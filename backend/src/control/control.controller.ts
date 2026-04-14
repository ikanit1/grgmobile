import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ControlService } from './control.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OpenDoorRateLimitGuard } from './open-door-rate-limit.guard';
import { OpenDoorDto } from './dto/open-door.dto';
import { LiveUrlQueryDto } from './dto/live-url.dto';
import { EventsQueryDto } from './dto/events-query.dto';
import { DeviceEventDto } from './dto/device-event.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { AddAkuvoxUserDto } from './dto/add-akuvox-user.dto';
import { RequestUser } from '../auth/request-user.interface';
import { RecordingsQueryDto } from './dto/recordings-query.dto';
import { PtzMoveDto } from './dto/ptz-move.dto';
import { PtzPresetDto } from './dto/ptz-preset.dto';

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

  // ————— Akuvox proxy (TZ: /control/akuvox/:deviceId/...) — same device ID, under /api/devices for consistency —————

  @Post(':id/dial')
  async dial(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.dial(Number(id), req.user);
  }

  @Post(':id/hangup')
  async hangup(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.hangup(Number(id), req.user);
  }

  @Get(':id/relay')
  async getRelayList(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.getRelayList(Number(id), req.user);
  }

  @Post(':id/relay/:relayId/trig')
  @UseGuards(OpenDoorRateLimitGuard)
  async relayTrig(@Param('id') id: string, @Param('relayId') relayId: string, @Req() req: { user: RequestUser }) {
    return this.controlService.relayTrig(Number(id), Number(relayId), req.user);
  }

  @Get(':id/calllog')
  async getCallLog(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.getCallLog(Number(id), req.user);
  }

  @Get(':id/users')
  async getUserList(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.getUserList(Number(id), req.user);
  }

  @Post(':id/users')
  async addUser(@Param('id') id: string, @Body() dto: AddAkuvoxUserDto, @Req() req: { user: RequestUser }) {
    return this.controlService.addUser(Number(id), dto.items, req.user);
  }

  @Get(':id/contacts')
  async getContacts(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.getContacts(Number(id), req.user);
  }

  @Get(':id/status')
  async getAkuvoxStatus(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.getAkuvoxStatus(Number(id), req.user);
  }

  // ————— Uniview proxy —————

  @Get(':id/channels')
  async getChannels(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.controlService.getChannels(Number(id), req.user);
  }

  @Get(':id/snapshot/:channelId')
  async getSnapshot(
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Query('stream') streamId: string | undefined,
    @Req() req: { user: RequestUser },
    @Res() res: Response,
  ) {
    const buffer = await this.controlService.getSnapshot(
      Number(id),
      Number(channelId),
      streamId !== undefined ? Number(streamId) : undefined,
      req.user,
    );
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(buffer);
  }

  // ─── Uniview Recording / Playback ───

  @Get(':id/recordings')
  async getRecordings(
    @Param('id') id: string,
    @Query() query: RecordingsQueryDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.getRecordings(Number(id), query, req.user);
  }

  @Get(':id/playback-url')
  async getPlaybackUrl(
    @Param('id') id: string,
    @Query() query: RecordingsQueryDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.getPlaybackUrl(Number(id), query, req.user);
  }

  @Get(':id/recording-timeline')
  async getRecordingTimeline(
    @Param('id') id: string,
    @Query() query: RecordingsQueryDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.getRecordingTimeline(Number(id), query, req.user);
  }

  // ─── Uniview PTZ ───

  @Get(':id/ptz/capabilities')
  async getPtzCapabilities(
    @Param('id') id: string,
    @Query('channelId') channelId: string | undefined,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.getPtzCapabilities(Number(id), channelId ? Number(channelId) : undefined, req.user);
  }

  @Post(':id/ptz/move')
  async ptzMove(
    @Param('id') id: string,
    @Body() dto: PtzMoveDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.ptzMove(Number(id), dto, req.user);
  }

  @Post(':id/ptz/stop')
  async ptzStop(
    @Param('id') id: string,
    @Body('channelId') channelId: number | undefined,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.ptzStop(Number(id), channelId, req.user);
  }

  @Get(':id/ptz/presets')
  async getPtzPresets(
    @Param('id') id: string,
    @Query('channelId') channelId: string | undefined,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.getPtzPresets(Number(id), channelId ? Number(channelId) : undefined, req.user);
  }

  @Post(':id/ptz/goto-preset')
  async gotoPreset(
    @Param('id') id: string,
    @Body() dto: PtzPresetDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.controlService.gotoPreset(Number(id), dto, req.user);
  }
}

