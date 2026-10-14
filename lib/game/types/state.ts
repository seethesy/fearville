import { type Team } from './roles.ts';
import { type RoleScript } from './setup.ts';
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
export type Player = {
  avatar?: string;
  deathEffect?: import('../cosmetics').DeathEffectId;
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
  fearTarget?: string; // Monster's choice of a neighbor to fear if their victim dies
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
  monsterFear?: string; // Monster's chosen neighbor, applied only if target dies
  bodyguard?: { player: string; decision?: boolean }; // offer after a confirmed fatal outcome
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
  progression?: import('../../social/progression.ts').ProgressionSnapshot;
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
  roleDistribution?: Record<Team, number>;
  rite?: import('../../rite/types.ts').RiteState;
  ranked?: boolean;
  progression?: import('../../social/progression.ts').ProgressionSnapshot;
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
export type Actor = { id: string; host: boolean; credentialHash?: string };
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
