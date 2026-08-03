import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  githubId: text('github_id').notNull().unique(),
  // Email is a discovery key for an explicit merge prompt, not an implicit account key.
  email: text('email').notNull(),
  name: text('name'),
  image: text('image'),
  userInfo: text('user_info').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// A user may authenticate through more than one OAuth provider. Keep provider credentials
// separate from the user record so MCP ownership remains stable across sign-in methods.
export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  { unique: 'auth_identities_provider_account_unique', columns: [table.provider, table.providerAccountId] },
]);

export const mcpConnections = pgTable('mcp_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const walletBindings = pgTable('wallet_bindings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  address: text('address').notNull().unique(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
});

export const walletChallenges = pgTable('wallet_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  nonce: text('nonce').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const oauthTokenUses = pgTable('oauth_token_uses', {
  kind: text('kind').notNull(),
  jti: text('jti').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // composite uniqueness makes a concurrent token replay produce one winner.
  { unique: 'oauth_token_uses_kind_jti_unique', columns: [table.kind, table.jti] },
]);

export const publishedPages = pgTable('published_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  blobUrl: text('blob_url'),
  isPublic: boolean('is_public').default(false).notNull(),
  publicId: text('public_id').unique(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const platformConnections = pgTable('platform_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  platform: text('platform').notNull(),
  clientId: text('client_id').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  { unique: 'platform_connections_user_platform_unique', columns: [table.userId, table.platform] },
]);

export const swapTransactions = pgTable('swap_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  walletAddress: text('wallet_address').notNull(),
  serializedTransaction: text('serialized_transaction').notNull(),
  messageBase64: text('message_base64').notNull(),
  transactionDigest: text('transaction_digest').notNull(),
  summary: text('summary').notNull(),
  status: text('status').notNull().default('awaiting_signature'),
  signature: text('signature'),
  error: text('error'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
});

export const walletTokenWatchlist = pgTable('wallet_token_watchlist', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  mint: text('mint').notNull(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [{ unique: 'wallet_token_watchlist_user_mint_unique', columns: [table.userId, table.mint] }]);
