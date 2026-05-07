import { IsOptional, IsString } from 'class-validator';

export class ApplyOsdDto {
  @IsOptional()
  @IsString()
  channelName?: string;
}
