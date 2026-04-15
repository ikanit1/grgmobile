import { IsOptional, IsString, MinLength } from 'class-validator';

/** Login by email or phone (passed as login). */
export class LoginDto {
  @IsString()
  login!: string;

  @IsString()
  @MinLength(3)
  password!: string;

  /** FCM or APNs token for push notifications; saved on login. */
  @IsOptional()
  @IsString()
  fcmToken?: string;

  /** Platform: 'android' | 'ios' | 'web'. */
  @IsOptional()
  @IsString()
  pushPlatform?: string;
}

