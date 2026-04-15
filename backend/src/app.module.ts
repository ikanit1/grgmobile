import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import * as path from 'path';
import { AuthModule } from './auth/auth.module';
import { HousesModule } from './houses/houses.module';
import { DevicesModule } from './devices/devices.module';
import { ControlModule } from './control/control.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { EventsModule } from './events/events.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ResidentialComplexesModule } from './residential-complexes/residential-complexes.module';
import { BuildingsModule } from './buildings/buildings.module';
import { ApartmentsModule } from './apartments/apartments.module';
import { UsersModule } from './users/users.module';
import { Device } from './devices/entities/device.entity';
import { Organization } from './organizations/entities/organization.entity';
import { ResidentialComplex } from './residential-complexes/entities/residential-complex.entity';
import { Building } from './buildings/entities/building.entity';
import { Apartment } from './apartments/entities/apartment.entity';
import { User } from './users/entities/user.entity';
import { UserApartment } from './users/entities/user-apartment.entity';
import { EventLog } from './events/entities/event-log.entity';
import { ApartmentApplication } from './apartments/entities/apartment-application.entity';
import { PanelResident } from './panel-residents/entities/panel-resident.entity';
import { AdminModule } from './admin/admin.module';
import { PanelResidentsModule } from './panel-residents/panel-residents.module';
import { PushModule } from './push/push.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { HealthController } from './common/health.controller';

const usePostgres = process.env.DB_TYPE === 'postgres';

const typeOrmConfig = usePostgres
  ? {
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'doorphone',
      entities: [
        Device,
        Organization,
        ResidentialComplex,
        Building,
        Apartment,
        User,
        UserApartment,
        EventLog,
        ApartmentApplication,
        PanelResident,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
    }
  : {
      type: 'better-sqlite3' as const,
      database: process.env.DB_SQLITE_PATH || path.join(process.cwd(), 'data', 'doorphone.sqlite'),
      entities: [
        Device,
        Organization,
        ResidentialComplex,
        Building,
        Apartment,
        User,
        UserApartment,
        EventLog,
        ApartmentApplication,
        PanelResident,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
    };

@Module({
  imports: [
    CacheModule.register({ isGlobal: true, ttl: 30_000, max: 500 }),
    TypeOrmModule.forRoot(typeOrmConfig),
    AuthModule,
    OrganizationsModule,
    ResidentialComplexesModule,
    BuildingsModule,
    ApartmentsModule,
    UsersModule,
    HousesModule,
    DevicesModule,
    PanelResidentsModule,
    ControlModule,
    DiscoveryModule,
    EventsModule,
    AdminModule,
    PushModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

