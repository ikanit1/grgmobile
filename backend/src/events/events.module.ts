import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsGateway } from './events.gateway';
import { UniviewWsConnectionService } from './uniview-ws-connection.service';
import { EventLog } from './entities/event-log.entity';
import { EventLogService } from './event-log.service';
import { IncomingCallService } from './incoming-call.service';
import { Device } from '../devices/entities/device.entity';
import { Apartment } from '../apartments/entities/apartment.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventLog, Device, Apartment, UserApartment]),
    forwardRef(() => PushModule),
  ],
  providers: [EventsGateway, UniviewWsConnectionService, EventLogService, IncomingCallService],
  exports: [EventsGateway, UniviewWsConnectionService, EventLogService, IncomingCallService],
})
export class EventsModule {}

