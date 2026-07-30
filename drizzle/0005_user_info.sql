-- userinfo.md is private account context stored in Postgres, not in public Blob storage.
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_info text NOT NULL DEFAULT '';
