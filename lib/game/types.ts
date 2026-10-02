export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export const ROLES = [
  [
    'washerwoman',
    'Washerwoman',
    'townsfolk',
    'On the first night, learn a Villager character held by one of two players.',
  ],
  [
    'librarian',
    'Librarian',
    'townsfolk',
    'On the first night, learn an Fool character held by one of two players, or learn that no Fools are in play.',
  ],
  [
    'investigator',
    'Investigator',
    'townsfolk',
    'On the first night, learn a Haunt character held by one of two players.',
  ],
  [
    'chef',
    'Chef',
    'townsfolk',
    'On the first night, learn the number of adjacent evil pairs around the table.',
  ],
  [
    'empath',
    'Empath',
    'townsfolk',
    'Each night, learn how many of your nearest living neighbors are evil.',
  ],
  [
    'fortuneteller',
    'Fortune Teller',
    'townsfolk',
    'Each night, check two players for a Horror. One good player is a permanent false positive.',
  ],
  [
    'undertaker',
    'Undertaker',
    'townsfolk',
    'After an execution that caused death, learn the executed character that night.',
  ],
  [
    'monk',
    'Monk',
    'townsfolk',
    'After the first night, choose someone other than yourself to protect from the Horror that night.',
  ],
  [
    'ravenkeeper',
    'Ravenkeeper',
    'townsfolk',
    'If you die at night, choose someone and learn their character.',
  ],
  [
    'virgin',
    'Virgin',
    'townsfolk',
    'Your first nomination consumes your ability. If the nominator is a Villager, they are executed immediately.',
  ],
  [
    'slayer',
    'Slayer',
    'townsfolk',
    'Once, during the day, publicly choose someone. If they register as the Horror, they die.',
  ],
  [
    'soldier',
    'Soldier',
    'townsfolk',
    'While healthy, you are safe from the Horror.',
  ],
  [
    'mayor',
    'Mayor',
    'townsfolk',
    'Good can win with three living players and no execution. A night attack on you may be redirected.',
  ],
  [
    'butler',
    'Butler',
    'outsider',
    'Choose a master each night. While alive, your yes vote requires your master to vote yes.',
  ],
  [
    'drunk',
    'Drunk',
    'outsider',
    'You are shown an out-of-play Villager character and act as that character, but its ability has no effect.',
  ],
  [
    'recluse',
    'Recluse',
    'outsider',
    'You may register as evil or as a Haunt or Horror, even while dead.',
  ],
  [
    'saint',
    'Saint',
    'outsider',
    'If your ability works when you die by execution, evil wins.',
  ],
  [
    'poisoner',
    'Poisoner',
    'minion',
    'Choose someone each night to disable their ability until the next dusk without telling them.',
  ],
  [
    'spy',
    'Spy',
    'minion',
    'Each night, inspect the full game state. You may register as good or as a Villager or Fool.',
  ],
  [
    'scarletwoman',
    'Scarlet Woman',
    'minion',
    'If the Horror dies with at least five players alive just before death, you become the Horror.',
  ],
  [
    'baron',
    'Baron',
    'minion',
    'During setup, replace two Villagers with two additional Fools.',
  ],
  [
    'imp',
    'Imp',
    'demon',
    'After the first night, choose someone to kill. Killing yourself passes the Imp to a living Haunt.',
  ],
].map(([id, name, team, description]) => ({
  id,
  name,
  team: team as Team,
  description,
}));
export type RoleDef = (typeof ROLES)[number];
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
export const ALL_ROLES: RoleDef[] = [...ROLES, ...HMS_ROLES];
export const role = (id: string) => ALL_ROLES.find((r) => r.id === id);
// Official TPI nightsheet, filtered to Fearville Classic (verified 2026-09-08).
export const FIRST = [
  'minioninfo',
  'demoninfo',
  'poisoner',
  'washerwoman',
  'librarian',
  'investigator',
  'chef',
  'empath',
  'fortuneteller',
  'butler',
  'spy',
];
export const OTHER = [
  'poisoner',
  'monk',
  'imp',
  'ravenkeeper',
  'empath',
  'fortuneteller',
  'undertaker',
  'butler',
  'spy',
];
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
};
export type Player = {
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
  // Holy Moon and Stars status. All optional so saved Classic games load.
  acts?: string; // character whose night slot this player takes (Lost Soul)
  drunk?: boolean; // permanent malfunction (Dazed, Lost Soul, Moonshiner, Celestial)
  poisonUntil?: number; // poison persists until this night begins
  extraLife?: number;
  executed?: boolean;
  revived?: boolean; // Priest self-revival spent
  misses?: number; // Dreameater wrong guesses
  marked?: boolean; // Grim Reaper mark
  pref?: string; // Fateweaver's preferred redirect
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
  virginFirst?: boolean;
};
export type Message = {
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
};
export type DawnChange = {
  id: string;
  kind: 'revive' | 'become';
  player: string;
  role: string;
  by: string;
};
export type HmsState = {
  visits: { from: string; to: string; role: string }[];
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
};
export const SCRIPTS = {
  classic: 'Fearville Classic',
  holyMoonStars: 'Holy Moon and Stars',
} as const;
export type RoleScript = keyof typeof SCRIPTS;
export const scriptRoles = (script?: string) =>
  script === 'holyMoonStars' ? HMS_ROLES : ROLES;
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
export type Game = {
  deferredNightTasks?: string[];
  sandbox?: boolean;
  gameStartedAt?: number;
  decisions?: { id: string; at: number; actor: string; text: string }[];
  recaps?: {
    id: string;
    ended: number;
    winner: string;
    script: RoleScript;
    players: { id: string; name: string; role: string; shown: string }[];
    decisions: { id: string; at: number; actor: string; text: string }[];
  }[];
  nightIntroductions?: Record<string, { id: string; text: string }>;
  nightChoiceDeadlines?: Record<string, number>;
  nightChoiceDeadline?: number;
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
  dawnAnnouncement?: { id: string; night: number; names: string[] };
  assignmentSeed?: string;
  nightPoll?: {
    id: string;
    night: number;
    question: string;
    answers: Record<string, string>;
  };
  previousNightPoll?: { night: number; question: string; winners: string[] };
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
