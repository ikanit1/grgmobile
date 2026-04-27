import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Building } from './entities/building.entity';
import { Device, DeviceRole } from '../devices/entities/device.entity';
import { ResidentialComplex } from '../residential-complexes/entities/residential-complex.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { AccessService } from '../access/access.service';
import { EventLogService } from '../events/event-log.service';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import {
  EVENT_TYPE_BUILDING_CREATED,
  EVENT_TYPE_BUILDING_DELETED,
  EVENT_TYPE_DEVICE_ADDED,
} from '../events/event-types';
import { CredentialsService } from '../credentials/credentials.service';

const DEVICES_CACHE_TTL = 30_000; // 30 seconds

@Injectable()
export class BuildingsService {
  constructor(
    @InjectRepository(Building)
    private readonly buildingsRepo: Repository<Building>,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(ResidentialComplex)
    private readonly complexesRepo: Repository<ResidentialComplex>,
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly credentialsService: CredentialsService,
  ) {}

  /**
   * Buildings the user is allowed to access.
   * RESIDENT: only buildings where user has a user_apartment (linked apartment).
   * ORG_ADMIN/COMPLEX_MANAGER: buildings of their org/complex.
   * SUPER_ADMIN: all buildings. Empty list = no access (e.g. resident not linked to any apartment).
   */
  async findAll(user: RequestUser): Promise<Building[]> {
    const allowedIds = await this.accessService.getAllowableBuildingIds(user);
    if (allowedIds.length === 0) return [];
    return this.buildingsRepo.find({
      where: { id: In(allowedIds) },
      order: { id: 'ASC' },
    });
  }

  /**
   * Buildings available for submitting an application (choose building + apartment).
   * Returns all buildings with apartments for any authenticated user (в т.ч. с пустым списком квартир).
   */
  async findAllForApplication(_user: RequestUser): Promise<Building[]> {
    return this.buildingsRepo.find({
      relations: ['apartments'],
      order: { id: 'ASC' },
    });
  }

  /**
   * Scoped building search by complexId — for residents submitting applications.
   * Returns only id, name, address (no apartment details) of buildings in the given complex.
   * Residents may look up a building to submit a first-time application.
   */
  async searchByComplex(complexId: string): Promise<Array<{ id: number; name: string; address?: string }>> {
    const buildings = await this.buildingsRepo.find({
      where: { complexId },
      select: { id: true, name: true, address: true },
      order: { id: 'ASC' },
    });
    return buildings.map((b) => ({ id: b.id, name: b.name, address: b.address }));
  }

  async findById(id: number): Promise<Building | null> {
    return this.buildingsRepo.findOne({ where: { id } });
  }

  async findOne(id: number, user: RequestUser): Promise<Building> {
    await this.accessService.assertCanAccessBuilding(user, id);
    const building = await this.buildingsRepo.findOne({
      where: { id },
      relations: ['complex'],
    });
    if (!building) throw new NotFoundException('Здание не найдено');
    return building;
  }

  async create(dto: CreateBuildingDto, user: RequestUser): Promise<Building> {
    await this.accessService.assertCanAccessComplex(user, dto.complexId);
    const complex = await this.complexesRepo.findOne({ where: { id: dto.complexId } });
    if (!complex) throw new NotFoundException('ЖК не найден');
    const building = this.buildingsRepo.create({
      complexId: dto.complexId,
      name: dto.name,
      address: dto.address,
    });
    const saved = await this.buildingsRepo.save(building);
    this.eventLogService.create(null, EVENT_TYPE_BUILDING_CREATED, { name: dto.name, complexId: dto.complexId }, {
      userId: user.id,
      organizationId: complex.organizationId,
      entityType: 'building',
      entityId: String(saved.id),
    }).catch(() => {});
    return saved;
  }

  async update(
    id: number,
    dto: UpdateBuildingDto,
    user: RequestUser,
  ): Promise<Building> {
    await this.accessService.assertCanAccessBuilding(user, id);
    const building = await this.buildingsRepo.findOne({ where: { id } });
    if (!building) throw new NotFoundException('Здание не найдено');
    if (dto.name != null) building.name = dto.name;
    if (dto.address != null) building.address = dto.address;
    return this.buildingsRepo.save(building);
  }

  async remove(id: number, user: RequestUser): Promise<void> {
    await this.accessService.assertCanAccessBuilding(user, id);
    const building = await this.buildingsRepo.findOne({ where: { id }, relations: ['apartments', 'devices', 'complex'] });
    if (!building) throw new NotFoundException('Здание не найдено');
    if ((building.apartments?.length ?? 0) > 0 || (building.devices?.length ?? 0) > 0) {
      throw new BadRequestException('Нельзя удалить здание, в котором есть квартиры или устройства. Сначала удалите их.');
    }
    await this.buildingsRepo.remove(building);
    this.eventLogService.create(null, EVENT_TYPE_BUILDING_DELETED, { name: building.name }, {
      userId: user.id,
      organizationId: building.complex?.organizationId ?? null,
      entityType: 'building',
      entityId: String(id),
    }).catch(() => {});
  }

  async findDevices(buildingId: number, user: RequestUser): Promise<Device[]> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);

    // Admins always see all devices — use cache
    const residentFloors = await this.accessService.getResidentFloorsInBuilding(user, buildingId);
    if (residentFloors === null) {
      const cacheKey = `devices:building:${buildingId}`;
      const cached = await this.cacheManager.get<Device[]>(cacheKey);
      if (cached) return cached;
      const devices = await this.devicesRepo.find({ where: { buildingId } });
      await this.cacheManager.set(cacheKey, devices, DEVICES_CACHE_TTL);
      return devices;
    }

    // RESIDENT: hide NVR infrastructure; show devices with no floor restriction OR
    // matching resident's floor(s)
    const all = await this.devicesRepo.find({ where: { buildingId } });
    return all.filter(
      (d) =>
        d.role !== DeviceRole.NVR &&
        (d.floor == null || residentFloors.includes(d.floor)),
    );
  }

  async invalidateDevicesCache(buildingId: number): Promise<void> {
    await this.cacheManager.del(`devices:building:${buildingId}`);
  }

  /** Ручное добавление устройства к зданию (без ONVIF discovery). */
  async addDevice(
    buildingId: number,
    dto: {
      name: string;
      host: string;
      type: Device['type'];
      role: Device['role'];
      username?: string;
      password?: string;
      httpPort?: number;
      rtspPort?: number;
      sipPort?: number;
      defaultChannel?: number;
      defaultStream?: string;
      macAddress?: string;
      floor?: number | null;
      nvrId?: number | null;
    },
    user: RequestUser,
  ): Promise<Device> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);
    const building = await this.buildingsRepo.findOne({
      where: { id: buildingId },
      relations: ['complex'],
    });
    if (!building) throw new NotFoundException('Здание не найдено');
    const orgId = building.complex?.organizationId;
    if (orgId) {
      const org = await this.orgsRepo.findOne({ where: { id: orgId } });
      if (org?.maxDevices != null) {
        const count = await this.devicesRepo
          .createQueryBuilder('d')
          .innerJoin('d.building', 'b')
          .innerJoin('b.complex', 'c')
          .where('c.organizationId = :orgId', { orgId })
          .getCount();
        if (count >= org.maxDevices) {
          throw new ForbiddenException(
            `Достигнут лимит устройств организации (${org.maxDevices}). Нельзя добавить больше устройств.`,
          );
        }
      }
    }
    // Encrypt credentials if provided
    let credentials: Record<string, string> | undefined = undefined;
    if (dto.username || dto.password) {
      credentials = this.credentialsService.encrypt({
        username: dto.username ?? '',
        password: dto.password ?? '',
      });
    }

    const dev = this.devicesRepo.create({
      buildingId,
      name: dto.name,
      host: dto.host,
      type: dto.type,
      role: dto.role,
      username: credentials ? undefined : dto.username, // undefined if credentials used
      password: credentials ? undefined : dto.password,
      credentials,
      httpPort: dto.httpPort ?? 80,
      rtspPort: dto.rtspPort ?? 554,
      sipPort: dto.sipPort,
      defaultChannel: dto.defaultChannel,
      defaultStream: dto.defaultStream,
      macAddress: dto.macAddress,
      floor: dto.floor ?? null,
      nvrId: dto.nvrId ?? null,
    });
    const saved = await this.devicesRepo.save(dev) as Device;
    this.eventLogService.create(null, EVENT_TYPE_DEVICE_ADDED, { name: dto.name, host: dto.host, type: dto.type }, {
      userId: user.id,
      organizationId: building.complex?.organizationId ?? null,
      entityType: 'device',
      entityId: String(saved.id),
    }).catch(() => {});
    await this.invalidateDevicesCache(buildingId);
    return saved;
  }
}
