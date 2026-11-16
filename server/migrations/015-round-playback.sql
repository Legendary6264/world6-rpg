-- The table clock is separate from the world and never advances game time.
CREATE TABLE IF NOT EXISTS round_playback_sessions (
  lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL
);
