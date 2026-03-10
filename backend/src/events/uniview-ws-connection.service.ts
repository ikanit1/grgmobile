/**
 * Manages LiteAPI Over WebSocket connections to Uniview devices and forwards events to EventsGateway.
 * Doc: LiteAPI Over Websocket Document for IPC V5.05 / NVR V5.08.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Device, DeviceType } from '../devices/entities/device.entity';
import { EventsGateway } from './events.gateway';
import { EventLogService } from './event-log.service';
import { UniviewLiteapiWsClient } from '../vendors/uniview/uniview-liteapi-ws.client';

@Injectable()
export class UniviewWsConnectionService implements OnModuleDestroy {
  private connections = new Map<number, UniviewLiteapiWsClient>();

  constructor(
    private readonly eventsGateway: EventsGateway,
    private readonly eventLogService: EventLogService,
  ) {}

  /** Start WebSocket connection and event subscription for a Uniview device. */
  async start(device: Device): Promise<void> {
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      return;
    }
    if (this.connections.has(device.id)) {
      return;
    }
    const wsUrl = `ws://${device.host}:${device.httpPort}`;
    const client = new UniviewLiteapiWsClient(wsUrl);
    client.onEvent((payload) => {
      const eventType = (payload as any)?.EventType ?? (payload as any)?.type ?? 'EVENT';
      const normalized = {
        time: new Date().toISOString(),
        type: eventType,
        source: device.type,
        payload,
      };
      this.eventLogService.create(device.id, eventType, payload as Record<string, unknown>).catch(() => {});
      this.eventsGateway.emitDeviceEvent(device.id, normalized);
      if (device.building?.id) {
        this.eventsGateway.emitToHouse(device.building.id, normalized);
      }
    });
    try {
      await client.connect();
      await client.subscribeEvents();
      this.connections.set(device.id, client);
    } catch (e) {
      client.disconnect();
      throw e;
    }
  }

  stop(deviceId: number): void {
    const client = this.connections.get(deviceId);
    if (client) {
      client.disconnect();
      this.connections.delete(deviceId);
    }
  }

  onModuleDestroy() {
    this.connections.forEach((c) => c.disconnect());
    this.connections.clear();
  }
}
