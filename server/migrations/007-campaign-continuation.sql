-- Current lineage is independent of the generation used to invalidate commands.
CREATE TABLE IF NOT EXISTS round_branch_states (
  lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  receipt_ids_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_checkpoints (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_generation INTEGER NOT NULL,
  source_revision INTEGER NOT NULL,
  world_json TEXT NOT NULL,
  branch_json TEXT NOT NULL,
  replay_json TEXT,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  UNIQUE(lobby_id,command_key)
);
CREATE INDEX IF NOT EXISTS campaign_checkpoint_order ON campaign_checkpoints(lobby_id,created_at,id);
CREATE TABLE IF NOT EXISTS campaign_sessions (
  lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  paused INTEGER NOT NULL CHECK(paused IN (0,1)),
  changed_at TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL
);
