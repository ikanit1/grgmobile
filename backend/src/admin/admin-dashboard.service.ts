import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { AccessService } from '../access/access.service';
import { Organization } from '../organizations/entities/organization.entity';
import { ResidentialComplex } from '../residential-complexes/entities/residential-complex.entity';
import { Building } from '../buildings/entities/building.entity';
import { Device } from '../devices/entities/device.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { ApartmentApplication } from '../apartments/entities/apartment-application.entity';
import { ApplicationStatus } from '../apartments/entities/apartment-application.entity';

export interface DashboardStats {
  organizations?: number;
  complexes: number;
  buildings: number;
  devices: number;
  devicesOnline: number;
  devicesOffline: number;
  residents: number;
  applicationsPending: number;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly accessService: AccessService,
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
    @InjectRepository(ResidentialComplex)
    private readonly complexesRepo: Repository<ResidentialComplex>,
    @InjectRepository(Building)
    private readonly buildingsRepo: Repository<Building>,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    @InjectRepository(ApartmentApplication)
    private readonly applicationsRepo: Repository<ApartmentApplication>,
  ) {}

  async getStats(user: RequestUser): Promise<DashboardStats> {
    const buildingIds = await this.accessService.getAllowableBuildingIds(user);

    const stats: DashboardStats = {
      complexes: 0,
      buildings: buildingIds.length,
      devices: 0,
      devicesOnline: 0,
      devicesOffline: 0,
      residents: 0,
      applicationsPending: 0,
    };

    if (user.role === UserRole.SUPER_ADMIN) {
      const [orgCount, complexCount, buildingCount, deviceCount, onlineCount, residentCount, pendingCount] = await Promise.all([
        this.orgsRepo.count(),
        this.complexesRepo.count(),
        this.buildingsRepo.count(),
        this.devicesRepo.createQueryBuilder('d').where('d.nvr_id IS NULL').getCount(),
        this.devicesRepo.createQueryBuilder('d').where('d.nvr_id IS NULL').andWhere('d.status = :s', { s: 'online' }).getCount(),
        this.countDistinctResidents(),
        this.applicationsRepo.count({ where: { status: ApplicationStatus.PENDING } }),
      ]);
      stats.organizations = orgCount;
      stats.complexes = complexCount;
      stats.buildings = buildingCount;
      stats.devices = deviceCount;
      stats.devicesOnline = onlineCount;
      stats.devicesOffline = Math.max(0, deviceCount - onlineCount);
      stats.residents = residentCount;
      stats.applicationsPending = pendingCount;
      return stats;
    }

    if (buildingIds.length === 0) return stats;

    const [deviceCount, onlineCount, residentCount, pendingCount] = await Promise.all([
      this.devicesRepo
        .createQueryBuilder('d')
        .where('d.building_id IN (:...ids)', { ids: buildingIds })
        .andWhere('d.nvr_id IS NULL')
        .getCount(),
      this.devicesRepo
        .createQueryBuilder('d')
        .where('d.building_id IN (:...ids)', { ids: buildingIds })
        .andWhere('d.nvr_id IS NULL')
        .andWhere('d.status = :status', { status: 'online' })
        .getCount(),
      this.userApartmentsRepo
        .createQueryBuilder('ua')
        .innerJoin('ua.apartment', 'apt')
        .where('apt.building_id IN (:...ids)', { ids: buildingIds })
        .select('COUNT(DISTINCT ua.user_id)', 'c')
        .getRawOne()
        .then((r) => Number(r?.c ?? 0)),
      this.applicationsRepo
        .createQueryBuilder('a')
        .innerJoin('a.apartment', 'apt')
        .where('apt.building_id IN (:...ids)', { ids: buildingIds })
        .andWhere('a.status = :status', { status: ApplicationStatus.PENDING })
        .getCount(),
    ]);

    const rawRows = await this.buildingsRepo
      .createQueryBuilder('b')
      .select('DISTINCT b.complex_id', 'complexId')
      .where('b.id IN (:...ids)', { ids: buildingIds })
      .getRawMany();
    const complexIds = rawRows.map((r: any) => r.complexId ?? r.b_complex_id).filter(Boolean);

    stats.complexes = complexIds.length;
    stats.devices = deviceCount;
    stats.devicesOnline = onlineCount;
    stats.devicesOffline = Math.max(0, deviceCount - onlineCount);
    stats.residents = residentCount;
    stats.applicationsPending = pendingCount;
    return stats;
  }

  private async countDistinctResidents(): Promise<number> {
    const r = await this.userApartmentsRepo
      .createQueryBuilder('ua')
      .select('COUNT(DISTINCT ua.user_id)', 'c')
      .getRawOne();
    return Number(r?.c ?? 0);
  }
}
