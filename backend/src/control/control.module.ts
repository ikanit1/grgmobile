import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { EventsController } from '../events/events.controller';
import { OpenDoorRateLimitGuard } from './open-door-rate-limit.guard';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { AccessModule } from '../access/access.module';
import { PushModule } from '../push/push.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AkuvoxClient } from '../vendors/akuvox/akuvox.client';
import { UniviewLiteapiHttpClient } from '../vendors/uniview/uniview-liteapi-http.client';
import { Go2rtcClient } from '../vendors/go2rtc/go2rtc.client';
import { Device } from '../devices/entities/device.entity';

const HTTP_TIMEOUT_MS = 10000; // 10s — запрос через интернет на роутер ЖК

@Module({
  imports: [
    HttpModule.register({ timeout: HTTP_TIMEOUT_MS }),
    DevicesModule,
    EventsModule,
    AccessModule,
    PushModule,
    CredentialsModule,
    TypeOrmModule.forFeature([Device]),
  ],
  controllers: [ControlController, EventsController],
  providers: [ControlService, AkuvoxClient, UniviewLiteapiHttpClient, Go2rtcClient, OpenDoorRateLimitGuard],
})
export class ControlModule {}

