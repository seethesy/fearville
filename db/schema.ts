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
