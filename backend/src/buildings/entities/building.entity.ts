import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ResidentialComplex } from '../../residential-complexes/entities/residential-complex.entity';
import { Apartment } from '../../apartments/entities/apartment.entity';
import { Device } from '../../devices/entities/device.entity';

@Entity('buildings')
export class Building {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'complex_id', type: 'uuid' })
  complexId: string;

  @ManyToOne(() => ResidentialComplex, (c) => c.buildings)
  @JoinColumn({ name: 'complex_id' })
  complex: ResidentialComplex;

  @Column()
  name: string;

  @Column({ nullable: true })
  address?: string;

  @OneToMany(() => Apartment, (a) => a.building)
  apartments?: Apartment[];

  @OneToMany(() => Device, (d) => d.building)
  devices?: Device[];
}
