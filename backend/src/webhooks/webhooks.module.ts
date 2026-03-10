import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { EventsModule } from '../events/events.module';
import { Device } from '../devices/entities/device.entity';

@Module({
  imports: [EventsModule, TypeOrmModule.forFeature([Device])],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
