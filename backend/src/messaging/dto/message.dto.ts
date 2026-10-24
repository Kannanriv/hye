import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

export class SendMessageDto {
  /** Client-generated id (e.g. a UUID). Retrying a send with the same id returns the original message. */
  @IsString() @Length(8, 64)
  clientMessageId!: string;

  @IsString() @Length(1, 65536)
  text!: string;

  @IsOptional() @IsUUID()
  replyToId?: string;

  @IsOptional() @IsString() @MaxLength(200)
  forwardedFrom?: string;
}

export class ListMessagesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit = 50;

  @IsOptional() @IsISO8601()
  before?: string;
}

// ---- WebSocket payloads -------------------------------------------------------

export class TypingEventDto {
  @IsUUID()
  conversationId!: string;

  @IsBoolean()
  isTyping!: boolean;
}

export class MessageStatusEventDto {
  @IsUUID()
  messageId!: string;

  /** Recipients may only advance a message to delivered or read. */
  @IsIn(['delivered', 'read'])
  status!: 'delivered' | 'read';
}
