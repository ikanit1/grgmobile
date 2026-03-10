import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { ResidentialComplex } from '../../residential-complexes/entities/residential-complex.entity';
import { UserApartment } from './user-apartment.entity';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  COMPLEX_MANAGER = 'COMPLEX_MANAGER',
  RESIDENT = 'RESIDENT',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  phone?: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 50 })
  role: UserRole;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'complex_id', type: 'uuid', nullable: true })
  complexId?: string;

  @ManyToOne(() => ResidentialComplex)
  @JoinColumn({ name: 'complex_id' })
  complex?: ResidentialComplex;

  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  /** FCM or APNs device token for push notifications (incoming call, etc.) */
  @Column({ name: 'push_token', type: 'varchar', length: 512, nullable: true })
  pushToken?: string;

  @Column({ name: 'push_platform', type: 'varchar', length: 20, nullable: true })
  pushPlatform?: string;

  @Column({ name: 'is_blocked', type: 'boolean', default: false })
  isBlocked: boolean;

  @Column({ name: 'blocked_until', nullable: true })
  blockedUntil?: Date;

  @Column({ name: 'do_not_disturb', type: 'boolean', default: false })
  doNotDisturb: boolean;

  /** Time of day when DND starts (e.g. "22:00"). If set with doNotDisturbTo, only quiet in this window. */
  @Column({ name: 'do_not_disturb_from', type: 'varchar', length: 10, nullable: true })
  doNotDisturbFrom?: string;

  @Column({ name: 'do_not_disturb_to', type: 'varchar', length: 10, nullable: true })
  doNotDisturbTo?: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255, nullable: true })
  refreshTokenHash?: string;

  @OneToMany(() => UserApartment, (ua) => ua.user)
  userApartments?: UserApartment[];
}
