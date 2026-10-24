#!/usr/bin/env node
// Minimal forward-only migration runner.
//
//   npm run migrate              apply pending migrations in db/migrations (sorted by name)
//   npm run migrate -- --status  list applied / pending migrations
//
// Each file runs in its own transaction and is recorded in schema_migrations with a
// SHA-256 checksum. An applied file whose contents changed is an error: write a new
// migration instead of editing an old one. A session-level advisory lock stops two
// deploys from migrating at the same time.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (export it or put it in backend/.env).');
  process.exit(1);
}

const dir = join(root, 'db', 'migrations');
const files = readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
const LOCK_KEY = 4_815_162_342; // arbitrary, stable advisory lock id for hye migrations

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
  const applied = new Map(rows.map(r => [r.version, r.checksum]));
  const statusOnly = process.argv.includes('--status');

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prev = applied.get(file);
    if (prev) {
      if (prev !== checksum) throw new Error(`${file} was modified after it was applied (checksum mismatch)`);
      console.log(`applied  ${file}`);
      continue;
    }
    if (statusOnly) {
      console.log(`pending  ${file}`);
      continue;
    }
    console.log(`applying ${file} ...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} failed: ${err.message}`);
    }
    console.log(`applied  ${file}`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
  await client.end();
}
