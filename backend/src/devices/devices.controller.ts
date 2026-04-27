import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { EventLogService } from '../events/event-log.service';
import { BuildingsService } from '../buildings/buildings.service';
import { AccessService } from '../access/access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { EVENT_TYPE_DEVICE_UPDATED, EVENT_TYPE_DEVICE_DELETED } from '../events/event-types';
import { sanitizeLogData } from '../common/logging/sanitizer';
import { UniviewLiteapiHttpClient } from '../vendors/uniview/uniview-liteapi-http.client';

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly eventLogService: EventLogService,
    private readonly buildingsService: BuildingsService,
    private readonly accessService: AccessService,
    private readonly univiewClient: UniviewLiteapiHttpClient,
  ) {}

  @Get(':id')
  async getById(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.devicesService.findByIdForUser(Number(id), req.user);
  }

  @Post(':id/scan-channels')
  async scanChannels(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    const device = await this.devicesService.findByIdForUser(Number(id), req.user);
    return this.univiewClient.scanNvrChannels(device);
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
