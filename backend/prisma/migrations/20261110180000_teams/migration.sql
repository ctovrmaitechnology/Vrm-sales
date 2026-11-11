CREATE TABLE IF NOT EXISTS teams (
  id serial PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_lower ON teams (lower(name));
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id integer REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users (team_id);
