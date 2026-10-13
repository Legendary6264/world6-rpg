CREATE TABLE IF NOT EXISTS campaign_trade_commands (
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 command_key TEXT NOT NULL,
 author_id TEXT NOT NULL REFERENCES users(id),
 request_hash TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL CHECK(payload_bytes >= 0),
 PRIMARY KEY(lobby_id,command_key)
);
CREATE TABLE IF NOT EXISTS campaign_trade_previews (
 id TEXT PRIMARY KEY,
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES users(id),
 base_revision INTEGER NOT NULL,
 generation INTEGER NOT NULL,
 controls_stamp TEXT NOT NULL,
 world_hash TEXT NOT NULL,
 executor_version TEXT NOT NULL,
 input_json TEXT NOT NULL,
 destination_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 summary_json TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL CHECK(payload_bytes >= 0)
);
CREATE INDEX IF NOT EXISTS campaign_trade_previews_lobby ON campaign_trade_previews(lobby_id,author_id);
