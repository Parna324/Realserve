CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TYPE room_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role room_role NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_member_marks (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  marks INTEGER NOT NULL DEFAULT 0 CHECK (marks >= 0 AND marks <= 100),
  feedback TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled document',
  path TEXT NOT NULL DEFAULT 'main',
  language TEXT NOT NULL DEFAULT 'typescript',
  snapshot TEXT NOT NULL DEFAULT '',
  yjs_state BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent: add path column if it didn't exist yet (existing rooms get 'main')
ALTER TABLE documents ADD COLUMN IF NOT EXISTS path TEXT NOT NULL DEFAULT 'main';

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_room_path ON documents(room_id, path);
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_member_marks_marked_by ON room_member_marks(marked_by);
CREATE INDEX IF NOT EXISTS idx_documents_room_id ON documents(room_id);

-- ── Time-Travel Playback: append-only update log ──────────────────────────────
-- Every Yjs binary delta is persisted here so we can replay the edit history
-- of any file up to an arbitrary point in time.
--
-- Design notes:
--   • BIGSERIAL gives free monotonic ordering — replay uses ORDER BY id, not
--     created_at, which is immune to clock skew between server instances.
--   • client_id stores the author's display name so the timeline UI can
--     colour-code each tick without joining back to users.
--   • The table is bounded by the compaction mechanism in collaboration.ts:
--     every COMPACTION_THRESHOLD inserts, the server writes a fresh
--     yjs_state checkpoint to documents and prunes older rows here.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS checkpoint_at TIMESTAMPTZ;
-- Tracks *when* the current yjs_state snapshot was taken.
-- Rows in document_updates with created_at < checkpoint_at are redundant
-- and will be pruned by the next compaction cycle.

CREATE TABLE IF NOT EXISTS document_updates (
  -- Monotonic surrogate key — ORDER BY id is the correct replay order.
  id          BIGSERIAL    PRIMARY KEY,

  -- Which file this update belongs to.  Cascade-deletes with the document.
  file_id     UUID         NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  -- Raw Yjs binary delta — opaque bytes, applied with Y.applyUpdate().
  update_data BYTEA        NOT NULL,

  -- Author display name captured at write time.  Stored denormalised so the
  -- history timeline never needs a user-table join.
  client_id   TEXT         NOT NULL,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Core query pattern: "give me all updates for file X between two timestamps"
CREATE INDEX IF NOT EXISTS idx_doc_updates_file_time
  ON document_updates(file_id, created_at);

-- Secondary pattern: "how many updates exist for file X?" (compaction trigger)
CREATE INDEX IF NOT EXISTS idx_doc_updates_file_id
  ON document_updates(file_id);

