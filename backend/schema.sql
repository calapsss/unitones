CREATE TABLE IF NOT EXISTS units (
 id text PRIMARY KEY, name text NOT NULL, parent_id text REFERENCES units(id),
 reporting boolean NOT NULL DEFAULT true, source jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS personnel (
 id text PRIMARY KEY, unit_id text NOT NULL REFERENCES units(id), name text NOT NULL,
 rank text NOT NULL, category text NOT NULL, source jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
 id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL,
 reason text NOT NULL, rules jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS returns (
 id bigserial PRIMARY KEY, unit_id text NOT NULL REFERENCES units(id), day date NOT NULL,
 revision integer NOT NULL, published boolean NOT NULL, actor text NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 entries jsonb NOT NULL, policy_id integer NOT NULL REFERENCES policies(id),
 UNIQUE(unit_id,day,revision)
);
CREATE TABLE IF NOT EXISTS seed_runs (
 id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), manifest jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS returns_lookup ON returns(unit_id,day,revision DESC);
ALTER TABLE returns ADD COLUMN IF NOT EXISTS organization jsonb NOT NULL DEFAULT '{}';
ALTER TABLE returns ADD COLUMN IF NOT EXISTS establishment jsonb NOT NULL DEFAULT '{}';
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS starts_on date NOT NULL DEFAULT '1900-01-01';
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS ended_on date;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS end_reason text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'History is append-only'; END; $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='returns_immutable') THEN
 CREATE TRIGGER returns_immutable BEFORE UPDATE OR DELETE ON returns FOR EACH ROW EXECUTE FUNCTION protect_history();
 CREATE TRIGGER policies_immutable BEFORE UPDATE OR DELETE ON policies FOR EACH ROW EXECUTE FUNCTION protect_history();
 END IF;
END $$;
