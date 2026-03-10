import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ResidentialComplex } from '../../residential-complexes/entities/residential-complex.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'subscription_plan', default: 'basic' })
  subscriptionPlan: string;

  @Column({ name: 'max_complexes', type: 'int', default: 10 })
  maxComplexes: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  inn: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 50, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'max_devices', type: 'int', nullable: true })
  maxDevices: number | null;

  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => ResidentialComplex, (c) => c.organization)
  complexes?: ResidentialComplex[];
}
