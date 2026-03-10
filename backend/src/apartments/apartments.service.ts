import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Apartment } from './entities/apartment.entity';
import { ApartmentApplication } from './entities/apartment-application.entity';
import { Building } from '../buildings/entities/building.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { UserRole } from '../users/entities/user.entity';
import { AccessService } from '../access/access.service';
import { UsersService } from '../users/users.service';
import { EventLogService } from '../events/event-log.service';
import { RequestUser } from '../auth/request-user.interface';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { AddResidentDto } from './dto/add-resident.dto';
import { EVENT_TYPE_RESIDENT_ADDED, EVENT_TYPE_RESIDENT_REMOVED } from '../events/event-types';

@Injectable()
export class ApartmentsService {
  constructor(
    @InjectRepository(Apartment)
    private readonly apartmentsRepo: Repository<Apartment>,
    @InjectRepository(ApartmentApplication)
    private readonly applicationsRepo: Repository<ApartmentApplication>,
    @InjectRepository(Building)
    private readonly buildingsRepo: Repository<Building>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    private readonly accessService: AccessService,
    private readonly usersService: UsersService,
    private readonly eventLogService: EventLogService,
  ) {}

  async findByBuilding(buildingId: number, user: RequestUser): Promise<Apartment[]> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);
    return this.apartmentsRepo.find({
      where: { buildingId },
      order: { floor: 'ASC', number: 'ASC' },
    });
  }

  async findOne(id: number, user: RequestUser): Promise<Apartment> {
    const apartment = await this.apartmentsRepo.findOne({
      where: { id },
      relations: ['building'],
    });
    if (!apartment) throw new NotFoundException('Квартира не найдена');
    await this.accessService.assertCanAccessBuilding(user, apartment.buildingId);
    return apartment;
  }

  async create(dto: CreateApartmentDto, user: RequestUser): Promise<Apartment> {
    await this.accessService.assertCanAccessBuilding(user, dto.buildingId);
    const building = await this.buildingsRepo.findOne({ where: { id: dto.buildingId } });
    if (!building) throw new NotFoundException('Здание не найдено');
    const existing = await this.apartmentsRepo.findOne({
      where: { buildingId: dto.buildingId, number: dto.number.trim() },
    });
    if (existing) {
      throw new ConflictException(`Квартира с номером «${dto.number}» уже есть в этом здании`);
    }
    const apartment = this.apartmentsRepo.create({
      buildingId: dto.buildingId,
      number: dto.number.trim(),
      floor: dto.floor,
      extension: dto.extension?.trim() || undefined,
    });
    return this.apartmentsRepo.save(apartment);
  }

  /** Создать квартиры с номерами from..to (включительно). Существующие пропускаются. */
  async createBulk(
    buildingId: number,
    from: number,
    to: number,
    user: RequestUser,
  ): Promise<{ created: number; skipped: number }> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);
    const building = await this.buildingsRepo.findOne({ where: { id: buildingId } });
    if (!building) throw new NotFoundException('Здание не найдено');
    if (from > to) throw new BadRequestException('from не должно быть больше to');
    const range = Math.min(500, Math.max(0, to - from + 1));
    if (range <= 0) return { created: 0, skipped: 0 };

    const existing = await this.apartmentsRepo.find({
      where: { buildingId },
      select: { number: true },
    });
    const existingSet = new Set(existing.map((a) => a.number));

    let created = 0;
    for (let n = from; n <= to && created < 500; n++) {
      const num = String(n);
      if (existingSet.has(num)) continue;
      const apartment = this.apartmentsRepo.create({
        buildingId,
        number: num,
        floor: undefined,
      });
      await this.apartmentsRepo.save(apartment);
      existingSet.add(num);
      created++;
    }
    return { created, skipped: Math.min(to - from + 1, 500) - created };
  }

  async update(
    id: number,
    dto: UpdateApartmentDto,
    user: RequestUser,
  ): Promise<Apartment> {
    const apartment = await this.apartmentsRepo.findOne({ where: { id } });
    if (!apartment) throw new NotFoundException('Квартира не найдена');
    await this.accessService.assertCanAccessBuilding(user, apartment.buildingId);
    if (dto.number != null) {
      const num = String(dto.number).trim();
      const existing = await this.apartmentsRepo.findOne({
        where: { buildingId: apartment.buildingId, number: num },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Квартира с номером «${num}» уже есть в этом здании`);
      }
      apartment.number = num;
    }
    if (dto.floor != null) apartment.floor = dto.floor;
    if (dto.extension !== undefined) apartment.extension = dto.extension?.trim() || undefined;
    return this.apartmentsRepo.save(apartment);
  }

  /** RESIDENT: list apartments the current user is linked to (for "add family/guest" flow). */
  async getMyApartments(
    user: RequestUser,
  ): Promise<Array<{ apartmentId: number; apartment: Apartment; building: Building }>> {
    if (user.role !== UserRole.RESIDENT) return [];
    const uas = await this.userApartmentsRepo.find({
      where: { userId: user.id },
      relations: ['apartment', 'apartment.building'],
    });
    return uas
      .filter((ua) => ua.apartment?.building)
      .map((ua) => ({
        apartmentId: ua.apartmentId,
        apartment: ua.apartment!,
        building: ua.apartment!.building!,
      }));
  }

  async getResidents(apartmentId: number, user: RequestUser): Promise<UserApartment[]> {
    const apartment = await this.apartmentsRepo.findOne({
      where: { id: apartmentId },
      relations: ['building'],
    });
    if (!apartment) throw new NotFoundException('Квартира не найдена');
    await this.accessService.assertCanAccessBuilding(user, apartment.buildingId);
    return this.userApartmentsRepo.find({
      where: { apartmentId },
      relations: ['user', 'apartment'],
    });
  }

  async addResident(
    apartmentId: number,
    dto: AddResidentDto,
    user: RequestUser,
  ): Promise<UserApartment> {
    const apartment = await this.apartmentsRepo.findOne({
      where: { id: apartmentId },
      relations: ['building'],
    });
    if (!apartment) throw new NotFoundException('Квартира не найдена');

    let effectiveRole = dto.role ?? 'resident';
    if (user.role === UserRole.RESIDENT) {
      const myLink = await this.userApartmentsRepo.findOne({
        where: { userId: user.id, apartmentId },
      });
      if (!myLink) {
        throw new ForbiddenException('Добавлять жителей можно только в свою квартиру');
      }
      if (effectiveRole === 'owner') {
        throw new BadRequestException('Житель не может назначать роль владельца; укажите жителя или гостя');
      }
      if (effectiveRole !== 'guest' && effectiveRole !== 'resident') {
        effectiveRole = 'resident';
      }
    } else {
      await this.accessService.assertCanAccessBuilding(user, apartment.buildingId);
    }

    let targetUser;
    if (dto.userId) {
      targetUser = await this.usersService.findById(dto.userId);
    } else if (dto.email) {
      targetUser = await this.usersService.findByLogin(dto.email);
    } else if (dto.phone) {
      targetUser = await this.usersService.findByLogin(dto.phone);
    } else {
      throw new BadRequestException('Укажите userId, email или телефон');
    }
    if (!targetUser) throw new NotFoundException('Пользователь не найден');

    const existing = await this.userApartmentsRepo.findOne({
      where: { userId: targetUser.id, apartmentId },
    });
    if (existing) throw new ConflictException('Пользователь уже привязан к этой квартире');

    const ua = this.userApartmentsRepo.create({
      userId: targetUser.id,
      apartmentId,
      role: effectiveRole,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
    });
    const saved = await this.userApartmentsRepo.save(ua);
    this.eventLogService.create(null, EVENT_TYPE_RESIDENT_ADDED, { targetUserId: targetUser.id, role: effectiveRole }, {
      userId: user.id,
      entityType: 'apartment',
      entityId: String(apartmentId),
    }).catch(() => {});
    this.accessService.invalidateAccessCache(targetUser.id).catch(() => {});
    return saved;
  }

  async remove(id: number, user: RequestUser): Promise<void> {
    const apartment = await this.apartmentsRepo.findOne({
      where: { id },
      relations: ['userApartments'],
    });
    if (!apartment) throw new NotFoundException('Квартира не найдена');
    await this.accessService.assertCanAccessBuilding(user, apartment.buildingId);
    if (apartment.userApartments && apartment.userApartments.length > 0) {
      throw new BadRequestException('Нельзя удалить квартиру с привязанными жителями. Сначала уберите привязки.');
    }
    await this.applicationsRepo.delete({ apartmentId: id });
    await this.apartmentsRepo.remove(apartment);
  }

  async removeResident(
    apartmentId: number,
    userId: string,
    user: RequestUser,
  ): Promise<void> {
    const apartment = await this.apartmentsRepo.findOne({ where: { id: apartmentId } });
    if (!apartment) throw new NotFoundException('Квартира не найдена');
    await this.accessService.assertCanAccessBuilding(user, apartment.buildingId);
    const ua = await this.userApartmentsRepo.findOne({
      where: { userId, apartmentId },
    });
    if (!ua) throw new NotFoundException('Привязка жителя не найдена');
    await this.userApartmentsRepo.remove(ua);
    this.eventLogService.create(null, EVENT_TYPE_RESIDENT_REMOVED, { removedUserId: userId }, {
      userId: user.id,
      entityType: 'apartment',
      entityId: String(apartmentId),
    }).catch(() => {});
    this.accessService.invalidateAccessCache(userId).catch(() => {});
  }
}
