import type { Game } from './types.ts';
import {
  assembleGame,
  partChanges,
  partKey,
  partOfPath,
  splitGame,
  CHUNK_TARGET,
  PART_LIMIT,
  type PartRow,
} from './parts.ts';
import { savedGameValue } from './saved-state.ts';
import type { ScopedUpdate } from './scoped-update.ts';

// SQL for the split game layout (see parts.ts). Kept free of the worker
// environment so the D1 store and tests can pass any D1-compatible database.

type Loaded = {
  version: number;
  created: number;
  parts: Map<string, PartRow>;
  legacy: boolean;
};
// What each loaded Game looked like in storage, so a save writes only the
// parts that changed and checks each one's revision.
const loadedStates = new WeakMap<Game, Loaded>();

export const SESSION_COLUMNS =
  's.state, s.version, s.created, (SELECT json_group_array(json_array(p.part, p.rev, p.state)) FROM session_parts p WHERE p.code = s.code) AS parts';
export type SessionRow = {
  state: string;
  version: number;
  created: number;
  parts: string | null;
};

export function loadStored(row: SessionRow, includeHistory = false) {
  const parts = new Map<string, PartRow>();
  for (const [key, rev, state] of JSON.parse(row.parts || '[]') as [
    string,
    number,
    string,
  ][])
    parts.set(key, { rev, state });
  const assembled = assembleGame(
    row.state,
    [...parts].map(([key, part]) => [key, part.state] as [string, string]),
  );
  const game = savedGameValue(assembled.game, includeHistory);
  loadedStates.set(game, {
    version: row.version,
    created: row.created,
    parts,
    legacy: assembled.legacy,
  });
  return {
    game,
    version: row.version,
    created: row.created,
    legacy: assembled.legacy,
  };
}

const WRITE_GUARD =
  'EXISTS (SELECT 1 FROM sessions WHERE code=? AND write_id=?)';

export type PreparedWrite = {
  /** The core compare-and-set. Callers may batch their own statements right after it. */
  update: D1PreparedStatement;
  /** Snapshots and parts; batch them after `update`. They run only if it applied. */
  after: D1PreparedStatement[];
  /** SQL condition that is true only once this exact write has applied. */
  guard: string;
  guardBindings: [string, string];
  commit: () => void;
};

/**
 * Prepare a whole-table save at `version`. `coreCondition` adds SQL to the
 * core UPDATE's WHERE clause (for example an invitation check).
 */
export function prepareWrite(
  db: D1Database,
  g: Game,
  version: number,
  coreCondition = '',
  coreBindings: unknown[] = [],
): PreparedWrite {
  const loaded = loadedStates.get(g);
  const snapshots = g.history.filter((entry) => entry.before);
  const stored = splitGame({
    ...g,
    history: g.history.map((entry) => ({ ...entry, before: '' })),
  });
  const writeId = crypto.randomUUID();
  const guardBindings: [string, string] = [g.code, writeId];
  const update = db
    .prepare(
      'UPDATE sessions SET state=?, version=version+1, write_id=? WHERE code=? AND version=?' +
        coreCondition,
    )
    .bind(stored.core, writeId, g.code, version, ...coreBindings);
  const after = snapshots.map((entry) =>
    db
      .prepare(
        `INSERT INTO session_snapshots (code,id,state) SELECT ?,?,? WHERE ${WRITE_GUARD} ON CONFLICT(code,id) DO UPDATE SET state=excluded.state`,
      )
      .bind(g.code, entry.id, entry.before, ...guardBindings),
  );
  // A part that changed since it was loaded fails the whole batch: the guard
  // row collides with the existing primary key, D1 rolls the batch back, and
  // the caller retries from a fresh read like any other conflict.
  const expect = (key: string, rev: number) =>
    db
      .prepare(
        `INSERT INTO session_parts (code,part,state,rev) SELECT ?,?,'',0 WHERE ${WRITE_GUARD} AND NOT EXISTS (SELECT 1 FROM session_parts WHERE code=? AND part=? AND rev=?)`,
      )
      .bind(g.code, key, ...guardBindings, g.code, key, rev);
  const changes = loaded ? partChanges(loaded.parts, stored.parts) : null;
  if (!changes) {
    // Not loaded through this store: replace every part.
    after.push(
      db
        .prepare(`DELETE FROM session_parts WHERE code=? AND ${WRITE_GUARD}`)
        .bind(g.code, ...guardBindings),
    );
  }
  const upserts =
    changes?.upserts ??
    [...stored.parts].map(([key, state]) => ({ key, state, rev: 0 }));
  for (const { key, state, rev } of upserts)
    after.push(
      expect(key, rev),
      db
        .prepare(
          `INSERT INTO session_parts (code,part,state,rev) SELECT ?,?,?,1 WHERE ${WRITE_GUARD} ON CONFLICT(code,part) DO UPDATE SET state=excluded.state, rev=session_parts.rev+1`,
        )
        .bind(g.code, key, state, ...guardBindings),
    );
  for (const { key, rev } of changes?.deletes ?? [])
    after.push(
      expect(key, rev),
      db
        .prepare(
          `DELETE FROM session_parts WHERE code=? AND part=? AND ${WRITE_GUARD}`,
        )
        .bind(g.code, key, ...guardBindings),
    );
  const commit = () => {
    const parts = new Map<string, PartRow>();
    for (const [key, state] of stored.parts)
      parts.set(key, { state, rev: (loaded?.parts.get(key)?.rev ?? 0) + 1 });
    // Unchanged parts keep their revision.
    for (const [key, part] of loaded?.parts ?? [])
      if (stored.parts.get(key) === part.state) parts.set(key, part);
    loadedStates.set(g, {
      version: version + 1,
      created: loaded?.created ?? 0,
      parts,
      legacy: false,
    });
  };
  return { update, after, guard: WRITE_GUARD, guardBindings, commit };
}

/** True when a batch failed only because a stored part changed concurrently. */
export function isPartConflict(error: unknown) {
  return /UNIQUE constraint failed: session_parts/.test(String(error));
}

/** Run a prepared write batch. Returns null on a part conflict (retry). */
export async function runWrite(
  db: D1Database,
  write: PreparedWrite,
  between: D1PreparedStatement[] = [],
  extra: D1PreparedStatement[] = [],
) {
  try {
    const results = await db.batch([
      write.update,
      ...between,
      ...write.after,
      ...extra,
    ]);
    if (results[0].meta.changes === 1) write.commit();
    return results;
  } catch (error) {
    if (isPartConflict(error)) return null;
    throw error;
  }
}

/** Insert the stored form of a brand-new table. */
export function createStatements(db: D1Database, g: Game, created: number) {
  const stored = splitGame(g);
  return [
    db
      .prepare(
        'INSERT INTO sessions (code,state,version,created) VALUES (?,?,0,?)',
      )
      .bind(g.code, stored.core, created),
    ...[...stored.parts].map(([key, state]) =>
      db
        .prepare(
          'INSERT INTO session_parts (code,part,state,rev) VALUES (?,?,?,1)',
        )
        .bind(g.code, key, state),
    ),
  ];
}

/**
 * Save a chat message, a notebook or one vigil's Rite state without touching
 * the core: only that part's row changes, guarded by the table fields the
 * action depends on. Returns null when the full transaction must run instead.
 */
export async function saveIndependentParts(
  db: D1Database,
  g: Game,
  update: ScopedUpdate,
) {
  const loaded = loadedStates.get(g);
  if (!loaded || loaded.legacy) return null;
  const params: unknown[] = [g.code];
  let condition = 'EXISTS (SELECT 1 FROM sessions WHERE code=?';
  for (const [path, value] of update.guard) {
    if (path.startsWith('$.rite') || path.startsWith('$.notebooks')) continue;
    condition += " AND json_extract(state,?) IS json_extract(?,'$')";
    params.push(path, JSON.stringify(value ?? null));
  }
  condition += ')';
  const done = (key: string, state: string, rev: number) => {
    loaded.parts.set(key, { state, rev });
    return { game: g, version: loaded.version, created: loaded.created };
  };

  if (update.append) {
    const message = JSON.stringify(update.append[1]);
    const chats = [...loaded.parts.keys()]
      .filter((key) => key.startsWith('chat:'))
      .sort();
    const last = chats.at(-1);
    const lastPart = last ? loaded.parts.get(last)! : null;
    const duplicate =
      "NOT EXISTS (SELECT 1 FROM session_parts c, json_each(c.state) m WHERE c.code=? AND c.part LIKE 'chat:%' AND json_extract(m.value,'$.id')=?)";
    const duplicateParams = [g.code, update.messageId ?? ''];
    if (
      last &&
      lastPart &&
      lastPart.state.length + message.length < CHUNK_TARGET
    ) {
      const row = await db
        .prepare(
          `UPDATE session_parts SET state=json_insert(state,'$[#]',json(?)), rev=rev+1 WHERE code=? AND part=? AND NOT EXISTS (SELECT 1 FROM session_parts n WHERE n.code=? AND n.part LIKE 'chat:%' AND n.part>?) AND ${duplicate} AND ${condition} RETURNING rev`,
        )
        .bind(
          message,
          g.code,
          last,
          g.code,
          last,
          ...duplicateParams,
          ...params,
        )
        .first<{ rev: number }>();
      // The stored text is now SQLite's serialisation; mark it stale so a later
      // full save from this object rewrites the chunk under its new revision.
      return row ? done(last, '\u0000', row.rev) : null;
    }
    const next = partKey('chat', last ? Number(last.slice(5)) + 1 : 0);
    const row = await db
      .prepare(
        `INSERT INTO session_parts (code,part,state,rev) SELECT ?,?,json_array(json(?)),1 WHERE NOT EXISTS (SELECT 1 FROM session_parts n WHERE n.code=? AND n.part LIKE 'chat:%' AND n.part>=?) AND ${duplicate} AND ${condition} ON CONFLICT DO NOTHING RETURNING rev`,
      )
      .bind(g.code, next, message, g.code, next, ...duplicateParams, ...params)
      .first<{ rev: number }>();
    return row ? done(next, `[${message}]`, row.rev) : null;
  }

  if (update.set.length !== 1) return null;
  const [path, value] = update.set[0];
  const key = partOfPath(path);
  if (!key || value === undefined) return null;
  const state = JSON.stringify(value);
  if (
    state.length * 3 > PART_LIMIT &&
    new TextEncoder().encode(state).length > PART_LIMIT
  )
    return null; // the full save reports the size error
  if (key.startsWith('rite:')) {
    const meta = loaded.parts.get('rite');
    if (!meta) return null;
    condition +=
      ' AND EXISTS (SELECT 1 FROM session_parts WHERE code=? AND part=? AND rev=?)';
    params.push(g.code, 'rite', meta.rev);
  }
  const rev = loaded.parts.get(key)?.rev ?? 0;
  const row = rev
    ? await db
        .prepare(
          `UPDATE session_parts SET state=?, rev=rev+1 WHERE code=? AND part=? AND rev=? AND ${condition} RETURNING rev`,
        )
        .bind(state, g.code, key, rev, ...params)
        .first<{ rev: number }>()
    : await db
        .prepare(
          `INSERT INTO session_parts (code,part,state,rev) SELECT ?,?,?,1 WHERE ${condition} ON CONFLICT DO NOTHING RETURNING rev`,
        )
        .bind(g.code, key, state, ...params)
        .first<{ rev: number }>();
  return row ? done(key, state, row.rev) : null;
}
