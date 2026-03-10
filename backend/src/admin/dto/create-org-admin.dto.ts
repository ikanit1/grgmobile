import { IsEmail, IsOptional, IsString, MinLength, IsUUID, IsEnum } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

export class CreateOrgAdminDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @MinLength(6, { message: 'Пароль не менее 6 символов' })
  password: string;

  @IsUUID()
  organizationId: string;

  @IsEnum([UserRole.ORG_ADMIN, UserRole.COMPLEX_MANAGER])
  role: UserRole.ORG_ADMIN | UserRole.COMPLEX_MANAGER;

  @IsOptional()
  @IsUUID()
  complexId?: string;
}
