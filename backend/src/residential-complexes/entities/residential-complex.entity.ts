import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { Building } from '../../buildings/entities/building.entity';

@Entity('residential_complexes')
export class ResidentialComplex {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, (o) => o.complexes)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column()
  name: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  timezone?: string;

  @Column({ type: 'simple-json', nullable: true })
  settings?: Record<string, unknown>;

  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => Building, (b) => b.complex)
  buildings?: Building[];
}
