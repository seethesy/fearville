import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
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
export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    created: integer('created').notNull(),
    // Public, unique, lowercase handle chosen by the player. Null until set.
    handle: text('handle'),
  },
  (t) => [uniqueIndex('idx_accounts_handle').on(t.handle)],
);
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

// ---------------------------------------------------------------------------
// Social system: friendships, session invitations, game records, and ratings.
// Game records are intentionally NOT foreign-keyed to `sessions`: a player's
// history must outlive the session row, and session codes may be reused later.
// Stats are always derived by aggregation from these rows, never by counters.
// ---------------------------------------------------------------------------

// One row per (requester, addressee). The application guarantees that at most
// one row exists per unordered pair, except that a block may coexist with
// nothing else. status: pending | accepted | blocked
export const friendships = sqliteTable(
  'friendships',
  {
    requester: text('requester')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    addressee: text('addressee')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    created: integer('created').notNull(),
    updated: integer('updated').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.requester, t.addressee] }),
    index('idx_friendships_addressee').on(t.addressee),
  ],
);

// status: pending | accepted | declined | revoked
export const sessionInvites = sqliteTable(
  'session_invites',
  {
    id: text('id').primaryKey(),
    code: text('code')
      .notNull()
      .references(() => sessions.code, { onDelete: 'cascade' }),
    sender: text('sender')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    recipient: text('recipient')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    created: integer('created').notNull(),
    expires: integer('expires').notNull(),
  },
  (t) => [
    uniqueIndex('idx_session_invites_pair').on(t.code, t.recipient),
    index('idx_session_invites_recipient').on(t.recipient),
  ],
);

// One row per finished game. id = code + ':' + session.created so that
// recording is idempotent and a reused session code never collides.
export const games = sqliteTable(
  'games',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    hostAccount: text('host_account').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    hostName: text('host_name').notNull(),
    winner: text('winner').notNull(), // good | evil
    reason: text('reason').notNull(), // the Storyteller-facing label
    players: integer('players').notNull(),
    days: integer('days').notNull(),
    nights: integer('nights').notNull(),
    started: integer('started').notNull(),
    ended: integer('ended').notNull(),
  },
  (t) => [index('idx_games_host').on(t.hostAccount)],
);

// One row per seat in a finished game. `account` is filled when the seat is
// linked to an account, at game end or later when the seat is attached.
export const gamePlayers = sqliteTable(
  'game_players',
  {
    game: text('game')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    player: text('player').notNull(),
    account: text('account').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    role: text('role').notNull(),
    team: text('team').notNull(), // good | evil | neutral (final alignment; Travelers are neutral)
    won: integer('won').notNull(),
    alive: integer('alive').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.game, t.player] }),
    index('idx_game_players_account').on(t.account),
  ],
);

export const storytellerRatings = sqliteTable(
  'storyteller_ratings',
  {
    game: text('game')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    rater: text('rater')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    storyteller: text('storyteller')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    stars: integer('stars').notNull(), // 1–5
    comment: text('comment').notNull(),
    created: integer('created').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.game, t.rater] }),
    index('idx_ratings_storyteller').on(t.storyteller),
  ],
);
