import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncomingCallService } from '../events/incoming-call.service';
import { EventLogService } from '../events/event-log.service';
import {
  EVENT_TYPE_INCOMING_CALL,
  EVENT_TYPE_UNIVIEW_DOOR_OPEN,
  EVENT_TYPE_UNIVIEW_MOTION,
  EVENT_TYPE_UNIVIEW_ALARM,
  EVENT_TYPE_UNIVIEW_TAMPER,
} from '../events/event-types';
import { IntercomEventDto } from './dto/intercom-event.dto';
import { UniviewWebhookDto } from './dto/uniview-webhook.dto';
import { Device } from '../devices/entities/device.entity';

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

  async handleUniviewEvent(dto: UniviewWebhookDto, secret?: string): Promise<{ logId: number; pushSentTo?: string[] }> {
    this.validateSecret(secret);

    const device = await this.devicesRepo.findOne({
      where: { host: dto.deviceIp },
      relations: ['building'],
    });
    if (!device) {
      this.logger.warn(`Uniview webhook: unknown IP ${dto.deviceIp}`);
      throw new ForbiddenException('Устройство с таким IP не зарегистрировано');
    }

    const eventTypeMap: Record<string, string> = {
      door_open: EVENT_TYPE_UNIVIEW_DOOR_OPEN,
      motion: EVENT_TYPE_UNIVIEW_MOTION,
      alarm: EVENT_TYPE_UNIVIEW_ALARM,
      tamper: EVENT_TYPE_UNIVIEW_TAMPER,
    };
    const eventType = eventTypeMap[dto.eventType] ?? `uniview_${dto.eventType}`;
    const data: Record<string, unknown> = {
      deviceIp: dto.deviceIp,
      panelEventType: dto.eventType,
      timestamp: dto.timestamp,
      ...dto.payload,
    };

    const log = await this.eventLogService.create(device.id, eventType, data);
    this.logger.log(`Uniview webhook: deviceId=${device.id} eventType=${dto.eventType} logId=${log.id}`);

    if (dto.eventType === 'door_open') {
      const result = await this.incomingCallService.handleDeviceEvent(device.id, {
        type: EVENT_TYPE_INCOMING_CALL,
      });
      return { logId: log.id, pushSentTo: result.pushSentTo };
    }
    return { logId: log.id };
  }
}
