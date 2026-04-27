import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeviceRole, DeviceType } from '../entities/device.entity';
import { IsValidHost } from '../../common/validators/is-valid-host.validator';

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsValidHost()
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  floor?: number | null;

  @IsOptional()
  @IsString()
  customRtspUrl?: string | null;

  @IsOptional()
  @IsNumber()
  nvrId?: number | null;
}
