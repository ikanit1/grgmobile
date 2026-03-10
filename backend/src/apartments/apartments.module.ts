import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apartment } from './entities/apartment.entity';
import { ApartmentApplication } from './entities/apartment-application.entity';
import { Building } from '../buildings/entities/building.entity';
import { User } from '../users/entities/user.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { ApartmentsService } from './apartments.service';
import { ApplicationsService } from './applications.service';
import { ApartmentsImportService } from './apartments-import.service';
import { ResidentsImportService } from './residents-import.service';
import { ApartmentsController } from './apartments.controller';
import { AccessModule } from '../access/access.module';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Apartment, ApartmentApplication, Building, User, UserApartment]),
    AccessModule,
    forwardRef(() => UsersModule),
    EventsModule,
  ],
  controllers: [ApartmentsController],
  providers: [
    ApartmentsService,
    ApplicationsService,
    ApartmentsImportService,
    ResidentsImportService,
  ],
  exports: [
    TypeOrmModule,
    ApartmentsService,
    ApplicationsService,
    ApartmentsImportService,
    ResidentsImportService,
  ],
})
export class ApartmentsModule {}
