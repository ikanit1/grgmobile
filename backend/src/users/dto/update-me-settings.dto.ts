import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateMeSettingsDto {
  @IsOptional()
  @IsBoolean()
  doNotDisturb?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'Формат ЧЧ:ММ (например 22:00)' })
  doNotDisturbFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'Формат ЧЧ:ММ (например 08:00)' })
  doNotDisturbTo?: string;
}
