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

  /** Last N events for the current user (all accessible devices). Dashboard: GET /events?limit=5 */
  @Get()
  async getRecent(
    @Query('limit') limitStr: string | undefined,
    @Req() req: { user: RequestUser },
  ) {
    const limit = Math.min(parseInt(limitStr ?? '5', 10) || 5, 50);
    const buildingIds = await this.accessService.getAllowableBuildingIds(req.user);
    const deviceIds = await this.devicesService.getDeviceIdsByBuildingIds(buildingIds);
    const events = await this.eventLogService.findRecentByDeviceIds(deviceIds, limit);
    return events.map((e) => ({
      id: e.id,
      deviceId: e.deviceId,
      eventType: e.eventType,
      data: e.data,
      snapshotUrl: e.snapshotUrl,
      readBy: e.readBy,
      createdAt: e.createdAt,
    }));
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
