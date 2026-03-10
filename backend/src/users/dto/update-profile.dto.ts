import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Некорректный email' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
