import {
  assembleGame,
  splitGame,
  PART_LIMIT,
  type StoredGame,
} from './parts.ts';
import { savedGameValue } from './saved-state.ts';
import type { Game } from './types.ts';

export type TableMeta = {
  code: string;
  version: number;
  created: number;
  retainAt: number;
  projection?: {
    id: string;
    version: number;
    credentialHash?: string;
    communication?: boolean;
    syncRanked: boolean;
    removed?: string;
  };
  effects?: {
    before: Game['phase'];
    started: number;
    action: string;
    now: number;
  };
};
export type TableStorage = Pick<
  DurableObjectStorage,
  'sql' | 'transactionSync'
>;
export class ObjectParts {
  private stored: StoredGame | null = null;
  private storage: TableStorage;
  constructor(storage: TableStorage) {
    this.storage = storage;
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS parts (key TEXT PRIMARY KEY, state TEXT NOT NULL)',
    );
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)',
    );
  }
  load() {
    const metadata = this.storage.sql
      .exec<{ state: string }>('SELECT state FROM metadata WHERE id=1')
      .toArray()[0];
    if (!metadata) return null;
    const parts = new Map(
      this.storage.sql
        .exec<{ key: string; state: string }>(
          'SELECT key,state FROM parts WHERE key NOT LIKE ?',
          'snapshot:%',
        )
        .toArray()
        .map((r) => [r.key, r.state]),
    );
    const core = parts.get('core');
    if (!core) throw Error('Stored table is incomplete.');
    parts.delete('core');
    this.stored = { core, parts };
    return {
      game: savedGameValue(assembleGame(core, parts).game, false),
      meta: JSON.parse(metadata.state) as TableMeta,
    };
  }
  save(g: Game, meta: TableMeta) {
    const snapshots = g.history.filter((h) => h.before);
    const next = splitGame({
      ...g,
      history: g.history.map((h) => ({ ...h, before: '' })),
    });
    this.storage.transactionSync(() => {
      const put = (key: string, state: string) =>
        this.storage.sql.exec(
          'INSERT INTO parts(key,state) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET state=excluded.state',
          key,
          state,
        );
      if (this.stored?.core !== next.core) put('core', next.core);
      for (const [key, state] of next.parts)
        if (this.stored?.parts.get(key) !== state) put(key, state);
      for (const key of this.stored?.parts.keys() ?? [])
        if (!next.parts.has(key))
          this.storage.sql.exec('DELETE FROM parts WHERE key=?', key);
      for (const entry of snapshots) {
        // Rewind snapshots can contain heavy chat; each string chunk is at
        // most 300 KB in UTF-8, regardless of the size of the whole snapshot.
        this.storage.sql.exec(
          'DELETE FROM parts WHERE key LIKE ?',
          `snapshot:${entry.id}:%`,
        );
        for (let offset = 0; offset < entry.before.length;) {
          let end = Math.min(entry.before.length, offset + 100_000);
          // SQLite converts isolated surrogate halves to replacement chars.
          // Keep UTF-16 pairs intact at chunk boundaries.
          const last = entry.before.charCodeAt(end - 1);
          if (end < entry.before.length && last >= 0xd800 && last <= 0xdbff)
            end--;
          put(
            `snapshot:${entry.id}:${String(offset).padStart(10, '0')}`,
            entry.before.slice(offset, end),
          );
          offset = end;
        }
      }
      const live = new Set(g.history.map((h) => h.id));
      for (const row of this.storage.sql
        .exec<{ key: string }>(
          'SELECT key FROM parts WHERE key LIKE ?',
          'snapshot:%',
        )
        .toArray())
        if (!live.has(row.key.split(':')[1]))
          this.storage.sql.exec('DELETE FROM parts WHERE key=?', row.key);
      const text = JSON.stringify(meta);
      if (new TextEncoder().encode(text).length >= PART_LIMIT)
        throw Error('Table metadata is too large.');
      this.storage.sql.exec(
        'INSERT INTO metadata(id,state) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state',
        text,
      );
    });
    this.stored = next;
  }
  snapshot(id: string) {
    return this.storage.sql
      .exec<{ state: string }>(
        'SELECT state FROM parts WHERE key LIKE ? ORDER BY key',
        `snapshot:${id}:%`,
      )
      .toArray()
      .map((r) => r.state)
      .join('');
  }
  reset() {
    this.storage.transactionSync(() => {
      this.storage.sql.exec('DELETE FROM parts');
      this.storage.sql.exec('DELETE FROM metadata');
    });
    this.stored = null;
  }
}
