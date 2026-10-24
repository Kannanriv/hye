# Database migrations

Plain, forward-only SQL files, applied in filename order:

- `001_init.sql`: identity (phone + OTP challenges, passkeys, sessions, devices), contacts, conversations, messages, imports, integrations, privacy, audit, moderation.
- `002_social.sql`: posts/photos/reels, media, likes, reposts, comments, saves, follows, achievements.

Target: PostgreSQL 16 (14+ works). `001_init.sql` needs the `citext` extension, which
every major managed Postgres offers.

## Apply with the bundled runner (recommended)

```bash
cd backend
export DATABASE_URL=postgres://hye:hye@localhost:5432/hye   # or put it in backend/.env
npm run migrate              # applies pending files, records them in schema_migrations
npm run migrate -- --status  # shows applied / pending
```

`scripts/migrate.mjs` (uses `pg`):

- runs each file in its own transaction and records it in `schema_migrations` with a SHA-256 checksum;
- refuses to continue if an applied file was edited (checksum mismatch) — add a new file instead;
- holds a Postgres advisory lock, so two deploys can't migrate concurrently.

## Apply with psql

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/001_init.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/002_social.sql
```

`001_init.sql` is written to be re-runnable (guarded `CREATE TYPE`, `IF NOT EXISTS`,
`CREATE OR REPLACE TRIGGER`), but psql does not record what it applied, so don't mix
psql and the runner on the same database without inserting the matching
`schema_migrations` row yourself.

## Writing new migrations

- Never edit an applied file. Add `NNN_description.sql`.
- Keep changes backwards compatible with the running app version (expand, deploy, then
  contract in a later migration), because migrations run in CI *before* the new app deploys.
- Build indexes on large tables with `CREATE INDEX CONCURRENTLY` in a file of its own — and
  note that `CONCURRENTLY` cannot run inside a transaction, so apply such a file with psql
  (the runner wraps every file in a transaction).
