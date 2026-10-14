import { type Game } from '../types.ts';
import { requireThat, log, nameOf } from './shared.ts';
import { snapshot, setPhase } from './lifecycle.ts';
export function candidate(g: Game) {
  const eligible = g.ballots.filter(
    (b) => b.count !== undefined && b.count >= b.threshold,
  );
  const max = Math.max(0, ...eligible.map((b) => b.count!));
  const top = eligible.filter((b) => b.count === max);
  return {
    target: top.length === 1 ? top[0].target : '',
    count: max,
    tied: top.length > 1,
  };
}
export function eligibleVoters(g: Game) {
  return g.players.filter(
    (p) => p.id !== g.active?.target && !p.departed && (p.alive || p.ghost),
  );
}
export function finishVotingIfReady(g: Game, at: number) {
  if (g.phase !== 'voting' || !g.active) return false;
  if (!eligibleVoters(g).every((p) => Object.hasOwn(g.active!.votes, p.id)))
    return false;
  snapshot(g, 'All eligible votes received', at);
  tally(g, at);
  return true;
}
export function tally(g: Game, at: number) {
  const b = g.active;
  requireThat(b, 'No active ballot.');
  b.voterState = g.players.map(
    ({ id, alive, ghost, departed, role, poisoned, master }) => ({
      id,
      alive,
      ghost,
      departed,
      role,
      poisoned,
      master,
    }),
  );
  for (const p of eligibleVoters(g))
    if (!Object.hasOwn(b.votes, p.id)) b.votes[p.id] = null;
  b.invalid = [];
  b.spentGhosts = [];
  b.threshold = Math.ceil(g.players.filter((p) => p.alive).length / 2);
  const valid = new Set(
    g.players
      .filter(
        (p) =>
          p.id !== b.target &&
          !p.departed &&
          b.votes[p.id] === true &&
          (p.alive || p.ghost),
      )
      .map((p) => p.id),
  );
  b.count = valid.size;
  for (const p of g.players) {
    if (!p.alive && valid.has(p.id)) {
      p.ghost = false;
      b.spentGhosts.push(p.id);
    }
  }
  g.ballots.push(b);
  g.active = null;
  log(
    g,
    `${nameOf(g, b.target)} received ${b.count} yes votes (threshold ${b.threshold}).`,
    at,
    true,
  );
  g.nominationRemaining += 30;
  setPhase(g, 'nomination', at, g.nominationRemaining);
  if (g.nominationRemaining <= 0) setPhase(g, 'dayReview', at);
}
