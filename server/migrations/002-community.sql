UPDATE users SET role='PLAYER' WHERE role='GM';
CREATE UNIQUE INDEX IF NOT EXISTS one_chief_per_lobby ON members(lobby_id) WHERE role='GM';
CREATE INDEX IF NOT EXISTS member_lobbies ON members(user_id, lobby_id);
CREATE INDEX IF NOT EXISTS bound_characters ON character_bindings(lobby_id, owner_id);
CREATE TABLE IF NOT EXISTS world_entries (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  revision INTEGER NOT NULL DEFAULT 0,
  published_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS world_entry_feed ON world_entries(status, updated_at);
