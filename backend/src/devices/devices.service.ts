import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { AccessService } from '../access/access.service';
import { EventLogService } from '../events/event-log.service';
import { EventsGateway } from '../events/events.gateway';
import { RequestUser } from '../auth/request-user.interface';
import { CredentialsService } from '../credentials/credentials.service';
import { BuildingsService } from '../buildings/buildings.service';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    private readonly accessService: AccessService,
    private readonly eventLogService: EventLogService,
    private readonly eventsGateway: EventsGateway,
    private readonly credentialsService: CredentialsService,
    private readonly buildingsService: BuildingsService,
  ) {}

  async findById(id: number): Promise<Device> {
    const dev = await this.devicesRepo.findOne({ where: { id } });
    if (!dev) {
      throw new NotFoundException('Устройство не найдено');
    }
    // Decrypt credentials if present and populate username/password for backward compatibility
    if (dev.credentials) {
      const dec = this.credentialsService.decrypt(dev.credentials);
      if (dec) {
        dev.username = dec.username;
        dev.password = dec.password;
      }
    }
    // If no credentials, plain username/password from DB (legacy records) are already present
    return dev;
  }

  /** Device IDs for given building IDs (for events aggregation). */
  async getDeviceIdsByBuildingIds(buildingIds: number[]): Promise<number[]> {
    if (buildingIds.length === 0) return [];
    const list = await this.devicesRepo.find({
      where: { buildingId: In(buildingIds) },
      select: ['id'],
    });
    return list.map((d) => d.id);
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

    // Handle credentials: if username or password provided, encrypt and store in credentials, clear plain fields
    if (dto.username !== undefined || dto.password !== undefined) {
      const newUsername = dto.username !== undefined ? dto.username : (dev.username ?? '');
      const newPassword = dto.password !== undefined ? dto.password : (dev.password ?? '');
      // Only encrypt if we have at least one non-empty value
      if (newUsername || newPassword) {
        dev.credentials = this.credentialsService.encrypt({ username: newUsername, password: newPassword });
      }
      dev.username = undefined;
      dev.password = undefined;
    }

    if (dto.httpPort !== undefined) dev.httpPort = dto.httpPort;
    if (dto.rtspPort !== undefined) dev.rtspPort = dto.rtspPort;
    if (dto.sipPort !== undefined) dev.sipPort = dto.sipPort;
    if (dto.defaultChannel !== undefined) dev.defaultChannel = dto.defaultChannel;
    if (dto.defaultStream !== undefined) dev.defaultStream = dto.defaultStream;
    if (dto.macAddress !== undefined) dev.macAddress = dto.macAddress;
    if ('floor' in dto) dev.floor = dto.floor ?? null;
    if ('customRtspUrl' in dto) dev.customRtspUrl = dto.customRtspUrl ?? null;
    const saved = await this.devicesRepo.save(dev);
    // Invalidate building devices cache
    await this.buildingsService.invalidateDevicesCache(saved.buildingId);
    return saved;
  }

  async remove(id: number, user?: RequestUser): Promise<Device> {
    const dev = await this.findById(id);
    if (user) {
      await this.accessService.assertCanAccessDevice(user, dev.buildingId);
    }
    await this.eventLogService.clearDeviceReferences(id);
    const buildingId = dev.buildingId;
    await this.devicesRepo.remove(dev);
    // Invalidate building devices cache
    await this.buildingsService.invalidateDevicesCache(buildingId);
    return dev;
  }

  async updateStatus(deviceId: number, status: 'online' | 'offline'): Promise<void> {
    const device = await this.devicesRepo.findOne({ where: { id: deviceId }, select: { id: true, buildingId: true, status: true } });
    if (!device) return;
    const previousStatus = device.status;
    await this.devicesRepo.update(deviceId, {
      status,
      lastSeenAt: status === 'online' ? new Date() : undefined,
    });
    if (previousStatus !== status) {
      this.eventsGateway.emitDeviceStatusChange(deviceId, device.buildingId, status);
    }
  }
}
