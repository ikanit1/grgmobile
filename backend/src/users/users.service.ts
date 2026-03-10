import { Injectable, Inject, forwardRef, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { UserApartment } from './entities/user-apartment.entity';
import { AccessService } from '../access/access.service';
import { EventLogService } from '../events/event-log.service';
import { ApplicationsService } from '../apartments/applications.service';
import { RequestUser } from '../auth/request-user.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
    @Inject(forwardRef(() => ApplicationsService))
    private readonly applicationsService: ApplicationsService,
  ) {}

  /** List users visible to the given admin. SUPER_ADMIN sees all; others see only users in their scope. */
  async findAllForAdmin(admin: RequestUser): Promise<Partial<User>[]> {
    if (admin.role !== UserRole.SUPER_ADMIN && admin.role !== UserRole.ORG_ADMIN && admin.role !== UserRole.COMPLEX_MANAGER) {
      throw new ForbiddenException('Только администраторы могут просматривать список пользователей');
    }
    const viewableIds = await this.accessService.getViewableUserIds(admin);
    const options: Parameters<Repository<User>['find']>[0] = {
      select: ['id', 'email', 'phone', 'name', 'role', 'organizationId', 'complexId', 'createdAt', 'isBlocked', 'blockedUntil'],
      order: { createdAt: 'DESC' as const },
    };
    if (viewableIds !== null) {
      if (viewableIds.length === 0) return [];
      options.where = { id: In(viewableIds) };
    }
    return this.usersRepo.find(options);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  async findByLogin(login: string): Promise<User | null> {
    const trimmed = login.trim();
    if (!trimmed) return null;
    return this.usersRepo
      .createQueryBuilder('u')
      .where('u.email = :login OR u.phone = :login', { login: trimmed })
      .getOne();
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  isUserBlocked(user: User): boolean {
    if (user.isBlocked) return true;
    if (user.blockedUntil && new Date(user.blockedUntil) > new Date()) return true;
    return false;
  }

  async setBlocked(
    userId: string,
    isBlocked: boolean,
    blockedUntil?: Date | null,
  ): Promise<User> {
    const user = await this.findById(userId);
    await this.usersRepo.update(userId, {
      isBlocked: isBlocked ?? false,
      blockedUntil: blockedUntil ?? undefined,
    });
    return this.findById(userId);
  }

  async create(data: {
    email?: string;
    phone?: string;
    name?: string;
    password: string;
    role?: UserRole;
    organizationId?: string;
    complexId?: string;
  }): Promise<User> {
    if (data.email) {
      const existing = await this.usersRepo.findOne({ where: { email: data.email } });
      if (existing) throw new ConflictException('Этот email уже зарегистрирован');
    }
    if (data.phone) {
      const existing = await this.usersRepo.findOne({ where: { phone: data.phone } });
      if (existing) throw new ConflictException('Этот номер телефона уже зарегистрирован');
    }
    const hash = await bcrypt.hash(data.password, 10);
    const user = this.usersRepo.create({
      email: data.email,
      phone: data.phone,
      name: data.name,
      passwordHash: hash,
      role: data.role ?? UserRole.RESIDENT,
      organizationId: data.organizationId,
      complexId: data.complexId,
    });
    return this.usersRepo.save(user);
  }

  async updateProfile(userId: string, dto: { name?: string; email?: string; phone?: string }): Promise<User> {
    const user = await this.findById(userId);
    if (dto.email && dto.email !== user.email) {
      const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
      if (existing && existing.id !== userId) throw new ConflictException('Этот email уже зарегистрирован');
      user.email = dto.email;
    }
    if (dto.phone && dto.phone !== user.phone) {
      const existing = await this.usersRepo.findOne({ where: { phone: dto.phone } });
      if (existing && existing.id !== userId) throw new ConflictException('Этот номер телефона уже зарегистрирован');
      user.phone = dto.phone;
    }
    if (dto.name !== undefined) user.name = dto.name;
    return this.usersRepo.save(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new ForbiddenException('Неверный текущий пароль');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.save(user);
  }

  async setRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    await this.usersRepo.update(userId, { refreshTokenHash: hash ?? undefined });
  }

  async findByRefreshTokenHash(hash: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { refreshTokenHash: hash } });
  }

  async updatePushToken(
    userId: string,
    pushToken: string | null,
    pushPlatform?: string,
  ): Promise<void> {
    await this.usersRepo.update(userId, {
      pushToken: pushToken ?? undefined,
      pushPlatform: pushPlatform ?? undefined,
    });
  }

  /** Return push tokens for given user IDs (for sending notifications). */
  async getPushTokens(
    userIds: string[],
  ): Promise<Array<{ userId: string; token: string; platform?: string }>> {
    if (userIds.length === 0) return [];
    const users = await this.usersRepo.find({
      where: userIds.map((id) => ({ id })),
      select: ['id', 'pushToken', 'pushPlatform'],
    });
    return users
      .filter((u) => u.pushToken)
      .map((u) => ({
        userId: u.id,
        token: u.pushToken!,
        platform: u.pushPlatform,
      }));
  }

  /**
   * Filter user IDs to those who should receive push (not in Do Not Disturb).
   * If doNotDisturb is false, include. If doNotDisturbFrom/To set, exclude only when current time is in that window.
   */
  async filterDoNotDisturb(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const users = await this.usersRepo.find({
      where: userIds.map((id) => ({ id })),
      select: ['id', 'doNotDisturb', 'doNotDisturbFrom', 'doNotDisturbTo'],
    });
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const parseTime = (s: string | undefined): number | null => {
      if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    };
    return users.filter((u) => {
      if (!u.doNotDisturb) return true;
      const from = parseTime(u.doNotDisturbFrom);
      const to = parseTime(u.doNotDisturbTo);
      if (from == null || to == null) return false;
      const inWindow = from <= to
        ? nowMin >= from && nowMin <= to
        : nowMin >= from || nowMin <= to;
      return !inWindow;
    }).map((u) => u.id);
  }

  async updateMeSettings(
    userId: string,
    dto: { doNotDisturb?: boolean; doNotDisturbFrom?: string; doNotDisturbTo?: string },
  ): Promise<void> {
    await this.usersRepo.update(userId, {
      ...(dto.doNotDisturb !== undefined && { doNotDisturb: dto.doNotDisturb }),
      ...(dto.doNotDisturbFrom !== undefined && { doNotDisturbFrom: dto.doNotDisturbFrom || undefined }),
      ...(dto.doNotDisturbTo !== undefined && { doNotDisturbTo: dto.doNotDisturbTo || undefined }),
    });
  }

  /** Удалить пользователя (только для админов, с проверкой прав). Нельзя удалить себя. */
  async remove(userId: string, requestedBy: RequestUser): Promise<void> {
    if (requestedBy.id === userId) {
      throw new ForbiddenException('Нельзя удалить самого себя');
    }
    const user = await this.findById(userId);
    const canManage = await this.accessService.canManageUser(requestedBy, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId ?? undefined,
      complexId: user.complexId ?? undefined,
    });
    if (!canManage) {
      throw new ForbiddenException('Нет прав на удаление этого пользователя');
    }
    await this.userApartmentsRepo.delete({ userId });
    await this.applicationsService.deleteByUserId(userId);
    await this.eventLogService.clearUserReferences(userId);
    await this.usersRepo.remove(user);
  }
}
