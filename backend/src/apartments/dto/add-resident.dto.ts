import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class AddResidentDto {
  /** User ID (uuid). If provided, email and phone are ignored. */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** owner | resident | guest */
  @IsOptional()
  @IsString()
  @IsIn(['owner', 'resident', 'guest'])
  role?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
