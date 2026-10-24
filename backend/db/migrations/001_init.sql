-- =============================================================================
-- hye: 001_init.sql — initial schema
--
-- Mirrors the client domain model in ../../src/domain/types.ts and the import
-- semantics in ../../src/domain/import/pipeline.ts:
--   * imported history is read-only, never synced, and carries provenance;
--   * every imported message has a deterministic source_key, so re-running an
--     import is idempotent (UNIQUE (owner_user_id, source_platform, source_key));
--   * import jobs persist a cursor after every batch so they can resume;
--   * each staged item ends as imported / skipped / failed with a reason.
--
-- Conventions
--   * UUID primary keys (gen_random_uuid() is built in since PostgreSQL 13).
--   * created_at / updated_at on mutable tables; updated_at is maintained by the
--     set_updated_at() trigger. Append-only tables (audit_events) have created_at only.
--   * deleted_at = soft delete on user-facing content (users, contacts,
--     conversations, messages, attachments). Hard deletes run in retention / account
--     deletion jobs.
--   * Secrets are never stored in clear text: session tokens are stored as SHA-256
--     hashes; integration refresh tokens are envelope-encrypted; passwords are never
--     stored at all (hye signs in with phone + one-time code, optionally passkeys;
--     email/IMAP uses OAuth or encrypted app tokens). OTP codes are stored as HMACs.
--
-- Safe to re-run: types are created in guarded DO blocks, tables/indexes use
-- IF NOT EXISTS, triggers use CREATE OR REPLACE. Apply with scripts/migrate.mjs
-- (npm run migrate) or psql — see README.md in this folder. Requires PostgreSQL 14+
-- (developed against 16).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE source_platform AS ENUM ('hye', 'whatsapp', 'telegram', 'instagram', 'messenger', 'x', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- native = created in hye; imported = history from a user-provided export (read-only).
  CREATE TYPE conversation_origin AS ENUM ('native', 'imported');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE conversation_kind AS ENUM ('direct', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('sending', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE retention_policy AS ENUM ('off', '24h', '7d', '90d');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attachment_kind AS ENUM ('image', 'video', 'audio', 'document', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- pending = not yet scanned; skipped = nothing to scan (file missing from export).
  CREATE TYPE malware_scan_status AS ENUM ('pending', 'clean', 'infected', 'error', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE import_status AS ENUM ('validating', 'ready', 'importing', 'paused', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE import_outcome AS ENUM ('imported', 'skipped', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE date_order AS ENUM ('DMY', 'MDY', 'YMD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE integration_status AS ENUM ('pending', 'active', 'error', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE last_seen_visibility AS ENUM ('everyone', 'contacts', 'nobody');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE privacy_request_kind AS ENUM ('export', 'deletion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE privacy_request_status AS ENUM ('pending', 'processing', 'completed', 'cancelled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'illegal_content', 'impersonation', 'self_harm', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- Identity
-- -----------------------------------------------------------------------------
-- Users sign in with a mobile number verified by a one-time code (otp_challenges).
-- Passkeys can be added afterwards as a phishing-resistant second way in.
CREATE TABLE IF NOT EXISTS users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone               text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),  -- E.164
  phone_verified_at   timestamptz,
  handle              citext CHECK (handle ~ '^[A-Za-z0-9_.]{3,30}$'),       -- optional public username, no '@'
  display_name        text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  bio                 text CHECK (length(bio) <= 300),
  email               citext,
  email_verified_at   timestamptz,
  -- Privacy settings (PrivacySettings in the client).
  read_receipts       boolean NOT NULL DEFAULT true,
  typing_indicators   boolean NOT NULL DEFAULT true,
  last_seen           last_seen_visibility NOT NULL DEFAULT 'contacts',
  default_retention   retention_policy NOT NULL DEFAULT 'off',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
-- Phone, handle and email are unique among live accounts only, so a deleted account frees
-- them. A handle is optional: NULLs never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_live_uniq  ON users (phone)  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_live_uniq ON users (handle) WHERE deleted_at IS NULL AND handle IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_live_uniq  ON users (email)  WHERE deleted_at IS NULL AND email IS NOT NULL;

-- One-time sign-in codes sent by SMS. Only a hash of the code is stored; codes are short-lived,
-- single-use and attempt-limited. Rows are purged after expiry by a cleanup job.
CREATE TABLE IF NOT EXISTS otp_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  code_hash     bytea NOT NULL,                  -- HMAC-SHA-256(code) keyed with SESSION_SECRET
  attempts      smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts  smallint NOT NULL DEFAULT 5,
  provider      text NOT NULL,                   -- SMS provider that sent it
  provider_ref  text,                            -- provider message id, for delivery receipts
  ip            inet,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_challenges_phone_idx ON otp_challenges (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name            text NOT NULL,
  platform        text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  app_version     text,
  push_provider   text CHECK (push_provider IN ('apns', 'fcm', 'expo')),
  push_token      text,
  last_seen_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_user_idx ON devices (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id       uuid REFERENCES devices (id) ON DELETE SET NULL,
  -- SHA-256 of the opaque bearer token. The token itself is never stored.
  token_hash      bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  ip              inet,
  user_agent      text,
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  revoked_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id, last_used_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id   bytea NOT NULL UNIQUE,        -- WebAuthn rawId
  public_key      bytea NOT NULL,               -- COSE-encoded public key
  sign_count      bigint NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  transports      text[] NOT NULL DEFAULT '{}',
  aaguid          uuid,
  backup_eligible boolean NOT NULL DEFAULT false,
  backup_state    boolean NOT NULL DEFAULT false,
  nickname        text,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passkey_credentials_user_idx ON passkey_credentials (user_id) WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- Contacts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Set when the contact is a hye account; NULL for people known only from an import.
  contact_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  display_name     text NOT NULL,
  handle           text,
  origin           conversation_origin NOT NULL DEFAULT 'native',
  source_platform  source_platform NOT NULL DEFAULT 'hye',
  source_key       text,                         -- e.g. hash of the export participant name
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CHECK (origin = 'native' OR source_key IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_user_uniq ON contacts (owner_user_id, contact_user_id)
  WHERE contact_user_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_source_uniq ON contacts (owner_user_id, source_platform, source_key)
  WHERE source_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Conversations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                      conversation_kind NOT NULL,
  origin                    conversation_origin NOT NULL DEFAULT 'native',
  source_platform           source_platform NOT NULL DEFAULT 'hye',
  title                     text NOT NULL DEFAULT '',
  created_by_user_id        uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Disappearing-message policy. A retention worker hard-deletes messages older than this.
  retention                 retention_policy NOT NULL DEFAULT 'off',
  last_activity_at          timestamptz NOT NULL DEFAULT now(),
  last_message_id           uuid,                 -- denormalized pointer, no FK (avoids a cycle with messages)
  -- Provenance for imported history (ImportProvenance in the client).
  provenance_import_job_id  uuid,                 -- FK added below, once import_jobs exists
  provenance_file_name      text,
  provenance_imported_at    timestamptz,
  provenance_timezone_note  text,
  imported_participants     text[] NOT NULL DEFAULT '{}',  -- display names from the export, no accounts behind them
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz,
  CONSTRAINT conversations_origin_platform_chk CHECK (
    (origin = 'native'   AND source_platform = 'hye') OR
    (origin = 'imported' AND source_platform <> 'hye' AND provenance_imported_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS conversations_retention_idx ON conversations (retention) WHERE retention <> 'off' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id   uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role              member_role NOT NULL DEFAULT 'member',
  -- Per-member inbox state.
  pinned            boolean NOT NULL DEFAULT false,
  muted             boolean NOT NULL DEFAULT false,
  archived          boolean NOT NULL DEFAULT false,
  marked_unread     boolean NOT NULL DEFAULT false,
  last_read_at      timestamptz,
  -- Copy of conversations.last_activity_at so the inbox query is a single index range scan.
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  joined_at         timestamptz NOT NULL DEFAULT now(),
  left_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
-- Inbox: "my conversations, most recent first", split by archived.
CREATE INDEX IF NOT EXISTS conversation_members_inbox_idx
  ON conversation_members (user_id, archived, last_activity_at DESC)
  WHERE left_at IS NULL;

-- -----------------------------------------------------------------------------
-- Imports (jobs first: messages reference them)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  conversation_id   uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  source_platform   source_platform NOT NULL CHECK (source_platform <> 'hye'),
  file_name         text NOT NULL,
  -- SHA-256 (hex) of the uploaded export. Same file again => same job (idempotent create).
  source_file_hash  text NOT NULL CHECK (source_file_hash ~ '^[0-9a-f]{64}$'),
  file_size_bytes   bigint CHECK (file_size_bytes >= 0),
  status            import_status NOT NULL DEFAULT 'validating',
  date_order        date_order NOT NULL,
  me_participant    text,                         -- which export participant is the user
  timezone_note     text,
  total             integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  -- Index (seq) of the next staged item to process; committed with each batch.
  cursor            integer NOT NULL DEFAULT 0,
  imported          integer NOT NULL DEFAULT 0 CHECK (imported >= 0),
  skipped           integer NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  failed            integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  last_error        text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_jobs_file_uniq UNIQUE (owner_user_id, source_platform, source_file_hash),
  CONSTRAINT import_jobs_cursor_chk CHECK (cursor BETWEEN 0 AND total),
  -- Every processed item has exactly one outcome.
  CONSTRAINT import_jobs_totals_chk CHECK (imported + skipped + failed = cursor)
);
CREATE INDEX IF NOT EXISTS import_jobs_owner_idx ON import_jobs (owner_user_id, created_at DESC);
-- Resumable work: jobs a worker should pick up after a crash or pause.
CREATE INDEX IF NOT EXISTS import_jobs_resumable_idx ON import_jobs (updated_at) WHERE status IN ('importing', 'paused');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_provenance_job_fk') THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_provenance_job_fk
      FOREIGN KEY (provenance_import_job_id) REFERENCES import_jobs (id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  -- Native: the sender. Imported: the user who imported it (scope of source_key uniqueness).
  owner_user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sender_user_id     uuid REFERENCES users (id) ON DELETE SET NULL,  -- NULL for imported senders without accounts
  sender_name        text NOT NULL,                                  -- raw sender name for imported messages
  client_message_id  text,                                           -- client-generated id; makes sends idempotent
  body               text NOT NULL DEFAULT '' CHECK (length(body) <= 65536),
  is_system          boolean NOT NULL DEFAULT false,
  -- For imports without a time zone this is the export's wall-clock time (see provenance_timezone_note).
  sent_at            timestamptz NOT NULL,
  edited_at          timestamptz,
  deleted_at         timestamptz,                                    -- soft delete / "message deleted" placeholder
  reply_to_id        uuid REFERENCES messages (id) ON DELETE SET NULL,
  forwarded_from     text,
  status             delivery_status,                                -- sender-side aggregate; NULL for imported
  -- Provenance.
  origin             conversation_origin NOT NULL DEFAULT 'native',
  source_platform    source_platform NOT NULL DEFAULT 'hye',
  source_key         text,                                           -- stable key derived from the export
  source_ref         text,                                           -- e.g. "lines 12-14"
  import_job_id      uuid REFERENCES import_jobs (id) ON DELETE SET NULL,
  -- Full-text search. 'simple' config: no stemming, works across languages.
  search_tsv         tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body, ''))) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Idempotent imports: the same source record can only land once per user and platform.
  -- NULL source_key (native messages) never conflicts.
  CONSTRAINT messages_source_key_uniq UNIQUE (owner_user_id, source_platform, source_key),
  CONSTRAINT messages_provenance_chk CHECK (
    (origin = 'native'   AND source_key IS NULL AND source_platform = 'hye') OR
    (origin = 'imported' AND source_key IS NOT NULL AND source_platform <> 'hye')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_id_uniq ON messages (sender_user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
-- Conversation timeline, keyset-paginated by (sent_at, id).
CREATE INDEX IF NOT EXISTS messages_timeline_idx ON messages (conversation_id, sent_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS messages_reply_idx ON messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_import_job_idx ON messages (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING gin (search_tsv);

CREATE TABLE IF NOT EXISTS message_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  kind            attachment_kind NOT NULL,
  file_name       text NOT NULL,
  mime_type       text,
  size_bytes      bigint CHECK (size_bytes >= 0),
  sha256          text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key     text,                           -- object key in S3; NULL when the export omitted the file
  missing_reason  text,
  scan_status     malware_scan_status NOT NULL DEFAULT 'pending',
  scanned_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CHECK (storage_key IS NOT NULL OR missing_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments (message_id);
CREATE INDEX IF NOT EXISTS message_attachments_scan_idx ON message_attachments (created_at) WHERE scan_status = 'pending';

CREATE TABLE IF NOT EXISTS reactions (
  message_id   uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji        text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 32),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Per-recipient delivery / read state behind the message.status WebSocket event.
CREATE TABLE IF NOT EXISTS message_receipts (
  message_id    uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delivered_at  timestamptz,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Import items (staged plan + per-item outcome)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
  seq           integer NOT NULL CHECK (seq >= 0),  -- position in the plan; import_jobs.cursor points here
  source_key    text NOT NULL,
  source_ref    text NOT NULL,                      -- "line 12" / "lines 12-14"
  line_start    integer,
  line_end      integer,
  payload       jsonb,                              -- the planned message; NULL when parsing failed
  parse_error   text,                               -- error found while planning (e.g. unreadable date)
  outcome       import_outcome,                     -- NULL = not processed yet
  reason        text,                               -- why skipped / failed
  message_id    uuid REFERENCES messages (id) ON DELETE SET NULL,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_items_seq_uniq UNIQUE (job_id, seq),
  CHECK ((outcome IS NULL) = (processed_at IS NULL))
);
-- Migration report: the non-imported items, in order.
CREATE INDEX IF NOT EXISTS import_items_problems_idx ON import_items (job_id, seq) WHERE outcome IN ('skipped', 'failed');

CREATE TABLE IF NOT EXISTS migration_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL UNIQUE REFERENCES import_jobs (id) ON DELETE CASCADE,
  owner_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  format         text NOT NULL DEFAULT 'hye-migration-report/1',
  report         jsonb NOT NULL,                    -- see migrationReport() in the client pipeline
  storage_key    text,                              -- optional copy in object storage
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Integrations (OAuth-connected accounts). Never stores passwords.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform                  source_platform NOT NULL CHECK (platform <> 'hye'),
  provider_account_id       text NOT NULL,          -- the provider's stable account id
  display_label             text,                   -- e.g. the email address, shown to the user
  scopes                    text[] NOT NULL DEFAULT '{}',
  status                    integration_status NOT NULL DEFAULT 'pending',
  -- Access tokens live in a secret store / cache; we keep only a reference to them.
  access_token_ref          text,
  -- Refresh token envelope-encrypted with a KMS data key; key id kept for rotation.
  refresh_token_encrypted   bytea,
  encryption_key_id         text,
  token_expires_at          timestamptz,
  last_sync_at              timestamptz,
  last_error                text,
  connected_at              timestamptz,
  revoked_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_accounts_uniq UNIQUE (user_id, platform, provider_account_id),
  CHECK (refresh_token_encrypted IS NULL OR encryption_key_id IS NOT NULL),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- Privacy, consent, notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose         text NOT NULL,                  -- e.g. 'import_processing', 'integration:gmail'
  policy_version  text NOT NULL,
  granted         boolean NOT NULL,
  granted_at      timestamptz,
  withdrawn_at    timestamptz,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_records_user_idx ON consent_records (user_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind               privacy_request_kind NOT NULL,
  status             privacy_request_status NOT NULL DEFAULT 'pending',
  scheduled_for      timestamptz,                 -- deletion: end of the grace period
  export_storage_key text,                        -- export: archive location (short-lived signed URL)
  export_expires_at  timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- At most one open request of each kind per user.
CREATE UNIQUE INDEX IF NOT EXISTS privacy_requests_open_uniq ON privacy_requests (user_id, kind)
  WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id            uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  messages           boolean NOT NULL DEFAULT true,
  groups             boolean NOT NULL DEFAULT true,
  import_complete    boolean NOT NULL DEFAULT true,
  previews           boolean NOT NULL DEFAULT true,
  quiet_hours_start  time,
  quiet_hours_end    time,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Audit (append-only: no updated_at; the app role should get INSERT/SELECT only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users (id) ON DELETE SET NULL,  -- whose data the event is about
  actor_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,  -- who did it (NULL = system)
  action         text NOT NULL,                                  -- e.g. 'import.created', 'session.revoked'
  target_type    text,
  target_id      text,
  detail         text NOT NULL DEFAULT '',
  metadata       jsonb NOT NULL DEFAULT '{}',
  ip             inet,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_user_idx ON audit_events (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Safety: blocks and moderation reports
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocks (
  blocker_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_user_id);

CREATE TABLE IF NOT EXISTS reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  reported_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  conversation_id   uuid REFERENCES conversations (id) ON DELETE SET NULL,
  message_id        uuid REFERENCES messages (id) ON DELETE SET NULL,
  reason            report_reason NOT NULL,
  details           text CHECK (length(details) <= 4000),
  -- Snapshot of reported content, since the original may be deleted or expire.
  evidence          jsonb,
  status            report_status NOT NULL DEFAULT 'open',
  resolved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_target_chk CHECK (reported_user_id IS NOT NULL OR conversation_id IS NOT NULL OR message_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports (status, created_at) WHERE status IN ('open', 'reviewing');

-- -----------------------------------------------------------------------------
-- updated_at triggers on every table that has the column
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'otp_challenges', 'devices', 'sessions', 'passkey_credentials', 'contacts', 'conversations',
    'conversation_members', 'import_jobs', 'messages', 'message_attachments', 'reactions',
    'message_receipts', 'import_items', 'migration_reports', 'integration_accounts',
    'consent_records', 'privacy_requests', 'notification_preferences', 'blocks', 'reports'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
