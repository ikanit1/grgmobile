import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { EventLogService } from '../events/event-log.service';
import {
  EVENT_TYPE_USER_LOGIN,
  EVENT_TYPE_USER_REGISTERED,
} from '../events/event-types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly eventLogService: EventLogService,
  ) {}

  private buildPayload(user: { id: string; role: string; organizationId?: string; complexId?: string }) {
    return {
      sub: user.id,
      role: user.role,
      organization_id: user.organizationId ?? undefined,
      complex_id: user.complexId ?? undefined,
    };
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(user: { id: string; role: string; organizationId?: string; complexId?: string }) {
    const payload = this.buildPayload(user);
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = this.generateRefreshToken();
    await this.usersService.setRefreshTokenHash(user.id, this.hashRefreshToken(refreshToken));
    return { accessToken, refreshToken };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByLogin(dto.login);
    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    const valid = await this.usersService.validatePassword(user, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    if (this.usersService.isUserBlocked(user)) {
      throw new UnauthorizedException('Учётная запись заблокирована');
    }
    const { accessToken, refreshToken } = await this.issueTokens(user);
    if (dto.fcmToken) {
      await this.usersService.updatePushToken(user.id, dto.fcmToken, dto.pushPlatform);
    }
    this.eventLogService.create(null, EVENT_TYPE_USER_LOGIN, { login: dto.login }, {
      userId: user.id,
      organizationId: user.organizationId ?? null,
      entityType: 'user',
      entityId: user.id,
    }).catch(() => {});
    return {
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name ?? user.email ?? user.phone,
        role: user.role,
        organizationId: user.organizationId,
        complexId: user.complexId,
      },
    };
  }

  /** Invalidate refresh token for the user (logout). */
  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  async register(dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Укажите email или телефон');
    }
    const user = await this.usersService.create({
      email: dto.email,
      phone: dto.phone,
      name: dto.name,
      password: dto.password,
    });
    const { accessToken, refreshToken } = await this.issueTokens(user);
    this.eventLogService.create(null, EVENT_TYPE_USER_REGISTERED, { email: dto.email, phone: dto.phone }, {
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
    }).catch(() => {});
    return {
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name ?? user.email ?? user.phone,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string) {
    const hash = this.hashRefreshToken(refreshToken);
    const user = await this.usersService.findByRefreshTokenHash(hash);
    if (!user) {
      throw new UnauthorizedException('Невалидный refresh-токен');
    }
    if (this.usersService.isUserBlocked(user)) {
      throw new UnauthorizedException('Учётная запись заблокирована');
    }
    const tokens = await this.issueTokens(user);
    return {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        name: user.name ?? user.email ?? user.phone,
        role: user.role,
        organizationId: user.organizationId,
        complexId: user.complexId,
      },
    };
  }
}
