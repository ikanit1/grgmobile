import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BuildingsService } from './buildings.service';
import { ApartmentsService } from '../apartments/apartments.service';
import { ApartmentsImportService } from '../apartments/apartments-import.service';
import { ResidentsImportService } from '../apartments/residents-import.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { CreateDeviceDto } from './dto/create-device.dto';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { BulkCreateApartmentsDto } from './dto/bulk-create-apartments.dto';
@UseGuards(JwtAuthGuard)
@Controller('buildings')
export class BuildingsController {
  constructor(
    private readonly buildingsService: BuildingsService,
    private readonly apartmentsService: ApartmentsService,
    private readonly apartmentsImportService: ApartmentsImportService,
    private readonly residentsImportService: ResidentsImportService,
  ) {}

  @Get()
  async findAll(@Req() req: { user: RequestUser }) {
    return this.buildingsService.findAll(req.user);
  }

  @Get('for-application')
  async findForApplication(@Req() req: { user: RequestUser }) {
    return this.buildingsService.findAllForApplication(req.user);
  }

  @Get('search')
  async search(@Query('complexId') complexId: string) {
    if (!complexId) return [];
    return this.buildingsService.searchByComplex(complexId);
  }

  @Post()
  async create(@Body() dto: CreateBuildingDto, @Req() req: { user: RequestUser }) {
    return this.buildingsService.create(dto, req.user);
  }

  @Get(':id/devices')
  async findDevices(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.buildingsService.findDevices(Number(id), req.user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.buildingsService.findOne(Number(id), req.user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.buildingsService.update(Number(id), dto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.buildingsService.remove(Number(id), req.user);
    return { ok: true };
  }

  @Post(':id/devices')
  async addDevice(
    @Param('id') id: string,
    @Body() dto: CreateDeviceDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.buildingsService.addDevice(Number(id), dto, req.user);
  }

  @Post(':id/apartments/bulk')
  async bulkCreateApartments(
    @Param('id') id: string,
    @Body() dto: BulkCreateApartmentsDto,
    @Req() req: { user: RequestUser },
  ) {
    const buildingId = Number(id);
    return this.apartmentsService.createBulk(buildingId, dto.from, dto.to, req.user);
  }

  @Post(':id/apartments/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importApartments(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Body() body: { apartments?: Array<{ number: string; floor?: number; rooms?: number; area?: number }> },
    @Req() req: { user: RequestUser },
  ) {
    const buildingId = Number(id);
    let result: unknown;
    if (file) {
      result = await this.apartmentsImportService.importFromFile(
        buildingId,
        { buffer: file.buffer, originalname: file.originalname || '', size: file.size },
        req.user,
      );
    } else if (body?.apartments && Array.isArray(body.apartments)) {
      result = await this.apartmentsImportService.importFromJson(buildingId, { apartments: body.apartments }, req.user);
    } else {
      throw new BadRequestException('Загрузите файл (CSV/Excel) или передайте JSON с массивом "apartments"');
    }
    return result;
  }

  @Post(':id/residents/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importResidents(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Body() body: { residents?: Array<{ apartmentNumber: string; email?: string; phone?: string; name?: string; role?: string }> },
    @Req() req: { user: RequestUser },
  ) {
    const buildingId = Number(id);
    if (file) {
      return this.residentsImportService.importFromFile(
        buildingId,
        { buffer: file.buffer, originalname: file.originalname || '', size: file.size },
        req.user,
      );
    }
    if (body?.residents && Array.isArray(body.residents)) {
      return this.residentsImportService.importFromJson(buildingId, { residents: body.residents }, req.user);
    }
    throw new BadRequestException('Загрузите файл (CSV/Excel) или передайте JSON с массивом "residents"');
  }
}
