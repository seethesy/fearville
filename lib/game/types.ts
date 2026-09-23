export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export const ROLES = [
  [
    'washerwoman',
    'Washerwoman',
    'townsfolk',
    'On the first night, learn a Townsfolk character held by one of two players.',
  ],
  [
    'librarian',
    'Librarian',
    'townsfolk',
    'On the first night, learn an Outsider character held by one of two players, or learn that no Outsiders are in play.',
  ],
  [
    'investigator',
    'Investigator',
    'townsfolk',
    'On the first night, learn a Minion character held by one of two players.',
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
    'Each night, check two players for a Demon. One good player is a permanent false positive.',
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
    'After the first night, choose someone other than yourself to protect from the Demon that night.',
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
    'Your first nomination consumes your ability. If the nominator is a Townsfolk, they are executed immediately.',
  ],
  [
    'slayer',
    'Slayer',
    'townsfolk',
    'Once, during the day, publicly choose someone. If they register as the Demon, they die.',
  ],
  [
    'soldier',
    'Soldier',
    'townsfolk',
    'While healthy, you are safe from the Demon.',
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
    'You are shown an out-of-play Townsfolk character and act as that character, but its ability has no effect.',
  ],
  [
    'recluse',
    'Recluse',
    'outsider',
    'You may register as evil or as a Minion or Demon, even while dead.',
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
    'Each night, inspect the full game state. You may register as good or as a Townsfolk or Outsider.',
  ],
  [
    'scarletwoman',
    'Scarlet Woman',
    'minion',
    'If the Demon dies with at least five players alive just before death, you become the Demon.',
  ],
  [
    'baron',
    'Baron',
    'minion',
    'During setup, replace two Townsfolk with two additional Outsiders.',
  ],
  [
    'imp',
    'Imp',
    'demon',
    'After the first night, choose someone to kill. Killing yourself passes the Imp to a living Minion.',
  ],
].map(([id, name, team, description]) => ({
  id,
  name,
  team: team as Team,
  description,
}));
export const role = (id: string) => ROLES.find((r) => r.id === id);
// Official TPI nightsheet, filtered to Trouble Brewing (verified 2026-09-08).
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
};
export type Nomination = {
  id: string;
  by: string;
  target: string;
  votes: Record<string, boolean>;
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
export type Game = {
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
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
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
    code,
    hostName: name,
    phase: 'lobby',
    day: 0,
    night: 0,
    players: [],
    timers: {
      discovery: 300,
      discussion: 180,
      nomination: 180,
      defense: 45,
      voting: 30,
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
