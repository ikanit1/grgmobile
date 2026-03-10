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
import { ResidentialComplexesService } from './residential-complexes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { CreateComplexDto } from './dto/create-complex.dto';
import { UpdateComplexDto } from './dto/update-complex.dto';

@UseGuards(JwtAuthGuard)
@Controller('complexes')
export class ResidentialComplexesController {
  constructor(private readonly complexesService: ResidentialComplexesService) {}

  @Get()
  async findAll(@Req() req: { user: RequestUser }) {
    return this.complexesService.findAll(req.user);
  }

  @Get('by-organization/:orgId')
  async findByOrganization(@Param('orgId') orgId: string, @Req() req: { user: RequestUser }) {
    return this.complexesService.findByOrganization(orgId, req.user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.complexesService.findOne(id, req.user);
  }

  @Post()
  async create(@Body() dto: CreateComplexDto, @Req() req: { user: RequestUser }) {
    return this.complexesService.create(dto, req.user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateComplexDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.complexesService.update(id, dto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    await this.complexesService.remove(id, req.user);
    return { ok: true };
  }
}
