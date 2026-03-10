import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { OpenDoorRateLimitGuard } from './open-door-rate-limit.guard';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { AccessModule } from '../access/access.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AkuvoxClient } from '../vendors/akuvox/akuvox.client';
import { UniviewLiteapiHttpClient } from '../vendors/uniview/uniview-liteapi-http.client';
import { Device } from '../devices/entities/device.entity';

const HTTP_TIMEOUT_MS = 10000; // 10s — запрос через интернет на роутер ЖК

@Module({
  imports: [
    HttpModule.register({ timeout: HTTP_TIMEOUT_MS }),
    DevicesModule,
    EventsModule,
    AccessModule,
    CredentialsModule,
    TypeOrmModule.forFeature([Device]),
  ],
  controllers: [ControlController],
  providers: [ControlService, AkuvoxClient, UniviewLiteapiHttpClient, OpenDoorRateLimitGuard],
})
export class ControlModule {}

