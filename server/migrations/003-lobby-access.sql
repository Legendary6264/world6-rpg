-- Application-owned migrations: portable SQLite/Postgres tables, idempotent on startup.
-- No grant is inferred from an existing assistant role. The chief grants explicitly.
CREATE TABLE IF NOT EXISTS lobby_permissions (
  lobby_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(lobby_id, user_id),
  FOREIGN KEY(lobby_id, user_id) REFERENCES members(lobby_id, user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS character_delegations (
  lobby_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  assistant_id TEXT REFERENCES users(id),
  delegated_at TEXT NOT NULL,
  PRIMARY KEY(lobby_id, character_id),
  FOREIGN KEY(lobby_id, character_id) REFERENCES character_bindings(lobby_id, character_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS character_control_events (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  controller_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('delegate','return','assign','fallback','transfer-chief','restore-reset')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS character_control_history ON character_control_events(lobby_id, character_id, created_at, id);
