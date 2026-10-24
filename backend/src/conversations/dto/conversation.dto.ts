import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min,
} from 'class-validator';
import { CONVERSATION_KINDS, RETENTION_POLICIES, type ConversationKind, type RetentionPolicy } from '../../common/domain.js';

export class CreateConversationDto {
  @IsIn(CONVERSATION_KINDS)
  kind!: ConversationKind;

  @IsOptional() @IsString() @Length(1, 100)
  title?: string;

  /** Other participants (hye user ids). The caller is added as admin. */
  @IsUUID('all', { each: true }) @ArrayUnique() @ArrayMaxSize(255)
  memberIds!: string[];

  @IsOptional() @IsIn(RETENTION_POLICIES)
  retention?: RetentionPolicy;
}

export class ListConversationsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 30;

  @IsOptional() @IsISO8601()
  before?: string;

  @IsOptional() @IsIn(['true', 'false'])
  archived?: 'true' | 'false';
}

/** Per-member inbox state plus the conversation-wide retention policy (admins only). */
export class UpdateConversationDto {
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsBoolean() muted?: boolean;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsBoolean() markedUnread?: boolean;
  @IsOptional() @IsISO8601() lastReadAt?: string;
  @IsOptional() @IsIn(RETENTION_POLICIES) retention?: RetentionPolicy;
}
