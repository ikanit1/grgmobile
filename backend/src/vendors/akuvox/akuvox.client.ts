import * as https from 'https';
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { Device } from '../../devices/entities/device.entity';
import { LiveUrlQueryDto } from '../../control/dto/live-url.dto';
import { CredentialsService } from '../../credentials/credentials.service';

/** HTTPS-агент. Если AKUVOX_INSECURE_SKIP_VERIFY=true, принимает самоподписанные сертификаты. */
const getHttpsAgent = () => {
  if (process.env.AKUVOX_INSECURE_SKIP_VERIFY === 'true') {
    return new https.Agent({ rejectUnauthorized: false });
  }
  return undefined; // default verification
};

@Injectable()
export class AkuvoxClient {
  private readonly logger = new Logger(AkuvoxClient.name);

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
      httpsAgent: getHttpsAgent(),
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
        message: success ? 'Дверь открыта' : 'Не удалось открыть дверь',
      };
    } catch (e: any) {
      // Логируем полное исключение на сервере для отладки
      this.logger.error(`openDoor failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось открыть дверь' };
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

  /** Akuvox Linux API: POST /api/call/dial — initiate outgoing call from panel (e.g. to app). */
  async dial(device: Device): Promise<{ success: boolean; message?: string }> {
    const url = `${this.baseUrl(device)}/api/call/dial`;
    try {
      const res = await lastValueFrom(
        this.http.post(url, {}, { ...this.requestConfig(device), headers: { ...this.requestConfig(device).headers, 'Content-Type': 'application/json' } }),
      );
      const data = res.data as any;
      const ok = res.status === 200 && (data?.retcode === 0 || data?.result === 0);
      return { success: ok, message: ok ? 'Вызов инициирован' : 'Не удалось инициировать вызов' };
    } catch (e: any) {
      this.logger.error(`dial failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось инициировать вызов' };
    }
  }

  /** Akuvox Linux API: POST /api/call/hangup — end active call. */
  async hangup(device: Device): Promise<{ success: boolean; message?: string }> {
    const url = `${this.baseUrl(device)}/api/call/hangup`;
    try {
      const res = await lastValueFrom(
        this.http.post(url, {}, { ...this.requestConfig(device), headers: { ...this.requestConfig(device).headers, 'Content-Type': 'application/json' } }),
      );
      const data = res.data as any;
      const ok = res.status === 200 && (data?.retcode === 0 || data?.result === 0);
      return { success: ok, message: ok ? 'Вызов завершён' : 'Не удалось завершить вызов' };
    } catch (e: any) {
      this.logger.error(`hangup failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось завершить вызов' };
    }
  }

  /** Akuvox Linux API: GET /api/relay/get — list of relays/config. */
  async getRelayList(device: Device): Promise<unknown[]> {
    const url = `${this.baseUrl(device)}/api/relay/get`;
    const res = await lastValueFrom(this.http.get(url, this.requestConfig(device)));
    const data = res.data as any;
    if (res.status !== 200) throw new Error(data?.message ?? 'Не удалось получить список реле');
    const list = data?.data?.list ?? data?.data?.item ?? data?.list ?? data?.item ?? (Array.isArray(data?.data) ? data.data : []);
    return Array.isArray(list) ? list : [];
  }

  /** Akuvox Linux API: POST /api/relay/trig — trigger relay by index. num: 1=Relay A, 2=B, 3=C. */
  async relayTrig(device: Device, relayNum: number, options?: { mode?: number; level?: number; delay?: number }): Promise<{ success: boolean; message?: string }> {
    const num = Math.max(1, Math.min(relayNum, 255));
    const url = `${this.baseUrl(device)}/api/relay/trig`;
    const body = {
      target: 'relay',
      action: 'trig',
      data: {
        num,
        mode: options?.mode ?? 1,
        level: options?.level ?? 1,
        delay: options?.delay ?? 5,
      },
    };
    try {
      const res = await lastValueFrom(
        this.http.post(url, body, { ...this.requestConfig(device), headers: { ...this.requestConfig(device).headers, 'Content-Type': 'application/json' } }),
      );
      const data = res.data as any;
      const ok = res.status === 200 && (data?.retcode === 0 || data?.result === 0);
      return { success: ok, message: ok ? 'Реле сработало' : 'Не удалось сработать реле' };
    } catch (e: any) {
      this.logger.error(`relayTrig failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось сработать реле' };
    }
  }

  /** Akuvox Linux API: GET /api/calllog/get — call history. */
  async getCallLog(device: Device): Promise<unknown[]> {
    const url = `${this.baseUrl(device)}/api/calllog/get`;
    const res = await lastValueFrom(this.http.get(url, this.requestConfig(device)));
    const data = res.data as any;
    if (res.status !== 200) throw new Error(data?.message ?? 'Не удалось получить историю вызовов');
    const list = data?.data?.list ?? data?.list ?? (Array.isArray(data?.data) ? data.data : []);
    return Array.isArray(list) ? list : [];
  }

  /** Akuvox Linux API: GET /api/user/get — list of users (residents/keys). */
  async getUserList(device: Device): Promise<unknown[]> {
    const url = `${this.baseUrl(device)}/api/user/get`;
    const res = await lastValueFrom(this.http.get(url, this.requestConfig(device)));
    const data = res.data as any;
    if (res.status !== 200) throw new Error(data?.message ?? 'Не удалось получить список пользователей');
    const list = data?.data?.list ?? data?.data?.item ?? data?.list ?? data?.item ?? (Array.isArray(data?.data) ? data.data : []);
    return Array.isArray(list) ? list : [];
  }

  /** Akuvox Linux API: POST /api/user/add — add user(s). items: array of { Name, UserID, LiftFloorNum?, WebRelay?, Schedule-Relay? }. */
  async addUser(device: Device, items: Array<{ Name: string; UserID: string; LiftFloorNum?: number; WebRelay?: number; 'Schedule-Relay'?: string }>): Promise<{ success: boolean; message?: string }> {
    const url = `${this.baseUrl(device)}/api/user/add`;
    const body = { target: 'user', action: 'add', data: { num: items.length, item: items } };
    try {
      const res = await lastValueFrom(
        this.http.post(url, body, { ...this.requestConfig(device), headers: { ...this.requestConfig(device).headers, 'Content-Type': 'application/json' } }),
      );
      const data = res.data as any;
      const ok = res.status === 200 && (data?.retcode === 0 || data?.result === 0);
      return { success: ok, message: ok ? 'Пользователь добавлен' : 'Не удалось добавить пользователя' };
    } catch (e: any) {
      this.logger.error(`addUser failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось добавить пользователя' };
    }
  }

  /** Akuvox Linux API: POST /api/user/set — update user(s). */
  async setUser(
    device: Device,
    items: Array<{
      UserID: string;
      Name: string;
      WebRelay?: string | number;
      LiftFloorNum?: string | number;
      'Schedule-Relay'?: Record<string, unknown> | string;
    }>,
  ): Promise<{ success: boolean; message?: string }> {
    const url = `${this.baseUrl(device)}/api/user/set`;
    const body = { target: 'user', action: 'set', data: { num: items.length, item: items } };
    try {
      const res = await lastValueFrom(
        this.http.post(url, body, { ...this.requestConfig(device), headers: { ...this.requestConfig(device).headers, 'Content-Type': 'application/json' } }),
      );
      const data = res.data as any;
      const ok = res.status === 200 && (data?.retcode === 0 || data?.result === 0);
      return { success: ok, message: ok ? 'Пользователь обновлён' : 'Не удалось обновить пользователя' };
    } catch (e: any) {
      this.logger.error(`setUser failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось обновить пользователя' };
    }
  }

  /** Akuvox Linux API: POST /api/user/del — delete user(s) by UserID. */
  async delUser(device: Device, userIds: string[]): Promise<{ success: boolean; message?: string }> {
    const url = `${this.baseUrl(device)}/api/user/del`;
    const body = { target: 'user', action: 'del', data: { num: userIds.length, item: userIds.map((UserID) => ({ UserID })) } };
    try {
      const res = await lastValueFrom(
        this.http.post(url, body, { ...this.requestConfig(device), headers: { ...this.requestConfig(device).headers, 'Content-Type': 'application/json' } }),
      );
      const data = res.data as any;
      const ok = res.status === 200 && (data?.retcode === 0 || data?.result === 0);
      return { success: ok, message: ok ? 'Пользователь удалён' : 'Не удалось удалить пользователя' };
    } catch (e: any) {
      this.logger.error(`delUser failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось удалить пользователя' };
    }
  }

  /** Akuvox Linux API: POST /api/user/clear — clear all users on panel. */
  async clearUsers(device: Device): Promise<{ success: boolean; message?: string }> {
    const url = `${this.baseUrl(device)}/api/user/clear`;
    const body = { target: 'user', action: 'clear' };
    try {
      const res = await lastValueFrom(
        this.http.post(url, body, { ...this.requestConfig(device), headers: { ...this.requestConfig(device).headers, 'Content-Type': 'application/json' } }),
      );
      const data = res.data as any;
      const ok = res.status === 200 && (data?.retcode === 0 || data?.result === 0);
      return { success: ok, message: ok ? 'Список пользователей очищен' : 'Не удалось очистить список пользователей' };
    } catch (e: any) {
      this.logger.error(`clearUsers failed: ${e?.message}`, e?.stack);
      return { success: false, message: 'Не удалось очистить список пользователей' };
    }
  }

  /** Akuvox Linux API: GET /api/contact/get — contacts (phone book). */
  async getContacts(device: Device): Promise<unknown[]> {
    const url = `${this.baseUrl(device)}/api/contact/get`;
    const res = await lastValueFrom(this.http.get(url, this.requestConfig(device)));
    const data = res.data as any;
    if (res.status !== 200) throw new Error(data?.message ?? 'Не удалось получить контакты');
    const list = data?.data?.list ?? data?.data?.item ?? data?.list ?? data?.item ?? (Array.isArray(data?.data) ? data.data : []);
    return Array.isArray(list) ? list : [];
  }

  /** Akuvox Linux API: GET /api/system/status — device online/offline status. */
  async getSystemStatus(device: Device): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(device)}/api/system/status`;
    const res = await lastValueFrom(this.http.get(url, this.requestConfig(device)));
    const data = res.data as any;
    if (res.status !== 200) throw new Error(data?.message ?? 'Не удалось получить статус системы');
    return (data?.data ?? data) as Record<string, unknown>;
  }

  /** Akuvox Linux API: GET /api/sip/status — SIP registration status. */
  async getSipStatus(device: Device): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(device)}/api/sip/status`;
    const res = await lastValueFrom(this.http.get(url, this.requestConfig(device)));
    const data = res.data as any;
    if (res.status !== 200) throw new Error(data?.message ?? 'Не удалось получить статус SIP');
    return (data?.data ?? data) as Record<string, unknown>;
  }
}

