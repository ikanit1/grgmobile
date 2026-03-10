import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Apartment } from '../../apartments/entities/apartment.entity';

@Entity('user_apartments')
export class UserApartment {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (u) => u.userApartments)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @PrimaryColumn({ name: 'apartment_id' })
  apartmentId: number;

  @ManyToOne(() => Apartment, (a) => a.userApartments)
  @JoinColumn({ name: 'apartment_id' })
  apartment: Apartment;

  @Column({ length: 20, default: 'resident' })
  role: string; // owner, resident, guest

  @Column({ name: 'access_level', type: 'int', default: 1 })
  accessLevel: number;

  @Column({ name: 'valid_until', nullable: true })
  validUntil?: Date;
}
