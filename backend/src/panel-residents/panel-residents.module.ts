import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PanelResident } from './entities/panel-resident.entity';
import { PanelResidentService } from './panel-resident.service';
import { PanelResidentController } from './panel-resident.controller';
import { DevicesModule } from '../devices/devices.module';
import { AccessModule } from '../access/access.module';
import { EventsModule } from '../events/events.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AkuvoxClient } from '../vendors/akuvox/akuvox.client';
import { Apartment } from '../apartments/entities/apartment.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';

@Module({
  imports: [
    HttpModule.register({ timeout: 10000 }),
    TypeOrmModule.forFeature([PanelResident, Apartment, UserApartment]),
    DevicesModule,
    AccessModule,
    EventsModule,
    CredentialsModule,
  ],
  controllers: [PanelResidentController],
  providers: [PanelResidentService, AkuvoxClient],
  exports: [PanelResidentService],
})
export class PanelResidentsModule {}
