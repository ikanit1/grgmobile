import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminImpersonateController } from './admin-impersonate.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminService } from './admin.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AccessModule } from '../access/access.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ResidentialComplexesModule } from '../residential-complexes/residential-complexes.module';
import { EventsModule } from '../events/events.module';
import { Organization } from '../organizations/entities/organization.entity';
import { ResidentialComplex } from '../residential-complexes/entities/residential-complex.entity';
import { Building } from '../buildings/entities/building.entity';
import { Device } from '../devices/entities/device.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { ApartmentApplication } from '../apartments/entities/apartment-application.entity';
import { Apartment } from '../apartments/entities/apartment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      ResidentialComplex,
      Building,
      Device,
      UserApartment,
      ApartmentApplication,
      Apartment,
    ]),
    AuthModule,
    UsersModule,
    AccessModule,
    OrganizationsModule,
    ResidentialComplexesModule,
    EventsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES || '30d') as number | import('ms').StringValue,
      },
    }),
  ],
  controllers: [
    AdminController,
    AdminImpersonateController,
    AdminUsersController,
    AdminDashboardController,
  ],
  providers: [AdminService, AdminDashboardService],
})
export class AdminModule {}
