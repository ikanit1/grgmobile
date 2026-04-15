import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceType } from '../devices/entities/device.entity';
import { PanelResident, PanelResidentSyncStatus } from './entities/panel-resident.entity';
import { DevicesService } from '../devices/devices.service';
import { AccessService } from '../access/access.service';
import { AkuvoxClient } from '../vendors/akuvox/akuvox.client';
import { EventLogService } from '../events/event-log.service';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { CreatePanelResidentDto } from './dto/create-panel-resident.dto';
import { UpdatePanelResidentDto } from './dto/update-panel-resident.dto';
import { Apartment } from '../apartments/entities/apartment.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';

const BULK_CHUNK_SIZE = 10;

@Injectable()
export class PanelResidentService {
  constructor(
    @InjectRepository(PanelResident)
    private readonly repo: Repository<PanelResident>,
    @InjectRepository(Apartment)
    private readonly apartmentsRepo: Repository<Apartment>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    private readonly devicesService: DevicesService,
    private readonly accessService: AccessService,
    private readonly akuvoxClient: AkuvoxClient,
    private readonly eventLogService: EventLogService,
  ) {}

  private async assertAkuvoxDevice(deviceId: number, user: RequestUser) {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    if (device.type !== DeviceType.AKUVOX) {
      throw new BadRequestException('Устройство не является панелью Akuvox');
    }
    return device;
  }

  private async assertCanWrite(user: RequestUser, deviceId: number) {
    const device = await this.devicesService.findById(deviceId);
    await this.accessService.assertCanAccessDevice(user, device.buildingId);
    if (user.role === UserRole.RESIDENT) {
      throw new ForbiddenException('Только COMPLEX_MANAGER и выше могут изменять жителей панели');
    }
  }

  async getAll(
    deviceId: number,
    user: RequestUser,
    options?: { page?: number; limit?: number; search?: string; syncStatus?: string },
  ) {
    await this.assertAkuvoxDevice(deviceId, user);
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 50));
    const skip = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.device_id = :deviceId', { deviceId })
      .orderBy('p.name', 'ASC')
      .skip(skip)
      .take(limit);

    if (options?.search?.trim()) {
      qb.andWhere('(p.name ILIKE :search OR p.panel_user_id ILIKE :search)', {
        search: `%${options.search.trim()}%`,
      });
    }
    if (options?.syncStatus && Object.values(PanelResidentSyncStatus).includes(options.syncStatus as PanelResidentSyncStatus)) {
      qb.andWhere('p.sync_status = :syncStatus', { syncStatus: options.syncStatus });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async syncFromDevice(deviceId: number, user: RequestUser) {
    const device = await this.assertAkuvoxDevice(deviceId, user);
    await this.assertCanWrite(user, deviceId);

    const panelList = await this.akuvoxClient.getUserList(device);
    const panelUserIds = new Set(
      (Array.isArray(panelList) ? panelList : []).map((item: any) => String(item?.UserID ?? item?.user_id ?? item?.userId ?? '').trim()).filter(Boolean),
    );

    const existing = await this.repo.find({ where: { deviceId } });
    const existingByPanelId = new Map(existing.map((e) => [e.panelUserId, e]));

    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const item of Array.isArray(panelList) ? panelList : []) {
      const raw = item as Record<string, unknown>;
      const panelUserId = String(raw?.UserID ?? raw?.user_id ?? raw?.userId ?? '').trim();
      if (!panelUserId) continue;
      const name = String(raw?.Name ?? raw?.name ?? '').trim() || panelUserId;
      const webRelay = raw?.WebRelay != null ? String(raw.WebRelay) : null;
      const liftFloorNum = raw?.LiftFloorNum != null ? String(raw.LiftFloorNum) : null;
      const scheduleRelay = typeof raw?.['Schedule-Relay'] === 'object' ? (raw['Schedule-Relay'] as Record<string, unknown>) : null;

      const current = existingByPanelId.get(panelUserId);
      if (current) {
        current.name = name;
        current.webRelay = webRelay;
        current.liftFloorNum = liftFloorNum;
        current.scheduleRelay = scheduleRelay;
        current.syncStatus = PanelResidentSyncStatus.SYNCED;
        current.syncError = null;
        current.syncedAt = new Date();
        await this.repo.save(current);
        updated++;
      } else {
        const newResident = this.repo.create({
          deviceId,
          panelUserId,
          name,
          webRelay,
          liftFloorNum,
          scheduleRelay,
          syncStatus: PanelResidentSyncStatus.SYNCED,
          syncedAt: new Date(),
        });
        await this.repo.save(newResident);
        added++;
      }
    }

    for (const rec of existing) {
      if (!panelUserIds.has(rec.panelUserId)) {
        if (rec.syncStatus === PanelResidentSyncStatus.SYNCED) {
          await this.repo.remove(rec);
          removed++;
        }
      }
    }

    this.eventLogService.create(deviceId, 'panel_residents_sync', { added, updated, removed, userId: user.id }, { userId: user.id }).catch(() => {});
    return { added, updated, removed };
  }

  async create(deviceId: number, dto: CreatePanelResidentDto, user: RequestUser) {
    const device = await this.assertAkuvoxDevice(deviceId, user);
    await this.assertCanWrite(user, deviceId);

    const existing = await this.repo.findOne({ where: { deviceId, panelUserId: dto.panelUserId } });
    if (existing) throw new BadRequestException(`Житель с ID «${dto.panelUserId}» уже есть на панели`);

    const resident = this.repo.create({
      deviceId,
      panelUserId: dto.panelUserId,
      name: dto.name,
      apartmentId: dto.apartmentId ?? null,
      webRelay: dto.webRelay ?? null,
      liftFloorNum: dto.liftFloorNum ?? null,
      scheduleRelay: dto.scheduleRelay ?? null,
      syncStatus: PanelResidentSyncStatus.PENDING_ADD,
    });
    await this.repo.save(resident);

    const item = {
      UserID: dto.panelUserId,
      Name: dto.name,
      WebRelay: dto.webRelay != null ? parseInt(String(dto.webRelay), 10) || 0 : 0,
      LiftFloorNum: dto.liftFloorNum != null ? parseInt(String(dto.liftFloorNum), 10) || 0 : 0,
      'Schedule-Relay': dto.scheduleRelay ? (typeof dto.scheduleRelay === 'string' ? dto.scheduleRelay : '1001-12;') : '1001-12;',
    };
    const result = await this.akuvoxClient.addUser(device, [item]);
    if (result.success) {
      resident.syncStatus = PanelResidentSyncStatus.SYNCED;
      resident.syncedAt = new Date();
      resident.syncError = null;
      await this.repo.save(resident);
    } else {
      resident.syncStatus = PanelResidentSyncStatus.ERROR;
      resident.syncError = result.message ?? 'Ошибка добавления на панель';
      await this.repo.save(resident);
    }
    this.eventLogService.create(deviceId, 'panel_resident_create', { panelUserId: dto.panelUserId, success: result.success, userId: user.id }, { userId: user.id }).catch(() => {});
    return { ...resident, panelSyncSuccess: result.success };
  }

  async update(deviceId: number, panelUserId: string, dto: UpdatePanelResidentDto, user: RequestUser) {
    const device = await this.assertAkuvoxDevice(deviceId, user);
    await this.assertCanWrite(user, deviceId);

    const resident = await this.repo.findOne({ where: { deviceId, panelUserId } });
    if (!resident) throw new NotFoundException('Житель не найден');

    if (dto.name !== undefined) resident.name = dto.name;
    if (dto.apartmentId !== undefined) resident.apartmentId = dto.apartmentId ?? null;
    if (dto.webRelay !== undefined) resident.webRelay = dto.webRelay ?? null;
    if (dto.liftFloorNum !== undefined) resident.liftFloorNum = dto.liftFloorNum ?? null;
    if (dto.scheduleRelay !== undefined) resident.scheduleRelay = dto.scheduleRelay ?? null;
    resident.syncStatus = PanelResidentSyncStatus.PENDING_UPDATE;
    await this.repo.save(resident);

    const item = {
      UserID: panelUserId,
      Name: resident.name,
      WebRelay: resident.webRelay ?? '0',
      LiftFloorNum: resident.liftFloorNum ?? '0',
      'Schedule-Relay': resident.scheduleRelay ?? '1001-12;',
    };
    const result = await this.akuvoxClient.setUser(device, [item]);
    if (result.success) {
      resident.syncStatus = PanelResidentSyncStatus.SYNCED;
      resident.syncedAt = new Date();
      resident.syncError = null;
      await this.repo.save(resident);
    } else {
      resident.syncStatus = PanelResidentSyncStatus.ERROR;
      resident.syncError = result.message ?? 'Ошибка обновления на панели';
      await this.repo.save(resident);
    }
    this.eventLogService.create(deviceId, 'panel_resident_update', { panelUserId, success: result.success, userId: user.id }, { userId: user.id }).catch(() => {});
    return { ...resident, panelSyncSuccess: result.success };
  }

  async remove(deviceId: number, panelUserId: string, user: RequestUser) {
    const device = await this.assertAkuvoxDevice(deviceId, user);
    await this.assertCanWrite(user, deviceId);

    const resident = await this.repo.findOne({ where: { deviceId, panelUserId } });
    if (!resident) throw new NotFoundException('Житель не найден');

    resident.syncStatus = PanelResidentSyncStatus.PENDING_DELETE;
    await this.repo.save(resident);

    const result = await this.akuvoxClient.delUser(device, [panelUserId]);
    if (result.success) {
      await this.repo.remove(resident);
    } else {
      resident.syncStatus = PanelResidentSyncStatus.ERROR;
      resident.syncError = result.message ?? 'Ошибка удаления с панели';
      await this.repo.save(resident);
    }
    this.eventLogService.create(deviceId, 'panel_resident_delete', { panelUserId, success: result.success, userId: user.id }, { userId: user.id }).catch(() => {});
    return { success: result.success, deleted: result.success };
  }

  async bulkImport(deviceId: number, residents: CreatePanelResidentDto[], user: RequestUser) {
    const device = await this.assertAkuvoxDevice(deviceId, user);
    await this.assertCanWrite(user, deviceId);

    const results = { added: 0, errors: [] as string[] };
    for (let i = 0; i < residents.length; i += BULK_CHUNK_SIZE) {
      const chunk = residents.slice(i, i + BULK_CHUNK_SIZE);
      const items = chunk.map((d) => ({
        UserID: d.panelUserId,
        Name: d.name,
        WebRelay: d.webRelay != null ? parseInt(String(d.webRelay), 10) || 0 : 0,
        LiftFloorNum: d.liftFloorNum != null ? parseInt(String(d.liftFloorNum), 10) || 0 : 0,
        'Schedule-Relay': d.scheduleRelay ? (typeof d.scheduleRelay === 'object' ? '1001-12;' : String(d.scheduleRelay)) : '1001-12;',
      }));
      const result = await this.akuvoxClient.addUser(device, items);
      if (result.success) {
        for (const d of chunk) {
          const resident = this.repo.create({
            deviceId,
            panelUserId: d.panelUserId,
            name: d.name,
            apartmentId: d.apartmentId ?? null,
            webRelay: d.webRelay ?? null,
            liftFloorNum: d.liftFloorNum ?? null,
            scheduleRelay: d.scheduleRelay ?? null,
            syncStatus: PanelResidentSyncStatus.SYNCED,
            syncedAt: new Date(),
          });
          await this.repo.save(resident);
          results.added++;
        }
      } else {
        results.errors.push(result.message ?? `Чанк ${i / BULK_CHUNK_SIZE + 1}: ошибка`);
      }
    }
    this.eventLogService.create(deviceId, 'panel_residents_bulk_import', { added: results.added, errors: results.errors.length, userId: user.id }, { userId: user.id }).catch(() => {});
    return results;
  }

  async importFromApartments(deviceId: number, user: RequestUser) {
    const device = await this.assertAkuvoxDevice(deviceId, user);
    await this.assertCanWrite(user, deviceId);

    const apartments = await this.apartmentsRepo.find({
      where: { buildingId: device.buildingId },
      order: { number: 'ASC' },
    });
    const apartmentIds = apartments.map((a) => a.id);
    if (apartmentIds.length === 0) return { added: 0, errors: [] };

    const uas = await this.userApartmentsRepo.find({
      where: { apartmentId: In(apartmentIds) },
      relations: ['user', 'apartment'],
    });
    const byApartment = new Map<number, { name: string; number: string }[]>();
    for (const ua of uas) {
      if (!ua.user?.name && !ua.user?.email && !ua.user?.phone) continue;
      const apt = ua.apartment;
      if (!apt) continue;
      const list = byApartment.get(apt.id) ?? [];
      list.push({
        name: (ua.user as any).name ?? (ua.user as any).email ?? (ua.user as any).phone ?? apt.number,
        number: apt.number,
      });
      byApartment.set(apt.id, list);
    }

    const residents: CreatePanelResidentDto[] = [];
    const seen = new Set<string>();
    for (const apt of apartments) {
      const list = byApartment.get(apt.id);
      const panelUserId = apt.extension?.trim() || apt.number;
      if (seen.has(panelUserId)) continue;
      seen.add(panelUserId);
      const name = list?.length ? list[0].name : `Кв. ${apt.number}`;
      residents.push({ panelUserId, name, apartmentId: apt.id });
    }
    return this.bulkImport(deviceId, residents, user);
  }

  async bulkDelete(deviceId: number, panelUserIds: string[], user: RequestUser) {
    const device = await this.assertAkuvoxDevice(deviceId, user);
    await this.assertCanWrite(user, deviceId);

    const result = await this.akuvoxClient.delUser(device, panelUserIds);
    if (result.success) {
      await this.repo.delete({ deviceId, panelUserId: In(panelUserIds) });
    }
    this.eventLogService.create(deviceId, 'panel_residents_bulk_delete', { count: panelUserIds.length, success: result.success, userId: user.id }, { userId: user.id }).catch(() => {});
    return { success: result.success, deleted: result.success ? panelUserIds.length : 0 };
  }

  async getSyncStatus(deviceId: number, user: RequestUser) {
    await this.assertAkuvoxDevice(deviceId, user);

    const list = await this.repo.find({ where: { deviceId }, select: ['syncStatus'] });
    const total = list.length;
    const synced = list.filter((p) => p.syncStatus === PanelResidentSyncStatus.SYNCED).length;
    const pending = list.filter((p) =>
      [PanelResidentSyncStatus.PENDING_ADD, PanelResidentSyncStatus.PENDING_UPDATE, PanelResidentSyncStatus.PENDING_DELETE].includes(p.syncStatus),
    ).length;
    const errors = list.filter((p) => p.syncStatus === PanelResidentSyncStatus.ERROR).length;
    const lastSynced = await this.repo
      .createQueryBuilder('p')
      .where('p.device_id = :deviceId', { deviceId })
      .andWhere('p.synced_at IS NOT NULL')
      .select('MAX(p.synced_at)', 'max')
      .getRawOne();
    return {
      total,
      synced,
      pending,
      errors,
      lastSyncedAt: lastSynced?.max ?? null,
    };
  }

  async clearAll(deviceId: number, user: RequestUser) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Только SUPER_ADMIN может очистить всех жителей панели');
    }
    const device = await this.assertAkuvoxDevice(deviceId, user);
    const result = await this.akuvoxClient.clearUsers(device);
    if (result.success) {
      await this.repo.delete({ deviceId });
    }
    this.eventLogService.create(deviceId, 'panel_residents_clear', { success: result.success, userId: user.id }, { userId: user.id }).catch(() => {});
    return { success: result.success };
  }
}
