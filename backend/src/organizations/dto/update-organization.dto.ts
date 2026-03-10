import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subscriptionPlan?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxComplexes?: number;

  @IsOptional()
  @IsString()
  inn?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDevices?: number;
}
