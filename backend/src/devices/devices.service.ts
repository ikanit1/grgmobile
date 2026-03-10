import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { AccessService } from '../access/access.service';
import { EventLogService } from '../events/event-log.service';
import { RequestUser } from '../auth/request-user.interface';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
  ) {}

  async findById(id: number): Promise<Device> {
    const dev = await this.devicesRepo.findOne({ where: { id } });
    if (!dev) {
      throw new NotFoundException('Устройство не найдено');
    }
    return dev;
  }

  async findByIdForUser(id: number, user: RequestUser): Promise<Device> {
    const dev = await this.findById(id);
    await this.accessService.assertCanAccessDevice(user, dev.buildingId);
    return dev;
  }

  async update(id: number, dto: UpdateDeviceDto, user?: RequestUser): Promise<Device> {
    const dev = await this.findById(id);
    if (user) {
      await this.accessService.assertCanAccessDevice(user, dev.buildingId);
    }
    if (dto.name !== undefined) dev.name = dto.name;
    if (dto.host !== undefined) dev.host = dto.host;
    if (dto.type !== undefined) dev.type = dto.type;
    if (dto.role !== undefined) dev.role = dto.role;
    if (dto.username !== undefined) dev.username = dto.username;
    if (dto.password !== undefined) dev.password = dto.password;
    if (dto.httpPort !== undefined) dev.httpPort = dto.httpPort;
    if (dto.rtspPort !== undefined) dev.rtspPort = dto.rtspPort;
    if (dto.sipPort !== undefined) dev.sipPort = dto.sipPort;
    if (dto.defaultChannel !== undefined) dev.defaultChannel = dto.defaultChannel;
    if (dto.defaultStream !== undefined) dev.defaultStream = dto.defaultStream;
    if (dto.macAddress !== undefined) dev.macAddress = dto.macAddress;
    return this.devicesRepo.save(dev);
  }

  async remove(id: number, user?: RequestUser): Promise<Device> {
    const dev = await this.findById(id);
    if (user) {
      await this.accessService.assertCanAccessDevice(user, dev.buildingId);
    }
    await this.eventLogService.clearDeviceReferences(id);
    await this.devicesRepo.remove(dev);
    return dev;
  }

  async updateStatus(deviceId: number, status: 'online' | 'offline'): Promise<void> {
    await this.devicesRepo.update(deviceId, {
      status,
      lastSeenAt: status === 'online' ? new Date() : undefined,
    });
  }
}
