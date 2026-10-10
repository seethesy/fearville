export type Team = 'townsfolk' | 'outsider' | 'traveler' | 'minion' | 'demon';
// Tables seat 5–18 players in every script.
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 18;
export type RoleDef = {
  id: string;
  name: string;
  team: Team;
  description: string;
};
// Holy Moon and Stars characters. Wording follows the Fearville script sheet.
export const HMS_ROLES: RoleDef[] = [
  [
    'astrologist',
    'Astrologist',
    'townsfolk',
    'At the start of the game, choose 3 players. You are told 3 roles: 1 belongs to one of them and 2 do not belong to anyone.',
  ],
  [
    'mystic',
    'Mystic',
    'townsfolk',
    'At the start of the game, choose 1 of your neighbors. You learn up to 3 other players they may be connected to.',
  ],
  [
    'astronaut',
    'Astronaut',
    'townsfolk',
    'At the start of the game, learn how far the nearest evil player is from you.',
  ],
  [
    'stargazer',
    'Stargazer',
    'townsfolk',
    'At the start of the game, choose a player. Alive or dead, you may ask the Storyteller who they spoke with or what they discussed. Answers are at Storyteller discretion.',
  ],
  [
    'prophet',
    'Prophet',
    'townsfolk',
    'At the start of the game, learn which Haunt and Horror characters are in play. If the Storyteller hears you reveal this, you and one of your neighbors may die that night.',
  ],
  [
    'insomniac',
    'Insomniac',
    'townsfolk',
    'Each night, learn which players visited you and how many of your neighbors visited another player.',
  ],
  [
    'diviner',
    'Diviner',
    'townsfolk',
    'Each night, ask the Storyteller a question. They answer with the name of a player you should speak to the next day.',
  ],
  [
    'medium',
    'Medium',
    'townsfolk',
    'Each night after the first, choose a dead player. They may use their night ability tonight (spent once-per-game abilities are not reset), and you share a private channel with them until dawn.',
  ],
  [
    'spirit',
    'Spirit',
    'townsfolk',
    'Each night, choose a player. Learn how many of their visitors are good and evil. If nobody visited, learn “0 people.” If you die, learn only the number of visitors.',
  ],
  [
    'gravedigger',
    'Gravedigger',
    'townsfolk',
    'Once per game, at night, choose a dead player. You may become their character and alignment at dawn. The Storyteller may refuse setup-changing characters.',
  ],
  [
    'fateweaver',
    'Fateweaver',
    'townsfolk',
    'The first time either of your living neighbors dies, you may redirect their death. The Storyteller may or may not follow your choice.',
  ],
  [
    'priest',
    'Priest',
    'townsfolk',
    'Once per game, at night, choose a dead player: they return at dawn (Villagers as themselves, Fools as themselves, Haunts as an out-of-play Villager). If you are killed, you return at the next dawn as an out-of-play Villager.',
  ],
  [
    'atheist',
    'Atheist',
    'townsfolk',
    'If the Atheist is in play, every player is good. Good wins by executing the Storyteller; evil wins when two players remain. The Storyteller may break any rule.',
  ],
  [
    'celestial',
    'Celestial',
    'townsfolk',
    'While you live, other good players cannot die during the day. If you are executed, everyone is poisoned until the next dusk and one Villager becomes drunk for the rest of the game. Evil learns whether a Celestial is in play.',
  ],
  [
    'constellation',
    'Constellation',
    'outsider',
    'At the start of the game, choose 3 players to link. If one dies, the others may die too. Once per game, at night, guess all their characters: if correct, revive one or give one an extra life; if wrong, the link breaks and you and another member may die.',
  ],
  [
    'lostsoul',
    'Lost Soul',
    'outsider',
    'You secretly act as an out-of-play Villager, but you do not know which. Its ability does not work, and information is given only as unlabeled names or values.',
  ],
  [
    'zealot',
    'Zealot',
    'outsider',
    'When you die, the Storyteller gains a character ability from this script of their choice.',
  ],
  [
    'dazed',
    'Dazed',
    'outsider',
    'You are drunk and believe you are a Villager. Whenever another player targets you with an ability, the Storyteller may redirect it to one of your living neighbors or to a player of your choice.',
  ],
  [
    'necromancer',
    'Necromancer',
    'minion',
    'Once per game, at night, choose a dead player: they return at dawn as evil (Haunts as themselves; others as an out-of-play Haunt). The Horror cannot be revived.',
  ],
  [
    'moonshiner',
    'Moonshiner',
    'minion',
    'Adds a Fool to the game. Every Fool is drunk and believes they are a Villager, though their own Fool ability still works. After you die, the Fools may sober up and learn their real characters.',
  ],
  [
    'nightmare',
    'Nightmare',
    'minion',
    'If you are executed, at night choose a player with a nighttime targeting ability. Once per game, when they choose a target, you have 60 seconds to redirect it without them knowing.',
  ],
  [
    'astrophage',
    'Astrophage',
    'minion',
    'Once per game, during the day, you may end the day early. Not available with 4 or fewer living players.',
  ],
  [
    'grimreaper',
    'Grim Reaper',
    'demon',
    'Each night, mark a player for death. At any time you may reap: every marked player dies.',
  ],
  [
    'werewolf',
    'Werewolf',
    'demon',
    'Each night, prepare for the full moon. After two nights of preparation, choose 3 players to die (Nights 3, 6, 9…).',
  ],
  [
    'dreameater',
    'Dreameater',
    'demon',
    'Each night, guess any number of players’ characters. Correct guesses die. At 3 total wrong guesses you die instead, and that night’s correct guesses do not count.',
  ],
  [
    'miasma',
    'Miasma',
    'demon',
    'Each night, infect a player with the plague. The next night they die and both of their living neighbors are poisoned that night.',
  ],
].map(([id, name, team, description]) => ({
  id,
  name,
  team: team as Team,
  description,
}));
// Horrors of Fearville characters. Wording follows the script sheet; the
// Vigilante acts once per game by day. The Drunk retains its hidden Villager ability.
export const HOF_ROLES: RoleDef[] = [
  [
    'doctor',
    'Doctor',
    'townsfolk',
    'Every night after the first, visit a player to save them.',
  ],
  [
    'detective',
    'Detective',
    'townsfolk',
    'Every night, visit two players to investigate them. You are told “Yes” if one of them is a Horror, or “No” if neither are. One random Villager secretly registers as a false positive, so they may produce a “Yes” despite being a Villager.',
  ],
  [
    'watchman',
    'Watchman',
    'townsfolk',
    'Every night after the first, visit a player to stay on lookout for them. You learn the names of all players who visit them.',
  ],
  [
    'bodyguard',
    'Bodyguard',
    'townsfolk',
    'Every night after the first, learn if someone is killed at night. You will be given the option to die in their place.',
  ],
  [
    'psychic',
    'Psychic',
    'townsfolk',
    'Every night, the Storyteller chooses another player for you to visit. After the first night, that player’s role type will be different from the player you visited the previous night. You will not know their roles.',
  ],
  [
    'judge',
    'Judge',
    'townsfolk',
    'Every night, visit two players. You learn if they are the same alignment.',
  ],
  [
    'mortician',
    'Mortician',
    'townsfolk',
    'Once per game, at night, visit a dead player. Learn which roles have visited them in this game. If they were visited by 3 or more different players, learn 1 of their names.',
  ],
  [
    'vigilante',
    'Vigilante',
    'townsfolk',
    'Once per game, during the day, you may declare a player you want to kill. They may die instantly.',
  ],
  [
    'sheriff',
    'Sheriff',
    'townsfolk',
    'At the start of the game, learn that one of two players is a particular Haunt.',
  ],
  [
    'hoflibrarian',
    'Librarian',
    'townsfolk',
    'At the start of the game, learn that one of two players is a particular Villager.',
  ],
  [
    'teacher',
    'Teacher',
    'townsfolk',
    'At the start of the game, learn that one of your neighbors is a particular role.',
  ],
  [
    'hunter',
    'Hunter',
    'townsfolk',
    'If you are killed at night, a Haunt may die the same night.',
  ],
  [
    'drunk',
    'Drunk',
    'outsider',
    'You do not know you are the Drunk. Instead, you are shown a random Villager role that you believe yourself to be. That role’s ability will not work as intended, but you will not know that.',
  ],
  [
    'hag',
    'Hag',
    'outsider',
    'If you are killed, declare another player to die. If they are Good, they may die that night.',
  ],
  [
    'lostwanderer',
    'Lost Wanderer',
    'outsider',
    'Every night, visit a player. Anyone else who visits them may be redirected to one of their neighbors.',
  ],
  [
    'executioner',
    'Executioner',
    'traveler',
    'At the start of the game, a random player becomes your execution target. You win if this player is executed. This player will never be the Horror.',
  ],
  [
    'researcher',
    'Researcher',
    'traveler',
    'Once per game, you may declare the role of 3 living players. You win if you are correct about all of them.',
  ],
  [
    'guardian',
    'Guardian',
    'traveler',
    'At the start of the game, a random player becomes your ward. Any time this player is meant to die, you will die in their place. You win if your ward lives to the end of the game.',
  ],
  [
    'banshee',
    'Banshee',
    'minion',
    'If you are executed, every Villager is feared that night.',
  ],
  [
    'basilisk',
    'Basilisk',
    'minion',
    'Every night, visit one player to fear them that night.',
  ],
  [
    'sphinx',
    'Sphinx',
    'minion',
    'Every night, receive a glimpse of every player’s role for the game.',
  ],
  [
    'monster',
    'Monster',
    'demon',
    'Every night after the first, visit one player to kill them that night. If they die, one of their living neighbors is feared the following night.',
  ],
  [
    'wraith',
    'Wraith',
    'demon',
    'Every night after the first, visit one player to kill them that night. You may choose whether or not you are detected visiting this player.',
  ],
].map(([id, name, team, description]) => ({
  id,
  name,
  team: team as Team,
  description,
}));
export const ALL_ROLES: RoleDef[] = [...HMS_ROLES, ...HOF_ROLES];
export const role = (id: string) => ALL_ROLES.find((r) => r.id === id);
export type Phase =
  | 'lobby'
  | 'night'
  | 'discovery'
  | 'discussion'
  | 'nomination'
  | 'defense'
  | 'voting'
  | 'dayReview'
  | 'ended';
export const phaseName: Record<Phase, string> = {
  lobby: 'Gathering the town',
  night: 'Night',
  discovery: 'Discovery',
  discussion: 'Discussion',
  nomination: 'Nominations',
  defense: 'Defense',
  voting: 'Voting',
  dayReview: 'Execution review',
  ended: 'Game ended',
};
export const COUNTS: Record<number, number[]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
  // The official sheet stops at 15 players; Fearville extends it to 18.
  16: [10, 2, 3, 1],
  17: [11, 2, 3, 1],
  18: [11, 2, 4, 1],
};
// Horrors of Fearville role breakdown, in TEAM_ORDER:
// Villagers, Fools, Travelers, Haunts, Horrors.
export const HOF_COUNTS: Record<number, number[]> = {
  5: [3, 0, 0, 1, 1],
  6: [4, 0, 0, 1, 1],
  7: [4, 1, 0, 1, 1],
  8: [5, 1, 0, 1, 1],
  9: [5, 1, 1, 1, 1],
  10: [6, 0, 1, 2, 1],
  11: [6, 1, 1, 2, 1],
  12: [6, 1, 2, 2, 1],
  13: [6, 2, 2, 2, 1],
  14: [7, 2, 2, 2, 1],
  15: [8, 1, 2, 3, 1],
  16: [8, 2, 2, 3, 1],
  17: [9, 2, 2, 3, 1],
  18: [10, 2, 2, 3, 1],
};
export const TEAM_ORDER: Team[] = [
  'townsfolk',
  'outsider',
  'traveler',
  'minion',
  'demon',
];
export const TEAM_NAMES: Record<Team, string> = {
  townsfolk: 'Villagers',
  outsider: 'Fools',
  traveler: 'Travelers',
  minion: 'Haunts',
  demon: 'Horrors',
};
// Standard team sizes for a table, keyed by team. Holy Moon and Stars has no Travelers.
export function standardCounts(
  script: string | undefined,
  players: number,
): Record<Team, number> | null {
  if (script !== 'holyMoonStars') {
    const c = HOF_COUNTS[players];
    return c
      ? {
          townsfolk: c[0],
          outsider: c[1],
          traveler: c[2],
          minion: c[3],
          demon: c[4],
        }
      : null;
  }
  const c = COUNTS[players];
  return c
    ? {
        townsfolk: c[0],
        outsider: c[1],
        traveler: 0,
        minion: c[2],
        demon: c[3],
      }
    : null;
}
export type Player = {
  avatar?: string;
  deathEffect?: import('./cosmetics').DeathEffectId;
  dummy?: boolean;
  departed?: boolean;
  id: string;
  name: string;
  seat: number;
  role: string;
  shown: string;
  alive: boolean;
  publicAlive: boolean;
  ghost: boolean;
  poisoned: boolean;
  protected: boolean;
  master: string;
  used: boolean;
  nightDeath: number;
  notes: string;
  // Holy Moon and Stars status. All optional for compatibility with older saves.
  acts?: string; // character whose night slot this player takes (Lost Soul)
  drunk?: boolean; // permanent malfunction (Dazed, Lost Soul, Moonshiner, Celestial)
  poisonUntil?: number; // poison persists until this night begins
  extraLife?: number;
  executed?: boolean;
  revived?: boolean; // Priest self-revival spent
  misses?: number; // Dreameater wrong guesses
  marked?: boolean; // Grim Reaper mark
  pref?: string; // Fateweaver's preferred redirect
  // Horrors of Fearville status.
  feared?: boolean; // ability malfunctions tonight (like poison)
  fearNight?: number; // carried fear: feared when this night begins
  charge?: string; // Executioner's target or Guardian's ward
};
export type Nomination = {
  id: string;
  by: string;
  target: string;
  votes: Record<string, boolean | null>;
  voterState?: Pick<
    Player,
    'id' | 'alive' | 'ghost' | 'departed' | 'role' | 'poisoned' | 'master'
  >[];
  spentGhosts?: string[];
  threshold: number;
  count?: number;
  invalid?: string[];
};
export type Message = {
  participants?: string[];
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
  kind: 'chat' | 'info' | 'correction';
};
export type Log = { id: string; text: string; at: number; public: boolean };
export type NightChoice = {
  id: string;
  target: string;
  target2: string;
  target3?: string;
  text?: string;
  guesses?: { player: string; role: string }[];
  pass?: boolean;
  flag?: boolean; // optional yes/no (Wraith: stay hidden)
};
export type DeathItem = {
  id: string;
  player: string;
  cause: string;
  // false until the night's death step (Horror kills wait for Spirit/Insomniac)
  ready: boolean;
  night: boolean;
  impaired?: boolean; // the killing ability was drunk or poisoned
  redirected?: boolean; // already moved by a Fateweaver
  by?: string; // killing character (Horrors of Fearville)
  spare?: string; // suggested reason the death does not happen
};
export type DawnChange = {
  id: string;
  kind: 'revive' | 'become';
  player: string;
  role: string;
  by: string;
};
export type Visit = {
  from: string;
  to: string;
  role: string;
  night?: number;
  hidden?: boolean; // a Wraith chose not to be detected
};
export type HmsState = {
  visits: Visit[];
  nightStartDead: string[];
  deathQueue: DeathItem[];
  dawnChanges: DawnChange[];
  constellation?: {
    owner: string;
    members: string[];
    linked: boolean;
  };
  stargazer: Record<string, string>;
  astrologist: Record<string, string[]>;
  infected?: { target: string; by: string; night: number };
  medium?: { medium: string; target: string; night: number };
  channel?: { id: string; a: string; b: string; night: number };
  stRole?: string; // ability granted to the Storyteller by a Zealot
  stNight?: number; // the granted ability acts from the night after this one
  stUsed?: boolean;
  nightmare?: { player: string; bound: string; used: boolean };
  nightmareRedirectTarget?: string;
  prophetReveal?: string[]; // players queued by a Prophet reveal tonight
  questions: Record<string, string>; // Diviner questions this night
  // Horrors of Fearville. All optional so older saves load.
  history?: Visit[]; // every visit this game (Mortician)
  saves?: string[]; // players saved tonight
  wanderer?: { player: string; target: string }; // tonight's Lost Wanderer
  psychic?: Record<string, string>; // Psychic → role type visited last night
  hag?: Record<string, boolean>; // killed Hag → declaration still owed
  vigilante?: { player: string; target: string }; // declaration awaiting ruling
  research?: Record<
    string,
    { guesses: { player: string; role: string }[]; correct: boolean }
  >;
  executed?: string[]; // everyone executed this game (Executioner)
  travelerWins?: string[]; // Travelers who met their win condition
};
export const SCRIPTS = {
  holyMoonStars: 'Holy Moon and Stars',
  horrors: 'Horrors of Fearville',
} as const;
export type RoleScript = keyof typeof SCRIPTS;
export const scriptRoles = (script?: string) =>
  script === 'holyMoonStars' ? HMS_ROLES : HOF_ROLES;
// Horrors of Fearville night orders. Steps that are not characters:
// minioninfo/demoninfo — evil introductions (7+ players)
// fear — Banshee and Monster fear carried from the day or previous night
//        takes effect (automatic, no Storyteller task)
// deaths — resolve queued night deaths
// The Sphinx's glimpse is an automatic popup during the night-choice window.
export const HOF_FIRST = [
  'minioninfo',
  'demoninfo',
  'basilisk',
  'lostwanderer',
  'sheriff',
  'hoflibrarian',
  'teacher',
  'psychic',
  'detective',
  'judge',
  'sphinx',
  'deaths',
];
export const HOF_OTHER = [
  'fear',
  'basilisk',
  'lostwanderer',
  'doctor',
  'monster',
  'wraith',
  'bodyguard',
  'detective',
  'judge',
  'psychic',
  'mortician',
  'sphinx',
  'watchman',
  'deaths',
];
// Holy Moon and Stars night orders. Steps that are not characters:
// minioninfo/demoninfo — evil introductions (7+ players; none with an Atheist)
// plague — resolve last night's Miasma infection before anyone acts
// nightmare — an executed Nightmare binds to a player (once)
// guess — the Constellation's once-per-game guess (never on Night 1)
// deaths — resolve queued Horror and other night deaths after Spirit/Insomniac
export const HMS_FIRST = [
  'minioninfo',
  'demoninfo',
  'constellation',
  'stargazer',
  'astrologist',
  'mystic',
  'astronaut',
  'prophet',
  'diviner',
  'miasma',
  'grimreaper',
  'werewolf',
  'dreameater',
  'spirit',
  'insomniac',
  'deaths',
];
export const HMS_OTHER = [
  'plague',
  'nightmare',
  'medium',
  'gravedigger',
  'priest',
  'necromancer',
  'guess',
  'diviner',
  'miasma',
  'grimreaper',
  'werewolf',
  'dreameater',
  'spirit',
  'insomniac',
  'deaths',
];
export type Notebook = {
  roles: Record<string, number>;
  players: Record<string, { role: string; confidence: string }>;
  text: string;
};
export type Decision = {
  id: string;
  at: number;
  actor: string;
  text: string;
  playerIds?: string[];
  day?: number;
  night?: number;
};
export type SessionRecap = {
  progression?: import('../social/progression.ts').ProgressionSnapshot;
  ranked?: boolean;
  id: string;
  ended: number;
  started?: number;
  number?: number;
  winner: string;
  script: RoleScript;
  players: {
    id: string;
    name: string;
    role: string;
    shown: string;
    roleId?: string;
    team?: Team;
    seat?: number;
    avatar?: string;
    alive?: boolean;
    notebook?: Notebook;
  }[];
  decisions: Decision[];
  messages?: Message[];
  votes?: Record<string, string[]>;
};
export type Game = {
  rite?: import('../rite/types.ts').RiteState;
  ranked?: boolean;
  progression?: import('../social/progression.ts').ProgressionSnapshot;
  deferredNightTasks?: string[];
  sandbox?: boolean;
  gameStartedAt?: number;
  gameEndedAt?: number;
  sessionNumber?: number;
  notebooks?: Record<string, Notebook>;
  mvpVotes?: Record<string, string[]>;
  decisions?: Decision[];
  recaps?: SessionRecap[];
  nightIntroductions?: Record<string, { id: string; text: string }>;
  nightChoiceDeadlines?: Record<string, number>;
  nightChoiceDeadline?: number;
  nightChoiceRound?: string;
  nightChoiceTasks?: {
    key: string;
    role: string;
    player: string;
    name: string;
    done: boolean;
  }[];
  script?: RoleScript;
  nightChoices?: Record<string, NightChoice>;
  hms?: HmsState;
  dawnAnnouncement?: {
    id: string;
    night: number;
    names: string[];
    playerIds?: string[];
  };
  assignmentSeed?: string;
  code: string;
  hostName: string;
  phase: Phase;
  day: number;
  night: number;
  players: Player[];
  timers: Record<string, number>;
  deadline: number | null;
  remaining: number;
  nominationRemaining: number;
  nominees: string[];
  nominators: string[];
  ballots: Nomination[];
  active: Nomination | null;
  done: string[];
  bluffs: string[];
  redHerring: string;
  execution: string;
  winner: string;
  messages: Message[];
  log: Log[];
  history: { id: string; text: string; before: string; at: number }[];
};
export type Actor = { id: string; host: boolean };
export type Command = { action: string; [key: string]: unknown };
export type Option = { value: string; label: string };
export type Field = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'hidden';
  value?: string | number | boolean;
  options?: Option[];
  required?: boolean;
  min?: number;
  max?: number;
  hint?: string;
};
export type Control = {
  action: string;
  title: string;
  description: string;
  fields: Field[];
  danger?: boolean;
};
export const uuid = () => crypto.randomUUID();
export function newPlayer(name: string, seat: number): Player {
  return {
    id: uuid(),
    name,
    seat,
    role: '',
    shown: '',
    alive: true,
    publicAlive: true,
    ghost: true,
    poisoned: false,
    protected: false,
    master: '',
    used: false,
    nightDeath: 0,
    notes: '',
  };
}
export function newGame(code: string, name: string): Game {
  return {
    script: 'horrors',
    assignmentSeed: uuid(),
    decisions: [],
    recaps: [],
    code,
    hostName: name,
    phase: 'lobby',
    day: 0,
    night: 0,
    players: [],
    timers: {
      nightChoice: 60,
      discovery: 180,
      discussion: 120,
      nomination: 60,
      defense: 60,
      voting: 60,
    },
    deadline: null,
    remaining: 0,
    nominationRemaining: 0,
    nominees: [],
    nominators: [],
    ballots: [],
    active: null,
    done: [],
    bluffs: [],
    redHerring: '',
    execution: '',
    winner: '',
    messages: [],
    log: [],
    history: [],
  };
}
