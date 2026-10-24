# hye backend

A NestJS 12 + TypeScript **modular monolith** for hye. It covers phone sign-in, sessions, conversations, messaging (REST + WebSocket), chat-history imports, posts/photos/reels, the integration capability matrix, privacy requests and audit. It runs as native ESM on Node 22.

The Expo client in `../` is the source of truth for the domain model (`../src/domain/types.ts`). The schema in `db/migrations/` mirrors it.

## Layout

```
backend/
  db/migrations/      001_init.sql (core), 002_social.sql (posts, follows, achievements), README.md
  scripts/migrate.mjs forward-only migration runner (npm run migrate)
  src/
    main.ts, app.module.ts, app.setup.ts   bootstrap, helmet, CORS, validation, JSON logs, shutdown
    config/           env schema + validation (refuses to boot on bad config)
    persistence/      record types, in-memory tables, pg pool
    identity/         phone OTP (stub), passkeys (stub), sessions, auth guard
    conversations/    inbox, membership, per-member state, retention
    messaging/        REST send/list + socket.io gateway (/ws)
    imports/          idempotent, batched, resumable imports (in-memory + Postgres repos)
    posts/            posts/photos/reels, feed, likes, follows
    integrations/     GET /integrations capability matrix
    privacy/          data export + account deletion requests
    audit/            audit trail
    health/           GET /health
  test/app.e2e-spec.ts  black-box e2e against the built server
```

Modules talk to each other only through their exported services. Each module's storage sits behind a repository interface (`*_REPOSITORY` token). Every repository has an in-memory implementation, which the tests use and which `PERSISTENCE=memory` selects. **The imports repository also has a Postgres implementation** (`imports/pg-imports.repository.ts`). The other Postgres repositories are TODO.

## Setup

```bash
cd backend
npm ci
cp .env.example .env          # then edit; every variable is documented there
docker compose up -d          # postgres:16, redis:7, minio (+ bucket), clamav
npm run migrate               # applies db/migrations/*.sql (needs DATABASE_URL)
npm run build
npm start                     # or: npm run build:watch + npm run start:dev in two terminals
```

You don't need Docker to try it. Keep `PERSISTENCE=memory` and skip `docker compose` and `migrate`. Everything then runs in-process, and data is lost on restart.

In development, `AUTH_DEV_HEADER=true` lets you call authenticated routes with `x-hye-dev-user: <any uuid>` until phone sign-in is implemented. The server refuses to boot with this setting when `NODE_ENV=production`.

```bash
curl localhost:3000/health
curl localhost:3000/integrations
curl -H 'x-hye-dev-user: 2d7c8f0e-1b2a-4c3d-8e9f-001122334455' localhost:3000/conversations
```

## API overview

| Area | Routes |
|---|---|
| Health | `GET /health` (503 when a configured dependency is down; not rate limited) |
| Phone sign-in | `POST /auth/otp/request`, `POST /auth/otp/verify`: validated, documented **501 stubs**. They never send an SMS (`SMS_PROVIDER=none`). |
| Passkeys | `POST /auth/passkeys/{register,login}/{options,verify}`: documented **501 stubs** |
| Sessions | `GET /sessions`, `DELETE /sessions/:id` |
| Conversations | `GET /conversations` (inbox, `?before=` keyset), `POST`, `GET /:id`, `PATCH /:id` (pin/mute/archive/read state, retention) |
| Messages | `GET/POST /conversations/:id/messages`. Sends are idempotent on `clientMessageId` (201 new, 200 replay). Imported conversations are read-only. |
| Realtime | socket.io namespace `/ws`, auth `{ token }` (or `{ devUserId }` in dev). Server→client: `message.new`, `message.status`, `typing`. Client→server: `typing`, `message.status`. |
| Imports | `POST /imports`, `GET /imports/:id`, `GET /imports/:id/report`, `POST /imports/:id/resume` |
| Posts | `POST /posts`, `GET /posts/feed` (`?kind=reel`, `?before=`), `GET /posts/:id`, `POST/DELETE /posts/:id/like`, `PUT/DELETE /follows/:userId` |
| Integrations | `GET /integrations`: what each platform supports. No connected accounts exist. |
| Privacy | `POST /privacy/export`, `POST /privacy/deletion` (`{"confirm":"DELETE MY ACCOUNT"}`), `DELETE /privacy/deletion`, `GET /privacy/requests/:id` |
| Audit | `GET /audit` (the caller's own events) |

### Imports

This mirrors `../src/domain/import/pipeline.ts`. The client parses the export and sends planned items: a `sourceKey`, a `ref`, and either a `message` or an `error`.

- **Idempotent create:** a job is unique per `(user, platform, fileHash)`. Posting the same file again returns the existing job with `200` and `duplicate: true`.
- **Idempotent items:** messages are unique per `(owner_user_id, source_platform, source_key)`. Re-importing records that were already imported marks them `skipped` ("Already imported"), including from a different file of the same chat. Nothing is duplicated.
- **Batched and resumable:** each batch runs in one transaction, which inserts the messages, records each item's outcome and advances `cursor`. If a batch crashes, the whole batch rolls back. After `IMPORT_MAX_BATCHES_PER_REQUEST` batches the job is `paused`; an error leaves it `failed`. In both cases `POST /imports/:id/resume` continues from the cursor.
- **Per-item outcomes:** `imported`, `skipped` or `failed`, each with a reason. The report lists the problems; successes are counted.

## Tests

```bash
npm test          # builds (pretest), then runs jest in-band
npm run test:unit # unit tests only
```

- `src/imports/imports.service.spec.ts`: idempotency (same file, same items in a new job, longer re-export, in-batch duplicates), resumability (budget pause and resume; a failure mid-batch rolls back and resume finishes without duplicates), failure recording and the report, and provenance.
- `src/posts/posts.service.spec.ts`: media rules per kind, replies/quotes, feed composition and audience, pagination, idempotent likes.
- `test/app.e2e-spec.ts`: starts `dist/main.js` on a free port and uses supertest to exercise `/health`, `/integrations` (including throttler headers), 401s, the OTP and passkey 501s, posts and imports over HTTP.

Why the e2e test runs against the built server: Nest 12 is ESM-only, while `@nestjs/throttler` is CommonJS and `require()`s it. Node 22 handles that, but Jest can only emulate `require(esm)` on Node ≥ 24.9. Testing the compiled server also proves the real ESM build boots. Jest runs with `--experimental-vm-modules` and ts-jest in ESM mode.

## Deployment

- **Containers:** the `Dockerfile` builds a small, non-root image (`node:22-alpine`, production dependencies only). The process is stateless: run it behind a load balancer or ingress that terminates TLS. `GET /health` serves as the readiness and liveness probe. On SIGTERM the process drains connections, closes sockets and the pg pool, then exits. It force-exits after `SHUTDOWN_TIMEOUT_MS`.
- **Managed services:** use managed Postgres 16 (e.g. RDS/Cloud SQL/Neon; `citext` is needed), managed Redis, and S3 (or R2/GCS in S3 mode) with private buckets and signed URLs. Run ClamAV as an internal service (`CLAMAV_HOST`) and scan every upload and export archive before it becomes visible.
- **Secrets:** inject them from a secret manager, never baked into images. Use ≥ 32-character `JWT_SECRET` / `SESSION_SECRET`, plus KMS for integration refresh tokens. Set `AUTH_DEV_HEADER=false`, `PERSISTENCE=postgres`, and explicit `CORS_ORIGINS`.
- **Migrations in CI before deploy:** run `node scripts/migrate.mjs` as a pipeline step (or a one-off job/init container) against the target database *before* rolling out the new app version. The runner holds an advisory lock and verifies checksums. Write migrations to be backwards compatible (expand → deploy → contract), because old pods keep serving during the rollout.
- **Scaling the WebSocket gateway horizontally:**
  - Events are addressed to `user:<id>` rooms.
  - With more than one instance, attach `@socket.io/redis-adapter` in `messaging/ws-adapter.ts` (pub/sub clients on `REDIS_URL`) so an emit on one node reaches sockets on all nodes.
  - Enable sticky sessions on the load balancer if long-polling is allowed, or force `transports: ['websocket']` on clients.
  - Move rate-limit storage to Redis too (e.g. `@nest-lab/throttler-storage-redis`), so limits are cluster-wide.
- **Background work:** import resumption, retention sweeps, privacy export/deletion, media scanning and push notifications belong in a queue worker (e.g. BullMQ on Redis), run from the same image with a different entrypoint.

## Known gaps / TODO

- Phone OTP and passkeys are stubs (501). There is no SMS provider adapter, and no real sign-in flow issues sessions yet (`SessionsService.issue` is ready for it).
- Postgres repositories exist only for imports. Identity, conversations, messages, posts, privacy and audit are in-memory, so `PERSISTENCE=postgres` currently persists import jobs/items/messages only, and those reference users and conversations that must already exist in Postgres.
- The server does not parse uploaded exports (the client sends planned items). It also lacks media upload (presigned S3 + ClamAV), attachment storage for imported files, push notifications, reactions/edits, comments/reposts/saves, achievements logic, the Redis socket.io adapter, and the background workers listed above.
- Posts "contacts" audience is approximated as "the author follows the viewer" until contacts are server-side.
