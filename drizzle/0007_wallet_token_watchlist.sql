CREATE TABLE IF NOT EXISTS "wallet_token_watchlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mint" text NOT NULL,
  "symbol" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wallet_token_watchlist_user_mint_unique" UNIQUE("user_id", "mint")
);
