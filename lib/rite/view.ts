import type { Actor, Game } from '../game/types.ts';
import {
  PATTERNS,
  DEFAULT_CONFIG,
  type Block,
  type Vial,
  type Triple,
  type Page,
  type Altar,
} from './types.ts';
export type RitePuzzleView = {
  type: 'board' | 'lab' | 'grid' | 'ritual';
  blocks?: Block[];
  vials?: Vial[];
  phase: 'day' | 'lock' | 'wait' | 'turn' | 'locked' | 'done';
  deadline?: number;
  turn?: string;
  vote?: {
    id: string;
    kind: 'undo' | 'reset';
    deadline: number;
    canVote: boolean;
    answered: boolean;
  };
  voteResult?: { id: string; passed: boolean };
  ruined?: string;
  canUndo?: boolean;
  clues?: {
    id: string;
    hidden: boolean;
    revealNight: number;
    text?: string;
    forged?: boolean;
  }[];
  placements?: Triple[];
  submission?: Triple[];
  book?: Page[];
  altar?: Altar;
  omens?: number[][];
  omensFor?: string;
  keeperFor?: string;
  myOmensHolder?: string;
  myKeeper?: string;
  usedTonight?: boolean;
  result?: boolean;
  performed?: boolean;
  firstAttemptNight?: number;
};
export function riteView(g: Game, a: Actor, now: number) {
  const r = g.rite;
  if (a.host)
    return {
      host: true as const,
      enabled: r?.config.enabled ?? false,
      config: r?.config ?? { ...DEFAULT_CONFIG, enabled: false },
      plans: r?.plans ?? [],
      squads: r?.squads ?? [],
      status: r?.status ?? 'dormant',
      epoch: r?.epoch ?? '',
      lockUntil: r?.lockUntil,
      windowEnd: r?.windowEnd,
      needed: r ? Math.ceil(r.config.threshold * r.squads.length) : 0,
      preparing:
        !!r?.config.enabled &&
        (r.pendingRedeal?.length ||
          (r.status === 'dormant' &&
            r.plans.some(
              (p) =>
                (p.kind === 'board' || p.kind === 'lab') &&
                !r.prepared?.[`${p.id}:${p.kind}:${p.members.length}`],
            ))),
    };
  if (
    !r?.config.enabled ||
    !g.players.some((p) => p.id === a.id && !p.departed)
  )
    return null;
  const s = r.squads.find((s) => s.members.includes(a.id)),
    plan = s ?? r.plans.find((s) => s.members.includes(a.id));
  if (!plan) return null;
  const base = {
    host: false as const,
    enabled: true,
    opensNight: r.config.opensNight,
    redealing: !!r.pendingRedeal?.includes(plan.id),
    status: r.status,
    epoch: r.epoch,
    lockUntil: g.phase === 'night' ? r.lockUntil : undefined,
    windowEnd: g.phase === 'night' ? r.windowEnd : undefined,
    squad: {
      id: plan.id,
      kind: plan.kind,
      title: PATTERNS[plan.kind],
      members: plan.members.map((id) => ({
        id,
        name: g.players.find((p) => p.id === id)?.name ?? 'Player',
      })),
    },
  };
  if (!s || r.pendingRedeal?.includes(s.id)) return { ...base, puzzle: null };
  const state = s.state;
  let phase: RitePuzzleView['phase'] = s.completeNight
    ? 'done'
    : r.status === 'complete'
      ? 'locked'
      : g.phase !== 'night'
        ? 'day'
        : now < (r.lockUntil ?? Infinity)
          ? 'lock'
          : now >= (r.windowEnd ?? -1)
            ? 'locked'
            : 'wait';
  const puzzle: RitePuzzleView = { type: s.kind, phase };
  if (state.type === 'board' || state.type === 'lab') {
    const t = state.turn,
      current = t?.order[t.cursor] === a.id;
    const snapshot = t?.snapshots[a.id];
    if (phase === 'wait')
      phase = current && !t?.vote ? 'turn' : snapshot ? 'locked' : 'wait';
    puzzle.phase = phase;
    const board =
      g.phase !== 'night' || s.completeNight
        ? state.type === 'board'
          ? state.blocks
          : state.vials
        : current
          ? state.type === 'board'
            ? state.blocks
            : state.vials
          : (snapshot ?? state.nightStart ?? state.original);
    if (state.type === 'board')
      puzzle.blocks = structuredClone(board as Block[]);
    else {
      puzzle.vials = structuredClone(board as Vial[]);
      puzzle.canUndo = current && state.history.at(-1)?.night === g.night;
    }
    if (phase === 'turn' && t) {
      puzzle.turn = t.token;
      puzzle.deadline = t.deadline;
    }
    if (t?.vote)
      puzzle.vote = {
        id: t.vote.id,
        kind: t.vote.kind,
        deadline: t.vote.deadline,
        canVote: a.id !== t.vote.caller,
        answered: Object.hasOwn(t.vote.ballots, a.id),
      };
    if (t?.voteResult) puzzle.voteResult = { ...t.voteResult };
    if (t?.ruined) puzzle.ruined = t.ruined;
  } else if (state.type === 'grid') {
    puzzle.phase = phase === 'wait' ? 'turn' : phase;
    puzzle.clues = state.clues
      .filter((c) => c.holder === a.id)
      .map((c) =>
        g.night < c.revealNight
          ? { id: c.id, hidden: true, revealNight: c.revealNight }
          : {
              id: c.id,
              hidden: false,
              revealNight: c.revealNight,
              text: c.text,
              ...(c.forged ? { forged: true } : {}),
            },
      );
    puzzle.placements = structuredClone(state.placements[a.id] ?? []);
    puzzle.submission = structuredClone(state.submissions[a.id] ?? []);
  } else {
    const own = state.rituals[a.id],
      omens = Object.values(state.rituals).find((x) => x.omensHolder === a.id)!,
      keep = Object.values(state.rituals).find((x) => x.keeper === a.id)!;
    const attempt = own.attempts.find((x) => x.night === g.night);
    puzzle.phase =
      phase === 'wait' &&
      g.night >= r.config.ritualFirstNight &&
      !attempt &&
      !own.doneNight
        ? 'turn'
        : phase === 'wait'
          ? 'locked'
          : phase;
    puzzle.book = structuredClone(state.book);
    puzzle.altar = structuredClone(own.altar);
    puzzle.omens = structuredClone(omens.decoys ?? omens.omens);
    puzzle.omensFor = omens.performer;
    puzzle.keeperFor = keep.performer;
    puzzle.myOmensHolder = own.omensHolder;
    puzzle.myKeeper = own.keeper;
    puzzle.usedTonight = !!attempt;
    puzzle.performed = own.doneNight !== undefined;
    puzzle.result = attempt?.ok;
    puzzle.firstAttemptNight = r.config.ritualFirstNight;
  }
  return { ...base, puzzle };
}
export type RiteView = ReturnType<typeof riteView>;
