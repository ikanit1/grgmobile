import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Device, DeviceType } from './entities/device.entity';
import { Apartment } from '../apartments/entities/apartment.entity';
import { CredentialsService } from '../credentials/credentials.service';
import { EventLogService } from '../events/event-log.service';
import { EVENT_TYPE_DEVICE_CONFIG_SYNCED } from '../events/event-types';
import { RequestUser } from '../auth/request-user.interface';

export interface ProvisionConfig {
  panel: { host: string; username: string; password: string };
  backend: { baseUrl: string; webhookSecret: string };
  sip?: Array<{ server: string; user: string; password: string }> | { server: string; user: string; password: string };
  actionUrls: { openDoor: string; incomingCall: string; callFinished: string };
  apiWhitelist: string[];
  /** Номера квартир здания (обратная совместимость; скрипт предпочитает apartmentContacts). */
  apartmentNumbers?: string[];
  /** Квартиры с номером вызова для contact/add: панель звонит на extension. */
  apartmentContacts?: Array<{ number: string; extension?: string }>;
}

export interface SyncResultItem {
  deviceId: number;
  success: boolean;
  error?: string;
}

@Injectable()
export class AkuvoxProvisioningService {
  private readonly logger = new Logger(AkuvoxProvisioningService.name);

  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(Apartment)
    private readonly apartmentsRepo: Repository<Apartment>,
    private readonly credentialsService: CredentialsService,
    private readonly eventLogService: EventLogService,
  ) {}

  getScriptPath(): string {
    const envPath = process.env.AKUVOX_CONFIG_SCRIPT;
    if (envPath) return envPath;
    return path.join(process.cwd(), '..', 'akuvox_config.py');
  }

  buildProvisionConfig(device: Device): ProvisionConfig {
    const dec = this.credentialsService.decrypt(device.credentials);
    const username = dec?.username ?? device.username ?? 'admin';
    const password = dec?.password ?? device.password ?? '';
    const baseUrl = process.env.BACKEND_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/akuvox`;
    let whitelist: string[] = [];
    const whitelistEnv = process.env.PROVISION_WHITELIST_IP ?? process.env.BACKEND_BASE_URL;
    if (whitelistEnv) {
      try {
        const url = new URL(whitelistEnv.startsWith('http') ? whitelistEnv : `http://${whitelistEnv}`);
        if (url.hostname) whitelist = [url.hostname];
      } catch {
        whitelist = [whitelistEnv];
      }
    }
    const panelHost = device.host.includes('://') ? device.host : `http://${device.host}:${device.httpPort ?? 80}`;
    return {
      panel: { host: panelHost, username, password },
      backend: { baseUrl, webhookSecret },
      actionUrls: {
        openDoor: webhookUrl,
        incomingCall: webhookUrl,
        callFinished: webhookUrl,
      },
      apiWhitelist: whitelist,
    };
  }

  async getProvisionConfig(deviceId: number, user: RequestUser): Promise<ProvisionConfig> {
    const device = await this.devicesRepo.findOne({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Устройство не найдено');
    if (device.type !== DeviceType.AKUVOX) throw new NotFoundException('Устройство не является панелью Akuvox');
    const config = this.buildProvisionConfig(device);
    const apartments = await this.apartmentsRepo.find({
      where: { buildingId: device.buildingId },
      select: { number: true, extension: true },
      order: { number: 'ASC' },
    });
    config.apartmentContacts = apartments.map((a) => ({ number: a.number, extension: a.extension ?? undefined }));
    config.apartmentNumbers = apartments.map((a) => a.number);
    return config;
  }

  runScriptWithConfig(config: ProvisionConfig): Promise<{ success: boolean; stderr: string; stdout: string }> {
    const scriptPath = this.getScriptPath();
    return new Promise((resolve) => {
      const configJson = JSON.stringify(config);
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const args = [scriptPath, '--config', '-'];
      const child = spawn(pythonCmd, args, {
        cwd: path.dirname(scriptPath),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        stderr += err.message;
        resolve({ success: false, stderr, stdout });
      });
      child.on('close', (code) => {
        resolve({ success: code === 0, stderr, stdout });
      });
      child.stdin?.write(configJson);
      child.stdin?.end();
    });
  }

  async syncDeviceConfig(deviceId: number): Promise<SyncResultItem> {
    const device = await this.devicesRepo.findOne({ where: { id: deviceId } });
    if (!device) return { deviceId, success: false, error: 'Устройство не найдено' };
    if (device.type !== DeviceType.AKUVOX) return { deviceId, success: false, error: 'Устройство не Akuvox' };

    const config = this.buildProvisionConfig(device);
    const apartments = await this.apartmentsRepo.find({
      where: { buildingId: device.buildingId },
      select: { number: true, extension: true },
      order: { number: 'ASC' },
    });
    config.apartmentContacts = apartments.map((a) => ({ number: a.number, extension: a.extension ?? undefined }));
    config.apartmentNumbers = apartments.map((a) => a.number);
    this.logger.log(`Sync config deviceId=${deviceId} host=${device.host}`);
    const { success, stderr, stdout } = await this.runScriptWithConfig(config);

    const errorMessage = success ? undefined : (stderr || stdout || 'Скрипт завершился с ошибкой').trim().slice(0, 500);
    await this.eventLogService.create(deviceId, EVENT_TYPE_DEVICE_CONFIG_SYNCED, {
      success,
      error: errorMessage,
      stdout: stdout.slice(-1000),
    } as Record<string, unknown>);

    if (success) {
      await this.devicesRepo.update(deviceId, {
        isConfigured: true,
        lastSyncAt: new Date(),
      });
      this.logger.log(`Sync config deviceId=${deviceId} OK`);
    } else {
      this.logger.warn(`Sync config deviceId=${deviceId} failed: ${errorMessage}`);
    }
    return { deviceId, success, error: errorMessage };
  }

  async syncConfigForDevices(deviceIds: number[], _user: RequestUser): Promise<SyncResultItem[]> {
    const results: SyncResultItem[] = [];
    for (const id of deviceIds) {
      const item = await this.syncDeviceConfig(id);
      results.push(item);
    }
    return results;
  }

  /**
   * Синхронизировать конфиг и квартиры на все панели Akuvox указанного здания.
   * Вызывается автоматически после изменения квартир (импорт, диапазон) или вручную.
   */
  async syncConfigForBuilding(buildingId: number): Promise<SyncResultItem[]> {
    const devices = await this.devicesRepo.find({
      where: { buildingId, type: DeviceType.AKUVOX },
      select: { id: true },
    });
    if (devices.length === 0) return [];
    const ids = devices.map((d) => d.id);
    this.logger.log(`Auto-sync Akuvox config for building ${buildingId}, devices: ${ids.join(', ')}`);
    const results: SyncResultItem[] = [];
    for (const id of ids) {
      const item = await this.syncDeviceConfig(id);
      results.push(item);
    }
    return results;
  }
}
