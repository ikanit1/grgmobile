import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { Device, DeviceType } from '../../devices/entities/device.entity';
import { LiveUrlQueryDto } from '../../control/dto/live-url.dto';
import { buildDigestHeader, parseWwwAuthenticate } from './digest-auth.helper';
import { CredentialsService } from '../../credentials/credentials.service';

/** LiteAPI HTTP client — IPC & NVR (doc: LiteAPI Document for IPC V5.07, NVR V5.14). Auth: HTTP Digest per 3.2. */
@Injectable()
export class UniviewLiteapiHttpClient {
  private readonly logger = new Logger(UniviewLiteapiHttpClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly credentialsService: CredentialsService,
  ) {}

  private baseUrl(device: Device): string {
    return `http://${device.host}:${device.httpPort}/LAPI/V1.0`;
  }

  private getAuth(device: Device): { username: string; password: string } {
    const dec = this.credentialsService.decrypt(device.credentials);
    if (dec) return dec;
    return {
      username: device.username ?? '',
      password: device.password ?? '',
    };
  }

  /** Request with Basic then Digest on 401 (LiteAPI 3.2 Call Authentication). */
  private async request(
    device: Device,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: any,
  ): Promise<any> {
    const base = this.baseUrl(device);
    const url = `${base}${path}`;
    const uri = `/LAPI/V1.0${path}`;
    const body = data ? JSON.stringify(data) : undefined;
    const { username, password } = this.getAuth(device);

    let config: any = {
      method,
      url,
      data: body,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (s: number) => s < 500,
    };

    if (username && password) {
      const token = Buffer.from(`${username}:${password}`, 'utf-8').toString('base64');
      config.headers.Authorization = `Basic ${token}`;
    }

    let res = await lastValueFrom(this.http.request(config)) as AxiosResponse;

    if (res.status === 401 && username && password) {
      const wwwAuth = res.headers?.['www-authenticate'] ?? res.headers?.['WWW-Authenticate'];
      const challenge = typeof wwwAuth === 'string' ? parseWwwAuthenticate(wwwAuth) : null;
      if (challenge) {
        const digestHeader = buildDigestHeader(
          method,
          uri,
          username,
          password,
          challenge,
          body,
        );
        config = {
          method,
          url,
          data: body,
          headers: { ...config.headers, Authorization: digestHeader },
          validateStatus: (s: number) => s < 500,
        };
        res = await lastValueFrom(this.http.request(config)) as AxiosResponse;
      }
    }

    if (res.status >= 400) {
      const msg = (res.data as any)?.message ?? (res.data as any)?.ResponseString ?? res.statusText;
      throw new Error(`LiteAPI ${res.status}: ${msg}`);
    }
    return res.data;
  }

  /** LiteAPI IPC 6.6.5 Live View; NVR 6.8.4 Live View — path differs by device type. */
  async getLiveUrl(device: Device, query: LiveUrlQueryDto) {
    const channel = query.channel ?? device.defaultChannel ?? 1;
    const stream = query.stream ?? device.defaultStream ?? 'main';

    // If custom RTSP URL is set — use it directly, skip LiteAPI entirely
    if (device.customRtspUrl) {
      this.logger.log(`getLiveUrl using customRtspUrl for device ${device.id}`);
      return { protocol: 'rtsp', url: device.customRtspUrl };
    }

    try {
      const path = `/Channels/${channel}/Media/LiveViewURL?StreamType=${stream}`;
      const data = await this.request(device, 'GET', path);
      const url =
        data?.Data?.Url || data?.Data?.URL || data?.Data?.RtspUrl || data?.Data?.LiveViewURL || '';
      if (url) return { protocol: 'rtsp', url };
    } catch (e: any) {
      this.logger.warn(`getLiveUrl LiteAPI failed (${e?.message}), falling back to constructed RTSP URL`);
    }

    // Fallback: construct standard Uniview RTSP URL without calling LiteAPI
    const { username, password } = this.getAuth(device);
    const streamIndex = stream === 'sub' ? 1 : 0;
    const url = `rtsp://${username}:${password}@${device.host}:${device.rtspPort}/unicast/c${channel}/s${streamIndex}/live`;
    return { protocol: 'rtsp', url };
  }

  /**
   * Боевое управление: POST /Channels/{id}/OpenDoor с Digest-авторизацией (LAPI).
   * Таймаут задаётся в ControlModule (10 с).
   */
  async openDoor(device: Device, channelId?: number): Promise<{ success: boolean; message: string }> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    try {
      await this.request(device, 'POST', `/Channels/${ch}/OpenDoor`, {});
      return { success: true, message: 'Дверь открыта' };
    } catch (e: any) {
      this.logger.error(`openDoor failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось открыть дверь' };
    }
  }

  async triggerRelay(device: Device, relayNum: number): Promise<{ success: boolean; message: string }> {
    // LiteAPI IPC 6.10.2 / NVR: Serial Port I/O — Alarm Output (Digital Output)
    try {
      await this.request(device, 'PUT', `/IO/Outputs/${relayNum}`, {
        Enabled: 1,
        Active: 1,
        Duration: 5,
      });
      return { success: true, message: 'Реле сработало' };
    } catch (e: any) {
      this.logger.error(`triggerRelay failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось сработать реле' };
    }
  }

  /** LiteAPI doc IPC 6.1.5 / NVR: System/Equipment — device info */
  async getSystemInfo(device: Device): Promise<Record<string, unknown>> {
    const data = await this.request(device, 'GET', '/System/Equipment');
    return (data?.Data ?? data ?? {}) as Record<string, unknown>;
  }

  /**
   * LiteAPI: door access log via HTTP.
   * IPC: GET /Channels/{ch}/DoorLogs — returns list of door access events.
   * Params: StartTime/EndTime (ISO 8601 or epoch sec), Count (max records).
   */
  async getEvents(device: Device, from?: string, to?: string, limit?: number): Promise<unknown[]> {
    const ch = device.defaultChannel ?? 1;
    const count = limit ?? 100;
    const params: string[] = [`Count=${count}`];
    if (from) params.push(`StartTime=${encodeURIComponent(from)}`);
    if (to) params.push(`EndTime=${encodeURIComponent(to)}`);
    const path = `/Channels/${ch}/DoorLogs?${params.join('&')}`;
    try {
      const data = await this.request(device, 'GET', path);
      const list = data?.Data?.DoorLogs ?? data?.Data ?? [];
      return Array.isArray(list) ? list : [];
    } catch (e: any) {
      this.logger.warn(`getEvents failed (${device.host}): ${e?.message}`);
      return [];
    }
  }

  /** LiteAPI NVR: GET /Channels/System/DeviceInfo — list of channels/cameras. */
  async getChannels(device: Device): Promise<unknown[]> {
    const data = await this.request(device, 'GET', '/Channels/System/DeviceInfo');
    const list = data?.Data?.Channels ?? data?.Data ?? (Array.isArray(data?.Data) ? data.Data : []);
    return Array.isArray(list) ? list : (list ? [list] : []);
  }

  /** LiteAPI NVR: GET /Channels/System/ChannelDetailInfo — detail per channel. */
  async getChannelDetail(device: Device): Promise<unknown[]> {
    const data = await this.request(device, 'GET', '/Channels/System/ChannelDetailInfo');
    const list = data?.Data?.Channels ?? data?.Data ?? (Array.isArray(data?.Data) ? data.Data : []);
    return Array.isArray(list) ? list : (list ? [list] : []);
  }

  /** LiteAPI: GET /Channels/<id>/System/BasicInfo — single channel basic info. */
  async getChannelInfo(device: Device, channelId: number): Promise<Record<string, unknown>> {
    const data = await this.request(device, 'GET', `/Channels/${channelId}/System/BasicInfo`);
    return (data?.Data ?? data ?? {}) as Record<string, unknown>;
  }

  /**
   * Search recordings on NVR/IPC for a time range.
   * LiteAPI: GET /Channels/{ch}/Record/SearchByTime
   */
  async getRecordings(
    device: Device,
    channelId: number,
    from?: string,
    to?: string,
  ): Promise<unknown[]> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    const params = new URLSearchParams();
    if (from) params.append('StartTime', from);
    if (to) params.append('EndTime', to);
    const qs = params.toString() ? `?${params}` : '';
    try {
      const resp = await this.request(device, 'GET', `/Channels/${ch}/Record/SearchByTime${qs}`);
      return resp?.Data?.RecordInfos ?? resp?.Data?.Records ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Construct RTSP playback URL for NVR/IPC recording.
   * Uniview playback RTSP format: rtsp://user:pass@host:port/media/videoN?starttime=X&endtime=Y
   */
  async getPlaybackUrl(
    device: Device,
    channelId: number,
    startTime: string,
    endTime: string,
  ): Promise<string> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    const { username, password } = this.getAuth(device);
    const host = device.host;
    const port = device.rtspPort ?? 554;
    const start = encodeURIComponent(startTime);
    const end = encodeURIComponent(endTime);
    return `rtsp://${username}:${password}@${host}:${port}/media/video${ch}?starttime=${start}&endtime=${end}`;
  }

  /**
   * Get recording timeline for a day (segments with start/end times).
   * LiteAPI: GET /Channels/{ch}/Record/Timeline?Date=YYYY-MM-DD
   */
  async getRecordingTimeline(
    device: Device,
    channelId: number,
    date: string,
  ): Promise<unknown[]> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    try {
      const resp = await this.request(device, 'GET', `/Channels/${ch}/Record/Timeline?Date=${date}`);
      return resp?.Data?.Segments ?? resp?.Data?.Timeline ?? [];
    } catch {
      return [];
    }
  }

  // ─── PTZ Control ───

  /** Check if device supports PTZ. Returns { Supported: boolean, ... } */
  async getPtzCapabilities(device: Device, channelId: number): Promise<Record<string, unknown>> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    try {
      const resp = await this.request(device, 'GET', `/Channels/${ch}/PTZ/Capabilities`);
      return resp?.Data ?? { Supported: false };
    } catch {
      return { Supported: false };
    }
  }

  /**
   * Continuous PTZ movement.
   * direction: 'up' | 'down' | 'left' | 'right' | 'zoomin' | 'zoomout'
   * speed: 1-100
   */
  async ptzMove(device: Device, channelId: number, direction: string, speed: number): Promise<void> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    const dirMap: Record<string, { Pan: number; Tilt: number; Zoom: number }> = {
      left:    { Pan: -speed, Tilt: 0, Zoom: 0 },
      right:   { Pan: speed,  Tilt: 0, Zoom: 0 },
      up:      { Pan: 0, Tilt: speed,  Zoom: 0 },
      down:    { Pan: 0, Tilt: -speed, Zoom: 0 },
      zoomin:  { Pan: 0, Tilt: 0, Zoom: speed },
      zoomout: { Pan: 0, Tilt: 0, Zoom: -speed },
    };
    const body = dirMap[direction] ?? { Pan: 0, Tilt: 0, Zoom: 0 };
    await this.request(device, 'PUT', `/Channels/${ch}/PTZ/ContinuousMove`, body);
  }

  /** Stop PTZ movement. */
  async ptzStop(device: Device, channelId: number): Promise<void> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    await this.request(device, 'PUT', `/Channels/${ch}/PTZ/ContinuousMove`, { Pan: 0, Tilt: 0, Zoom: 0 });
  }

  /** Get list of PTZ presets. */
  async getPtzPresets(device: Device, channelId: number): Promise<unknown[]> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    try {
      const resp = await this.request(device, 'GET', `/Channels/${ch}/PTZ/Presets`);
      return resp?.Data?.Presets ?? [];
    } catch {
      return [];
    }
  }

  /** Move camera to a saved preset position. */
  async gotoPreset(device: Device, channelId: number, presetId: number): Promise<void> {
    const ch = channelId ?? device.defaultChannel ?? 1;
    await this.request(device, 'PUT', `/Channels/${ch}/PTZ/Presets/${presetId}/Goto`, {});
  }

  /**
   * LiteAPI: GET /Channels/<id>/Media/Video/Streams/<streamId>/PreviewSnapshot (or Snapshot).
   * Returns JPEG buffer. streamId: 0 = main, 1 = sub.
   */
  async getSnapshot(device: Device, channelId: number, streamId: number = 0): Promise<Buffer> {
    const path = `/Channels/${channelId}/Media/Video/Streams/${streamId}/PreviewSnapshot`;
    const base = this.baseUrl(device);
    const url = `${base}${path}`;
    const uri = `/LAPI/V1.0${path}`;
    const { username, password } = this.getAuth(device);

    let config: any = {
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      validateStatus: (s: number) => s < 500,
      headers: {},
    };
    if (username && password) {
      config.headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf-8').toString('base64')}`;
    }

    let res = await lastValueFrom(this.http.request(config)) as AxiosResponse;

    if (res.status === 401 && username && password) {
      const wwwAuth = res.headers?.['www-authenticate'] ?? res.headers?.['WWW-Authenticate'];
      const challenge = typeof wwwAuth === 'string' ? parseWwwAuthenticate(wwwAuth) : null;
      if (challenge) {
        const digestHeader = buildDigestHeader('GET', uri, username, password, challenge, undefined);
        config = { ...config, headers: { ...config.headers, Authorization: digestHeader } };
        res = await lastValueFrom(this.http.request(config)) as AxiosResponse;
      }
    }

    if (res.status >= 400) {
      const msg = typeof res.data === 'string' ? res.data : (res.data as any)?.message ?? res.statusText;
      throw new Error(`LiteAPI snapshot ${res.status}: ${msg}`);
    }
    const buf = res.data as ArrayBuffer;
    return Buffer.from(buf);
  }
}

