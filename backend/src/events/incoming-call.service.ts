import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Device } from '../devices/entities/device.entity';
import { Apartment } from '../apartments/entities/apartment.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { EventLogService } from './event-log.service';
import { PushService } from '../push/push.service';
import { EVENT_TYPE_INCOMING_CALL } from './event-types';

export interface DeviceEventDto {
  type: string;
  apartmentId?: number;
  apartmentNumber?: string;
  snapshotUrl?: string;
}

@Injectable()
export class IncomingCallService {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(Apartment)
    private readonly apartmentsRepo: Repository<Apartment>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    private readonly eventLogService: EventLogService,
    private readonly pushService: PushService,
  ) {}

  /**
   * Process device event: save to event_log and if type is incoming_call,
   * resolve residents and send push.
   */
  async handleDeviceEvent(
    deviceId: number,
    dto: DeviceEventDto,
  ): Promise<{ logId: number; pushSentTo?: string[] }> {
    const device = await this.devicesRepo.findOne({
      where: { id: deviceId },
      relations: ['building'],
    });
    if (!device) throw new NotFoundException('Устройство не найдено');

    const data: Record<string, unknown> = {
      apartmentId: dto.apartmentId,
      apartmentNumber: dto.apartmentNumber,
      snapshotUrl: dto.snapshotUrl,
    };
    const log = await this.eventLogService.create(deviceId, dto.type, data);

    if (dto.type === EVENT_TYPE_INCOMING_CALL) {
      const userIds = await this.getResidentIdsForCall(
        device.buildingId,
        dto.apartmentId,
        dto.apartmentNumber,
      );
      const buildingName = device.building?.name;
      const apartmentNumber = dto.apartmentNumber ?? (dto.apartmentId ? await this.getApartmentNumber(dto.apartmentId) : '?');
      await this.pushService.sendIncomingCallPush(userIds, {
        apartmentNumber,
        buildingName,
        deviceId,
      });
      return { logId: log.id, pushSentTo: userIds };
    }

    return { logId: log.id };
  }

  private async getApartmentNumber(apartmentId: number): Promise<string> {
    const apt = await this.apartmentsRepo.findOne({
      where: { id: apartmentId },
      select: { number: true },
    });
    return apt?.number ?? '?';
  }

  /**
   * Get list of user IDs (residents) for the call.
   * If apartmentId/apartmentNumber given — только жители этой квартиры.
   * If not — все жители здания (все привязанные к квартирам в здании).
   */
  private async getResidentIdsForCall(
    buildingId: number,
    apartmentId?: number,
    apartmentNumber?: string,
  ): Promise<string[]> {
    const now = new Date();

    if (apartmentId || apartmentNumber) {
      let apartment: Apartment | null = null;
      if (apartmentId) {
        apartment = await this.apartmentsRepo.findOne({
          where: { id: apartmentId, buildingId },
        });
      } else if (apartmentNumber) {
        apartment = await this.apartmentsRepo.findOne({
          where: { buildingId, number: apartmentNumber },
        });
      }
      if (!apartment) return [];
      const bindings = await this.userApartmentsRepo.find({
        where: { apartmentId: apartment.id },
        relations: ['user'],
      });
      const active = bindings.filter((ua) => {
        if (!ua.validUntil) return true;
        return new Date(ua.validUntil) >= now;
      });
      return [...new Set(active.map((ua) => ua.userId))];
    }

    const apartmentsInBuilding = await this.apartmentsRepo.find({
      where: { buildingId },
      select: { id: true },
    });
    const aptIds = apartmentsInBuilding.map((a) => a.id);
    if (aptIds.length === 0) return [];
    const bindings = await this.userApartmentsRepo.find({
      where: { apartmentId: In(aptIds) },
      relations: ['user'],
    });
    const active = bindings.filter((ua) => {
      if (!ua.validUntil) return true;
      return new Date(ua.validUntil) >= now;
    });
    return [...new Set(active.map((ua) => ua.userId))];
  }
}
