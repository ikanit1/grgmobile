import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { AkuvoxProvisioningService } from './akuvox-provisioning.service';
import { EventLogService } from '../events/event-log.service';
import { BuildingsService } from '../buildings/buildings.service';
import { AccessService } from '../access/access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { SyncConfigDto } from './dto/sync-config.dto';
import { EVENT_TYPE_DEVICE_UPDATED, EVENT_TYPE_DEVICE_DELETED } from '../events/event-types';
import { sanitizeLogData } from '../common/logging/sanitizer';

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly akuvoxProvisioning: AkuvoxProvisioningService,
    private readonly eventLogService: EventLogService,
    private readonly buildingsService: BuildingsService,
    private readonly accessService: AccessService,
  ) {}

  @Get(':id')
  async getById(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.devicesService.findByIdForUser(Number(id), req.user);
  }

  @Get(':id/provision-config')
  async getProvisionConfig(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.devicesService.findByIdForUser(Number(id), req.user);
    return this.akuvoxProvisioning.getProvisionConfig(Number(id), req.user);
  }

  @Post('sync-config')
  async syncConfig(@Body() dto: SyncConfigDto, @Req() req: { user: RequestUser }) {
    const allowed = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER];
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenException('Только для администраторов');
    }
    for (const deviceId of dto.deviceIds) {
      const dev = await this.devicesService.findById(deviceId).catch(() => null);
      if (dev) await this.accessService.assertCanAccessDevice(req.user, dev.buildingId);
    }
    return this.akuvoxProvisioning.syncConfigForDevices(dto.deviceIds, req.user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @Req() req: { user: RequestUser },
  ) {
    const device = await this.devicesService.update(Number(id), dto, req.user);
    // Sanitize dto before logging to event_log (remove sensitive fields)
    const logData = sanitizeLogData({ ...dto });
    this.eventLogService.create(Number(id), EVENT_TYPE_DEVICE_UPDATED, logData as Record<string, unknown>, {
      userId: req.user.id,
      organizationId: req.user.organizationId ?? null,
      entityType: 'device',
      entityId: id,
    }).catch(() => {});
    return device;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    const device = await this.devicesService.remove(Number(id), req.user);
    this.eventLogService.create(Number(id), EVENT_TYPE_DEVICE_DELETED, { name: device.name, buildingId: device.buildingId }, {
      userId: req.user.id,
      organizationId: req.user.organizationId ?? null,
      entityType: 'device',
      entityId: id,
    }).catch(() => {});
    this.buildingsService.invalidateDevicesCache(device.buildingId).catch(() => {});
    return { deleted: true };
  }
}
