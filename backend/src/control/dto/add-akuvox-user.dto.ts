import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AkuvoxUserItemDto {
  @IsString()
  Name!: string;

  @IsString()
  UserID!: string;

  @IsOptional()
  @IsNumber()
  LiftFloorNum?: number;

  @IsOptional()
  @IsNumber()
  WebRelay?: number;

  @IsOptional()
  @IsString()
  'Schedule-Relay'?: string;
}

export class AddAkuvoxUserDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AkuvoxUserItemDto)
  items!: AkuvoxUserItemDto[];
}
