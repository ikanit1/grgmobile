import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncomingCallService } from '../events/incoming-call.service';
import { EventLogService } from '../events/event-log.service';
import {
  EVENT_TYPE_INCOMING_CALL,
  EVENT_TYPE_AKUVOX_DOOR_OPEN,
  EVENT_TYPE_AKUVOX_INCOMING_CALL,
  EVENT_TYPE_AKUVOX_CALL_FINISHED,
} from '../events/event-types';
import { IntercomEventDto } from './dto/intercom-event.dto';
import { AkuvoxWebhookDto } from './dto/akuvox-webhook.dto';
import { Device } from '../devices/entities/device.entity';

function normalizeMac(mac: string): string {
  return mac.replace(/[:-]/g, '').toUpperCase();
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly incomingCallService: IncomingCallService,
    private readonly eventLogService: EventLogService,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
  ) {}

  validateSecret(secret?: string): void {
    const expected = process.env.WEBHOOK_SECRET;
    if (!expected) {
      throw new UnauthorizedException('WEBHOOK_SECRET не настроен на сервере. Вебхуки отключены.');
    }
    if (secret !== expected) {
      throw new UnauthorizedException('Неверный секрет вебхука');
    }
  }

  async handleIntercomEvent(dto: IntercomEventDto): Promise<{ logId: number; pushSentTo?: string[] }> {
    return this.incomingCallService.handleDeviceEvent(dto.deviceId, {
      type: EVENT_TYPE_INCOMING_CALL,
      apartmentId: dto.apartmentId,
      apartmentNumber: dto.apartmentNumber,
    });
  }

  async handleAkuvoxEvent(dto: AkuvoxWebhookDto, secret?: string): Promise<{ logId: number; pushSentTo?: string[] }> {
    this.validateSecret(secret);
    const macNorm = normalizeMac(dto.mac);
    const devices = await this.devicesRepo.find({ where: {}, relations: ['building'] });
    const deviceByMac = devices.find((d) => d.macAddress && normalizeMac(d.macAddress) === macNorm);
    if (!deviceByMac) {
      this.logger.warn(`Akuvox webhook: unknown MAC ${dto.mac}`);
      throw new ForbiddenException('Устройство с таким MAC не зарегистрировано');
    }
    const deviceId = deviceByMac.id;
    const eventTypeMap: Record<string, string> = {
      door_open: EVENT_TYPE_AKUVOX_DOOR_OPEN,
      incoming_call: EVENT_TYPE_AKUVOX_INCOMING_CALL,
      call_finished: EVENT_TYPE_AKUVOX_CALL_FINISHED,
    };
    const eventType = eventTypeMap[dto.eventType] ?? `akuvox_${dto.eventType}`;
    const data: Record<string, unknown> = {
      mac: dto.mac,
      panelEventType: dto.eventType,
      timestamp: dto.timestamp,
      ...dto.payload,
    };
    const log = await this.eventLogService.create(deviceId, eventType, data);
    this.logger.log(`Akuvox webhook: deviceId=${deviceId} eventType=${dto.eventType} logId=${log.id}`);

    if (dto.eventType === 'incoming_call') {
      const payload = dto.payload ?? {};
      const result = await this.incomingCallService.handleDeviceEvent(deviceId, {
        type: EVENT_TYPE_INCOMING_CALL,
        apartmentId: typeof payload.apartmentId === 'number' ? payload.apartmentId : undefined,
        apartmentNumber: typeof payload.apartmentNumber === 'string' ? payload.apartmentNumber : undefined,
      });
      return { logId: log.id, pushSentTo: result.pushSentTo };
    }
    return { logId: log.id };
  }
}
