import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResidentialComplex } from './entities/residential-complex.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { ResidentialComplexesService } from './residential-complexes.service';
import { ResidentialComplexesController } from './residential-complexes.controller';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResidentialComplex, Organization]),
    AccessModule,
  ],
  controllers: [ResidentialComplexesController],
  providers: [ResidentialComplexesService],
  exports: [TypeOrmModule, ResidentialComplexesService],
})
export class ResidentialComplexesModule {}
