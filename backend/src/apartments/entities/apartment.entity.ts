import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Building } from '../../buildings/entities/building.entity';
import { UserApartment } from '../../users/entities/user-apartment.entity';
import { ApartmentApplication } from './apartment-application.entity';

@Entity('apartments')
export class Apartment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'building_id' })
  buildingId: number;

  @ManyToOne(() => Building, (b) => b.apartments)
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @Column({ length: 20 })
  number: string;

  @Column({ type: 'int', nullable: true })
  floor?: number;

  /** Номер/расширение для вызова с панели (должно совпадать с настройкой на внутреннем мониторе). */
  @Column({ length: 50, nullable: true })
  extension?: string;

  @OneToMany(() => UserApartment, (ua) => ua.apartment)
  userApartments?: UserApartment[];

  @OneToMany(() => ApartmentApplication, (a) => a.apartment)
  applications?: ApartmentApplication[];
}
