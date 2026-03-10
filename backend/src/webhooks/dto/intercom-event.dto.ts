import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class IntercomEventDto {
  @IsInt()
  @Min(1)
  deviceId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  apartmentId?: number;

  @IsOptional()
  @IsString()
  apartmentNumber?: string;
}
