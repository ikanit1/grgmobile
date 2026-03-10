import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccessService } from '../access/access.service';
import { RequestUser } from '../auth/request-user.interface';

@UseGuards(JwtAuthGuard)
@Controller('buildings')
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly accessService: AccessService,
  ) {}

  @Post(':id/discover-onvif')
  async discover(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.accessService.assertCanAccessBuilding(req.user, Number(id));
    const results = await this.discoveryService.startDiscovery(Number(id));
    return results;
  }

  @Get(':id/discover-onvif/result')
  async getResult(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.accessService.assertCanAccessBuilding(req.user, Number(id));
    return this.discoveryService.getLastResults(Number(id));
  }
}
