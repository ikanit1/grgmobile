import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async findAll(@Req() req: { user: RequestUser }) {
    return this.organizationsService.findAll(req.user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.organizationsService.findOne(id, req.user);
  }

  @Post()
  async create(
    @Body() dto: CreateOrganizationDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.organizationsService.create(dto, req.user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.organizationsService.update(id, dto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.organizationsService.remove(id, req.user);
    return { ok: true };
  }
}
