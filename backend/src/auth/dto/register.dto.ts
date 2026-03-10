import { IsString, MinLength, IsOptional, IsEmail, ValidateIf } from 'class-validator';

export class RegisterDto {
  @ValidateIf((o) => !o.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((o) => !o.email)
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
