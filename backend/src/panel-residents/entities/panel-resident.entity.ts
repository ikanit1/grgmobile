import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from '../../devices/entities/device.entity';
import { Apartment } from '../../apartments/entities/apartment.entity';

export enum PanelResidentSyncStatus {
  SYNCED = 'synced',
  PENDING_ADD = 'pending_add',
  PENDING_UPDATE = 'pending_update',
  PENDING_DELETE = 'pending_delete',
  ERROR = 'error',
}

@Entity('panel_residents')
@Index(['deviceId', 'panelUserId'], { unique: true })
export class PanelResident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device?: Device;

  @Column({ name: 'panel_user_id', type: 'varchar', length: 64 })
  panelUserId: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ name: 'apartment_id', type: 'int', nullable: true })
  apartmentId: number | null;

  @ManyToOne(() => Apartment, { nullable: true })
  @JoinColumn({ name: 'apartment_id' })
  apartment?: Apartment | null;

  @Column({ name: 'web_relay', type: 'varchar', length: 32, nullable: true })
  webRelay: string | null;

  @Column({ name: 'lift_floor_num', type: 'varchar', length: 32, nullable: true })
  liftFloorNum: string | null;

  @Column({ name: 'schedule_relay', type: 'simple-json', nullable: true })
  scheduleRelay: Record<string, unknown> | null;

  @Column({
    name: 'sync_status',
    type: 'varchar',
    length: 32,
    default: PanelResidentSyncStatus.SYNCED,
  })
  syncStatus: PanelResidentSyncStatus;

  @Column({ name: 'sync_error', type: 'text', nullable: true })
  syncError: string | null;

  @Column({ name: 'synced_at', type: 'timestamp', nullable: true })
  syncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
