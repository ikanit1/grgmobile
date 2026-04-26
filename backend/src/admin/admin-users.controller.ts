import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AccessService } from '../access/access.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ResidentialComplexesService } from '../residential-complexes/residential-complexes.service';
import { EventLogService } from '../events/event-log.service';
import { BlockUserDto } from './dto/block-user.dto';
import { CreateOrgAdminDto } from './dto/create-org-admin.dto';
import { EVENT_TYPE_USER_BLOCKED, EVENT_TYPE_USER_UNBLOCKED, EVENT_TYPE_USER_CREATED, EVENT_TYPE_USER_DELETED } from '../events/event-types';

@Controller('admin/users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accessService: AccessService,
    private readonly organizationsService: OrganizationsService,
    private readonly residentialComplexesService: ResidentialComplexesService,
    private readonly eventLogService: EventLogService,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
  ) {}

  @Get('search')
  async searchUsers(
    @Query('q') q: string | undefined,
    @Req() req: { user: RequestUser },
  ) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException('Только персонал может искать пользователей');
    }
    const all = await this.usersService.findAllForAdmin(req.user);
    if (!q) return all;
    const lower = q.toLowerCase();
    return all.filter((u: any) =>
      (u.email && u.email.toLowerCase().includes(lower)) ||
      (u.phone && u.phone.toLowerCase().includes(lower)) ||
      (u.name && u.name.toLowerCase().includes(lower))
    );
  }

  @Get(':id/apartments')
  async getUserApartments(
    @Param('id') userId: string,
    @Req() req: { user: RequestUser },
  ) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException('Только персонал может просматривать квартиры пользователя');
    }
    const rows = await this.userApartmentsRepo.find({
      where: { userId },
      relations: ['apartment', 'apartment.building'],
    });
    return rows.map((ua) => ({
      apartmentId: ua.apartmentId,
      number: ua.apartment.number,
      floor: ua.apartment.floor,
      buildingId: ua.apartment.buildingId,
      buildingAddress: ua.apartment.building?.address ?? null,
      role: ua.role,
      accessLevel: ua.accessLevel,
      validUntil: ua.validUntil ?? null,
    }));
  }

  @Delete(':id/apartments/:apartmentId')
  async unlinkApartment(
    @Param('id') userId: string,
    @Param('apartmentId') apartmentId: string,
    @Req() req: { user: RequestUser },
  ) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException('Только персонал может отвязывать квартиры');
    }
    await this.userApartmentsRepo.delete({ userId, apartmentId: Number(apartmentId) });
    return { ok: true };
  }

  @Post(':id/apartments')
  async linkApartment(
    @Param('id') userId: string,
    @Body() body: { apartmentId: number; role?: string },
    @Req() req: { user: RequestUser },
  ) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException('Только персонал может привязывать квартиры');
    }
    if (!body.apartmentId) {
      throw new BadRequestException('Укажите apartmentId');
    }
    const existing = await this.userApartmentsRepo.findOne({
      where: { userId, apartmentId: body.apartmentId },
    });
    if (existing) {
      throw new BadRequestException('Квартира уже привязана к этому пользователю');
    }
    const ua = this.userApartmentsRepo.create({
      userId,
      apartmentId: body.apartmentId,
      role: body.role ?? 'resident',
      accessLevel: 1,
    });
    await this.userApartmentsRepo.save(ua);
    return { ok: true };
  }

  @Patch(':id/block')
  async setBlocked(
    @Param('id') userId: string,
    @Body() dto: BlockUserDto,
    @Req() req: { user: RequestUser },
  ) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException('Блокировать может только персонал');
    }
    const target = await this.usersService.findById(userId);
    const canManage = await this.accessService.canManageUser(req.user, {
      id: target.id,
      role: target.role,
      organizationId: target.organizationId ?? undefined,
      complexId: target.complexId ?? undefined,
    });
    if (!canManage) {
      throw new ForbiddenException('Нет прав на управление этим пользователем');
    }
    const blockedUntil = dto.blockedUntil ? new Date(dto.blockedUntil) : undefined;
    const user = await this.usersService.setBlocked(userId, dto.isBlocked, blockedUntil ?? null);
    const eventType = dto.isBlocked ? EVENT_TYPE_USER_BLOCKED : EVENT_TYPE_USER_UNBLOCKED;
    this.eventLogService.create(null, eventType, { blockedUntil: dto.blockedUntil }, {
      userId: req.user.id,
      organizationId: req.user.organizationId ?? null,
      entityType: 'user',
      entityId: userId,
    }).catch(() => {});
    return {
      id: user.id,
      isBlocked: user.isBlocked,
      blockedUntil: user.blockedUntil ?? undefined,
    };
  }

  @Post('org-admin')
  async createOrgAdmin(
    @Body() dto: CreateOrgAdminDto,
    @Req() req: { user: RequestUser },
  ) {
    if (req.user.role === UserRole.SUPER_ADMIN) {
      // SUPER_ADMIN can create ORG_ADMIN or COMPLEX_MANAGER for any org
    } else if (req.user.role === UserRole.ORG_ADMIN && req.user.organizationId === dto.organizationId) {
      // ORG_ADMIN can only create COMPLEX_MANAGER for their own org
      if (dto.role !== UserRole.COMPLEX_MANAGER) {
        throw new ForbiddenException('Админ УК может создавать только менеджера ЖК в своей организации');
      }
    } else {
      throw new ForbiddenException('Только суперадмин или админ УК (для своей организации) может создавать сотрудников');
    }
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Укажите email или телефон');
    }
    await this.accessService.assertCanAccessOrganization(req.user, dto.organizationId);
    if (dto.role === UserRole.COMPLEX_MANAGER) {
      if (!dto.complexId) {
        throw new BadRequestException('Для менеджера ЖК укажите комплекс');
      }
      await this.accessService.assertCanAccessComplex(req.user, dto.complexId);
      const complex = await this.residentialComplexesService.findOne(dto.complexId, req.user);
      if (complex.organizationId !== dto.organizationId) {
        throw new BadRequestException('ЖК должен относиться к выбранной организации');
      }
    }
    const user = await this.usersService.create({
      email: dto.email,
      phone: dto.phone,
      name: dto.name,
      password: dto.password,
      role: dto.role,
      organizationId: dto.organizationId,
      complexId: dto.role === UserRole.COMPLEX_MANAGER ? dto.complexId : undefined,
    });
    this.eventLogService.create(null, EVENT_TYPE_USER_CREATED, { role: dto.role, email: dto.email, phone: dto.phone }, {
      userId: req.user.id,
      organizationId: dto.organizationId,
      entityType: 'user',
      entityId: user.id,
    }).catch(() => {});
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      complexId: user.complexId,
    };
  }

  @Delete(':id')
  async removeUser(
    @Param('id') userId: string,
    @Req() req: { user: RequestUser },
  ) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException('Удалять пользователей может только персонал');
    }
    await this.usersService.remove(userId, req.user);
    this.eventLogService.create(null, EVENT_TYPE_USER_DELETED, { deletedUserId: userId }, {
      userId: req.user.id,
      organizationId: req.user.organizationId ?? null,
      entityType: 'user',
      entityId: userId,
    }).catch(() => {});
    return { ok: true };
  }
}
