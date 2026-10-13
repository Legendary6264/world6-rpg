-- Operational records are outside portable game JSON. All access is through
-- server membership/permission checks; restore never rewinds this generation.
CREATE TABLE IF NOT EXISTS round_generations (
  lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL CHECK(generation > 0)
);
CREATE TABLE IF NOT EXISTS round_previews (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  generation INTEGER NOT NULL,
  base_revision INTEGER NOT NULL,
  collection_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  controls_stamp TEXT NOT NULL,
  executor_version TEXT NOT NULL,
  world_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  UNIQUE(lobby_id, author_id)
);
CREATE TABLE IF NOT EXISTS round_receipts (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  generation INTEGER NOT NULL,
  collection_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  before_json TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  UNIQUE(lobby_id, command_key),
  UNIQUE(lobby_id, generation, collection_id)
);
