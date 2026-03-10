import { IsObject, IsOptional, IsString } from 'class-validator';

export class AkuvoxWebhookDto {
  @IsString()
  mac: string;

  @IsString()
  eventType: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
