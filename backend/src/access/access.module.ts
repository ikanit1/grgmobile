import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Building } from '../buildings/entities/building.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { ResidentialComplex } from '../residential-complexes/entities/residential-complex.entity';
import { AccessService } from './access.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Building, UserApartment, ResidentialComplex]),
  ],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
