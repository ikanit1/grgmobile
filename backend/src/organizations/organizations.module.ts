import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { AccessModule } from '../access/access.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([Organization]), AccessModule, EventsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [TypeOrmModule, OrganizationsService],
})
export class OrganizationsModule {}
