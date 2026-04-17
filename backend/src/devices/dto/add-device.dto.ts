import { IsEnum, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { DeviceRole, DeviceType } from '../entities/device.entity';

export class AddDeviceDto {
  @IsString()
  name: string;

  @IsString()
  host: string;

  @IsEnum(DeviceType)
  type: DeviceType;

  @IsEnum(DeviceRole)
  role: DeviceRole;

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
  @ValidateIf((o) => o.floor !== null)
  @IsNumber()
  floor?: number | null;

  @IsOptional()
  @IsString()
  customRtspUrl?: string | null;
}
