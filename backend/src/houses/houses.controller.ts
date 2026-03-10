import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BuildingsService } from '../buildings/buildings.service';
import { RequestUser } from '../auth/request-user.interface';

/** Backward compatibility: /houses mirrors /buildings (list buildings as "houses"). */
@UseGuards(JwtAuthGuard)
@Controller('houses')
export class HousesController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  async findAll(@Req() req: { user: RequestUser }) {
    return this.buildingsService.findAll(req.user);
  }

  @Get(':id/devices')
  async getDevices(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.buildingsService.findDevices(Number(id), req.user);
  }
}
