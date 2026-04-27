import { IsString, IsOptional, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { DeviceType, DeviceRole } from '../../devices/entities/device.entity';
import { IsValidHost } from '../../common/validators/is-valid-host.validator';

export class CreateDeviceDto {
  @IsString()
  name!: string;

  @IsString()
  @IsValidHost()
  host!: string;

  @IsEnum(DeviceType)
  type!: DeviceType;

  @IsEnum(DeviceRole)
  role!: DeviceRole;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  floor?: number | null;

  @IsOptional()
  @IsNumber()
  nvrId?: number | null;
}
