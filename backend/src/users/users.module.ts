import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserApartment } from './entities/user-apartment.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ApartmentsModule } from '../apartments/apartments.module';
import { AccessModule } from '../access/access.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserApartment]),
    forwardRef(() => ApartmentsModule),
    AccessModule,
    EventsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
