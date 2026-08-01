CREATE TABLE IF NOT EXISTS swap_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL, serialized_transaction text NOT NULL, message_base64 text NOT NULL,
  transaction_digest text NOT NULL, summary text NOT NULL, status text NOT NULL DEFAULT 'awaiting_signature',
  signature text, error text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz
);
CREATE INDEX IF NOT EXISTS swap_transactions_user_status_created_idx ON swap_transactions (user_id, status, created_at DESC);
