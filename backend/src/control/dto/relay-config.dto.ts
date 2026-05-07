import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RelayConfigDto {
  @IsOptional()
  @IsInt()
  relayId?: number;

  @IsInt()
  @Min(1)
  @Max(30)
  durationSec: number;
}
