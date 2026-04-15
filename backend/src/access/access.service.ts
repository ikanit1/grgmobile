import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { Building } from '../buildings/entities/building.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { ResidentialComplex } from '../residential-complexes/entities/residential-complex.entity';

const ACCESS_CACHE_TTL = 60_000; // 60 seconds

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(Building)
    private readonly buildingsRepo: Repository<Building>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    @InjectRepository(ResidentialComplex)
    private readonly complexesRepo: Repository<ResidentialComplex>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /** Returns building IDs the user is allowed to access (cached 60s). */
  async getAllowableBuildingIds(user: RequestUser): Promise<number[]> {
    const cacheKey = `allowed_buildings:${user.id}`;
    const cached = await this.cacheManager.get<number[]>(cacheKey);
    if (cached) return cached;

    const ids = await this._fetchAllowableBuildingIds(user);
    await this.cacheManager.set(cacheKey, ids, ACCESS_CACHE_TTL);
    return ids;
  }

  /** Invalidate the building access cache for a specific user (call when roles or apartment assignments change). */
  async invalidateAccessCache(userId: string): Promise<void> {
    await this.cacheManager.del(`allowed_buildings:${userId}`);
  }

  private async _fetchAllowableBuildingIds(user: RequestUser): Promise<number[]> {
    if (user.role === UserRole.SUPER_ADMIN) {
      const list = await this.buildingsRepo.find({ select: { id: true } });
      return list.map((b) => b.id);
    }
    if (user.role === UserRole.ORG_ADMIN && user.organizationId) {
      const list = await this.buildingsRepo
        .createQueryBuilder('b')
        .innerJoin('b.complex', 'c')
        .where('c.organizationId = :orgId', { orgId: user.organizationId })
        .select('b.id')
        .getMany();
      return list.map((b) => b.id);
    }
    if (user.role === UserRole.COMPLEX_MANAGER && user.complexId) {
      const list = await this.buildingsRepo.find({
        where: { complexId: user.complexId },
        select: { id: true },
      });
      return list.map((b) => b.id);
    }
    if (user.role === UserRole.RESIDENT) {
      const uas = await this.userApartmentsRepo.find({
        where: { userId: user.id },
        relations: ['apartment'],
      });
      const now = new Date();
      const ids = new Set<number>();
      for (const ua of uas) {
        if (ua.validUntil != null && ua.validUntil < now) continue;
        if (ua.apartment?.buildingId != null) ids.add(ua.apartment.buildingId);
      }
      return Array.from(ids);
    }
    return [];
  }

  async assertCanAccessBuilding(user: RequestUser, buildingId: number): Promise<void> {
    const allowed = await this.getAllowableBuildingIds(user);
    if (!allowed.includes(buildingId)) {
      throw new ForbiddenException('Нет доступа к этому зданию');
    }
  }

  async assertCanAccessDevice(user: RequestUser, deviceBuildingId: number): Promise<void> {
    return this.assertCanAccessBuilding(user, deviceBuildingId);
  }

  /** Only SUPER_ADMIN or ORG_ADMIN for their own organization. */
  async assertCanAccessOrganization(user: RequestUser, orgId: string): Promise<void> {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (user.role === UserRole.ORG_ADMIN && user.organizationId === orgId) return;
    throw new ForbiddenException('Нет доступа к этой организации');
  }

  /** SUPER_ADMIN, or ORG_ADMIN for org of complex, or COMPLEX_MANAGER for own complex. */
  async assertCanAccessComplex(user: RequestUser, complexId: string): Promise<void> {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (user.role === UserRole.COMPLEX_MANAGER && user.complexId === complexId) return;
    if (user.role === UserRole.ORG_ADMIN && user.organizationId) {
      const c = await this.complexesRepo.findOne({
        where: { id: complexId },
        select: { organizationId: true },
      });
      if (c && c.organizationId === user.organizationId) return;
    }
    throw new ForbiddenException('Нет доступа к этому ЖК');
  }

  /** Can user create a complex in this organization? (SUPER_ADMIN or ORG_ADMIN for this org.) */
  async assertCanCreateComplexInOrganization(
    user: RequestUser,
    organizationId: string,
  ): Promise<void> {
    await this.assertCanAccessOrganization(user, organizationId);
  }

  /** User IDs that have access to the given building (residents with apartments in this building). For push targeting. */
  async getUserIdsWithAccessToBuilding(buildingId: number): Promise<string[]> {
    const now = new Date();
    const rows = await this.userApartmentsRepo
      .createQueryBuilder('ua')
      .innerJoin('ua.apartment', 'apt')
      .where('apt.building_id = :buildingId', { buildingId })
      .andWhere('(ua.valid_until IS NULL OR ua.valid_until >= :now)', { now })
      .select('DISTINCT ua.user_id', 'userId')
      .getRawMany();
    return (rows as { userId: string }[]).map((r) => r.userId);
  }

  /** Building IDs where this resident has apartments. */
  async getBuildingIdsForResident(userId: string): Promise<number[]> {
    const uas = await this.userApartmentsRepo.find({
      where: { userId },
      relations: ['apartment'],
    });
    const ids = new Set<number>();
    for (const ua of uas) {
      if (ua.apartment?.buildingId != null) ids.add(ua.apartment.buildingId);
    }
    return Array.from(ids);
  }

  /**
   * Returns user IDs that this admin is allowed to see in the users list.
   * Returns null for SUPER_ADMIN (means "all users"); otherwise array of allowed user IDs.
   */
  async getViewableUserIds(admin: RequestUser): Promise<string[] | null> {
    if (admin.role === UserRole.SUPER_ADMIN) return null;
    const viewableIds = new Set<string>();
    const buildingIds = await this.getAllowableBuildingIds(admin);
    if (buildingIds.length > 0) {
      const uas = await this.userApartmentsRepo
        .createQueryBuilder('ua')
        .innerJoin('ua.apartment', 'apt')
        .where('apt.building_id IN (:...ids)', { ids: buildingIds })
        .select('DISTINCT ua.user_id', 'userId')
        .getRawMany();
      uas.forEach((r: { userId: string }) => viewableIds.add(r.userId));
    }
    if (admin.role === UserRole.ORG_ADMIN && admin.organizationId) {
      const orgUsers = await this.userApartmentsRepo.manager
        .createQueryBuilder()
        .select('u.id')
        .from('users', 'u')
        .where('u.organization_id = :orgId', { orgId: admin.organizationId })
        .getRawMany();
      orgUsers.forEach((r: { id: string }) => viewableIds.add(r.id));
    }
    if (admin.role === UserRole.COMPLEX_MANAGER && admin.complexId) {
      const complexUsers = await this.userApartmentsRepo.manager
        .createQueryBuilder()
        .select('u.id')
        .from('users', 'u')
        .where('u.complex_id = :complexId', { complexId: admin.complexId })
        .getRawMany();
      complexUsers.forEach((r: { id: string }) => viewableIds.add(r.id));
    }
    return Array.from(viewableIds);
  }

  /** Whether admin can manage (e.g. block) the target user. */
  async canManageUser(admin: RequestUser, target: { id: string; role: UserRole; organizationId?: string; complexId?: string }): Promise<boolean> {
    if (admin.role === UserRole.SUPER_ADMIN) return true;
    if (admin.role === UserRole.ORG_ADMIN && admin.organizationId) {
      if (target.organizationId === admin.organizationId) return true;
      if (target.role === UserRole.RESIDENT) {
        const residentBids = await this.getBuildingIdsForResident(target.id);
        const adminBids = await this.getAllowableBuildingIds(admin);
        return residentBids.some((id) => adminBids.includes(id));
      }
    }
    if (admin.role === UserRole.COMPLEX_MANAGER && admin.complexId) {
      if (target.complexId === admin.complexId) return true;
      if (target.role === UserRole.RESIDENT) {
        const residentBids = await this.getBuildingIdsForResident(target.id);
        const adminBids = await this.getAllowableBuildingIds(admin);
        return residentBids.some((id) => adminBids.includes(id));
      }
    }
    return false;
  }
}
