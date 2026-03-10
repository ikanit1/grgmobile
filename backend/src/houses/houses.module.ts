import { Module } from '@nestjs/common';
import { BuildingsModule } from '../buildings/buildings.module';
import { HousesController } from './houses.controller';

@Module({
  imports: [BuildingsModule],
  controllers: [HousesController],
})
export class HousesModule {}
