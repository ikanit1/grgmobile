import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DevicesService } from '../devices/devices.service';
import { Device, DeviceType, DeviceRole } from '../devices/entities/device.entity';
import { OpenDoorDto } from './dto/open-door.dto';
import { LiveUrlQueryDto } from './dto/live-url.dto';
import { EventsQueryDto } from './dto/events-query.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { AkuvoxClient } from '../vendors/akuvox/akuvox.client';
import { UniviewLiteapiHttpClient } from '../vendors/uniview/uniview-liteapi-http.client';
import { UniviewWsConnectionService } from '../events/uniview-ws-connection.service';
import { EventLogService } from '../events/event-log.service';
import { IncomingCallService } from '../events/incoming-call.service';
import { AccessService } from '../access/access.service';
import { RequestUser } from '../auth/request-user.interface';
import { DeviceEventDto } from './dto/device-event.dto';

@Injectable()
export class ControlService {
  private readonly logger = new Logger(ControlService.name);

  constructor(
    private readonly devicesService: DevicesService,
    private readonly akuvoxClient: AkuvoxClient,
    private readonly univiewClient: UniviewLiteapiHttpClient,
    private readonly univiewWs: UniviewWsConnectionService,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
    private readonly incomingCallService: IncomingCallService,
  ) {}

  async openDoor(deviceId: number, dto: OpenDoorDto, user: RequestUser) {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    const relayId = dto.relayId ?? 1;

    let result: { success: boolean; message: string };
    switch (device.type) {
      case DeviceType.AKUVOX:
        result = await this.akuvoxClient.openDoor(device, relayId);
        break;
      case DeviceType.UNIVIEW_IPC:
      case DeviceType.UNIVIEW_NVR:
        result = await this.univiewClient.openDoor(device, relayId);
        break;
      default:
        throw new BadRequestException('Тип устройства не поддерживает открытие двери');
    }
    await this.eventLogService.create(deviceId, 'door_open', {
      relayId,
      userId: user.id,
      success: result.success,
    });
    this.logger.log(`openDoor deviceId=${deviceId} userId=${user.id} success=${result.success}`);
    return result;
  }

  async getLiveUrl(deviceId: number, query: LiveUrlQueryDto, user: RequestUser) {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);

    switch (device.type) {
      case DeviceType.AKUVOX:
        return this.akuvoxClient.getLiveUrl(device, query);
      case DeviceType.UNIVIEW_IPC:
      case DeviceType.UNIVIEW_NVR:
        return this.univiewClient.getLiveUrl(device, query);
      default:
        throw new BadRequestException('Тип устройства не поддерживает получение видеопотока');
    }
  }

  async getDeviceInfo(deviceId: number, user: RequestUser): Promise<Record<string, unknown>> {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    switch (device.type) {
      case DeviceType.AKUVOX:
        return this.akuvoxClient.getSystemInfo(device);
      case DeviceType.UNIVIEW_IPC:
      case DeviceType.UNIVIEW_NVR:
        return this.univiewClient.getSystemInfo(device);
      default:
        throw new BadRequestException('Тип устройства не поддерживает получение информации');
    }
  }

  async getDeviceEvents(
    deviceId: number,
    query: EventsQueryDto,
    user: RequestUser,
  ): Promise<Array<{ time: string; type: string; source: string; details: unknown }>> {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    const limit = Math.min(query.limit ?? 50, 200);

    const fromStorage = await this.eventLogService.findByDevice(deviceId, {
      from: query.from,
      to: query.to,
      limit,
    });
    const storageEvents = fromStorage.map((e) => ({
      time: e.createdAt.toISOString(),
      type: e.eventType,
      source: 'storage',
      details: e.data ?? {},
    }));

    let deviceEvents: Array<{ time: string; type: string; source: string; details: unknown }> = [];
    switch (device.type) {
      case DeviceType.AKUVOX: {
        const list = await this.akuvoxClient.getDoorLog(device);
        deviceEvents = (Array.isArray(list) ? list : []).slice(0, limit).map((item: any) => ({
          time: item.time ?? item.Time ?? item.date ?? new Date().toISOString(),
          type: item.action ?? item.type ?? 'DOOR_OPEN',
          source: 'AKUVOX',
          details: item,
        }));
        break;
      }
      case DeviceType.UNIVIEW_IPC:
      case DeviceType.UNIVIEW_NVR: {
        const list = await this.univiewClient.getEvents(
          device,
          query.from,
          query.to,
          limit,
        );
        deviceEvents = (Array.isArray(list) ? list : []).map((item: any) => ({
          time: item.time ?? item.Time ?? item.date ?? new Date().toISOString(),
          type: item.type ?? item.EventType ?? 'EVENT',
          source: device.type,
          details: item,
        }));
        break;
      }
    }

    const merged = [...deviceEvents, ...storageEvents].sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );
    return merged.slice(0, limit);
  }

  /** Start LiteAPI WebSocket connection for Uniview device (event push to app). */
  async startDeviceWs(deviceId: number, user: RequestUser): Promise<{ started: boolean }> {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      return { started: false };
    }
    await this.univiewWs.start(device);
    return { started: true };
  }

  async stopDeviceWs(deviceId: number, user: RequestUser): Promise<void> {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    this.univiewWs.stop(deviceId);
  }

  /** Test connection to a device without saving it to DB. */
  async testConnection(
    dto: TestConnectionDto,
  ): Promise<{ reachable: boolean; info?: Record<string, unknown>; error?: string }> {
    const tempDevice = {
      id: 0,
      buildingId: 0,
      name: 'test',
      host: dto.host,
      type: dto.type,
      role: DeviceRole.DOORPHONE,
      httpPort: dto.httpPort ?? 80,
      rtspPort: 554,
      username: dto.username,
      password: dto.password,
    } as Device;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout (5s)')), 5000),
    );

    try {
      let info: Record<string, unknown>;
      switch (dto.type) {
        case DeviceType.AKUVOX:
          info = await Promise.race([this.akuvoxClient.getSystemInfo(tempDevice), timeout]);
          break;
        case DeviceType.UNIVIEW_IPC:
        case DeviceType.UNIVIEW_NVR:
          info = await Promise.race([this.univiewClient.getSystemInfo(tempDevice), timeout]);
          break;
        default:
          if (dto.deviceId) await this.devicesService.updateStatus(dto.deviceId, 'offline');
          return { reachable: false, error: 'Тип устройства не поддерживает проверку связи' };
      }
      if (dto.deviceId) await this.devicesService.updateStatus(dto.deviceId, 'online');
      return { reachable: true, info };
    } catch (e) {
      if (dto.deviceId) await this.devicesService.updateStatus(dto.deviceId, 'offline').catch(() => {});
      return { reachable: false, error: (e as Error).message };
    }
  }

  /** Post device event (e.g. incoming_call from doorphone/gateway). Saves to event_log and triggers push for residents. */
  async postDeviceEvent(
    deviceId: number,
    dto: DeviceEventDto,
    user: RequestUser,
  ): Promise<{ logId: number; pushSentTo?: string[] }> {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    return this.incomingCallService.handleDeviceEvent(deviceId, {
      type: dto.type,
      apartmentId: dto.apartmentId,
      apartmentNumber: dto.apartmentNumber,
      snapshotUrl: dto.snapshotUrl,
    });
  }
}

