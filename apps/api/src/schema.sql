-- V0 Day 1 schema. Multi-tenant from D1 (CLAUDE.md constraint #4) — every
-- tenant table carries `user_id` even though V0 hardcodes it to "u-bayu".
-- Tables survive V0 -> V1 graduation; storage layer (SQLite -> Postgres+RLS) does not.

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  buyer_username TEXT NOT NULL,
  body TEXT NOT NULL,
  pii_scrubbed_body TEXT NOT NULL,
  ebay_item_id TEXT,
  ebay_message_id TEXT,
  thread_id TEXT,
  category TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ebay_item_id TEXT NOT NULL,
  kb_json TEXT NOT NULL,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, ebay_item_id)
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  version INTEGER NOT NULL DEFAULT 1,
  draft_text TEXT NOT NULL,
  edited_text TEXT,
  category TEXT NOT NULL,
  confidence REAL NOT NULL,
  used_facts TEXT NOT NULL,
  flags TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  sent_at TEXT,
  -- V0 Day 4-5: lifecycle status owned by the latest draft row.
  -- 'drafted' (default) | 'approved' | 'sent' | 'skipped'
  status TEXT NOT NULL DEFAULT 'drafted'
    CHECK (status IN ('drafted','approved','sent','skipped')),
  skipped_at TEXT,
  -- V0 Day 6: which send mechanism marked this row as sent.
  -- 'paste' (V0 prepare-and-paste) | 'api' (V1 Compat App). Null until sent.
  send_method TEXT
    CHECK (send_method IN ('paste','api') OR send_method IS NULL)
);

CREATE TABLE IF NOT EXISTS learned_edits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  original_phrase TEXT NOT NULL,
  preferred_phrase TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1,
  last_observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_calls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message_id TEXT,
  draft_id TEXT,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents REAL NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- V0 Day 2: idempotent ingest from the Chrome extension. Per CLAUDE.md
-- constraint #6, every POST is idempotent — middleware looks up by
-- (user_id, key) and replays the cached response.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_message ON drafts(message_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_user_time ON llm_calls(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_user_created
  ON idempotency_keys(user_id, created_at);

-- Dedupe ingested messages on (user_id, ebay_message_id). Manual /dev/draft
-- entries don't carry an ebay_message_id, so use a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_ebay_msg_id
  ON messages(user_id, ebay_message_id)
  WHERE ebay_message_id IS NOT NULL;
