-- Make all wallet bindings created before wallet sign-in valid login identities.
-- Existing wallet binding ownership wins if a short-lived duplicate wallet login was created.
INSERT INTO auth_identities (user_id, provider, provider_account_id)
SELECT user_id, 'wallet', address FROM wallet_bindings
ON CONFLICT (provider, provider_account_id)
DO UPDATE SET user_id = EXCLUDED.user_id;
