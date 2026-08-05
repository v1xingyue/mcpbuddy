CREATE TABLE IF NOT EXISTS tool_plugin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_plugin_settings_user_plugin_unique UNIQUE(user_id, plugin_id)
);
