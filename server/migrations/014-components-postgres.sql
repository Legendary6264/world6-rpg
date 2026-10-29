-- Additive compatibility storage. No existing worlds or history are rewritten.
CREATE TABLE IF NOT EXISTS world_component_heads (
 lobby_id TEXT PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
 schema_version INTEGER NOT NULL CHECK(schema_version=1),
 revision INTEGER NOT NULL CHECK(revision>=0),
 source_hash TEXT NOT NULL,
 rules_version TEXT NOT NULL,
 metadata_json JSONB NOT NULL,
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
 data_json JSONB NOT NULL,
 PRIMARY KEY(lobby_id,entity_id,component_name),
 FOREIGN KEY(lobby_id,entity_id) REFERENCES world_entities(lobby_id,entity_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS world_component_events (
 lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>=0),
 kind TEXT NOT NULL CHECK(kind IN ('baseline','change')),
 payload_json JSONB NOT NULL,
 payload_bytes INTEGER NOT NULL CHECK(payload_bytes>0),
 created_at TEXT NOT NULL,
 PRIMARY KEY(lobby_id,revision)
);

ALTER TABLE world6.world_component_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE world6.world_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE world6.world_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE world6.world_component_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON world6.world_component_heads, world6.world_entities, world6.world_components, world6.world_component_events FROM PUBLIC;
-- Entries may only disappear together with their entire lobby, never during
-- restoration, migration, history cleanup or ordinary game commands.
CREATE OR REPLACE FUNCTION world6.guard_component_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=world6,pg_catalog AS $guard$
BEGIN
 IF TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM lobbies WHERE id=OLD.lobby_id) THEN
  RAISE EXCEPTION 'Component journal is append-only';
 END IF;
 RETURN OLD;
END;
$guard$;
REVOKE ALL ON FUNCTION world6.guard_component_event() FROM PUBLIC;
DROP TRIGGER IF EXISTS immutable_component_event ON world_component_events;
CREATE TRIGGER immutable_component_event BEFORE UPDATE OR DELETE ON world_component_events
 FOR EACH ROW EXECUTE FUNCTION world6.guard_component_event();
