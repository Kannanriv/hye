import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { CreatePostDto } from './dto/post.dto.js';
import { InMemoryPostsRepository, POSTS_REPOSITORY } from './posts.repository.js';
import { PostsService } from './posts.service.js';

const ME = '11111111-1111-4111-8111-111111111111';
const ASHA = '22222222-2222-4222-8222-222222222222';
const RAVI = '33333333-3333-4333-8333-333333333333';

const text = (t: string, extra: Partial<CreatePostDto> = {}): CreatePostDto => ({ kind: 'text', text: t, ...extra });
const feed = (s: PostsService, user: string, extra = {}) => s.feed(user, { limit: 20, ...extra });

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PostsService, { provide: POSTS_REPOSITORY, useValue: new InMemoryPostsRepository(new InMemoryDb()) }],
    }).compile();
    service = moduleRef.get(PostsService);
  });

  describe('create', () => {
    it('creates text, photo and reel posts with kind-appropriate defaults', async () => {
      const t = await service.create(ME, text('  hello  '));
      expect(t).toMatchObject({ kind: 'text', text: 'hello', audience: 'everyone', likeCount: 0, likedByMe: false });

      const photo = await service.create(ME, { kind: 'photo', media: [{ kind: 'image', storageKey: 'uploads/me/a.jpg', aspectRatio: 1.5 }] });
      expect(photo.audience).toBe('contacts'); // photos default to contacts only

      const reel = await service.create(ME, { kind: 'reel', media: [{ kind: 'video', storageKey: 'uploads/me/r.mp4', posterStorageKey: 'uploads/me/r.jpg' }] });
      expect(reel).toMatchObject({ kind: 'reel', audience: 'everyone' });
    });

    it('rejects posts whose media does not fit the kind', async () => {
      await expect(service.create(ME, text('   '))).rejects.toThrow('A text post needs text');
      await expect(service.create(ME, { kind: 'photo', media: [] })).rejects.toThrow('at least one image');
      await expect(service.create(ME, { kind: 'reel', media: [{ kind: 'image', storageKey: 'uploads/x.jpg' }] })).rejects.toThrow('exactly one video');
      await expect(
        service.create(ME, { kind: 'photo', media: [{ kind: 'image', storageKey: 'uploads/x.jpg', posterStorageKey: 'uploads/p.jpg' }] }),
      ).rejects.toThrow('poster');
    });

    it('supports replies and quotes of visible posts only', async () => {
      const root = await service.create(ASHA, text('root'));
      const reply = await service.create(ME, text('reply', { replyToId: root.id }));
      const quote = await service.create(ME, text('quote', { quoteOfId: root.id }));
      expect(reply.replyToId).toBe(root.id);
      expect(quote.quoteOfId).toBe(root.id);

      const privatePost = await service.create(ASHA, text('friends only', { audience: 'contacts' }));
      await expect(service.create(ME, text('x', { replyToId: privatePost.id }))).rejects.toThrow('replyToId is not a post you can see');
    });
  });

  describe('feed', () => {
    it('shows my posts and people I follow, newest first', async () => {
      const mine = await service.create(ME, text('mine'));
      const ashas = await service.create(ASHA, text('asha'));
      const ravis = await service.create(RAVI, text('ravi'));

      expect((await feed(service, ME)).posts.map(p => p.id)).toEqual([mine.id]);
      await service.follow(ME, ASHA);
      const ids = (await feed(service, ME)).posts.map(p => p.id);
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(expect.arrayContaining([mine.id, ashas.id]));
      expect(ids).not.toContain(ravis.id);

      await service.unfollow(ME, ASHA);
      expect((await feed(service, ME)).posts.map(p => p.id)).toEqual([mine.id]);
    });

    it('applies the contacts audience', async () => {
      await service.follow(ME, ASHA);
      const secret = await service.create(ASHA, text('contacts only', { audience: 'contacts' }));
      expect((await feed(service, ME)).posts).toHaveLength(0);
      await expect(service.get(ME, secret.id)).rejects.toThrow('Post not found');

      await service.follow(ASHA, ME); // Asha adds me
      expect((await feed(service, ME)).posts.map(p => p.id)).toEqual([secret.id]);
    });

    it('filters by kind and paginates', async () => {
      for (let i = 0; i < 5; i++) await service.create(ME, text(`t${i}`));
      await service.create(ME, { kind: 'reel', media: [{ kind: 'video', storageKey: 'uploads/me/r.mp4' }] });
      expect((await feed(service, ME, { kind: 'reel' })).posts).toHaveLength(1);

      const page1 = await feed(service, ME, { limit: 4 });
      expect(page1.posts).toHaveLength(4);
      expect(page1.nextBefore).toBeTruthy();
    });

    it('rejects following yourself', async () => {
      await expect(service.follow(ME, ME)).rejects.toThrow('cannot follow yourself');
    });
  });

  describe('likes', () => {
    it('is idempotent and reversible', async () => {
      const post = await service.create(ASHA, text('like me'));
      expect(await service.like(ME, post.id)).toEqual({ postId: post.id, liked: true, likeCount: 1 });
      expect(await service.like(ME, post.id)).toEqual({ postId: post.id, liked: true, likeCount: 1 });
      expect(await service.like(RAVI, post.id)).toMatchObject({ likeCount: 2 });
      expect((await service.get(ME, post.id)).likedByMe).toBe(true);

      expect(await service.unlike(ME, post.id)).toEqual({ postId: post.id, liked: false, likeCount: 1 });
      expect(await service.unlike(ME, post.id)).toMatchObject({ likeCount: 1 });
    });

    it('cannot like a post you cannot see', async () => {
      const secret = await service.create(ASHA, text('hidden', { audience: 'contacts' }));
      await expect(service.like(ME, secret.id)).rejects.toThrow('Post not found');
      await expect(service.like(ME, '44444444-4444-4444-8444-444444444444')).rejects.toThrow('Post not found');
    });
  });
});
