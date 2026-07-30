CREATE TABLE IF NOT EXISTS platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  client_id text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform)
);
