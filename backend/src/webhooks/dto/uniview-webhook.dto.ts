import { IsIP, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Uniview IPC/NVR webhook payload.
 * Device is identified by IP (Uniview doesn't send MAC in callbacks).
 * eventType: door_open | motion | alarm | tamper | <custom>
 */
export class UniviewWebhookDto {
  @IsIP()
  deviceIp: string;

  @IsString()
  eventType: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
