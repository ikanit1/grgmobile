import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6, { message: 'Новый пароль не менее 6 символов' })
  newPassword: string;
}
