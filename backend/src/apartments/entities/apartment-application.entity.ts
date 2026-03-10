import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Apartment } from './apartment.entity';

export enum ApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('apartment_applications')
export class ApartmentApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'apartment_id' })
  apartmentId: number;

  @ManyToOne(() => Apartment, (a) => a.applications)
  @JoinColumn({ name: 'apartment_id' })
  apartment: Apartment;

  @Column({ type: 'varchar', length: 20, default: ApplicationStatus.PENDING })
  status: ApplicationStatus;

  @Column({ name: 'requested_at', default: () => 'CURRENT_TIMESTAMP' })
  requestedAt: Date;

  @Column({ name: 'decided_at', type: 'timestamp', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'decided_by' })
  decidedByUser: User | null;

  @Column({ name: 'reject_reason', type: 'varchar', length: 500, nullable: true })
  rejectReason: string | null;
}
