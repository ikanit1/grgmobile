import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApartmentsService } from './apartments.service';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { AddResidentDto } from './dto/add-resident.dto';
import { DecideApplicationDto } from './dto/decide-application.dto';
import { ApplicationStatus } from './entities/apartment-application.entity';

@UseGuards(JwtAuthGuard)
@Controller('apartments')
export class ApartmentsController {
  constructor(
    private readonly apartmentsService: ApartmentsService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  @Get('by-building/:buildingId')
  async findByBuilding(@Param('buildingId') buildingId: string, @Req() req: { user: RequestUser }) {
    return this.apartmentsService.findByBuilding(Number(buildingId), req.user);
  }

  @Get('applications')
  async listApplications(
    @Query('buildingId') buildingId: string | undefined,
    @Query('complexId') complexId: string | undefined,
    @Query('organizationId') organizationId: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: { user: RequestUser },
  ) {
    const filters: {
      buildingId?: number;
      complexId?: string;
      organizationId?: string;
      status?: ApplicationStatus;
    } = {};
    if (buildingId != null && buildingId !== '') filters.buildingId = Number(buildingId);
    if (complexId != null && complexId !== '') filters.complexId = complexId;
    if (organizationId != null && organizationId !== '') filters.organizationId = organizationId;
    if (status != null && status !== '' && Object.values(ApplicationStatus).includes(status as ApplicationStatus)) {
      filters.status = status as ApplicationStatus;
    }
    return this.applicationsService.listForStaff(req.user, filters);
  }

  @Patch('applications/:id')
  async decideApplication(
    @Param('id') id: string,
    @Body() dto: DecideApplicationDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.applicationsService.decide(Number(id), dto, req.user);
  }

  @Post(':apartmentId/apply')
  async applyForApartment(
    @Param('apartmentId') apartmentId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.applicationsService.apply(Number(apartmentId), req.user);
  }

  @Get(':apartmentId/residents')
  async getResidents(
    @Param('apartmentId') apartmentId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.apartmentsService.getResidents(Number(apartmentId), req.user);
  }

  @Post(':apartmentId/residents')
  async addResident(
    @Param('apartmentId') apartmentId: string,
    @Body() dto: AddResidentDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.apartmentsService.addResident(Number(apartmentId), dto, req.user);
  }

  @Delete(':apartmentId/residents/:userId')
  async removeResident(
    @Param('apartmentId') apartmentId: string,
    @Param('userId') userId: string,
    @Req() req: { user: RequestUser },
  ) {
    await this.apartmentsService.removeResident(Number(apartmentId), userId, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.apartmentsService.remove(Number(id), req.user);
    return { ok: true };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.apartmentsService.findOne(Number(id), req.user);
  }

  @Post()
  async create(@Body() dto: CreateApartmentDto, @Req() req: { user: RequestUser }) {
    return this.apartmentsService.create(dto, req.user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateApartmentDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.apartmentsService.update(Number(id), dto, req.user);
  }
}
