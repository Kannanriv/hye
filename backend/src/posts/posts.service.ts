import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { newId, nowIso } from '../common/ids.js';
import type { PostRecord } from '../persistence/records.js';
import type { CreatePostDto, FeedQueryDto } from './dto/post.dto.js';
import { POSTS_REPOSITORY, type PostsRepository } from './posts.repository.js';

const MAX_TEXT_POST_IMAGES = 4;

export function postView(p: PostRecord, likedByMe: boolean) {
  return {
    id: p.id,
    kind: p.kind,
    authorId: p.authorUserId,
    text: p.body,
    // storageKey is resolved to a short-lived signed URL by the media service (TODO).
    media: p.media.map(m => ({ kind: m.kind, storageKey: m.storageKey, posterStorageKey: m.posterStorageKey ?? undefined, aspectRatio: m.aspectRatio ?? undefined })),
    audience: p.audience,
    replyToId: p.replyToId ?? undefined,
    quoteOfId: p.quoteOfId ?? undefined,
    likeCount: p.likeCount,
    repostCount: p.repostCount,
    commentCount: p.commentCount,
    views: p.viewCount,
    likedByMe,
    createdAt: p.createdAt,
  };
}

/**
 * Posts, photos and reels (one model, three kinds), the home feed and likes.
 *
 * Visibility: `everyone` posts are visible to all signed-in users; `contacts` posts to the
 * author and the people the author has added. Until the contacts module is server-side,
 * "added" is approximated by "the author follows the viewer".
 */
@Injectable()
export class PostsService {
  constructor(@Inject(POSTS_REPOSITORY) private readonly repo: PostsRepository) {}

  async create(userId: string, dto: CreatePostDto) {
    const text = (dto.text ?? '').trim();
    const media = dto.media ?? [];
    if (media.some(m => m.posterStorageKey && m.kind !== 'video')) throw new BadRequestException('Only videos can have a poster frame');
    switch (dto.kind) {
      case 'text':
        if (!text) throw new BadRequestException('A text post needs text');
        if (media.length > MAX_TEXT_POST_IMAGES || media.some(m => m.kind !== 'image')) {
          throw new BadRequestException(`A text post can carry up to ${MAX_TEXT_POST_IMAGES} images`);
        }
        break;
      case 'photo':
        if (!media.length || media.some(m => m.kind !== 'image')) throw new BadRequestException('A photo post needs at least one image and only images');
        break;
      case 'reel':
        if (media.length !== 1 || media[0].kind !== 'video') throw new BadRequestException('A reel is exactly one video');
        break;
    }
    if (dto.replyToId) await this.requireVisible(userId, dto.replyToId, 'replyToId');
    if (dto.quoteOfId) await this.requireVisible(userId, dto.quoteOfId, 'quoteOfId');

    const now = nowIso();
    const post: PostRecord = {
      id: newId(),
      authorUserId: userId,
      kind: dto.kind,
      body: text,
      audience: dto.audience ?? (dto.kind === 'photo' ? 'contacts' : 'everyone'),
      replyToId: dto.replyToId ?? null,
      quoteOfId: dto.quoteOfId ?? null,
      // TODO: verify each storageKey belongs to this user's completed, malware-scanned upload.
      media: media.map(m => ({ kind: m.kind, storageKey: m.storageKey, posterStorageKey: m.posterStorageKey ?? null, aspectRatio: m.aspectRatio ?? null })),
      likeCount: 0, repostCount: 0, commentCount: 0, viewCount: 0,
      createdAt: now, updatedAt: now, deletedAt: null,
    };
    await this.repo.insert(post);
    return postView(post, false);
  }

  /** Your posts and those of people you follow, newest first, filtered by audience. */
  async feed(userId: string, q: FeedQueryDto) {
    const authorIds = [userId, ...(await this.repo.followeesOf(userId))];
    const scanLimit = q.limit * 3;
    const scanned = await this.repo.listByAuthors({ authorIds, before: q.before, limit: scanLimit });
    const visible: PostRecord[] = [];
    for (const p of scanned) {
      if (q.kind && p.kind !== q.kind) continue;
      if (await this.canSee(userId, p)) visible.push(p);
      if (visible.length === q.limit) break;
    }
    const liked = await this.repo.likedBy(userId, visible.map(p => p.id));
    const exhausted = scanned.length < scanLimit && visible.length < q.limit;
    const last = visible.length === q.limit ? visible[visible.length - 1] : scanned[scanned.length - 1];
    return { posts: visible.map(p => postView(p, liked.has(p.id))), nextBefore: exhausted || !last ? null : last.createdAt };
  }

  async get(userId: string, postId: string) {
    const post = await this.requireVisible(userId, postId);
    return postView(post, await this.repo.hasLiked(postId, userId));
  }

  /** Idempotent: liking twice keeps one like. */
  async like(userId: string, postId: string) {
    await this.requireVisible(userId, postId);
    await this.repo.addLike(postId, userId);
    return this.likeState(userId, postId);
  }

  async unlike(userId: string, postId: string) {
    await this.requireVisible(userId, postId);
    await this.repo.removeLike(postId, userId);
    return this.likeState(userId, postId);
  }

  async follow(userId: string, targetId: string) {
    if (userId === targetId.toLowerCase()) throw new BadRequestException('You cannot follow yourself');
    // TODO: check the target exists and has not blocked the caller (blocks table).
    await this.repo.follow(userId, targetId.toLowerCase());
    return { userId: targetId.toLowerCase(), following: true };
  }

  async unfollow(userId: string, targetId: string) {
    await this.repo.unfollow(userId, targetId.toLowerCase());
    return { userId: targetId.toLowerCase(), following: false };
  }

  private async likeState(userId: string, postId: string) {
    const post = await this.repo.findById(postId);
    return { postId, liked: await this.repo.hasLiked(postId, userId), likeCount: post?.likeCount ?? 0 };
  }

  private async canSee(viewerId: string, post: PostRecord): Promise<boolean> {
    if (post.authorUserId === viewerId || post.audience === 'everyone') return true;
    return this.repo.isFollowing(post.authorUserId, viewerId);
  }

  /** 404 for missing and invisible posts alike, so private posts can't be probed. */
  private async requireVisible(viewerId: string, postId: string, field?: string): Promise<PostRecord> {
    const post = await this.repo.findById(postId);
    if (!post || !(await this.canSee(viewerId, post))) {
      if (field) throw new BadRequestException(`${field} is not a post you can see`);
      throw new NotFoundException('Post not found');
    }
    return post;
  }
}
