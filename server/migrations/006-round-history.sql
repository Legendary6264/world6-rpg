-- Private operational history. Portable game JSON never grants permissions.
CREATE TABLE IF NOT EXISTS round_calculation_data (
  preview_id TEXT PRIMARY KEY REFERENCES round_previews(id) ON DELETE CASCADE,
  input_json TEXT NOT NULL,
  execution_seed TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS round_history_data (
  receipt_id TEXT PRIMARY KEY REFERENCES round_receipts(id) ON DELETE CASCADE,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  applied_revision INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  input_json TEXT,
  execution_seed TEXT,
  executor_version TEXT
);
CREATE INDEX IF NOT EXISTS round_history_order ON round_history_data(lobby_id,generation,applied_revision DESC);
CREATE TABLE IF NOT EXISTS round_change_previews (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  generation INTEGER NOT NULL,
  base_revision INTEGER NOT NULL,
  controls_stamp TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('cancel','rollback')),
  executor_version TEXT NOT NULL,
  world_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  target_receipt_id TEXT REFERENCES round_receipts(id),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  UNIQUE(lobby_id,author_id)
);
CREATE TABLE IF NOT EXISTS round_change_receipts (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_generation INTEGER NOT NULL,
  before_json TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  UNIQUE(lobby_id,command_key)
);
CREATE TABLE IF NOT EXISTS round_replay_contexts (
  lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  receipt_id TEXT NOT NULL REFERENCES round_receipts(id),
  world_hash TEXT NOT NULL
);
