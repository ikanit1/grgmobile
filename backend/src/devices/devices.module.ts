import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { Apartment } from '../apartments/entities/apartment.entity';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { AccessModule } from '../access/access.module';
import { EventsModule } from '../events/events.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { UniviewLiteapiHttpClient } from '../vendors/uniview/uniview-liteapi-http.client';

@Module({
  imports: [
    HttpModule.register({ timeout: 15000 }),
    TypeOrmModule.forFeature([Device, Apartment]),
    AccessModule,
    EventsModule,
    CredentialsModule,
    forwardRef(() => BuildingsModule),
  ],
  controllers: [DevicesController],
  providers: [DevicesService, UniviewLiteapiHttpClient],
  exports: [DevicesService],
})
export class DevicesModule {}

