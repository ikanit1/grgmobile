import { IsString, IsOptional } from 'class-validator';

export class UpdateComplexDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
