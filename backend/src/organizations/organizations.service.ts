import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { AccessService } from '../access/access.service';
import { EventLogService } from '../events/event-log.service';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { EVENT_TYPE_ORG_CREATED, EVENT_TYPE_ORG_UPDATED, EVENT_TYPE_ORG_DELETED } from '../events/event-types';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
  ) {}

  async findAll(user: RequestUser): Promise<Organization[]> {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.orgsRepo.find({ order: { name: 'ASC' } });
    }
    if (user.role === UserRole.ORG_ADMIN && user.organizationId) {
      const org = await this.orgsRepo.findOne({ where: { id: user.organizationId } });
      return org ? [org] : [];
    }
    return [];
  }

  async findOne(id: string, user: RequestUser): Promise<Organization> {
    await this.accessService.assertCanAccessOrganization(user, id);
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Организация не найдена');
    return org;
  }

  async create(dto: CreateOrganizationDto, user: RequestUser): Promise<Organization> {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Создавать организации может только суперадмин');
    }
    const org = this.orgsRepo.create({
      name: dto.name,
      subscriptionPlan: dto.subscriptionPlan ?? 'basic',
      maxComplexes: dto.maxComplexes ?? 10,
      inn: dto.inn ?? null,
      contactEmail: dto.contactEmail ?? null,
      contactPhone: dto.contactPhone ?? null,
      maxDevices: dto.maxDevices ?? null,
    });
    const saved = await this.orgsRepo.save(org);
    this.eventLogService.create(null, EVENT_TYPE_ORG_CREATED, { name: dto.name }, {
      userId: user.id,
      organizationId: saved.id,
      entityType: 'org',
      entityId: saved.id,
    }).catch(() => {});
    return saved;
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    user: RequestUser,
  ): Promise<Organization> {
    await this.accessService.assertCanAccessOrganization(user, id);
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Организация не найдена');
    if (dto.name != null) org.name = dto.name;
    if (dto.subscriptionPlan != null) org.subscriptionPlan = dto.subscriptionPlan;
    if (dto.maxComplexes != null) org.maxComplexes = dto.maxComplexes;
    if (dto.inn !== undefined) org.inn = dto.inn ?? null;
    if (dto.contactEmail !== undefined) org.contactEmail = dto.contactEmail ?? null;
    if (dto.contactPhone !== undefined) org.contactPhone = dto.contactPhone ?? null;
    if (dto.maxDevices !== undefined) org.maxDevices = dto.maxDevices ?? null;
    const saved = await this.orgsRepo.save(org);
    this.eventLogService.create(null, EVENT_TYPE_ORG_UPDATED, { ...dto } as Record<string, unknown>, {
      userId: user.id,
      organizationId: id,
      entityType: 'org',
      entityId: id,
    }).catch(() => {});
    return saved;
  }

  async remove(id: string, user: RequestUser): Promise<void> {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Удалять организации может только суперадмин');
    }
    const org = await this.orgsRepo.findOne({ where: { id }, relations: ['complexes'] });
    if (!org) throw new NotFoundException('Организация не найдена');
    if (org.complexes && org.complexes.length > 0) {
      throw new BadRequestException('Нельзя удалить организацию, у которой есть ЖК. Сначала удалите ЖК.');
    }
    await this.orgsRepo.remove(org);
    this.eventLogService.create(null, EVENT_TYPE_ORG_DELETED, { name: org.name }, {
      userId: user.id,
      entityType: 'org',
      entityId: id,
    }).catch(() => {});
  }
}
