import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { PostAudience, PostKind } from '../../persistence/records.js';

/** Object keys issued by the (future) presigned-upload endpoint; never client file paths or URLs. */
const STORAGE_KEY = /^uploads\/[A-Za-z0-9/_.-]{1,200}$/;

export class PostMediaDto {
  @IsIn(['image', 'video'])
  kind!: 'image' | 'video';

  @Matches(STORAGE_KEY, { message: 'storageKey must be an uploads/ object key' })
  storageKey!: string;

  @IsOptional() @Matches(STORAGE_KEY, { message: 'posterStorageKey must be an uploads/ object key' })
  posterStorageKey?: string;

  @IsOptional() @IsNumber() @IsPositive() @Max(10)
  aspectRatio?: number;
}

export class CreatePostDto {
  @IsIn(['text', 'photo', 'reel'])
  kind!: PostKind;

  @IsOptional() @IsString() @MaxLength(5000)
  text?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => PostMediaDto)
  media?: PostMediaDto[];

  /** Defaults: photos → contacts, everything else → everyone. */
  @IsOptional() @IsIn(['everyone', 'contacts'])
  audience?: PostAudience;

  @IsOptional() @IsUUID()
  replyToId?: string;

  @IsOptional() @IsUUID()
  quoteOfId?: string;
}

export class FeedQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit = 20;

  @IsOptional() @IsISO8601()
  before?: string;

  @IsOptional() @IsIn(['text', 'photo', 'reel'])
  kind?: PostKind;
}
