import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { PanelResidentService } from './panel-resident.service';
import { CreatePanelResidentDto } from './dto/create-panel-resident.dto';
import { UpdatePanelResidentDto } from './dto/update-panel-resident.dto';
import { BulkImportResidentsDto } from './dto/bulk-import-residents.dto';
import { BulkDeleteResidentsDto } from './dto/bulk-delete-residents.dto';

@UseGuards(JwtAuthGuard)
@Controller('devices/:deviceId/residents')
export class PanelResidentController {
  constructor(private readonly service: PanelResidentService) {}

  @Get()
  async getAll(
    @Param('deviceId') deviceId: string,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
    @Query('syncStatus') syncStatus: string | undefined,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.getAll(Number(deviceId), req.user, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      syncStatus,
    });
  }

  @Get('sync-status')
  async getSyncStatus(
    @Param('deviceId') deviceId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.getSyncStatus(Number(deviceId), req.user);
  }

  @Post()
  async create(
    @Param('deviceId') deviceId: string,
    @Body() dto: CreatePanelResidentDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.create(Number(deviceId), dto, req.user);
  }

  @Post('sync')
  async sync(
    @Param('deviceId') deviceId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.syncFromDevice(Number(deviceId), req.user);
  }

  @Post('import-from-apartments')
  async importFromApartments(
    @Param('deviceId') deviceId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.importFromApartments(Number(deviceId), req.user);
  }

  @Post('bulk')
  async bulkImport(
    @Param('deviceId') deviceId: string,
    @Body() dto: BulkImportResidentsDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.bulkImport(Number(deviceId), dto.residents, req.user);
  }

  @Post('clear')
  async clearAll(
    @Param('deviceId') deviceId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.clearAll(Number(deviceId), req.user);
  }

  @Put(':panelUserId')
  async update(
    @Param('deviceId') deviceId: string,
    @Param('panelUserId') panelUserId: string,
    @Body() dto: UpdatePanelResidentDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.update(Number(deviceId), decodeURIComponent(panelUserId), dto, req.user);
  }

  @Delete(':panelUserId')
  async remove(
    @Param('deviceId') deviceId: string,
    @Param('panelUserId') panelUserId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.remove(Number(deviceId), decodeURIComponent(panelUserId), req.user);
  }

  @Delete('bulk')
  async bulkDelete(
    @Param('deviceId') deviceId: string,
    @Body() dto: BulkDeleteResidentsDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.bulkDelete(Number(deviceId), dto.panelUserIds, req.user);
  }

}
