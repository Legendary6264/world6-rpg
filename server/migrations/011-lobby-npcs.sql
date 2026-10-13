CREATE TABLE IF NOT EXISTS lobby_npcs (
 lobby_id TEXT NOT NULL,
 character_id TEXT NOT NULL,
 assistant_id TEXT REFERENCES users(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(lobby_id,character_id),
 FOREIGN KEY(lobby_id,character_id) REFERENCES character_bindings(lobby_id,character_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lobby_npcs_assistant ON lobby_npcs(lobby_id,assistant_id);
CREATE TABLE IF NOT EXISTS lobby_npc_commands (
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 command_key TEXT NOT NULL,
 author_id TEXT NOT NULL REFERENCES users(id),
 request_hash TEXT NOT NULL,
 result_json TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL,
 PRIMARY KEY(lobby_id,command_key)
);
