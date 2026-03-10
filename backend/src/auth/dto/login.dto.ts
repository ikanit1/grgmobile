import { IsString, MinLength } from 'class-validator';

/** Login by email or phone (passed as login). */
export class LoginDto {
  @IsString()
  login!: string;

  @IsString()
  @MinLength(3)
  password!: string;
}

