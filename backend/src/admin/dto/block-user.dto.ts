import { IsBoolean, IsOptional, IsDateString } from 'class-validator';

export class BlockUserDto {
  @IsBoolean()
  isBlocked: boolean;

  @IsOptional()
  @IsDateString()
  blockedUntil?: string;
}
