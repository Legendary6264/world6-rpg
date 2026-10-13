CREATE TABLE IF NOT EXISTS round_replay_collections (
 lobby_id TEXT PRIMARY KEY REFERENCES round_replay_contexts(lobby_id) ON DELETE CASCADE,
 collection_id TEXT NOT NULL
);
