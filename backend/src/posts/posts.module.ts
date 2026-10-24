import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PostsController } from './posts.controller.js';
import { InMemoryPostsRepository, POSTS_REPOSITORY } from './posts.repository.js';
import { PostsService } from './posts.service.js';

/**
 * Posts, photos and reels; follows; likes.
 * TODO: Postgres PostsRepository (tables in 002_social.sql), media upload (presigned S3 PUT
 * + ClamAV scan), comments, reposts, saves, view counting, achievements.
 */
@Module({
  imports: [IdentityModule],
  controllers: [PostsController],
  providers: [PostsService, { provide: POSTS_REPOSITORY, useClass: InMemoryPostsRepository }],
  exports: [PostsService],
})
export class PostsModule {}
