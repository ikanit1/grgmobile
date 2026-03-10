import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateApartmentDto {
  @Type(() => Number)
  @IsInt()
  buildingId!: number;

  @IsString()
  number!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number;

  @IsOptional()
  @IsString()
  extension?: string;
}
