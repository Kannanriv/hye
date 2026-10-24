-- =============================================================================
-- hye: 002_social.sql — posts, photos and reels; follows; achievements
--
-- Mirrors Post / PostMedia / Comment / Achievement in ../../src/domain/types.ts.
-- Posts, photos and reels share one table, distinguished by `kind`:
--   text  = text post (media optional)
--   photo = at least one image
--   reel  = exactly one video (with an optional poster frame)
-- Those media rules span two tables, so the app enforces them; the schema enforces
-- everything that fits in one row.
--
-- Visibility (`audience`): everyone, or contacts = people the author has added (the
-- contacts table). Replies (reply_to_id) form threads; quotes (quote_of_id) embed another post.
-- Same conventions and re-runnability as 001_init.sql.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE post_kind AS ENUM ('text', 'photo', 'reel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE post_audience AS ENUM ('everyone', 'contacts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE post_media_kind AS ENUM ('image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- Posts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind            post_kind NOT NULL,
  body            text NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
  audience        post_audience NOT NULL DEFAULT 'everyone',
  reply_to_id     uuid REFERENCES posts (id) ON DELETE SET NULL,
  quote_of_id     uuid REFERENCES posts (id) ON DELETE SET NULL,
  -- Denormalized counters, maintained in the same transaction as the like/repost/comment rows.
  like_count      integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  repost_count    integer NOT NULL DEFAULT 0 CHECK (repost_count >= 0),
  comment_count   integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  view_count      bigint  NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  search_tsv      tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body, ''))) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CHECK (reply_to_id IS NULL OR reply_to_id <> id),
  CHECK (quote_of_id IS NULL OR quote_of_id <> id),
  -- A text post needs text (media-only posts are photos or reels).
  CHECK (kind <> 'text' OR length(btrim(body)) > 0)
);
-- Profile grid / author timeline.
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_user_id, created_at DESC) WHERE deleted_at IS NULL;
-- Feed fan-in over followed authors uses posts_author_idx; this one serves the "everyone" explore feed.
CREATE INDEX IF NOT EXISTS posts_public_recent_idx ON posts (created_at DESC)
  WHERE deleted_at IS NULL AND audience = 'everyone' AND reply_to_id IS NULL;
CREATE INDEX IF NOT EXISTS posts_reels_idx ON posts (created_at DESC) WHERE deleted_at IS NULL AND kind = 'reel';
CREATE INDEX IF NOT EXISTS posts_thread_idx ON posts (reply_to_id, created_at) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_quote_idx ON posts (quote_of_id) WHERE quote_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_search_idx ON posts USING gin (search_tsv);

CREATE TABLE IF NOT EXISTS post_media (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id             uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  position            smallint NOT NULL CHECK (position BETWEEN 0 AND 9),
  kind                post_media_kind NOT NULL,
  storage_key         text NOT NULL,              -- S3 object key
  poster_storage_key  text,                       -- poster frame for videos
  mime_type           text,
  size_bytes          bigint CHECK (size_bytes >= 0),
  aspect_ratio        numeric(6, 4) CHECK (aspect_ratio > 0),  -- width / height
  duration_ms         integer CHECK (duration_ms >= 0),
  scan_status         malware_scan_status NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_media_position_uniq UNIQUE (post_id, position),
  CHECK (kind = 'video' OR poster_storage_key IS NULL)
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id     uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_likes_user_idx ON post_likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_reposts (
  post_id     uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_reposts_user_idx ON post_reposts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments (post_id, created_at) WHERE deleted_at IS NULL;

-- Bookmarks (Post.saved in the client).
CREATE TABLE IF NOT EXISTS post_saves (
  post_id     uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- -----------------------------------------------------------------------------
-- Follows (one-way: follower sees followee's posts in their feed)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
  follower_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followee_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, followee_user_id),
  CHECK (follower_user_id <> followee_user_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_user_id);

-- -----------------------------------------------------------------------------
-- Achievements (gamification). Unlocks are recorded once; celebrated_at marks that the
-- celebration was shown, so it plays only once across devices.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS achievements (
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id  text NOT NULL CHECK (achievement_id ~ '^[a-z0-9_.-]{1,64}$'),  -- catalog id, defined in code
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  celebrated_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Moderation reports can now target posts and comments too.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES posts (id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS post_comment_id uuid REFERENCES post_comments (id) ON DELETE SET NULL;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_chk;
ALTER TABLE reports ADD CONSTRAINT reports_target_chk CHECK (
  reported_user_id IS NOT NULL OR conversation_id IS NOT NULL OR message_id IS NOT NULL
  OR post_id IS NOT NULL OR post_comment_id IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'posts', 'post_media', 'post_likes', 'post_reposts', 'post_comments', 'post_saves', 'follows', 'achievements'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
