import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeviceType } from '../../devices/entities/device.entity';

export class TestConnectionDto {
  @IsOptional()
  @IsNumber()
  deviceId?: number;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsEnum(DeviceType)
  type?: DeviceType;

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
}
