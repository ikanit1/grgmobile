import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { Apartment } from '../apartments/entities/apartment.entity';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { AkuvoxProvisioningService } from './akuvox-provisioning.service';
import { AccessModule } from '../access/access.module';
import { EventsModule } from '../events/events.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, Apartment]),
    AccessModule,
    EventsModule,
    CredentialsModule,
    forwardRef(() => BuildingsModule),
  ],
  controllers: [DevicesController],
  providers: [DevicesService, AkuvoxProvisioningService],
  exports: [DevicesService, AkuvoxProvisioningService],
})
export class DevicesModule {}

