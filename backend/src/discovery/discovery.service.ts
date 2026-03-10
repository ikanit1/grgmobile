import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Building } from '../buildings/entities/building.entity';
import { Device, DeviceRole, DeviceType } from '../devices/entities/device.entity';

export interface OnvifDiscoveredDevice {
  host: string;
  name?: string;
  location?: string;
  xAddr?: string;
}

@Injectable()
export class DiscoveryService {
  private lastResults = new Map<number, OnvifDiscoveredDevice[]>();

  constructor(
    @InjectRepository(Building)
    private readonly buildingsRepo: Repository<Building>,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
  ) {}

  /**
   * WS-Discovery (ONVIF) scan on the local network.
   * Uses node-onvif to send multicast probe and collect responses.
   */
  async startDiscovery(buildingId: number): Promise<OnvifDiscoveredDevice[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const onvif = require('node-onvif');
      const results: OnvifDiscoveredDevice[] = [];
      await new Promise<void>((resolve) => {
        onvif.startProbe().then((deviceInfoList: any[]) => {
          for (const info of deviceInfoList) {
            const xAddr: string = info.xaddrs?.[0] ?? info.xaddrs ?? '';
            const uri = xAddr ? (() => { try { return new URL(xAddr); } catch { return null; } })() : null;
            const host = uri?.hostname ?? xAddr;
            results.push({
              host,
              name: info.name ?? info.types ?? undefined,
              location: info.location ?? undefined,
              xAddr: xAddr || undefined,
            });
          }
          resolve();
        }).catch(() => resolve());
        setTimeout(resolve, 5000);
      });
      this.lastResults.set(buildingId, results);
      return results;
    } catch {
      this.lastResults.set(buildingId, []);
      return [];
    }
  }

  getLastResults(buildingId: number): OnvifDiscoveredDevice[] {
    return this.lastResults.get(buildingId) ?? [];
  }

  async createDeviceFromDiscovery(
    buildingId: number,
    dto: {
      host: string;
      type: DeviceType;
      username?: string;
      password?: string;
      role: DeviceRole;
    },
  ): Promise<Device> {
    const building = await this.buildingsRepo.findOne({ where: { id: buildingId } });
    if (!building) {
      throw new Error('Building not found');
    }

    const dev = this.devicesRepo.create({
      buildingId,
      building,
      name: dto.host,
      host: dto.host,
      type: dto.type,
      role: dto.role,
      username: dto.username,
      password: dto.password,
    });
    return this.devicesRepo.save(dev);
  }
}
