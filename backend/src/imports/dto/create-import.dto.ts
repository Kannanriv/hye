import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import {
  ATTACHMENT_KINDS, DATE_ORDERS, IMPORT_PLATFORMS, type AttachmentKind, type DateOrder, type SourcePlatform,
} from '../../common/domain.js';

export const MAX_IMPORT_ITEMS = 100_000;

export class PlannedAttachmentDto {
  @IsIn(ATTACHMENT_KINDS)
  kind!: AttachmentKind;

  @IsString() @Length(1, 255)
  fileName!: string;

  @IsOptional() @IsString() @MaxLength(500)
  missingReason?: string;
}

/**
 * One planned message (PlannedItem.message in the client pipeline). Structure is validated
 * here; semantic problems (bad timestamp, oversized text) become per-item `failed`
 * outcomes instead of rejecting the whole import.
 */
export class PlannedMessageDto {
  @IsString() @MaxLength(200)
  senderName!: string;

  /** True when this sender is the participant the user said was them. */
  @IsOptional() @IsBoolean()
  isMe?: boolean;

  @IsString()
  text!: string;

  /** ISO 8601. Without an offset it is treated as the export's wall-clock time (see timezoneNote). */
  @IsString() @MaxLength(40)
  sentAt!: string;

  @IsOptional() @IsString() @MaxLength(40)
  editedAt?: string;

  @IsOptional() @IsString() @MaxLength(40)
  deletedAt?: string;

  @IsOptional() @IsBoolean()
  system?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PlannedAttachmentDto)
  attachments?: PlannedAttachmentDto[];
}

/** PlannedItem from the client: a deterministic source key plus either a message or an error. */
export class ImportItemDto {
  /** Human-readable location in the export, e.g. "lines 12-14". */
  @IsString() @Length(1, 64)
  ref!: string;

  /** Stable hash of the source record (with occurrence suffix). Re-imports dedupe on this. */
  @IsString() @Length(1, 128)
  sourceKey!: string;

  @IsOptional() @IsString() @MaxLength(500)
  error?: string;

  @IsOptional() @ValidateNested() @Type(() => PlannedMessageDto)
  message?: PlannedMessageDto;
}

export class CreateImportDto {
  @IsIn(IMPORT_PLATFORMS)
  platform!: Exclude<SourcePlatform, 'hye'>;

  @IsString() @Length(1, 255)
  fileName!: string;

  /** Lowercase hex SHA-256 of the export file. The same file always maps to the same job. */
  @Matches(/^[0-9a-f]{64}$/, { message: 'fileHash must be a lowercase hex SHA-256' })
  fileHash!: string;

  @IsOptional() @IsInt() @Min(0)
  fileSizeBytes?: number;

  @IsIn(DATE_ORDERS)
  dateOrder!: DateOrder;

  /** Which export participant is the user, so their messages show as outgoing. */
  @IsOptional() @IsString() @MaxLength(200)
  me?: string;

  @IsOptional() @IsString() @MaxLength(500)
  timezoneNote?: string;

  /** Append to an existing imported conversation instead of creating one. */
  @IsOptional() @IsUUID()
  conversationId?: string;

  @IsOptional() @IsString() @Length(1, 100)
  title?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(1024) @IsString({ each: true }) @MaxLength(200, { each: true })
  participants?: string[];

  @IsArray() @ArrayMaxSize(MAX_IMPORT_ITEMS) @ValidateNested({ each: true }) @Type(() => ImportItemDto)
  items!: ImportItemDto[];
}
