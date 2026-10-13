-- Uploaded archives and recovery snapshots never import account permissions.
CREATE TABLE IF NOT EXISTS campaign_archive_previews (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  generation INTEGER NOT NULL,
  base_revision INTEGER NOT NULL,
  controls_stamp TEXT NOT NULL,
  source_stamp TEXT NOT NULL,
  executor_version TEXT NOT NULL,
  archive_base64 TEXT NOT NULL,
  before_base64 TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  UNIQUE(lobby_id,author_id)
);
CREATE TABLE IF NOT EXISTS campaign_archive_receipts (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_generation INTEGER NOT NULL,
  before_base64 TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  UNIQUE(lobby_id,command_key)
);
CREATE INDEX IF NOT EXISTS campaign_archive_receipt_lobby ON campaign_archive_receipts(lobby_id);
CREATE TABLE IF NOT EXISTS campaign_archive_origins (
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('round','change','checkpoint')),
  record_id TEXT NOT NULL,
  source_lobby_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  author_label TEXT NOT NULL,
  PRIMARY KEY(lobby_id,kind,record_id)
);
