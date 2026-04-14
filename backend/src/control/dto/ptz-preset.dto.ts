import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PtzPresetDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  channelId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  presetId: number;
}
