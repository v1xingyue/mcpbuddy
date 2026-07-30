-- Run this migration in Vercel Postgres before enabling Google sign-in in production.
-- Existing GitHub accounts are preserved and adopted into the new provider identity table.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_account_unique UNIQUE(provider, provider_account_id)
);

INSERT INTO auth_identities (user_id, provider, provider_account_id)
SELECT id, 'github', github_id FROM users
ON CONFLICT (provider, provider_account_id) DO NOTHING;
