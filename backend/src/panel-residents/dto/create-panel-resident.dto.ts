import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePanelResidentDto {
  @IsString()
  @MaxLength(64)
  panelUserId!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  apartmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  webRelay?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  liftFloorNum?: string;

  @IsOptional()
  @IsObject()
  scheduleRelay?: Record<string, unknown>;
}
