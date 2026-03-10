import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from '../../devices/entities/device.entity';

@Entity('event_logs')
@Index(['deviceId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['organizationId', 'eventType', 'createdAt'])
export class EventLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @ManyToOne(() => Device, { nullable: true })
  @JoinColumn({ name: 'device_id' })
  device?: Device;

  @Column({ name: 'event_type', length: 50 })
  eventType: string;

  /** Actor: the user who triggered the event (if applicable). */
  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

  /** Organisation context of the event (which tenant it belongs to). */
  @Column({ name: 'organization_id', type: 'varchar', length: 36, nullable: true })
  organizationId?: string | null;

  /** Type of the affected entity ('device', 'user', 'org', 'building', 'apartment', 'application'). */
  @Column({ name: 'entity_type', type: 'varchar', length: 50, nullable: true })
  entityType?: string | null;

  /** ID of the affected entity (stringified). */
  @Column({ name: 'entity_id', type: 'varchar', length: 255, nullable: true })
  entityId?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;

  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
