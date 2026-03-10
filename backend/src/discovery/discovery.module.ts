import { Module } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Building } from '../buildings/entities/building.entity';
import { Device } from '../devices/entities/device.entity';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [TypeOrmModule.forFeature([Building, Device]), AccessModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}

