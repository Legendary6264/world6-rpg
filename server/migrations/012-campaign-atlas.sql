CREATE TABLE IF NOT EXISTS campaign_atlas_commands (
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 command_key TEXT NOT NULL,
 author_id TEXT NOT NULL REFERENCES users(id),
 request_hash TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL,
 PRIMARY KEY(lobby_id,command_key)
);
