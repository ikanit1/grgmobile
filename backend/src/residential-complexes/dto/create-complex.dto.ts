import { IsString, IsOptional } from 'class-validator';

export class CreateComplexDto {
  @IsString()
  organizationId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
