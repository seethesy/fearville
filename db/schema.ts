import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('sessions', {
  code: text('code').primaryKey(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  created: integer('created').notNull(),
});
export const members = sqliteTable(
  'members',
  {
    tokenHash: text('token_hash').primaryKey(),
    code: text('code')
      .notNull()
      .references(() => sessions.code, { onDelete: 'cascade' }),
    player: text('player').notNull(),
    host: integer('host').notNull(),
    expires: integer('expires').notNull(),
  },
  (t) => [index('idx_members_code').on(t.code)],
);
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expires: integer('expires').notNull(),
});

// Provider identities are keyed by issuer/subject, never by matching email.
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  created: integer('created').notNull(),
});
export const identities = sqliteTable(
  'identities',
  {
    id: text('id').primaryKey(),
    account: text('account')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    refreshToken: text('refresh_token'),
  },
  (t) => [index('idx_identities_account').on(t.account)],
);
export const accountSessions = sqliteTable(
  'account_sessions',
  {
    hash: text('hash').primaryKey(),
    account: text('account')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expires: integer('expires').notNull(),
  },
  (t) => [index('idx_account_sessions_account').on(t.account)],
);
export const accountSeats = sqliteTable(
  'account_seats',
  {
    id: text('id').primaryKey(),
    account: text('account')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    code: text('code')
      .notNull()
      .references(() => sessions.code, { onDelete: 'cascade' }),
    player: text('player').notNull(),
    host: integer('host').notNull(),
  },
  (t) => [index('idx_account_seats_account').on(t.account)],
);
export const oauthFlows = sqliteTable('oauth_flows', {
  hash: text('hash').primaryKey(),
  provider: text('provider').notNull(),
  verifier: text('verifier').notNull(),
  nonce: text('nonce').notNull(),
  browser: text('browser'),
  account: text('account'),
  member: text('member'),
  nativeChallenge: text('native_challenge'),
  launched: integer('launched').notNull().default(0),
  expires: integer('expires').notNull(),
});
export const nativeCodes = sqliteTable('native_codes', {
  hash: text('hash').primaryKey(),
  account: text('account')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  challenge: text('challenge').notNull(),
  expires: integer('expires').notNull(),
});
