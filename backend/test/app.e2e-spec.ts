// Black-box e2e: boots the compiled server (dist/main.js) in a child process and talks to it
// over HTTP with supertest. This exercises the real Node ESM runtime, env validation,
// helmet, the throttler and the validation pipe exactly as deployed.
//
// Why not Test.createTestingModule(AppModule) in-process? Nest 12 is ESM-only and
// @nestjs/throttler is CommonJS that require()s it; Jest can only emulate require(esm) on
// Node >= 24.9, while Node itself handles it from 22.12. `npm test` builds first (pretest).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'dist', 'main.js');
let port = 0;
let base = '';

/** Ask the OS for a free port (random picks can hit Windows' reserved/excluded ranges). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '0.0.0.0', () => {
      const { port: p } = srv.address() as AddressInfo;
      srv.close(() => resolve(p));
    });
  });
}

let server: ChildProcess;
let output = '';

/** Plain node:http probe (no keep-alive agent left open after the run). */
function probe(): Promise<number> {
  return new Promise(resolve => {
    const req = httpGet(`${base}/health`, { agent: false }, res => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
    req.setTimeout(2_000, () => req.destroy());
  });
}

async function waitForHealth(timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error(`server exited early (${server.exitCode}):\n${output}`);
    if ((await probe()) === 200) return;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`server did not become healthy within ${timeoutMs} ms:\n${output.slice(-4000)}`);
}

beforeAll(async () => {
  if (!existsSync(entry)) throw new Error('dist/main.js missing: run `npm run build` (npm test does this via pretest)');
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [entry], {
    cwd: root,
    env: {
      PATH: process.env.PATH ?? '',
      SYSTEMROOT: process.env.SYSTEMROOT ?? '',
      NODE_ENV: 'test',
      PORT: String(port),
      PERSISTENCE: 'memory',
      AUTH_DEV_HEADER: 'true',
      LOG_LEVEL: 'warn',
      THROTTLE_LIMIT: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', d => (output += d));
  server.stderr?.on('data', d => (output += d));
  await waitForHealth();
}, 90_000);

afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise(r => server.once('exit', r));
  server.kill('SIGTERM');
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([exited, new Promise(r => (timer = setTimeout(r, 5_000)))]);
  clearTimeout(timer);
});

describe('GET /health', () => {
  it('reports ok with security headers and a request id', async () => {
    const res = await request(base).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'not_configured' } });
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.headers['x-content-type-options']).toBe('nosniff'); // helmet
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('is not rate limited', async () => {
    const res = await request(base).get('/health').expect(200);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('GET /integrations', () => {
  it('returns the capability matrix and no connected accounts', async () => {
    const res = await request(base).get('/integrations').expect(200);
    expect(res.body.kind).toBe('capability-matrix');
    const platforms = res.body.integrations.map((i: { platform: string }) => i.platform);
    expect(platforms).toEqual(['whatsapp', 'telegram', 'instagram', 'messenger', 'x', 'email']);
    expect(res.body.integrations[0].capabilities).toContainEqual(
      expect.objectContaining({ label: 'Import chat history', status: 'available' }),
    );
    expect(res.body.integrations[0].capabilities).toContainEqual(
      expect.objectContaining({ label: 'Live inbox for personal accounts', status: 'unavailable' }),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/"connected"|accessToken|refreshToken|password"/i);
  });

  it('is rate limited by the throttler', async () => {
    const res = await request(base).get('/integrations').expect(200);
    expect(res.headers['x-ratelimit-limit']).toBe('1000');
    expect(Number(res.headers['x-ratelimit-remaining'])).toBeLessThan(1000);
  });
});

describe('auth boundaries', () => {
  it('rejects unauthenticated calls', async () => {
    await request(base).get('/conversations').expect(401);
    await request(base).get('/imports/6f1c1d4e-8a7b-4c4e-9a59-0b3b0f2a1c11').expect(401);
  });

  it('answers passkey endpoints with a documented 501', async () => {
    const res = await request(base).post('/auth/passkeys/login/options').send({}).expect(501);
    expect(res.body).toMatchObject({ statusCode: 501, error: 'Not Implemented' });
    expect(res.body.todo).toBeInstanceOf(Array);
  });
});

describe('phone sign-in (OTP)', () => {
  it('validates E.164 and answers with a documented 501 without sending SMS', async () => {
    await request(base).post('/auth/otp/request').send({ phone: '98765 43210' }).expect(400);
    const res = await request(base).post('/auth/otp/request').send({ phone: '+919876543210' }).expect(501);
    expect(res.body).toMatchObject({ statusCode: 501, smsProvider: 'none' });
    expect(res.body.message).toContain('No SMS was sent');
    await request(base)
      .post('/auth/otp/verify')
      .send({ challengeId: '6f1c1d4e-8a7b-4c4e-9a59-0b3b0f2a1c11', phone: '+919876543210', code: '123456' })
      .expect(501);
  });
});

describe('posts', () => {
  const me = { 'x-hye-dev-user': '5a5a5a5a-1111-4111-8111-000000000001' };
  const asha = { 'x-hye-dev-user': '5a5a5a5a-2222-4222-8222-000000000002' };

  it('creates, follows, lists the feed and likes', async () => {
    const post = await request(base).post('/posts').set(asha).send({ kind: 'text', text: 'first post' }).expect(201);
    expect((await request(base).get('/posts/feed').set(me).expect(200)).body.posts).toHaveLength(0);

    await request(base).put(`/follows/${asha['x-hye-dev-user']}`).set(me).expect(200);
    const feed = await request(base).get('/posts/feed').set(me).expect(200);
    expect(feed.body.posts.map((p: { id: string }) => p.id)).toEqual([post.body.id]);

    const like = await request(base).post(`/posts/${post.body.id}/like`).set(me).expect(200);
    expect(like.body).toEqual({ postId: post.body.id, liked: true, likeCount: 1 });
    await request(base).post(`/posts/${post.body.id}/like`).set(me).expect(200);
    expect((await request(base).get(`/posts/${post.body.id}`).set(me).expect(200)).body.likeCount).toBe(1);
  });

  it('rejects malformed posts', async () => {
    await request(base).post('/posts').set(me).send({ kind: 'reel', media: [] }).expect(400);
    await request(base).post('/posts').set(me).send({ kind: 'photo', media: [{ kind: 'image', storageKey: 'file:///sdcard/a.jpg' }] }).expect(400);
  });
});

describe('POST /imports', () => {
  const user = { 'x-hye-dev-user': '2d7c8f0e-1b2a-4c3d-8e9f-001122334455' };
  const body = {
    platform: 'whatsapp', fileName: 'WhatsApp Chat with Asha.txt', fileHash: 'a'.repeat(64), dateOrder: 'DMY', me: 'Me',
    participants: ['Me', 'Asha'],
    items: [
      { ref: 'line 1', sourceKey: 'k1', message: { senderName: 'Asha', text: 'hi', sentAt: '2024-01-01T09:00:00' } },
      { ref: 'line 2', sourceKey: 'k2', message: { senderName: 'Me', isMe: true, text: 'hello', sentAt: '2024-01-01T09:01:00' } },
      { ref: 'line 3', sourceKey: 'k3', error: 'Unreadable date 31/02/24 for the chosen date order' },
    ],
  };

  it('creates once, then returns the same job for the same file', async () => {
    const created = await request(base).post('/imports').set(user).send(body).expect(201);
    expect(created.body).toMatchObject({ status: 'completed', total: 3, imported: 2, skipped: 0, failed: 1 });
    expect(created.body.results).toEqual([{ ref: 'line 3', outcome: 'failed', reason: 'Unreadable date 31/02/24 for the chosen date order' }]);

    const dup = await request(base).post('/imports').set(user).send(body).expect(200);
    expect(dup.body).toMatchObject({ id: created.body.id, duplicate: true, imported: 2 });

    const resumed = await request(base).post(`/imports/${created.body.id}/resume`).set(user).expect(200);
    expect(resumed.body).toMatchObject({ status: 'completed', imported: 2 });

    const messages = await request(base).get(`/conversations/${created.body.conversationId}/messages`).set(user).expect(200);
    expect(messages.body.messages).toHaveLength(2);

    const conversation = await request(base).get(`/conversations/${created.body.conversationId}`).set(user).expect(200);
    expect(conversation.body).toMatchObject({ origin: 'imported', source: 'whatsapp', provenance: { jobId: created.body.id } });
  });

  it('validates input', async () => {
    await request(base).post('/imports').set(user).send({ ...body, fileHash: 'not-a-hash' }).expect(400);
    await request(base).post('/imports').set(user).send({ ...body, fileHash: 'b'.repeat(64), extra: true }).expect(400);
  });

  it('hides jobs from other users', async () => {
    const created = await request(base).post('/imports').set(user).send({ ...body, fileHash: 'c'.repeat(64) }).expect(201);
    await request(base).get(`/imports/${created.body.id}`).set({ 'x-hye-dev-user': '9a9a9a9a-0000-4000-8000-000000000001' }).expect(404);
  });
});
