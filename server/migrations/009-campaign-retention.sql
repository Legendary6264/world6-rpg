CREATE TABLE IF NOT EXISTS round_lineage_anchors (
 lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
 generation INTEGER NOT NULL,
 collections_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkpoint_lineage_anchors (
 checkpoint_id TEXT PRIMARY KEY REFERENCES campaign_checkpoints(id) ON DELETE CASCADE,
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 collections_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_retired_commands (
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 command_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 retired_at TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL,
 PRIMARY KEY(lobby_id,command_key)
);
CREATE TABLE IF NOT EXISTS campaign_cleanup_previews (
 id TEXT PRIMARY KEY,
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES users(id),
 generation INTEGER NOT NULL,
 base_revision INTEGER NOT NULL,
 controls_stamp TEXT NOT NULL,
 storage_stamp TEXT NOT NULL,
 executor_version TEXT NOT NULL,
 selection_json TEXT NOT NULL,
 summary_json TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL,
 UNIQUE(lobby_id,author_id)
);
CREATE TABLE IF NOT EXISTS campaign_cleanup_receipts (
 id TEXT PRIMARY KEY,
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES users(id),
 command_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 generation INTEGER NOT NULL,
 receipt_json TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL,
 UNIQUE(lobby_id,command_key)
);
