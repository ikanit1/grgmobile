import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EventLog } from './entities/event-log.entity';

export interface AuditMeta {
  userId?: string | null;
  organizationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  snapshotUrl?: string | null;
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
      snapshotUrl: meta?.snapshotUrl ?? null,
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

  /** Recent events for given device IDs (for dashboard "last N events"). */
  async findRecentByDeviceIds(deviceIds: number[], limit: number): Promise<EventLog[]> {
    if (deviceIds.length === 0) return [];
    const qb = this.eventLogRepo
      .createQueryBuilder('e')
      .where('e.deviceId IN (:...ids)', { ids: deviceIds })
      .orderBy('e.createdAt', 'DESC')
      .take(Math.min(limit, 100));
    return qb.getMany();
  }

  /** Count events not read by the user (read_by is null or does not contain userId). */
  async countUnreadByDeviceIds(deviceIds: number[], userId: string): Promise<number> {
    if (deviceIds.length === 0) return 0;
    const list = await this.eventLogRepo.find({
      where: { deviceId: In(deviceIds) },
      select: ['id', 'readBy'],
    });
    return list.filter((e) => {
      const readBy = e.readBy as string[] | null | undefined;
      return !readBy || !readBy.includes(userId);
    }).length;
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
