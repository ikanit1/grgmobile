import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { UsersService } from '../users/users.service';
import * as admin from 'firebase-admin';

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
        `[PushService] sendIncomingCallPush -> userIds=${userIds.join(',')} (no push tokens) payload=${JSON.stringify(payload)}`,
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
        `[PushService] sendIncomingCallPush (no FCM) -> userIds=${userIds.join(',')} payload=${JSON.stringify(payload)}`,
      );
    }
  }
}
