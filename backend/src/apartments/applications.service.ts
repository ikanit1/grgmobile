import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApartmentApplication, ApplicationStatus } from './entities/apartment-application.entity';
import { Apartment } from './entities/apartment.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { UserRole } from '../users/entities/user.entity';
import { AccessService } from '../access/access.service';
import { EventLogService } from '../events/event-log.service';
import { RequestUser } from '../auth/request-user.interface';
import { EVENT_TYPE_APPLICATION_SUBMITTED, EVENT_TYPE_APPLICATION_DECIDED } from '../events/event-types';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(ApartmentApplication)
    private readonly applicationsRepo: Repository<ApartmentApplication>,
    @InjectRepository(Apartment)
    private readonly apartmentsRepo: Repository<Apartment>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
  ) {}

  /** RESIDENT: submit application to bind to apartment. */
  async apply(apartmentId: number, user: RequestUser): Promise<ApartmentApplication> {
    if (user.role !== UserRole.RESIDENT) {
      throw new ForbiddenException('Подавать заявку на привязку к квартире могут только жители');
    }
    const apartment = await this.apartmentsRepo.findOne({
      where: { id: apartmentId },
      relations: ['building'],
    });
    if (!apartment) throw new NotFoundException('Квартира не найдена');

    const alreadyLinked = await this.userApartmentsRepo.findOne({
      where: { userId: user.id, apartmentId },
    });
    if (alreadyLinked) {
      throw new ConflictException('Вы уже привязаны к этой квартире');
    }

    const pending = await this.applicationsRepo.findOne({
      where: { userId: user.id, apartmentId, status: ApplicationStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException('У вас уже есть заявка на эту квартиру');
    }

    const app = this.applicationsRepo.create({
      userId: user.id,
      apartmentId,
      status: ApplicationStatus.PENDING,
    });
    const saved = await this.applicationsRepo.save(app);
    this.eventLogService.create(null, EVENT_TYPE_APPLICATION_SUBMITTED, { apartmentId }, {
      userId: user.id,
      entityType: 'application',
      entityId: String(saved.id),
    }).catch(() => {});
    return saved;
  }

  /** ORG_ADMIN / COMPLEX_MANAGER / SUPER_ADMIN: list applications with optional filters. */
  async listForStaff(
    user: RequestUser,
    filters: { buildingId?: number; complexId?: string; organizationId?: string; status?: ApplicationStatus },
  ): Promise<ApartmentApplication[]> {
    const allowedBuildingIds = await this.accessService.getAllowableBuildingIds(user);
    if (allowedBuildingIds.length === 0) return [];

    const qb = this.applicationsRepo
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.apartment', 'apt')
      .innerJoinAndSelect('apt.building', 'b')
      .innerJoinAndSelect('b.complex', 'c')
      .innerJoinAndSelect('a.user', 'u')
      .where('b.id IN (:...ids)', { ids: allowedBuildingIds });

    if (filters.buildingId != null) {
      qb.andWhere('b.id = :buildingId', { buildingId: filters.buildingId });
    }
    if (filters.complexId != null) {
      qb.andWhere('c.id = :complexId', { complexId: filters.complexId });
    }
    if (filters.organizationId != null) {
      qb.andWhere('c.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      });
    }
    if (filters.status != null) {
      qb.andWhere('a.status = :status', { status: filters.status });
    }

    return qb.orderBy('a.requestedAt', 'DESC').getMany();
  }

  /** ORG_ADMIN / COMPLEX_MANAGER / SUPER_ADMIN: approve or reject application. */
  async decide(
    applicationId: number,
    dto: { status: ApplicationStatus.APPROVED | ApplicationStatus.REJECTED; rejectReason?: string },
    user: RequestUser,
  ): Promise<ApartmentApplication> {
    const app = await this.applicationsRepo.findOne({
      where: { id: applicationId },
      relations: ['apartment', 'apartment.building', 'user'],
    });
    if (!app) throw new NotFoundException('Заявка не найдена');
    await this.accessService.assertCanAccessBuilding(user, app.apartment.buildingId);

    if (app.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('По заявке уже принято решение');
    }

    app.status = dto.status;
    app.decidedAt = new Date();
    app.decidedBy = user.id;
    app.rejectReason = dto.rejectReason ?? null;
    await this.applicationsRepo.save(app);
    this.eventLogService.create(null, EVENT_TYPE_APPLICATION_DECIDED, { status: dto.status, rejectReason: dto.rejectReason }, {
      userId: user.id,
      organizationId: user.organizationId ?? null,
      entityType: 'application',
      entityId: String(applicationId),
    }).catch(() => {});

    if (dto.status === ApplicationStatus.APPROVED) {
      const existing = await this.userApartmentsRepo.findOne({
        where: { userId: app.userId, apartmentId: app.apartmentId },
      });
      if (!existing) {
        const ua = this.userApartmentsRepo.create({
          userId: app.userId,
          apartmentId: app.apartmentId,
          role: 'resident',
        });
        await this.userApartmentsRepo.save(ua);
        this.accessService.invalidateAccessCache(app.userId).catch(() => {});
      }
      // Optionally ensure user role is RESIDENT (if they had another role) — plan says "при необходимости"
      // We don't change role here; user may already be RESIDENT.
    }

    return app;
  }

  /** Resident: get my applications. */
  async getMyApplications(user: RequestUser): Promise<ApartmentApplication[]> {
    return this.applicationsRepo.find({
      where: { userId: user.id },
      relations: ['apartment', 'apartment.building', 'apartment.building.complex'],
      order: { requestedAt: 'DESC' },
    });
  }

  /** Get one application by id (for staff to PATCH). */
  async findOne(id: number, user: RequestUser): Promise<ApartmentApplication> {
    const app = await this.applicationsRepo.findOne({
      where: { id },
      relations: ['apartment', 'apartment.building'],
    });
    if (!app) throw new NotFoundException('Заявка не найдена');
    await this.accessService.assertCanAccessBuilding(user, app.apartment.buildingId);
    return app;
  }

  /** Удалить все заявки пользователя (перед удалением пользователя). */
  async deleteByUserId(userId: string): Promise<void> {
    await this.applicationsRepo.delete({ userId });
  }
}
