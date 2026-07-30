ALTER TABLE published_pages ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE published_pages ADD COLUMN IF NOT EXISTS public_id text;
CREATE UNIQUE INDEX IF NOT EXISTS published_pages_public_id_unique ON published_pages (public_id) WHERE public_id IS NOT NULL;
