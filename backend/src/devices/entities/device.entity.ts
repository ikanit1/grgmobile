import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Building } from '../../buildings/entities/building.entity';

export enum DeviceType {
  UNIVIEW_IPC = 'UNIVIEW_IPC',
  UNIVIEW_NVR = 'UNIVIEW_NVR',
  OTHER = 'OTHER',
}

export enum DeviceRole {
  DOORPHONE = 'DOORPHONE',
  CAMERA = 'CAMERA',
  NVR = 'NVR',
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'building_id' })
  buildingId: number;

  @ManyToOne(() => Building, (building) => building.devices, { eager: true })
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 50 })
  type: DeviceType;

  @Column({ type: 'varchar', length: 50 })
  role: DeviceRole;

  @Column()
  host: string;

  @Column({ name: 'http_port', default: 80 })
  httpPort: number;

  @Column({ name: 'rtsp_port', default: 554 })
  rtspPort: number;

  @Column({ name: 'sip_port', type: 'int', nullable: true })
  sipPort?: number;

  /** Plain username (used when credentials is empty; prefer credentials for new data). */
  @Column({ nullable: true })
  username?: string;

  /** Plain password (used when credentials is empty; prefer credentials for new data). */
  @Column({ nullable: true })
  password?: string;

  /** Encrypted { username, password } JSON. When set, use CredentialsService to decrypt. */
  @Column({ type: 'simple-json', nullable: true })
  credentials?: Record<string, string>;

  @Column({ nullable: true })
  onvifXAddr?: string;

  @Column({ name: 'mac_address', type: 'varchar', length: 32, nullable: true })
  macAddress?: string | null;

  @Column({ nullable: true })
  defaultChannel?: number;

  @Column({ nullable: true })
  defaultStream?: string;

  /** 'online' | 'offline'; updated when connection is tested or by periodic check. */
  @Column({ type: 'varchar', length: 20, default: 'offline' })
  status: string;

  @Column({ name: 'last_seen_at', nullable: true })
  lastSeenAt?: Date;

  /**
   * Floor restriction for residents. null = visible to ALL residents in the building.
   * Set to a floor number (e.g. 3) to restrict visibility to residents on that floor only.
   * Admins (ORG_ADMIN, COMPLEX_MANAGER, SUPER_ADMIN) always see all devices regardless.
   */
  @Column({ name: 'floor', type: 'int', nullable: true })
  floor?: number | null;

  /**
   * Custom RTSP URL override. If set, used directly instead of LiteAPI or constructed URL.
   * Useful for OBS test streams, cameras with non-standard RTSP paths, etc.
   * Example: rtsp://192.168.1.100:554/live
   */
  @Column({ name: 'custom_rtsp_url', type: 'varchar', nullable: true })
  customRtspUrl?: string | null;

  /** True after provisioning script has been applied successfully. */
  @Column({ name: 'is_configured', type: 'boolean', default: false })
  isConfigured: boolean;

  /** Last successful config sync (provisioning) timestamp. */
  @Column({ name: 'last_sync_at', nullable: true })
  lastSyncAt?: Date;

  /** FK to parent NVR device. Set for IPC cameras added via NVR channel scan. */
  @Column({ name: 'nvr_id', type: 'int', nullable: true })
  nvrId?: number | null;
}
