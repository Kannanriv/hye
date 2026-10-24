import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type Principal } from '../common/principal.js';
import { SessionAuthGuard } from '../identity/session-auth.guard.js';
import { CreatePostDto, FeedQueryDto } from './dto/post.dto.js';
import { PostsService } from './posts.service.js';

@Controller()
@UseGuards(SessionAuthGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post('posts')
  create(@CurrentUser() user: Principal, @Body() dto: CreatePostDto) {
    return this.posts.create(user.userId, dto);
  }

  /** Home feed: your posts and people you follow. ?kind=reel for the reels tab; paginate with ?before. */
  @Get('posts/feed')
  feed(@CurrentUser() user: Principal, @Query() query: FeedQueryDto) {
    return this.posts.feed(user.userId, query);
  }

  @Get('posts/:id')
  get(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.posts.get(user.userId, id);
  }

  /** Idempotent: liking twice keeps one like. */
  @Post('posts/:id/like')
  @HttpCode(HttpStatus.OK)
  like(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.posts.like(user.userId, id);
  }

  @Delete('posts/:id/like')
  unlike(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.posts.unlike(user.userId, id);
  }

  @Put('follows/:userId')
  follow(@CurrentUser() user: Principal, @Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.posts.follow(user.userId, userId);
  }

  @Delete('follows/:userId')
  unfollow(@CurrentUser() user: Principal, @Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.posts.unfollow(user.userId, userId);
  }
}
