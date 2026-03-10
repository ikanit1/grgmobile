import * as https from 'https';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { Device } from '../../devices/entities/device.entity';
import { LiveUrlQueryDto } from '../../control/dto/live-url.dto';
import { CredentialsService } from '../../credentials/credentials.service';

/** HTTPS-агент, принимающий самоподписанные сертификаты панелей (при редиректе HTTP→HTTPS). */
const INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

@Injectable()
export class AkuvoxClient {
  constructor(
    private readonly http: HttpService,
    private readonly credentialsService: CredentialsService,
  ) {}

  private baseUrl(device: Device): string {
    return `http://${device.host}:${device.httpPort}`;
  }

  private requestConfig(device: Device): { headers: { Authorization: string }; httpsAgent?: https.Agent } {
    return {
      headers: { Authorization: this.authHeader(device) },
      httpsAgent: INSECURE_HTTPS_AGENT,
    };
  }

  private getAuth(device: Device): { username: string; password: string } {
    const dec = this.credentialsService.decrypt(device.credentials);
    if (dec) return dec;
    return {
      username: device.username ?? '',
      password: device.password ?? '',
    };
  }

  private authHeader(device: Device): string {
    const { username, password } = this.getAuth(device);
    const token = Buffer.from(`${username}:${password}`, 'utf-8').toString('base64');
    return `Basic ${token}`;
  }

  /**
   * Боевое управление: GET /fcgi/do?action=openDoor&index={relayNum} с Basic Auth.
   * Таймаут задаётся в ControlModule (10 с).
   */
  async openDoor(device: Device, relayNum: number) {
    const index = Math.max(1, Math.min(relayNum, 255));
    const url = `${this.baseUrl(device)}/fcgi/do?action=openDoor&index=${index}`;

    try {
      const res = await lastValueFrom(
        this.http.get(url, this.requestConfig(device)),
      );
      const data = res.data as any;
      const success = res.status === 200 && (data?.retcode === 0 || data?.result === 0 || data?.success === true);
      return {
        success,
        message: data?.message ?? data?.msg ?? (success ? 'Дверь открыта' : 'Ошибка'),
      };
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Ошибка запроса';
      return { success: false, message: msg };
    }
  }

  async getLiveUrl(device: Device, query: LiveUrlQueryDto) {
    const { username: user, password: pass } = this.getAuth(device);
    const host = device.host;
    const port = device.rtspPort;
    const channel = query.channel ?? device.defaultChannel ?? 1;
    const pathSegment = device.defaultStream?.trim() || `stream${channel}`;
    const path = pathSegment.startsWith('/') ? pathSegment : `/${pathSegment}`;
    const userEnc = encodeURIComponent(user);
    const passEnc = encodeURIComponent(pass);
    const url = `rtsp://${userEnc}:${passEnc}@${host}:${port}${path}`;
    return { protocol: 'rtsp', url };
  }

  /** Akuvox Linux API: GET /api/system/info — device info (doc: Akuvox Linux Api) */
  async getSystemInfo(device: Device): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(device)}/api/system/info`;
    const res = await lastValueFrom(
      this.http.get(url, this.requestConfig(device)),
    );
    const data = res.data as any;
    if (res.status !== 200 || data?.retcode !== 0) {
      throw new Error(data?.message ?? 'Не удалось получить данные устройства');
    }
    return (data?.data ?? data) as Record<string, unknown>;
  }

  /** Akuvox Linux API: GET /api/doorlog/get — door open log (doc: Akuvox Linux Api) */
  async getDoorLog(device: Device): Promise<unknown[]> {
    const url = `${this.baseUrl(device)}/api/doorlog/get`;
    const res = await lastValueFrom(
      this.http.get(url, this.requestConfig(device)),
    );
    const data = res.data as any;
    if (res.status !== 200) {
      throw new Error(data?.message ?? 'Не удалось получить журнал двери');
    }
    const list = data?.data?.list ?? data?.list ?? (Array.isArray(data?.data) ? data.data : []);
    return Array.isArray(list) ? list : [];
  }

  /** Akuvox Linux API: GET /api/relay/status — relay state (doc: Akuvox Linux Api) */
  async getRelayStatus(device: Device): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(device)}/api/relay/status`;
    const res = await lastValueFrom(
      this.http.get(url, this.requestConfig(device)),
    );
    const data = res.data as any;
    if (res.status !== 200 || data?.retcode !== 0) {
      throw new Error(data?.message ?? 'Не удалось получить статус реле');
    }
    return (data?.data ?? data) as Record<string, unknown>;
  }

  /** Akuvox Linux API: GET /api/call/status — call state (doc: Akuvox Linux Api) */
  async getCallStatus(device: Device): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(device)}/api/call/status`;
    const res = await lastValueFrom(
      this.http.get(url, this.requestConfig(device)),
    );
    const data = res.data as any;
    if (res.status !== 200) {
      throw new Error(data?.message ?? 'Не удалось получить статус вызова');
    }
    return (data?.data ?? data) as Record<string, unknown>;
  }
}

