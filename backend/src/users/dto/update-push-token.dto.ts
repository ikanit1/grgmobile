import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePushTokenDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string; // 'android' | 'ios'
}
