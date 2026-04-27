import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DevicesService } from '../devices/devices.service';
import { Device, DeviceType, DeviceRole } from '../devices/entities/device.entity';
import { OpenDoorDto } from './dto/open-door.dto';
import { LiveUrlQueryDto } from './dto/live-url.dto';
import { EventsQueryDto } from './dto/events-query.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { UniviewLiteapiHttpClient } from '../vendors/uniview/uniview-liteapi-http.client';
import { UniviewWsConnectionService } from '../events/uniview-ws-connection.service';
import { EventLogService } from '../events/event-log.service';
import { IncomingCallService } from '../events/incoming-call.service';
import { AccessService } from '../access/access.service';
import { PushService } from '../push/push.service';
import { Go2rtcClient } from '../vendors/go2rtc/go2rtc.client';
import { RequestUser } from '../auth/request-user.interface';
import { DeviceEventDto } from './dto/device-event.dto';
import { RecordingsQueryDto } from './dto/recordings-query.dto';
import { PtzMoveDto } from './dto/ptz-move.dto';
import { PtzPresetDto } from './dto/ptz-preset.dto';

@Injectable()
export class ControlService {
  private readonly logger = new Logger(ControlService.name);

  constructor(
    private readonly devicesService: DevicesService,
    private readonly univiewClient: UniviewLiteapiHttpClient,
    private readonly univiewWs: UniviewWsConnectionService,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
    private readonly incomingCallService: IncomingCallService,
    private readonly pushService: PushService,
    private readonly go2rtcClient: Go2rtcClient,
  ) {}

  async openDoor(deviceId: number, dto: OpenDoorDto, user: RequestUser) {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    const relayId = dto.relayId ?? 1;

    let result: { success: boolean; message: string };
    switch (device.type) {
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

    let result: { protocol: string; url: string };
    switch (device.type) {
      case DeviceType.UNIVIEW_IPC:
      case DeviceType.UNIVIEW_NVR: {
        // IPC behind an NVR: stream via NVR host/credentials using the camera's channel number
        if (device.type === DeviceType.UNIVIEW_IPC && device.nvrId) {
          const nvr = await this.devicesService.findById(device.nvrId);
          const channelQuery = { ...query, channel: query.channel ?? device.defaultChannel ?? 1 };
          result = await this.univiewClient.getLiveUrl(nvr, channelQuery);
        } else {
          result = await this.univiewClient.getLiveUrl(device, query);
        }
        break;
      }
      default:
        throw new BadRequestException('Тип устройства не поддерживает получение видеопотока');
    }

    // Register stream in go2rtc and return proxy URLs for clients
    let hlsUrl: string | undefined;
    let rtspProxyUrl: string | undefined;
    if (this.go2rtcClient.isConfigured && result.url) {
      const channel = query.channel ?? device.defaultChannel ?? 1;
      const streamType = query.stream ?? device.defaultStream ?? 'main';
      const streamName = Go2rtcClient.streamName(deviceId, channel, streamType);
      await this.go2rtcClient.ensureStream(streamName, result.url);
      hlsUrl = this.go2rtcClient.getHlsUrl(streamName) ?? undefined;
      // RTSP proxy: mobile clients prefer this over HLS (mpv handles RTSP startup delay gracefully)
      rtspProxyUrl = this.go2rtcClient.getRtspProxyUrl(streamName) ?? undefined;
    }

    return { ...result, hlsUrl, rtspProxyUrl };
  }

  async getDeviceInfo(deviceId: number, user: RequestUser): Promise<Record<string, unknown>> {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    switch (device.type) {
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

  /** Test connection to a device. If dto.deviceId is set, the saved device (with its
   *  encrypted credentials) is used; otherwise builds a temp device from dto fields. */
  async testConnection(
    dto: TestConnectionDto,
  ): Promise<{ reachable: boolean; info?: Record<string, unknown>; error?: string }> {
    const probe: Device = dto.deviceId
      ? await this.devicesService.findById(dto.deviceId)
      : ({
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
        } as Device);

    // Uniview NVR may need Basic→probe→Digest (3 requests); allow 12s
    const timeoutMs = (probe.type === DeviceType.UNIVIEW_NVR) ? 12000 : 5000;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timeout (${timeoutMs / 1000}s)`)), timeoutMs),
    );

    try {
      let info: Record<string, unknown>;
      switch (probe.type) {
        case DeviceType.UNIVIEW_IPC:
        case DeviceType.UNIVIEW_NVR:
          info = await Promise.race([this.univiewClient.getSystemInfo(probe), timeout]);
          break;
        default:
          if (dto.deviceId) await this.devicesService.updateStatus(dto.deviceId, 'offline');
          return { reachable: false, error: 'Тип устройства не поддерживает проверку связи' };
      }
      if (dto.deviceId) await this.devicesService.updateStatus(dto.deviceId, 'online');
      return { reachable: true, info };
    } catch (e) {
      if (dto.deviceId) {
        await this.devicesService.updateStatus(dto.deviceId, 'offline').catch(() => {});
        try {
          const device = await this.devicesService.findById(dto.deviceId);
          const userIds = await this.accessService.getUserIdsWithAccessToBuilding(device.buildingId);
          await this.pushService.sendDeviceOfflinePush(userIds, {
            deviceId: device.id,
            deviceName: device.name,
          });
        } catch (pushErr) {
          this.logger.warn(`Device offline push failed: ${(pushErr as Error).message}`);
        }
      }
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

  // ————— Uniview proxy (device type UNIVIEW_IPC | UNIVIEW_NVR) —————

  async getChannels(deviceId: number, user: RequestUser) {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('Устройство не является Uniview NVR/IPC');
    }
    const [channels, details] = await Promise.all([
      this.univiewClient.getChannels(device).catch(() => []),
      this.univiewClient.getChannelDetail(device).catch(() => []),
    ]);
    return { channels, details };
  }

  async getSnapshot(deviceId: number, channelId: number, streamId: number | undefined, user: RequestUser): Promise<Buffer> {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('Устройство не является Uniview NVR/IPC');
    }
    return this.univiewClient.getSnapshot(device, channelId, streamId ?? 0);
  }

  // ─── Uniview Recording / Playback ───

  async getRecordings(deviceId: number, query: RecordingsQueryDto, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('Recordings are only supported for Uniview devices');
    }
    const channelId = query.channelId ?? device.defaultChannel ?? 1;
    return this.univiewClient.getRecordings(device, channelId, query.from, query.to);
  }

  async getPlaybackUrl(deviceId: number, query: RecordingsQueryDto, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('Playback is only supported for Uniview devices');
    }
    const channelId = query.channelId ?? device.defaultChannel ?? 1;
    if (!query.from || !query.to) {
      throw new BadRequestException('from and to parameters are required for playback URL');
    }
    const url = await this.univiewClient.getPlaybackUrl(device, channelId, query.from, query.to);
    return { url };
  }

  async getRecordingTimeline(deviceId: number, query: RecordingsQueryDto, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('Recording timeline is only supported for Uniview devices');
    }
    const channelId = query.channelId ?? device.defaultChannel ?? 1;
    const date = query.date ?? new Date().toISOString().split('T')[0];
    return this.univiewClient.getRecordingTimeline(device, channelId, date);
  }

  // ─── Uniview PTZ ───

  async getPtzCapabilities(deviceId: number, channelId: number | undefined, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      return { Supported: false };
    }
    const ch = channelId ?? device.defaultChannel ?? 1;
    return this.univiewClient.getPtzCapabilities(device, ch);
  }

  async ptzMove(deviceId: number, dto: PtzMoveDto, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('PTZ is only supported for Uniview devices');
    }
    const ch = dto.channelId ?? device.defaultChannel ?? 1;
    await this.univiewClient.ptzMove(device, ch, dto.direction, dto.speed ?? 50);
    return { success: true };
  }

  async ptzStop(deviceId: number, channelId: number | undefined, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('PTZ is only supported for Uniview devices');
    }
    const ch = channelId ?? device.defaultChannel ?? 1;
    await this.univiewClient.ptzStop(device, ch);
    return { success: true };
  }

  async getPtzPresets(deviceId: number, channelId: number | undefined, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      return [];
    }
    const ch = channelId ?? device.defaultChannel ?? 1;
    return this.univiewClient.getPtzPresets(device, ch);
  }

  async gotoPreset(deviceId: number, dto: PtzPresetDto, user: RequestUser) {
    const device = await this.devicesService.findByIdForUser(deviceId, user);
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      throw new BadRequestException('PTZ is only supported for Uniview devices');
    }
    const ch = dto.channelId ?? device.defaultChannel ?? 1;
    await this.univiewClient.gotoPreset(device, ch, dto.presetId);
    return { success: true };
  }
}

