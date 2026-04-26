import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { AccessService } from '../access/access.service';
import { DevicesService } from '../devices/devices.service';
import { EventLogService } from './event-log.service';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(
    private readonly accessService: AccessService,
    private readonly devicesService: DevicesService,
    private readonly eventLogService: EventLogService,
  ) {}

  /** Events for the current user (all accessible devices) with optional filters. GET /events */
  @Get()
  async getRecent(
    @Query('limit') limitStr: string | undefined,
    @Query('offset') offsetStr: string | undefined,
    @Query('deviceId') deviceIdStr: string | undefined,
    @Query('type') eventType: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: { user: RequestUser },
  ) {
    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 100);
    const offset = parseInt(offsetStr ?? '0', 10) || 0;
    const buildingIds = await this.accessService.getAllowableBuildingIds(req.user);
    const deviceIds = await this.devicesService.getDeviceIdsByBuildingIds(buildingIds);

    const { items, total } = await this.eventLogService.findFiltered(deviceIds, {
      deviceId: deviceIdStr ? Number(deviceIdStr) : undefined,
      eventType,
      from,
      to,
      limit,
      offset,
    });

    return {
      total,
      items: items.map((e) => ({
        id: e.id,
        deviceId: e.deviceId,
        eventType: e.eventType,
        data: e.data,
        snapshotUrl: e.snapshotUrl,
        createdAt: e.createdAt,
      })),
    };
  }

  /** Unread count for badge. GET /events/unread-count */
  @Get('unread-count')
  async getUnreadCount(@Req() req: { user: RequestUser }) {
    const buildingIds = await this.accessService.getAllowableBuildingIds(req.user);
    const deviceIds = await this.devicesService.getDeviceIdsByBuildingIds(buildingIds);
    const count = await this.eventLogService.countUnreadByDeviceIds(deviceIds, req.user.id);
    return { count };
  }
}
