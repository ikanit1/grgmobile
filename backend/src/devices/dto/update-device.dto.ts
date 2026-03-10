import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeviceRole, DeviceType } from '../entities/device.entity';

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsEnum(DeviceType)
  type?: DeviceType;

  @IsOptional()
  @IsEnum(DeviceRole)
  role?: DeviceRole;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  httpPort?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  rtspPort?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  sipPort?: number;

  @IsOptional()
  @IsNumber()
  defaultChannel?: number;

  @IsOptional()
  @IsString()
  defaultStream?: string;

  @IsOptional()
  @IsString()
  macAddress?: string;
}
