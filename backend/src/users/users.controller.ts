import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { UsersService } from './users.service';
import { ApplicationsService } from '../apartments/applications.service';
import { ApartmentsService } from '../apartments/apartments.service';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { UpdateMeSettingsDto } from './dto/update-me-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly applicationsService: ApplicationsService,
    private readonly apartmentsService: ApartmentsService,
  ) {}

  @Get()
  async findAll(@Req() req: { user: RequestUser }) {
    return this.usersService.findAllForAdmin(req.user);
  }

  @Get('me')
  async getMe(@Req() req: { user: RequestUser }) {
    const user = await this.usersService.findById(req.user.id);
    return {
      id: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      name: user.name ?? undefined,
      role: user.role,
      organizationId: user.organizationId ?? undefined,
      complexId: user.complexId ?? undefined,
    };
  }

  @Patch('me')
  async updateMe(
    @Req() req: { user: RequestUser },
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(req.user.id, dto);
    return {
      id: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      name: user.name ?? undefined,
      role: user.role,
    };
  }

  @Patch('me/password')
  async changePassword(
    @Req() req: { user: RequestUser },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  @Get('me/settings')
  async getMeSettings(@Req() req: { user: RequestUser }) {
    const user = await this.usersService.findById(req.user.id);
    return {
      doNotDisturb: user.doNotDisturb ?? false,
      doNotDisturbFrom: user.doNotDisturbFrom ?? undefined,
      doNotDisturbTo: user.doNotDisturbTo ?? undefined,
    };
  }

  @Patch('me/settings')
  async updateMeSettings(
    @Req() req: { user: RequestUser },
    @Body() dto: UpdateMeSettingsDto,
  ) {
    await this.usersService.updateMeSettings(req.user.id, dto);
    return { ok: true };
  }

  @Get('me/applications')
  async getMyApplications(@Req() req: { user: RequestUser }) {
    return this.applicationsService.getMyApplications(req.user);
  }

  @Get('me/apartments')
  async getMyApartments(@Req() req: { user: RequestUser }) {
    const list = await this.apartmentsService.getMyApartments(req.user);
    return list.map(({ apartmentId, apartment, building }) => ({
      apartmentId,
      apartment: {
        id: apartment.id,
        number: apartment.number,
        floor: apartment.floor,
        buildingId: apartment.buildingId,
      },
      building: {
        id: building.id,
        name: building.name,
        address: building.address,
      },
    }));
  }

  @Post('me/push-token')
  async updateMyPushToken(
    @Req() req: { user: RequestUser },
    @Body() dto: UpdatePushTokenDto,
  ) {
    const token = typeof dto.token === 'string' ? dto.token.trim() : '';
    await this.usersService.updatePushToken(
      req.user.id,
      token || null,
      dto.platform,
    );
    return { ok: true };
  }
}
