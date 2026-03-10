import { IsInt, IsOptional } from 'class-validator';

export class OpenDoorDto {
  @IsOptional()
  @IsInt()
  relayId?: number;
}

