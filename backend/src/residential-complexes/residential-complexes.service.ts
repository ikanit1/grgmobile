import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResidentialComplex } from './entities/residential-complex.entity';
import { AccessService } from '../access/access.service';
import { RequestUser } from '../auth/request-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { CreateComplexDto } from './dto/create-complex.dto';
import { UpdateComplexDto } from './dto/update-complex.dto';
import { Organization } from '../organizations/entities/organization.entity';

@Injectable()
export class ResidentialComplexesService {
  constructor(
    @InjectRepository(ResidentialComplex)
    private readonly complexesRepo: Repository<ResidentialComplex>,
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
    private readonly accessService: AccessService,
  ) {}

  async findAll(user: RequestUser): Promise<ResidentialComplex[]> {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.complexesRepo.find({
        order: { name: 'ASC' },
        relations: ['organization'],
      });
    }
    if (user.role === UserRole.ORG_ADMIN && user.organizationId) {
      return this.complexesRepo.find({
        where: { organizationId: user.organizationId },
        order: { name: 'ASC' },
        relations: ['organization'],
      });
    }
    if (user.role === UserRole.COMPLEX_MANAGER && user.complexId) {
      const c = await this.complexesRepo.findOne({
        where: { id: user.complexId },
        relations: ['organization'],
      });
      return c ? [c] : [];
    }
    if (user.role === UserRole.RESIDENT) {
      const buildingIds = await this.accessService.getAllowableBuildingIds(user);
      if (buildingIds.length === 0) return [];
      const complexes = await this.complexesRepo
        .createQueryBuilder('c')
        .innerJoin('c.buildings', 'b')
        .where('b.id IN (:...ids)', { ids: buildingIds })
        .distinct(true)
        .getMany();
      return complexes;
    }
    return [];
  }

  async findByOrganization(organizationId: string, user: RequestUser): Promise<ResidentialComplex[]> {
    const all = await this.findAll(user);
    return all.filter((c) => c.organizationId === organizationId);
  }

  async findOne(id: string, user: RequestUser): Promise<ResidentialComplex> {
    await this.accessService.assertCanAccessComplex(user, id);
    const complex = await this.complexesRepo.findOne({
      where: { id },
      relations: ['organization'],
    });
    if (!complex) throw new NotFoundException('ЖК не найден');
    return complex;
  }

  async create(dto: CreateComplexDto, user: RequestUser): Promise<ResidentialComplex> {
    await this.accessService.assertCanCreateComplexInOrganization(user, dto.organizationId);
    const org = await this.orgsRepo.findOne({ where: { id: dto.organizationId } });
    if (!org) throw new NotFoundException('Организация не найдена');
    const count = await this.complexesRepo.count({ where: { organizationId: dto.organizationId } });
    if (count >= org.maxComplexes) {
      throw new BadRequestException(
        `Достигнут лимит организаций (макс. ЖК: ${org.maxComplexes})`,
      );
    }
    const complex = this.complexesRepo.create({
      organizationId: dto.organizationId,
      name: dto.name,
      address: dto.address,
      timezone: dto.timezone,
    });
    return this.complexesRepo.save(complex);
  }

  async update(
    id: string,
    dto: UpdateComplexDto,
    user: RequestUser,
  ): Promise<ResidentialComplex> {
    await this.accessService.assertCanAccessComplex(user, id);
    const complex = await this.complexesRepo.findOne({ where: { id } });
    if (!complex) throw new NotFoundException('ЖК не найден');
    if (dto.name != null) complex.name = dto.name;
    if (dto.address != null) complex.address = dto.address;
    if (dto.timezone != null) complex.timezone = dto.timezone;
    return this.complexesRepo.save(complex);
  }

  async remove(id: string, user: RequestUser): Promise<void> {
    await this.accessService.assertCanAccessComplex(user, id);
    const complex = await this.complexesRepo.findOne({ where: { id }, relations: ['buildings'] });
    if (!complex) throw new NotFoundException('ЖК не найден');
    if (complex.buildings && complex.buildings.length > 0) {
      throw new BadRequestException('Нельзя удалить ЖК, в котором есть здания. Сначала удалите здания.');
    }
    await this.complexesRepo.remove(complex);
  }
}
