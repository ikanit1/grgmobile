import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Building } from './entities/building.entity';
import { Device } from '../devices/entities/device.entity';
import { ResidentialComplex } from '../residential-complexes/entities/residential-complex.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { BuildingsService } from './buildings.service';
import { BuildingsController } from './buildings.controller';
import { AccessModule } from '../access/access.module';
import { ApartmentsModule } from '../apartments/apartments.module';
import { EventsModule } from '../events/events.module';
import { DevicesModule } from '../devices/devices.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Building, Device, ResidentialComplex, Organization]),
    AccessModule,
    ApartmentsModule,
    EventsModule,
    forwardRef(() => DevicesModule),
    CredentialsModule,
  ],
  controllers: [BuildingsController],
  providers: [BuildingsService],
  exports: [BuildingsService],
})
export class BuildingsModule {}
