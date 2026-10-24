import { Injectable } from '@nestjs/common';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { PostRecord } from '../persistence/records.js';

export const POSTS_REPOSITORY = Symbol('POSTS_REPOSITORY');

export interface FeedQuery {
  /** Authors whose posts may appear (the viewer and whoever they follow). */
  authorIds: string[];
  /** Keyset cursor: posts strictly older than this created_at. */
  before?: string;
  /** Upper bound on rows scanned before visibility filtering. */
  limit: number;
}

export interface PostsRepository {
  insert(post: PostRecord): Promise<void>;
  findById(id: string): Promise<PostRecord | null>;
  /** Newest first, live posts by the given authors. Visibility is applied by the service. */
  listByAuthors(query: FeedQuery): Promise<PostRecord[]>;
  /** Adds a like; returns false if it already existed. Keeps posts.like_count in step. */
  addLike(postId: string, userId: string): Promise<boolean>;
  removeLike(postId: string, userId: string): Promise<boolean>;
  hasLiked(postId: string, userId: string): Promise<boolean>;
  likedBy(userId: string, postIds: string[]): Promise<Set<string>>;
  follow(followerId: string, followeeId: string): Promise<boolean>;
  unfollow(followerId: string, followeeId: string): Promise<boolean>;
  followeesOf(userId: string): Promise<string[]>;
  isFollowing(followerId: string, followeeId: string): Promise<boolean>;
}

@Injectable()
export class InMemoryPostsRepository implements PostsRepository {
  constructor(private readonly db: InMemoryDb) {}

  async insert(post: PostRecord) {
    this.db.posts.set(post.id, structuredClone(post));
  }

  async findById(id: string) {
    const p = this.db.posts.get(id);
    return p && !p.deletedAt ? structuredClone(p) : null;
  }

  async listByAuthors(q: FeedQuery) {
    const authors = new Set(q.authorIds);
    return [...this.db.posts.values()]
      .filter(p => !p.deletedAt && authors.has(p.authorUserId) && (!q.before || p.createdAt < q.before))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, q.limit)
      .map(p => structuredClone(p));
  }

  async addLike(postId: string, userId: string) {
    const likes = this.likesOf(postId);
    if (likes.has(userId)) return false;
    likes.add(userId);
    this.bump(postId, +1);
    return true;
  }

  async removeLike(postId: string, userId: string) {
    const likes = this.likesOf(postId);
    if (!likes.delete(userId)) return false;
    this.bump(postId, -1);
    return true;
  }

  async hasLiked(postId: string, userId: string) {
    return this.likesOf(postId).has(userId);
  }

  async likedBy(userId: string, postIds: string[]) {
    return new Set(postIds.filter(id => this.db.postLikes.get(id)?.has(userId)));
  }

  async follow(followerId: string, followeeId: string) {
    const set = this.db.follows.get(followerId) ?? new Set<string>();
    this.db.follows.set(followerId, set);
    if (set.has(followeeId)) return false;
    set.add(followeeId);
    return true;
  }

  async unfollow(followerId: string, followeeId: string) {
    return this.db.follows.get(followerId)?.delete(followeeId) ?? false;
  }

  async followeesOf(userId: string) {
    return [...(this.db.follows.get(userId) ?? [])];
  }

  async isFollowing(followerId: string, followeeId: string) {
    return this.db.follows.get(followerId)?.has(followeeId) ?? false;
  }

  private likesOf(postId: string) {
    let set = this.db.postLikes.get(postId);
    if (!set) this.db.postLikes.set(postId, (set = new Set()));
    return set;
  }

  private bump(postId: string, delta: number) {
    const p = this.db.posts.get(postId);
    if (p) p.likeCount = Math.max(0, p.likeCount + delta);
  }
}
