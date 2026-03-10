import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { EventLogService } from '../events/event-log.service';
import { EVENT_TYPE_ADMIN_IMPERSONATE } from '../events/event-types';
import { ImpersonateDto } from './dto/impersonate.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminImpersonateController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly eventLogService: EventLogService,
  ) {}

  @Post('impersonate')
  async impersonate(
    @Body() dto: ImpersonateDto,
    @Req() req: { user: RequestUser },
  ): Promise<{ token: string }> {
    if (req.user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Входить под пользователем может только суперадмин');
    }
    const target = await this.usersService.findById(dto.userId);
    const payload = {
      sub: target.id,
      role: target.role,
      organization_id: target.organizationId ?? undefined,
      complex_id: target.complexId ?? undefined,
    };
    const token = await this.jwtService.signAsync(payload);
    await this.eventLogService.create(null, EVENT_TYPE_ADMIN_IMPERSONATE, {
      adminId: req.user.id,
      targetUserId: target.id,
      targetEmail: target.email ?? undefined,
      targetPhone: target.phone ?? undefined,
    });
    return { token };
  }
}
