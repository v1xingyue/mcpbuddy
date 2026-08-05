-- Shared, public Solana mint mapping for the xStocks public API. No user data or credentials are stored here.
CREATE TABLE IF NOT EXISTS xstocks_solana_asset_cache (
  cache_key text PRIMARY KEY,
  assets text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
