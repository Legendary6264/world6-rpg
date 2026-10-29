-- Additive compatibility storage. No existing worlds or history are rewritten.
CREATE TABLE IF NOT EXISTS world_component_heads (
 lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
 schema_version INTEGER NOT NULL CHECK(schema_version=1),
 revision INTEGER NOT NULL CHECK(revision>=0),
 source_hash TEXT NOT NULL,
 rules_version TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 journal_bytes INTEGER NOT NULL CHECK(journal_bytes>=0)
);
CREATE TABLE IF NOT EXISTS world_entities (
 lobby_id TEXT NOT NULL REFERENCES world_component_heads(lobby_id) ON DELETE CASCADE,
 entity_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('actor','scene','object')),
 ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 PRIMARY KEY(lobby_id,entity_id),
 UNIQUE(lobby_id,ordinal)
);
CREATE TABLE IF NOT EXISTS world_components (
 lobby_id TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 component_name TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version=1),
 data_json TEXT NOT NULL,
 PRIMARY KEY(lobby_id,entity_id,component_name),
 FOREIGN KEY(lobby_id,entity_id) REFERENCES world_entities(lobby_id,entity_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS world_component_events (
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>=0),
 kind TEXT NOT NULL CHECK(kind IN ('baseline','change')),
 payload_json TEXT NOT NULL,
 payload_bytes INTEGER NOT NULL CHECK(payload_bytes>0),
 created_at TEXT NOT NULL,
 PRIMARY KEY(lobby_id,revision)
);

CREATE TRIGGER IF NOT EXISTS immutable_component_event_update BEFORE UPDATE ON world_component_events
BEGIN SELECT RAISE(ABORT,'Component journal is append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_component_event_delete BEFORE DELETE ON world_component_events
WHEN EXISTS(SELECT 1 FROM lobbies WHERE id=OLD.lobby_id)
BEGIN SELECT RAISE(ABORT,'Component journal is append-only'); END;
