import { sql } from 'drizzle-orm';
// Trust tables use SQL triggers in 0014_trust_ledger.sql for atomic balances.
import {
  sqliteTable,
  check,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('sessions', {
  code: text('code').primaryKey(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  created: integer('created').notNull(),
  // Unique id of the save that produced this row; statements batched with a
  // save run only if that exact save applied.
  writeId: text('write_id'),
});
// Chat, log, notebooks, Night Rite vigils and recaps are stored apart from
// sessions.state so each action rewrites only what it changed and no stored
// value nears Durable Object storage's 2 MB cap. See lib/game/parts.ts.
export const sessionParts = sqliteTable(
  'session_parts',
  {
    code: text('code')
      .notNull()
      .references(() => sessions.code, { onDelete: 'cascade' }),
    part: text('part').notNull(),
    state: text('state').notNull(),
    rev: integer('rev').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.code, t.part] })],
);
// Decision snapshots are read only when the Storyteller rewinds. Keeping them
// out of the live table avoids copying every past decision on each move/poll.
export const sessionSnapshots = sqliteTable(
  'session_snapshots',
  {
    code: text('code')
      .notNull()
      .references(() => sessions.code, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    state: text('state').notNull(),
  },
  (t) => [primaryKey({ columns: [t.code, t.id] })],
);
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
    handleChangedAt: integer('handle_changed_at'),
    role: text('role').notNull().default('player'),
    googleEmail: text('google_email'),
    banned: text('banned'),
    mutedUntil: integer('muted_until'),
    adminRevision: integer('admin_revision').notNull().default(0),
  },
  (t) => [uniqueIndex('idx_accounts_handle').on(t.handle)],
);
export const wallets = sqliteTable('wallets', {
  id: text('id').primaryKey(),
  account: text('account')
    .unique()
    .references(() => accounts.id, { onDelete: 'set null' }),
  balance: integer('balance').notNull().default(0),
});
export const trustLedger = sqliteTable(
  'trust_ledger',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    wallet: text('wallet')
      .notNull()
      .references(() => wallets.id),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    kind: text('kind').notNull(),
    origin: text('origin').notNull(),
    source: text('source').notNull(),
    reason: text('reason').notNull(),
    metadata: text('metadata').notNull().default('{}'),
    idempotencyKey: text('idempotency_key').notNull(),
    created: integer('created').notNull(),
  },
  (t) => [uniqueIndex('idx_trust_ledger_key').on(t.wallet, t.idempotencyKey)],
);
export const cosmetics = sqliteTable('cosmetics', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  tier: text('tier').notNull().default('standard'),
  preview: text('preview').notNull(),
  available: integer('available').notNull().default(1),
  starts: integer('starts'),
  ends: integer('ends'),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: integer('is_default').notNull().default(0),
  created: integer('created').notNull(),
  updated: integer('updated').notNull(),
});
export const ownedCosmetics = sqliteTable(
  'owned_cosmetics',
  {
    account: text('account')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    cosmetic: text('cosmetic')
      .notNull()
      .references(() => cosmetics.id),
    acquired: integer('acquired').notNull(),
    method: text('method').notNull(),
  },
  (t) => [primaryKey({ columns: [t.account, t.cosmetic] })],
);
export const equippedCosmetics = sqliteTable(
  'equipped_cosmetics',
  {
    account: text('account')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    cosmetic: text('cosmetic').references(() => cosmetics.id),
  },
  (t) => [primaryKey({ columns: [t.account, t.category] })],
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
    provider: text('provider'),
    verifiedEmail: text('verified_email'),
    issued: integer('issued').notNull().default(0),
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
  provider: text('provider'),
  verifiedEmail: text('verified_email'),
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
    script: text('script').notNull().default('unknown'),
    ranked: integer('ranked').notNull().default(0),
    hostXp: integer('host_xp').notNull().default(0),
    recap: text('recap'),
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
  (t) => [
    index('idx_games_host').on(t.hostAccount),
    index('idx_games_ended').on(t.ended),
  ],
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
    roleType: text('role_type').notNull().default('unknown'),
    baseXp: integer('base_xp').notNull().default(0),
    mvpXp: real('mvp_xp').notNull().default(0),
    mvpVotes: integer('mvp_votes').notNull().default(0),
    ratingBefore: integer('rating_before'),
    opponentRating: real('opponent_rating'),
    teamRating: real('team_rating'),
    eloDelta: integer('elo_delta').notNull().default(0),
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

export const accountSettings = sqliteTable('account_settings', {
  account: text('account')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  statsVisibility: text('stats_visibility').notNull().default('friends'),
  historyVisibility: text('history_visibility').notNull().default('friends'),
  friendRequests: text('friend_requests').notNull().default('everyone'),
  gameInvites: text('game_invites').notNull().default('friends'),
});
export const accountProfiles = sqliteTable('account_profiles', {
  account: text('account')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  lobbyName: text('lobby_name').notNull().default(''),
  avatar: text('avatar').notNull().default('ghost'),
  deathEffect: text('death_effect').notNull().default('spirit'),
  settings: text('settings').notNull().default('{}'),
  lastSeen: integer('last_seen').notNull().default(0),
  onlineVisible: integer('online_visible').notNull().default(1),
});
// Prevent one account from starting two rated matches with the same rating.
export const rankedSeats = sqliteTable(
  'ranked_seats',
  {
    account: text('account')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    code: text('code')
      .notNull()
      .references(() => sessions.code, { onDelete: 'cascade' }),
    game: text('game').notNull(),
  },
  (t) => [index('idx_ranked_seats_code').on(t.code)],
);

// Tutorials a signed-in account has finished or skipped (FEAR-16). Guests are
// never stored. status: completed | skipped
export const tutorialProgress = sqliteTable(
  'tutorial_progress',
  {
    account: text('account')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tutorial: text('tutorial').notNull(),
    status: text('status').notNull(),
    updated: integer('updated').notNull(),
  },
  (t) => [primaryKey({ columns: [t.account, t.tutorial] })],
);

// Player reports (FEAR-119) for the admin moderation queue. `content` is a
// snapshot of the reported text (chat message, handle or rating comment) at
// report time. kind: player | chat | rating. status: open | dismissed | actioned
export const playerReports = sqliteTable(
  'player_reports',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    note: text('note').notNull().default(''),
    reporterAccount: text('reporter_account').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    // Guests report with their seat (code:player); never a credential.
    reporterSeat: text('reporter_seat'),
    targetAccount: text('target_account').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    targetName: text('target_name').notNull().default(''),
    code: text('code'),
    game: text('game'),
    messageId: text('message_id'),
    content: text('content').notNull().default(''),
    status: text('status').notNull().default('open'),
    created: integer('created').notNull(),
    resolvedBy: text('resolved_by'),
    resolvedAt: integer('resolved_at'),
    resolution: text('resolution'),
  },
  (t) => [
    index('idx_player_reports_status').on(t.status, t.created),
    index('idx_player_reports_target').on(t.targetAccount),
  ],
);
// FEAR-31: immutable audit/text history. Triggers are in the SQL migration.
export const adminProgression = sqliteTable('admin_progression', {
  account: text('account')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  xpOffset: real('xp_offset').notNull().default(0),
});
export const accountItems = sqliteTable(
  'account_items',
  {
    account: text('account')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    item: text('item').notNull(),
  },
  (t) => [primaryKey({ columns: [t.account, t.item] })],
);
export const adminAudit = sqliteTable(
  'admin_audit',
  {
    id: text('id').primaryKey(),
    at: integer('at').notNull(),
    admin: text('admin').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    parameters: text('parameters').notNull(),
    result: text('result').notNull(),
    beforeValue: text('before_value'),
    afterValue: text('after_value'),
  },
  (t) => [index('idx_admin_audit_at').on(t.at)],
);
export const uiTextVersions = sqliteTable(
  'ui_text_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    at: integer('at').notNull(),
    admin: text('admin').notNull(),
    // FEAR-173: the editor's note for this version ("fixed typo").
    summary: text('summary'),
  },
  (t) => [index('idx_ui_text_versions_key').on(t.key, t.id)],
);
// FEAR-173: unpublished edits, one per key. Never served to players.
export const uiTextDrafts = sqliteTable('ui_text_drafts', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  summary: text('summary'),
  // Published version id the draft was based on (0 = bundled default).
  base: integer('base').notNull().default(0),
  editor: text('editor').notNull(),
  updated: integer('updated').notNull(),
});
// FEAR-173: trusted accounts that may edit and publish official text.
export const textEditors = sqliteTable('text_editors', {
  account: text('account')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  granted: integer('granted').notNull(),
  grantedBy: text('granted_by').notNull(),
});
export const adminAssertions = sqliteTable(
  'admin_assertions',
  { ok: integer('ok').notNull() },
  (t) => [check('admin_assertion_ok', sql`${t.ok}=1`)],
);

export const adminConfirmations = sqliteTable('admin_confirmations', {
  hash: text('hash').primaryKey(),
  admin: text('admin').notNull(),
  session: text('session').notNull(),
  command: text('command').notNull(),
  digest: text('digest').notNull(),
  expires: integer('expires').notNull(),
});

// FEAR-158: an admin session browsing the normal UI. While a row exists for the
// admin's account session, account reads resolve to `account` (null = guest)
// and every non-admin account write is refused.
export const adminViews = sqliteTable('admin_views', {
  session: text('session').primaryKey(), // account_sessions.hash of the admin
  admin: text('admin')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  viewer: text('viewer').notNull(), // guest | player | storyteller | observer
  account: text('account').references(() => accounts.id, {
    onDelete: 'cascade',
  }),
  created: integer('created').notNull(),
});

// FEAR-158: a table credential that only the admin account can use. `sandbox`
// is a private Sandbox table the admin hosts; `observe` is a read-only seat on
// a real table. Without a valid admin session the credential is refused.
export const adminTableGrants = sqliteTable(
  'admin_table_grants',
  {
    token: text('token').primaryKey(), // members.token_hash
    admin: text('admin')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    mode: text('mode').notNull(), // sandbox | observe
    created: integer('created').notNull(),
  },
  (t) => [index('idx_admin_table_grants_admin').on(t.admin)],
);

// FEAR-159: feedback and bug report forms. A form is immutable once stored;
// editing publishes a new version and moves `active` to it.
export const feedbackForms = sqliteTable(
  'feedback_forms',
  {
    id: text('id').primaryKey(), // context:version
    context: text('context').notNull(),
    version: integer('version').notNull(),
    active: integer('active').notNull().default(0),
    definition: text('definition').notNull(), // JSON FormDefinition
    created: integer('created').notNull(),
    createdBy: text('created_by'),
  },
  (t) => [
    uniqueIndex('idx_feedback_forms_version').on(t.context, t.version),
    uniqueIndex('idx_feedback_forms_active')
      .on(t.context)
      .where(sql`${t.active} = 1`),
  ],
);
export const feedbackSubmissions = sqliteTable(
  'feedback_submissions',
  {
    id: text('id').primaryKey(),
    form: text('form')
      .notNull()
      .references(() => feedbackForms.id),
    context: text('context').notNull(),
    version: integer('version').notNull(),
    account: text('account').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    // Anonymous random id a guest's device keeps; never a credential.
    guest: text('guest'),
    subject: text('subject'),
    answers: text('answers').notNull(), // JSON, plain text only
    client: text('client'), // JSON app details (bug reports)
    game: text('game'), // JSON public table details (bug reports)
    flagged: integer('flagged').notNull().default(0), // objectionable text
    status: text('status').notNull().default('new'),
    created: integer('created').notNull(),
  },
  (t) => [
    index('idx_feedback_submissions_context').on(t.context, t.created),
    index('idx_feedback_submissions_account').on(t.account),
  ],
);

// FEAR-122: remote switches (feature flags, kill switches, maintenance banner,
// app build policy). value is JSON; see lib/flags/catalog.ts. Rows are per
// environment; a missing row means the default (on / no banner).
export const featureFlags = sqliteTable(
  'feature_flags',
  {
    key: text('key').notNull(),
    environment: text('environment').notNull(),
    value: text('value').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.environment] })],
);
