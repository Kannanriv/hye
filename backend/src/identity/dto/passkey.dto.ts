import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class PasskeyRegistrationOptionsDto {
  /** Desired handle for a new account, or omitted when adding a passkey to the signed-in account. */
  @IsOptional() @IsString() @Length(3, 32)
  handle?: string;

  @IsOptional() @IsString() @Length(1, 100)
  displayName?: string;
}

export class PasskeyVerifyDto {
  /** The PublicKeyCredential JSON produced by the platform authenticator. */
  @IsObject()
  credential!: Record<string, unknown>;
}

export class PasskeyLoginOptionsDto {
  @IsOptional() @IsString() @Length(3, 32)
  handle?: string;
}
