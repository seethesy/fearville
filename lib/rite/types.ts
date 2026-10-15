import { GENERATOR_STYLE } from './generator-config.ts';
export const PATTERNS = {
  board: 'Escape Fearville',
  grid: 'The Sphinx’s Riddles',
  ritual: 'Ritual of Divination',
  lab: 'Alchemist’s Laboratory',
} as const;
export type Pattern = keyof typeof PATTERNS;
export type RiteConfig = {
  timed?: boolean;
  enabled: boolean;
  patterns: Pattern[];
  opensNight: number;
  threshold: number;
  lockSeconds: number;
  windowSeconds: number;
  ritualFirstNight: number;
  forgedPerEvil: number;
  notifyCompletion: boolean;
};
export const DEFAULT_CONFIG: RiteConfig = {
  timed: false,
  enabled: true,
  patterns: ['board', 'grid', 'ritual', 'lab'],
  opensNight: 2,
  threshold: 0.5,
  lockSeconds: GENERATOR_STYLE.timing.lockSeconds,
  windowSeconds: GENERATOR_STYLE.timing.windowSeconds,
  ritualFirstNight: 3,
  forgedPerEvil: 1,
  notifyCompletion: true,
};
export type Block = {
  id: string;
  kind: 'carriage' | 'wood' | 'crates' | 'car' | 'tree' | 'brick' | 'coach';
  x: number;
  y: number;
  len: 2 | 3;
  horiz: boolean;
  key?: boolean;
};
export type Vial = { id: string; shape: number; layers: number[] };
export type Triple = { character: number; location: number; activity: number };
export type Fact = {
  a: 'character' | 'location' | 'activity';
  x: number;
  b: 'character' | 'location' | 'activity';
  ys: number[];
  not?: boolean;
};
// Entities of The Sphinx's Riddles. Locations stand in LOCATIONS order along
// one street, west (0) to east (4), which relational clues refer to.
export type Ent = { cat: 'character' | 'location' | 'activity'; id: number };
export type Logic =
  | { t: 'is' | 'not'; a: Ent; b: Ent }
  | { t: 'oneOf' | 'none'; a: Ent; bs: Ent[] }
  | { t: 'set'; as: Ent[]; bs: Ent[] }
  | { t: 'distinct'; es: Ent[] }
  | { t: 'and' | 'xor' | 'if'; p: Logic; q: Logic }
  | {
      t: 'rel';
      a: Ent;
      b: Ent;
      r: 'next' | 'apart' | 'west' | 'westBy' | 'gap';
      n?: number;
    }
  | { t: 'at'; a: Ent; ps: number[] };
export type Clue = {
  id: string;
  // Legacy clue cards (games dealt before the varied riddles) carry facts.
  facts?: Fact[];
  logic?: Logic;
  pattern?: string;
  text: string;
  holder: string;
  revealNight: number;
  forged?: boolean;
};
export type ControlName =
  | 'candles'
  | 'offerings'
  | 'chalice'
  | 'dial'
  | 'incense';
export type Altar = { control: ControlName; value: number }[];
export type Page = {
  control: ControlName;
  entries: { symbols: number[]; value: number }[];
};
export type Ritual = {
  performer: string;
  omensHolder: string;
  keeper: string;
  controls: ControlName[];
  target: Altar;
  altar: Altar;
  omens: number[][];
  decoys?: number[][];
  attempts: { night: number; ok: boolean }[];
  doneNight?: number;
};
export type Turn = {
  order: string[];
  cursor: number;
  start: number;
  deadline: number;
  snapshots: Record<string, Block[] | Vial[]>;
  log: { player: string; at: number; kind: string; detail?: string }[];
  token: string;
  vote?: {
    id: string;
    kind: 'undo' | 'reset';
    caller: string;
    deadline: number;
    ballots: Record<string, boolean>;
  };
  voteResult?: { id: string; passed: boolean };
  ruined?: string;
};
export type BoardState = {
  type: 'board';
  blocks: Block[];
  original: Block[];
  nightStart?: Block[];
  par: number;
  distance?: number | null;
  solved: boolean;
  turn?: Turn;
};
export type LabState = {
  type: 'lab';
  vials: Vial[];
  original: Vial[];
  nightStart: Vial[];
  par: number;
  distance?: number | null;
  solved: boolean;
  history: { night: number; before: Vial[]; from: string; to: string }[];
  turn?: Turn;
};
export type GridState = {
  type: 'grid';
  solution: Triple[];
  clues: Clue[];
  placements: Record<string, Triple[]>;
  submissions: Record<string, Triple[]>;
};
export type RitualState = {
  type: 'ritual';
  book: Page[];
  rituals: Record<string, Ritual>;
};
export type Squad = {
  id: string;
  kind: Pattern;
  members: string[];
  completeNight?: number;
  state: BoardState | LabState | GridState | RitualState;
};
export type Plan = { id: string; kind: Pattern; members: string[] };
export type RiteState = {
  config: RiteConfig;
  seed: string;
  epoch: string;
  status: 'dormant' | 'open' | 'complete';
  plans: Plan[];
  squads: Squad[];
  prepared?: Record<string, BoardState | LabState>;
  preparing?: Record<string, number>;
  pendingRedeal?: string[];
  timerless?: boolean;
  lockUntil?: number;
  windowEnd?: number;
  resolvedNight: number;
  completedNight?: number;
  infoNight?: number;
  refreshPlayers?: string[];
  rewardApplied?: boolean;
};
