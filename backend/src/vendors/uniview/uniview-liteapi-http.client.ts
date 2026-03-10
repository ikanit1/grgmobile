import { Injectable } from '@nestjs/common';
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

    const path =
      device.type === DeviceType.UNIVIEW_NVR
        ? `/Channels/${channel}/Media/LiveViewURL?StreamType=${stream}`
        : `/Channels/${channel}/Media/LiveViewURL?StreamType=${stream}`;
    const data = await this.request(device, 'GET', path);

    const url =
      data?.Data?.Url || data?.Data?.URL || data?.Data?.RtspUrl || data?.Data?.LiveViewURL || '';

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
      const msg = e?.message ?? 'Не удалось открыть дверь';
      return { success: false, message: msg };
    }
  }

  async triggerRelay(device: Device, relayNum: number) {
    // LiteAPI IPC 6.10.2 / NVR: Serial Port I/O — Alarm Output (Digital Output)
    await this.request(device, 'PUT', `/IO/Outputs/${relayNum}`, {
      Enabled: 1,
      Active: 1,
      Duration: 5,
    });

    return { success: true, message: 'Реле сработало' };
  }

  /** LiteAPI doc IPC 6.1.5 / NVR: System/Equipment — device info */
  async getSystemInfo(device: Device): Promise<Record<string, unknown>> {
    const data = await this.request(device, 'GET', '/System/Equipment');
    return (data?.Data ?? data ?? {}) as Record<string, unknown>;
  }

  /** LiteAPI: events via HTTP (if available); else use WS cache. Returns empty for now. */
  async getEvents(_device: Device, _from?: string, _to?: string, _limit?: number): Promise<unknown[]> {
    return [];
  }
}

