import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateApartmentDto {
  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number;

  @IsOptional()
  @IsString()
  extension?: string;
}
