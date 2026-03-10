import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ControlService } from './control.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OpenDoorRateLimitGuard } from './open-door-rate-limit.guard';
import { OpenDoorDto } from './dto/open-door.dto';
import { LiveUrlQueryDto } from './dto/live-url.dto';
import { EventsQueryDto } from './dto/events-query.dto';
import { DeviceEventDto } from './dto/device-event.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { RequestUser } from '../auth/request-user.interface';

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class ControlController {
  constructor(private readonly controlService: ControlService) {}

  @Post('test-connection')
  async testConnection(@Body() dto: TestConnectionDto) {
    return this.controlService.testConnection(dto);
  }

  @Post(':id/open-door')
  @UseGuards(OpenDoorRateLimitGuard)
  async openDoor(@Param('id') id: string, @Body() dto: OpenDoorDto, @Req() req: { user: RequestUser }) {
    return this.controlService.openDoor(Number(id), dto, req.user);
  }

  @Get(':id/live-url')
  async getLiveUrl(@Param('id') id: string, @Query() query: LiveUrlQueryDto, @Req() req: { user: RequestUser }) {
    return this.controlService.getLiveUrl(Number(id), query, req.user);
  }

  @Get(':id/info')
  async getDeviceInfo(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.getDeviceInfo(Number(id), req.user);
  }

  @Get(':id/events')
  async getDeviceEvents(
    @Param('id') id: string,
    @Query() query: EventsQueryDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.getDeviceEvents(Number(id), query, req.user);
  }

  @Post(':id/ws-connect')
  async startWs(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.startDeviceWs(Number(id), req.user);
  }

  @Post(':id/ws-disconnect')
  async stopWs(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.controlService.stopDeviceWs(Number(id), req.user);
    return { stopped: true };
  }

  @Post(':id/events')
  async postDeviceEvent(
    @Param('id') id: string,
    @Body() dto: DeviceEventDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.postDeviceEvent(Number(id), dto, req.user);
  }
}

