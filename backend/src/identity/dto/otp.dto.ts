import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

/** E.164: '+', country code, subscriber number; 8–15 digits in total. */
export const E164 = /^\+[1-9]\d{6,14}$/;

export class OtpRequestDto {
  @Matches(E164, { message: 'phone must be in E.164 format, e.g. +919876543210' })
  phone!: string;
}

export class OtpVerifyDto {
  /** Returned by POST /auth/otp/request. */
  @IsUUID()
  challengeId!: string;

  @Matches(E164, { message: 'phone must be in E.164 format, e.g. +919876543210' })
  phone!: string;

  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  /** Display name for a brand-new account. */
  @IsOptional() @IsString() @Length(1, 100)
  displayName?: string;
}
