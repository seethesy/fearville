import { role, uuid, type Game } from '../../game/types.ts';
import {
  type Plan,
  type Squad,
  type BoardState,
  type LabState,
  type Block,
  type Vial,
} from '../types.ts';
import { rng, shuffle } from '../random.ts';
import { solveLab } from '../lab.ts';
import { generateGrid } from '../grid.ts';
import { generateRitual } from '../ritual.ts';
import { check, riteSetupCheck } from './setup.ts';
export function deal(g: Game, plan: Plan): Squad {
  const r = g.rite!,
    seed = `${r.seed}:${plan.id}`,
    evil = plan.members.filter((id) =>
      ['minion', 'demon'].includes(
        role(g.players.find((p) => p.id === id)?.role ?? '')?.team ?? '',
      ),
    );
  const state =
    plan.kind === 'board' || plan.kind === 'lab'
      ? r.prepared?.[`${plan.id}:${plan.kind}:${plan.members.length}`]
      : plan.kind === 'grid'
        ? generateGrid(
            seed,
            plan.members,
            evil,
            r.config.opensNight,
            r.config.forgedPerEvil,
          )
        : generateRitual(seed, plan.members, evil);
  check(
    state,
    'The puzzles are still preparing. Keep the table open, then try again.',
  );
  return { ...plan, state: structuredClone(state) };
}
export function beginRiteNight(g: Game, at: number) {
  const r = g.rite;
  if (
    !r?.config.enabled ||
    r.status === 'complete' ||
    g.night < r.config.opensNight
  )
    return;
  if (r.status === 'dormant') {
    riteSetupCheck(g);
    r.squads = r.plans.map((p) => deal(g, p));
    r.status = 'open';
  }
  r.timerless = !r.config.timed || !!g.sandbox;
  if (r.timerless) {
    delete r.lockUntil;
    delete r.windowEnd;
  } else {
    r.lockUntil = at + r.config.lockSeconds * 1000;
    r.windowEnd = r.lockUntil + r.config.windowSeconds * 1000;
  }
  for (const s of r.squads) {
    if (s.completeNight || (s.state.type !== 'board' && s.state.type !== 'lab'))
      continue;
    if (s.state.type === 'lab')
      s.state.nightStart = structuredClone(s.state.vials);
    else s.state.nightStart = structuredClone(s.state.blocks);
    const order = shuffle(s.members, rng(`${r.seed}:${s.id}:${g.night}`));
    s.state.turn = {
      order,
      cursor: 0,
      start: r.lockUntil ?? at,
      deadline: r.timerless ? 0 : (r.lockUntil ?? at) + 5000,
      snapshots: {},
      log: [],
      token: uuid(),
    };
  }
}
export function boardOf(s: BoardState | LabState): Block[] | Vial[] {
  return s.type === 'board' ? s.blocks : s.vials;
}
export function turnPlayer(t: NonNullable<BoardState['turn']>) {
  return t.order[t.cursor % t.order.length];
}
export function nextTurn(s: Squad, at: number, kind: string, detail?: string) {
  const state = s.state as BoardState | LabState,
    t = state.turn!;
  const player = turnPlayer(t);
  if (!player) return;
  t.snapshots[player] = structuredClone(boardOf(state));
  t.log.push({ player, at, kind, detail });
  t.cursor = (t.cursor + 1) % t.order.length;
  t.token = uuid();
  t.start = at;
  t.deadline = t.deadline > 0 ? at + 5000 : 0;
}
export function recordMove(s: Squad, at: number, kind: string, detail: string) {
  const t = (s.state as BoardState | LabState).turn!;
  t.log.push({ player: turnPlayer(t), at, kind, detail });
  // Invalidate a duplicate request while keeping this player's timed turn.
  t.token = uuid();
}
export function finishVote(s: Squad, at: number) {
  const state = s.state as LabState,
    t = state.turn!,
    vote = t.vote!;
  const passed = s.members
    .filter((id) => id !== vote.caller)
    .every((id) => vote.ballots[id] === true);
  if (passed) {
    if (vote.kind === 'reset') {
      state.vials = structuredClone(state.original);
      state.history = [];
    } else {
      const last = state.history.pop();
      if (last) state.vials = last.before;
    }
    state.distance =
      solveLab(state.vials, 1500, performance.now() + 4)?.length ?? null;
  }
  t.voteResult = { id: vote.id, passed };
  delete t.vote;
  nextTurn(s, at, 'vote', passed ? 'passed' : 'failed');
}
