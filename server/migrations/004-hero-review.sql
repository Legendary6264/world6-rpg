CREATE TABLE IF NOT EXISTS lobby_creation_conditions (
  lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  conditions_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS character_submissions (
  lobby_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  source_character_id TEXT,
  submitted_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','returned','approved')),
  note TEXT NOT NULL DEFAULT '',
  accepted_once INTEGER NOT NULL DEFAULT 0 CHECK(accepted_once IN (0,1)),
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  PRIMARY KEY(lobby_id,character_id),
  FOREIGN KEY(lobby_id,character_id) REFERENCES character_bindings(lobby_id,character_id) ON DELETE CASCADE
);
-- Older bindings have no trustworthy original submission or acceptance history.
-- Preserve their game state by forbidding replacement from a cloud source.
INSERT INTO character_submissions(lobby_id,character_id,status,accepted_once)
SELECT b.lobby_id,b.character_id,CASE WHEN b.approved=1 THEN 'approved' ELSE 'pending' END,1
FROM character_bindings b
WHERE NOT EXISTS(SELECT 1 FROM character_submissions s WHERE s.lobby_id=b.lobby_id AND s.character_id=b.character_id);
