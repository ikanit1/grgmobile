import { IsNumber, IsOptional, IsString } from 'class-validator';

export class DeviceEventDto {
  @IsString()
  type!: string; // e.g. 'incoming_call'

  @IsOptional()
  @IsNumber()
  apartmentId?: number;

  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @IsOptional()
  @IsString()
  snapshotUrl?: string;
}
