/**
 * Manages LiteAPI Over WebSocket connections to Uniview devices and forwards events to EventsGateway.
 * Features: auto-reconnect with exponential backoff, heartbeat, doorbell push, connection status.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Device, DeviceType } from '../devices/entities/device.entity';
import { EventsGateway } from './events.gateway';
import { EventLogService } from './event-log.service';
import { PushService } from '../push/push.service';
import { AccessService } from '../access/access.service';
import { UniviewLiteapiWsClient } from '../vendors/uniview/uniview-liteapi-ws.client';
import {
  EVENT_TYPE_UNIVIEW_DOORBELL,
  EVENT_TYPE_DEVICE_WS_CONNECTED,
  EVENT_TYPE_DEVICE_WS_DISCONNECTED,
  EVENT_TYPE_DEVICE_WS_RECONNECTING,
} from './event-types';

const MOTION_EVENT_TYPES = new Set(['VMD', 'Motion', 'motion', 'VideoMotion', 'VideoMotionDetection']);
const IO_ALARM_EVENT_TYPES = new Set(['IO', 'IOAlarm', 'io_alarm', 'AlarmInput', 'DigitalInput']);
const DOORBELL_EVENT_TYPES = new Set(['DoorBell', 'doorbell', 'CallIncoming', 'call_incoming', 'DoorCall']);

const MAX_BACKOFF_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface ConnectionState {
  client: UniviewLiteapiWsClient;
  device: Device;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  backoffMs: number;
  stopped: boolean;
}

@Injectable()
export class UniviewWsConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(UniviewWsConnectionService.name);
  private connections = new Map<number, ConnectionState>();

  constructor(
    private readonly eventsGateway: EventsGateway,
    private readonly eventLogService: EventLogService,
    private readonly pushService: PushService,
    private readonly accessService: AccessService,
  ) {}

  async start(device: Device): Promise<void> {
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      return;
    }
    if (this.connections.has(device.id)) {
      return;
    }
    const state: ConnectionState = {
      client: null as any,
      device,
      backoffMs: 1000,
      stopped: false,
    };
    this.connections.set(device.id, state);
    await this.connectDevice(state);
  }

  private async connectDevice(state: ConnectionState): Promise<void> {
    if (state.stopped) return;
    const { device } = state;
    const buildingId = device.buildingId ?? (device.building as any)?.id;
    const wsUrl = `ws://${device.host}:${device.httpPort}`;
    const client = new UniviewLiteapiWsClient(wsUrl);

    client.onEvent((payload) => {
      this.handleEvent(device, buildingId, payload);
    });

    try {
      await client.connect();
      await client.subscribeEvents();
      state.client = client;
      state.backoffMs = 1000; // reset backoff on success

      this.emitConnectionStatus(device.id, buildingId, EVENT_TYPE_DEVICE_WS_CONNECTED);
      this.startHeartbeat(state);
      this.logger.log(`WS connected to device ${device.id} (${device.host})`);
    } catch (e: unknown) {
      client.disconnect();
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`WS connect failed for device ${device.id}: ${msg}`);
      this.scheduleReconnect(state);
    }
  }

  private handleEvent(device: Device, buildingId: number | undefined, payload: any): void {
    const eventType = payload?.EventType ?? payload?.type ?? 'EVENT';
    const normalized = {
      time: new Date().toISOString(),
      type: eventType,
      source: device.type,
      payload,
    };

    this.eventLogService.create(device.id, eventType, payload as Record<string, unknown>).catch(() => {});
    this.eventsGateway.emitDeviceEvent(device.id, normalized);
    if (buildingId) {
      this.eventsGateway.emitToHouse(buildingId, normalized);
    }

    if (!buildingId) return;

    this.accessService.getUserIdsWithAccessToBuilding(buildingId).then((userIds) => {
      if (userIds.length === 0) return;
      const p = payload as Record<string, unknown>;
      const snapshotUrl = (p?.SnapshotURL ?? p?.snapshotUrl ?? p?.PictureURL) as string | undefined;
      const channelId = (p?.ChannelID ?? p?.channelId ?? p?.ChannelId) as number | undefined;

      if (DOORBELL_EVENT_TYPES.has(eventType)) {
        this.pushService.sendIncomingCallPush(userIds, {
          apartmentNumber: '',
          buildingName: '',
          deviceId: device.id,
          channelId,
          snapshotUrl,
        }).catch(() => {});
      } else if (MOTION_EVENT_TYPES.has(eventType)) {
        this.pushService.sendMotionPush(userIds, {
          deviceId: device.id,
          channelId,
          snapshotUrl,
          timestamp: normalized.time,
        }).catch(() => {});
      } else if (IO_ALARM_EVENT_TYPES.has(eventType)) {
        const inputId = (p?.InputID ?? p?.inputId ?? p?.Port) as number | string | undefined;
        this.pushService.sendIoAlarmPush(userIds, { deviceId: device.id, inputId }).catch(() => {});
      }
    }).catch(() => {});
  }

  private scheduleReconnect(state: ConnectionState): void {
    if (state.stopped) return;
    const { device } = state;
    const buildingId = device.buildingId ?? (device.building as any)?.id;

    this.emitConnectionStatus(device.id, buildingId, EVENT_TYPE_DEVICE_WS_RECONNECTING);
    this.logger.log(`Scheduling reconnect for device ${device.id} in ${state.backoffMs}ms`);

    state.reconnectTimer = setTimeout(async () => {
      await this.connectDevice(state);
    }, state.backoffMs);

    state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private startHeartbeat(state: ConnectionState): void {
    this.clearHeartbeat(state);
    state.heartbeatTimer = setInterval(() => {
      if (!state.client?.isConnected) {
        this.logger.warn(`Heartbeat: device ${state.device.id} disconnected, reconnecting`);
        this.clearHeartbeat(state);
        const buildingId = state.device.buildingId ?? (state.device.building as any)?.id;
        this.emitConnectionStatus(state.device.id, buildingId, EVENT_TYPE_DEVICE_WS_DISCONNECTED);
        this.scheduleReconnect(state);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(state: ConnectionState): void {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = undefined;
    }
  }

  private emitConnectionStatus(deviceId: number, buildingId: number | undefined, status: string): void {
    const payload = { deviceId, status, time: new Date().toISOString() };
    this.eventsGateway.emitDeviceEvent(deviceId, payload);
    if (buildingId) {
      this.eventsGateway.emitToHouse(buildingId, payload);
    }
  }

  stop(deviceId: number): void {
    const state = this.connections.get(deviceId);
    if (state) {
      state.stopped = true;
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      this.clearHeartbeat(state);
      state.client?.disconnect();
      this.connections.delete(deviceId);
    }
  }

  getConnectionStatus(deviceId: number): 'connected' | 'reconnecting' | 'disconnected' {
    const state = this.connections.get(deviceId);
    if (!state) return 'disconnected';
    if (state.client?.isConnected) return 'connected';
    return 'reconnecting';
  }

  onModuleDestroy() {
    this.connections.forEach((state, _id) => {
      state.stopped = true;
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      this.clearHeartbeat(state);
      state.client?.disconnect();
    });
    this.connections.clear();
  }
}
