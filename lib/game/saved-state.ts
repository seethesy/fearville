import { SCRIPTS, type Game, type Player, type SessionRecap } from './types.ts';

// Old tables without a script identifier also used the retired rules.
// Keep them intact in storage; changing a live table's rules would be unsafe.
const GAME_KEYS = new Set<string>(
  Object.keys({
    schemaVersion: true,
    roleDistribution: true,
    rite: true,
    ranked: true,
    progression: true,
    deferredNightTasks: true,
    sandbox: true,
    gameStartedAt: true,
    gameEndedAt: true,
    sessionNumber: true,
    notebooks: true,
    mvpVotes: true,
    decisions: true,
    recaps: true,
    nightIntroductions: true,
    nightChoiceDeadlines: true,
    nightChoiceDeadline: true,
    nightChoiceRound: true,
    nightChoiceTasks: true,
    script: true,
    nightChoices: true,
    hms: true,
    dawnAnnouncement: true,
    assignmentSeed: true,
    code: true,
    hostName: true,
    phase: true,
    day: true,
    night: true,
    players: true,
    timers: true,
    deadline: true,
    remaining: true,
    nominationRemaining: true,
    nominees: true,
    nominators: true,
    ballots: true,
    active: true,
    done: true,
    bluffs: true,
    redHerring: true,
    execution: true,
    winner: true,
    messages: true,
    log: true,
    history: true,
  } satisfies Record<keyof Game, true>),
);

const PLAYER_KEYS = new Set<string>(
  Object.keys({
    avatar: true,
    deathEffect: true,
    dummy: true,
    departed: true,
    id: true,
    name: true,
    seat: true,
    role: true,
    shown: true,
    alive: true,
    publicAlive: true,
    ghost: true,
    poisoned: true,
    protected: true,
    master: true,
    used: true,
    nightDeath: true,
    notes: true,
    acts: true,
    drunk: true,
    poisonUntil: true,
    extraLife: true,
    executed: true,
    revived: true,
    misses: true,
    marked: true,
    pref: true,
    feared: true,
    fearNight: true,
    charge: true,
  } satisfies Record<keyof Player, true>),
);
const RECAP_PLAYER_KEYS = new Set<string>(
  Object.keys({
    id: true,
    name: true,
    role: true,
    shown: true,
    roleId: true,
    team: true,
    seat: true,
    avatar: true,
    alive: true,
    notebook: true,
  } satisfies Record<keyof SessionRecap['players'][number], true>),
);
function currentFields<T>(value: T, keys: Set<string>): T {
  return Object.fromEntries(
    Object.entries(value as object).filter(([key]) => keys.has(key)),
  ) as T;
}

function currentGame(game: Game, includeHistory = true): Game {
  const current = currentFields(game, GAME_KEYS);
  current.players = game.players.map((player) =>
    currentFields(player, PLAYER_KEYS),
  );
  if (game.recaps)
    current.recaps = game.recaps.map((recap) => ({
      ...recap,
      players: recap.players.map((player) =>
        currentFields(player, RECAP_PLAYER_KEYS),
      ),
    }));
  if (includeHistory && game.history)
    current.history = game.history.map((entry) => ({
      ...entry,
      before: entry.before
        ? JSON.stringify(currentGame(JSON.parse(entry.before) as Game))
        : '',
    }));
  return current;
}

export function savedGame(state: string, includeHistory = true): Game {
  return savedGameValue(JSON.parse(state) as Game, includeHistory);
}

// ── Stored-state schema (FEAR-121) ──────────────────────────────────────────
// Every stored game carries schemaVersion. Loading migrates older versions
// forward with pure functions, one step at a time. Rules for new code:
// - always read the previous version (add a migration, never drop support);
// - never write a version the previous release can't read unless the table
//   protocol (TABLE_API_VERSION) is bumped in the same release.
// A newer version (a rollback after a deploy) is read as-is: unknown fields
// are dropped by currentGame, as they always were.
export const SCHEMA_VERSION = 1;
export const MIGRATIONS: Record<number, (game: Game) => Game> = {
  // 0 → 1: tables saved before schema versioning. Shape unchanged; this
  // stamps the baseline every later migration builds on.
  0: (game) => game,
};
export function migrateGame(game: Game): Game {
  let version = Number.isSafeInteger(game.schemaVersion)
    ? (game.schemaVersion as number)
    : 0;
  let current = game;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw Error(`No saved-table migration from version ${version}.`);
    current = { ...step(current), schemaVersion: version + 1 };
    version += 1;
  }
  return current;
}

/** Validate and normalise an already parsed (or assembled) saved game. */
export function savedGameValue(game: Game, includeHistory = true): Game {
  if (!game.script || !Object.hasOwn(SCRIPTS, game.script))
    throw Error(
      'This saved table uses a retired script. Create a new table with Horrors of Fearville or Holy Moon and Stars.',
    );
  return currentGame(migrateGame(game), includeHistory);
}
