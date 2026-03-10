import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventLog } from './entities/event-log.entity';

export interface AuditMeta {
  userId?: string | null;
  organizationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

@Injectable()
export class EventLogService {
  constructor(
    @InjectRepository(EventLog)
    private readonly eventLogRepo: Repository<EventLog>,
  ) {}

  async create(
    deviceId: number | null,
    eventType: string,
    data?: Record<string, unknown>,
    meta?: AuditMeta,
  ): Promise<EventLog> {
    const log = this.eventLogRepo.create({
      deviceId,
      eventType,
      data,
      userId: meta?.userId ?? null,
      organizationId: meta?.organizationId ?? null,
      entityType: meta?.entityType ?? null,
      entityId: meta?.entityId ?? null,
    });
    return this.eventLogRepo.save(log);
  }

  /** Обнулить device_id в логах перед удалением устройства (чтобы не блокировать DELETE по FK). */
  async clearDeviceReferences(deviceId: number): Promise<void> {
    await this.eventLogRepo.update({ deviceId }, { deviceId: null });
  }

  /** Обнулить user_id в логах перед удалением пользователя. */
  async clearUserReferences(userId: string): Promise<void> {
    await this.eventLogRepo.update({ userId }, { userId: null });
  }

  async findByDevice(
    deviceId: number,
    options?: { from?: string; to?: string; limit?: number },
  ): Promise<EventLog[]> {
    const qb = this.eventLogRepo
      .createQueryBuilder('e')
      .where('e.deviceId = :deviceId', { deviceId })
      .orderBy('e.createdAt', 'DESC');
    if (options?.from) {
      qb.andWhere('e.createdAt >= :from', { from: options.from });
    }
    if (options?.to) {
      qb.andWhere('e.createdAt <= :to', { to: options.to });
    }
    const limit = Math.min(options?.limit ?? 50, 200);
    qb.take(limit);
    return qb.getMany();
  }

  /** Find audit events for a specific organisation (for monitoring / NOC dashboard). */
  async findByOrganization(
    organizationId: string,
    options?: { from?: string; to?: string; limit?: number; eventType?: string },
  ): Promise<EventLog[]> {
    const qb = this.eventLogRepo
      .createQueryBuilder('e')
      .where('e.organizationId = :organizationId', { organizationId })
      .orderBy('e.createdAt', 'DESC');
    if (options?.eventType) {
      qb.andWhere('e.eventType = :eventType', { eventType: options.eventType });
    }
    if (options?.from) {
      qb.andWhere('e.createdAt >= :from', { from: options.from });
    }
    if (options?.to) {
      qb.andWhere('e.createdAt <= :to', { to: options.to });
    }
    const limit = Math.min(options?.limit ?? 100, 500);
    qb.take(limit);
    return qb.getMany();
  }
}
