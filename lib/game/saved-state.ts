import { SCRIPTS, type Game, type Player, type SessionRecap } from './types.ts';

// Old tables without a script identifier also used the retired rules.
// Keep them intact in storage; changing a live table's rules would be unsafe.
const GAME_KEYS = new Set<string>(
  Object.keys({
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

function currentGame(game: Game): Game {
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
  if (game.history)
    current.history = game.history.map((entry) => ({
      ...entry,
      before: JSON.stringify(currentGame(JSON.parse(entry.before) as Game)),
    }));
  return current;
}

export function savedGame(state: string): Game {
  const game = JSON.parse(state) as Game;
  if (!game.script || !Object.hasOwn(SCRIPTS, game.script))
    throw Error(
      'This saved table uses a retired script. Create a new table with Horrors of Fearville or Holy Moon and Stars.',
    );
  return currentGame(game);
}
