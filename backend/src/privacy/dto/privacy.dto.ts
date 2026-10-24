import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestDeletionDto {
  /** Explicit confirmation, so a stray request can't schedule a deletion. */
  @Equals('DELETE MY ACCOUNT')
  confirm!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
