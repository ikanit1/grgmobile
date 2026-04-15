import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { UsersService } from '../users/users.service';
import * as admin from 'firebase-admin';
import { safeLog } from '../common/logging/sanitizer';

export interface IncomingCallPayload {
  apartmentNumber: string;
  buildingName?: string;
  deviceId: number;
  [key: string]: unknown;
}

/**
 * Sends push notifications via FCM when configured; otherwise logs only.
 * Configure FCM via env: FCM_SERVICE_ACCOUNT_JSON (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path to key file).
 */
@Injectable()
export class PushService {
  private fcmInitialized = false;

  constructor(private readonly usersService: UsersService) {
    this.initFcm();
  }

  private initFcm(): void {
    if (admin.apps.length > 0) {
      this.fcmInitialized = true;
      return;
    }
    const json = process.env.FCM_SERVICE_ACCOUNT_JSON;
    const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    try {
      if (json) {
        const key = JSON.parse(json) as admin.ServiceAccount;
        admin.initializeApp({ credential: admin.credential.cert(key) });
        this.fcmInitialized = true;
      } else if (path) {
        const key = JSON.parse(
          readFileSync(path, 'utf8'),
        ) as admin.ServiceAccount;
        admin.initializeApp({ credential: admin.credential.cert(key) });
        this.fcmInitialized = true;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[PushService] FCM not configured:', (e as Error).message);
    }
  }

  /**
   * Send incoming call push to residents of the apartment.
   * @param userIds Target user IDs (from user_apartments)
   * @param payload Data for the notification (apartment number, building name, etc.)
   */
  async sendIncomingCallPush(
    userIds: string[],
    payload: IncomingCallPayload,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const allowed = await this.usersService.filterDoNotDisturb(userIds);
    const tokens = await this.usersService.getPushTokens(allowed);
    if (tokens.length === 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[PushService] sendIncomingCallPush -> userIds=${userIds.join(',')} (no push tokens) payload=${safeLog(payload)}`,
      );
      return;
    }
    const title = 'Входящий звонок';
    const body =
      payload.buildingName && payload.apartmentNumber
        ? `${payload.buildingName}, кв. ${payload.apartmentNumber}`
        : `Квартира ${payload.apartmentNumber}`;
    const message: admin.messaging.MulticastMessage = {
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data: {
        type: 'VOIP_CALL',
        incoming_call: '1',
        deviceId: String(payload.deviceId),
        apartmentNumber: payload.apartmentNumber ?? '',
        ...(payload.buildingName && { buildingName: payload.buildingName }),
      },
      android: { priority: 'high' },
      apns: {
        payload: { aps: { sound: 'default', contentAvailable: true } },
        fcmOptions: { imageUrl: undefined },
      },
    };
    if (this.fcmInitialized) {
      try {
        const res = await admin.messaging().sendEachForMulticast(message);
        // eslint-disable-next-line no-console
        console.log(
          `[PushService] sendIncomingCallPush -> success=${res.successCount} failure=${res.failureCount}`,
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[PushService] FCM send error:', (e as Error).message);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[PushService] sendIncomingCallPush (no FCM) -> userIds=${userIds.join(',')} payload=${safeLog(payload)}`,
      );
    }
  }

  /** type: "motion" — motion detection on camera (TZ 2.6). */
  async sendMotionPush(
    userIds: string[],
    payload: { deviceId: number; channelId?: number; snapshotUrl?: string; timestamp?: string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    const allowed = await this.usersService.filterDoNotDisturb(userIds);
    const tokens = await this.usersService.getPushTokens(allowed);
    if (tokens.length === 0) return;
    const message: admin.messaging.MulticastMessage = {
      tokens: tokens.map((t) => t.token),
      notification: { title: 'Движение на камере', body: 'Зафиксировано движение' },
      data: {
        type: 'motion',
        deviceId: String(payload.deviceId),
        ...(payload.channelId != null && { channelId: String(payload.channelId) }),
        ...(payload.snapshotUrl && { snapshotUrl: payload.snapshotUrl }),
        ...(payload.timestamp && { timestamp: payload.timestamp }),
      },
      android: { priority: 'high' },
    };
    if (this.fcmInitialized) {
      try {
        await admin.messaging().sendEachForMulticast(message);
      } catch (e) {
        console.error('[PushService] sendMotionPush error:', (e as Error).message);
      }
    }
  }

  /** type: "io_alarm" — IO alarm / sensor (TZ 2.6). */
  async sendIoAlarmPush(
    userIds: string[],
    payload: { deviceId: number; inputId?: number | string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    const allowed = await this.usersService.filterDoNotDisturb(userIds);
    const tokens = await this.usersService.getPushTokens(allowed);
    if (tokens.length === 0) return;
    const message: admin.messaging.MulticastMessage = {
      tokens: tokens.map((t) => t.token),
      notification: { title: 'Тревога', body: 'Сработал датчик' },
      data: {
        type: 'io_alarm',
        deviceId: String(payload.deviceId),
        ...(payload.inputId != null && { inputId: String(payload.inputId) }),
      },
      android: { priority: 'high' },
    };
    if (this.fcmInitialized) {
      try {
        await admin.messaging().sendEachForMulticast(message);
      } catch (e) {
        console.error('[PushService] sendIoAlarmPush error:', (e as Error).message);
      }
    }
  }

  /** type: "device_offline" — device went offline (TZ 2.6). */
  async sendDeviceOfflinePush(
    userIds: string[],
    payload: { deviceId: number; deviceName?: string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    const allowed = await this.usersService.filterDoNotDisturb(userIds);
    const tokens = await this.usersService.getPushTokens(allowed);
    if (tokens.length === 0) return;
    const message: admin.messaging.MulticastMessage = {
      tokens: tokens.map((t) => t.token),
      notification: {
        title: 'Устройство недоступно',
        body: payload.deviceName ? `Устройство «${payload.deviceName}» офлайн` : 'Устройство офлайн',
      },
      data: {
        type: 'device_offline',
        deviceId: String(payload.deviceId),
        ...(payload.deviceName && { deviceName: payload.deviceName }),
      },
    };
    if (this.fcmInitialized) {
      try {
        await admin.messaging().sendEachForMulticast(message);
      } catch (e) {
        console.error('[PushService] sendDeviceOfflinePush error:', (e as Error).message);
      }
    }
  }
}
