import type { Game } from './types.ts';

// A live table is stored as one small `core` document (sessions.state) plus
// independent parts (session_parts rows). Durable Object storage caps a value
// at 2 MB, and rewriting the whole game on every move was the main write cost.
//
//   core            phase, seats, roles, votes, timers … (sessions.state)
//   chat:00000…     messages, chunked by size, append-only in practice
//   log:00000…      table log, chunked by size
//   history:00000…  rewind entries (their snapshots live in session_snapshots)
//   recaps:00000…   finished-game recaps without their chat, chunked by size
//   recapchat:<recap>:<chunk>  each recap's chat, chunked by size
//   notes:<player>  one player's notebook
//   rite            Night Rite state without its vigils
//   rite:00000…     one vigil (squad) each
//
// Chunking is greedy and depends only on the list's prefix, so appending to a
// list never changes earlier chunks: an action rewrites only what it changed.
// The Durable Object ticket (FEAR-85) reuses this exact layout.

export const STORAGE_LAYOUT = 1;
const LAYOUT_KEY = 'storageLayout';
// Clear error well before the 2 MB Durable Object value cap.
export const PART_LIMIT = 1_000_000;
// Lists start a new chunk past this size.
export const CHUNK_TARGET = 200_000;

const LISTS = {
  messages: 'chat',
  log: 'log',
  history: 'history',
  recaps: 'recaps',
} as const;
type ListField = keyof typeof LISTS;
const FIELD_OF = Object.fromEntries(
  Object.entries(LISTS).map(([field, prefix]) => [prefix, field]),
) as Record<string, ListField>;

export type PartRow = { rev: number; state: string };
export type StoredGame = { core: string; parts: Map<string, string> };

export const partKey = (prefix: string, index: number) =>
  `${prefix}:${String(index).padStart(5, '0')}`;

const encoder = new TextEncoder();
// Chunk sizing only needs an estimate: short items count by length (at most
// 3x under for non-Latin text, still far below PART_LIMIT), long ones exactly.
function approxBytes(text: string) {
  return text.length * 3 <= 4096 ? text.length : encoder.encode(text).length;
}

const LABELS: Record<string, string> = {
  core: 'the table',
  chat: 'a chat message',
  log: 'a log entry',
  history: 'a saved decision',
  recaps: 'a game recap',
  recapchat: 'a game recap',
  notes: 'a notebook',
  rite: 'the Night Rite',
};
function guard(key: string, text: string) {
  if (text.length * 3 > PART_LIMIT && encoder.encode(text).length > PART_LIMIT)
    throw Error(
      `Session storage is full (${LABELS[key.split(':')[0]] ?? key} is too large). End this session and create another.`,
    );
  return text;
}

function chunks(list: unknown[]) {
  const out: string[] = [];
  let current: string[] = [];
  let size = 2;
  for (const item of list) {
    const text = JSON.stringify(item) ?? 'null';
    const length = approxBytes(text) + 1;
    if (current.length && size + length > CHUNK_TARGET) {
      out.push(`[${current.join(',')}]`);
      current = [];
      size = 2;
    }
    current.push(text);
    size += length;
  }
  if (current.length) out.push(`[${current.join(',')}]`);
  return out;
}

/** Split a game into its stored core and parts. Throws on an oversized part. */
export function splitGame(game: Game): StoredGame {
  const parts = new Map<string, string>();
  const core: Record<string, unknown> = { ...game, [LAYOUT_KEY]: STORAGE_LAYOUT };
  const addList = (prefix: string, list: unknown[]) =>
    chunks(list).forEach((text, i) => {
      const key = partKey(prefix, i);
      parts.set(key, guard(key, text));
    });
  for (const [field, prefix] of Object.entries(LISTS) as [ListField, string][]) {
    let list = game[field] as unknown[] | undefined;
    if (!Array.isArray(list)) continue;
    core[field] = [];
    if (field === 'recaps')
      // A recap keeps a whole game's chat; store it apart so one chatty game
      // cannot push a recap past the part limit.
      list = (list as { messages?: unknown[] }[]).map((recap, i) => {
        if (!Array.isArray(recap.messages)) return recap;
        addList(partKey('recapchat', i), recap.messages);
        return { ...recap, messages: [] };
      });
    addList(prefix, list);
  }
  if (game.notebooks) {
    core.notebooks = {};
    for (const [player, book] of Object.entries(game.notebooks)) {
      if (book === undefined) continue;
      const key = `notes:${player}`;
      parts.set(key, guard(key, JSON.stringify(book)));
    }
  }
  if (game.rite) {
    const { squads, ...meta } = game.rite;
    core.rite = { squads: [] };
    parts.set('rite', guard('rite', JSON.stringify(meta)));
    (squads ?? []).forEach((squad, i) => {
      const key = partKey('rite', i);
      parts.set(key, guard(key, JSON.stringify(squad)));
    });
  }
  return { core: guard('core', JSON.stringify(core)), parts };
}

/**
 * Rebuild the same Game object `splitGame` stored. A core without the layout
 * marker is an older single-blob row (or a test fixture written directly): it
 * is complete on its own, any parts are stale, and the next save converts it.
 */
export function assembleGame(
  coreText: string,
  parts: Iterable<[string, string]>,
): { game: Game; legacy: boolean } {
  const core = JSON.parse(coreText) as Record<string, unknown>;
  if (core[LAYOUT_KEY] !== STORAGE_LAYOUT) return { game: core as Game, legacy: true };
  delete core[LAYOUT_KEY];
  const sorted = [...parts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const recapChat: [number, string][] = [];
  for (const [key, text] of sorted) {
    if (!text) continue;
    const split = key.indexOf(':');
    const prefix = split < 0 ? key : key.slice(0, split);
    const rest = split < 0 ? '' : key.slice(split + 1);
    const field = FIELD_OF[prefix];
    if (field) {
      // Independent saves can add the first part of a list or notebook the
      // core never had; any stored part means the field exists.
      const list = Array.isArray(core[field]) ? (core[field] as unknown[]) : (core[field] = []);
      list.push(...(JSON.parse(text) as unknown[]));
    } else if (prefix === 'recapchat') {
      recapChat.push([Number(rest.split(':')[0]), text]);
    } else if (prefix === 'notes') {
      const books = (core.notebooks ??= {}) as Record<string, unknown>;
      books[rest] = JSON.parse(text);
    } else if (prefix === 'rite') {
      const rite = core.rite as { squads: unknown[] } | undefined;
      if (!rite) continue;
      if (rest) rite.squads.push(JSON.parse(text));
      else core.rite = { ...(JSON.parse(text) as object), squads: rite.squads };
    }
  }
  const recaps = core.recaps as { messages?: unknown[] }[] | undefined;
  for (const [index, text] of recapChat) {
    const messages = recaps?.[index]?.messages;
    if (Array.isArray(messages)) messages.push(...(JSON.parse(text) as unknown[]));
  }
  return { game: core as Game, legacy: false };
}

export type PartChanges = {
  upserts: { key: string; state: string; rev: number }[];
  deletes: { key: string; rev: number }[];
};

/** Parts that differ from what was loaded, with the revision each expects. */
export function partChanges(
  loaded: Map<string, PartRow>,
  next: Map<string, string>,
): PartChanges {
  const upserts: PartChanges['upserts'] = [];
  const deletes: PartChanges['deletes'] = [];
  for (const [key, state] of next) {
    const old = loaded.get(key);
    if (!old || old.state !== state) upserts.push({ key, state, rev: old?.rev ?? 0 });
  }
  for (const [key, old] of loaded)
    if (!next.has(key)) deletes.push({ key, rev: old.rev });
  return { upserts, deletes };
}

/** The part a scoped (independent) update path writes, if it maps to one. */
export function partOfPath(path: string): string | null {
  const notebook = /^\$\.notebooks\.(".*")$/.exec(path);
  if (notebook) return `notes:${JSON.parse(notebook[1]) as string}`;
  const squad = /^\$\.rite\.squads\[(\d+)\]$/.exec(path);
  if (squad) return partKey('rite', Number(squad[1]));
  return null;
}
