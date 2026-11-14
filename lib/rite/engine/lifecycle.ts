import { uuid, type Game } from '../../game/types.ts';
import { rng, shuffle } from '../random.ts';
import { preparedPuzzle } from '../bank.ts';
import { sameSolution } from '../grid.ts';
import { check } from './setup.ts';
import { finishVote, nextTurn } from './night.ts';
export function tickRite(g: Game, now: number) {
  const r = g.rite;
  let changed = false;
  // Existing sessions may still carry turn and window deadlines from the
  // former timed Rite. Migrate them once so a live puzzle reopens immediately.
  if (
    r?.status === 'open' &&
    g.phase === 'night' &&
    !r.timerless &&
    !r.config.timed
  ) {
    r.timerless = true;
    delete r.lockUntil;
    delete r.windowEnd;
    for (const squad of r.squads)
      if (squad.state.type === 'board' || squad.state.type === 'lab') {
        if (squad.state.turn) {
          squad.state.turn.deadline = 0;
          if (squad.state.turn.vote) squad.state.turn.vote.deadline = 0;
        }
      }
    changed = true;
  }
  if (
    r?.status === 'open' &&
    g.phase === 'night' &&
    r.config.timed &&
    !g.sandbox
  ) {
    const through = Math.min(now, r.windowEnd ?? now);
    for (const squad of r.squads) {
      if (
        squad.completeNight ||
        (squad.state.type !== 'board' && squad.state.type !== 'lab') ||
        squad.state.solved
      )
        continue;
      const turn = squad.state.turn;
      if (!turn) continue;
      if (
        turn.vote &&
        turn.vote.deadline > 0 &&
        turn.vote.deadline <= through
      ) {
        finishVote(squad, turn.vote.deadline);
        changed = true;
      }
      // A timed window is at most 300 seconds, so bounded catch-up covers all
      // missed turns without a poll or an unbounded loop after an outage.
      for (
        let n = 0;
        n < 100 && !turn.vote && turn.deadline > 0 && turn.deadline <= through;
        n++
      ) {
        nextTurn(squad, turn.deadline, 'timeout');
        changed = true;
      }
      if (turn.vote && r.windowEnd !== undefined && now >= r.windowEnd) {
        finishVote(squad, r.windowEnd);
        changed = true;
      }
    }
  }
  if (
    r?.config.enabled &&
    (r.status === 'dormant' || r.pendingRedeal?.length) &&
    r.plans.length
  ) {
    // Select from puzzles certified offline. Refreshes never run generators.
    r.prepared ??= {};
    r.preparing ??= {};
    for (const plan of r.plans.filter(
      (p) =>
        (p.kind === 'board' || p.kind === 'lab') &&
        (r.status === 'dormant' || r.pendingRedeal?.includes(p.id)),
    )) {
      const key = `${plan.id}:${plan.kind}:${plan.members.length}`;
      if (r.prepared[key]) continue;
      const candidate = preparedPuzzle(
        plan.kind as 'board' | 'lab',
        `${r.seed}:${plan.id}`,
        r.generation?.settings.profiles[r.generation.settings.nightDifficulty][
          plan.kind as 'board' | 'lab'
        ],
      );
      changed = true;
      r.prepared[key] = candidate;
      delete r.preparing[key];
      if (r.pendingRedeal?.includes(plan.id)) {
        const s = r.squads.find((s) => s.id === plan.id)!;
        delete s.completeNight;
        r.pendingRedeal = r.pendingRedeal.filter((id) => id !== plan.id);
        if (g.phase === 'night') {
          candidate.turn = {
            order: shuffle(s.members, rng(`${r.seed}:${s.id}:${g.night}`)),
            cursor: 0,
            start: now,
            deadline:
              r.timerless || g.sandbox
                ? 0
                : Math.max(now, r.lockUntil ?? now) + 5000,
            snapshots: {},
            log: [],
            token: uuid(),
          };
        }
        s.state = structuredClone(candidate);
      }
    }
  }
  return changed;
}
export function riteReady(g: Game, now: number) {
  const r = g.rite;
  if (!r?.config.enabled || r.status !== 'open') return true;
  return (
    !r.pendingRedeal?.length &&
    (r.timerless || r.windowEnd === undefined || now >= r.windowEnd)
  );
}
export function resolveRite(g: Game, now: number, force = false) {
  const r = g.rite;
  if (!r?.config.enabled || r.status !== 'open' || r.resolvedNight >= g.night)
    return;
  check(force || riteReady(g, now), 'The Night Rite window is still open.');
  for (const s of r.squads) {
    if (s.completeNight) continue;
    const state = s.state;
    const done =
      state.type === 'board' || state.type === 'lab'
        ? state.solved
        : state.type === 'grid'
          ? s.members.filter((id) =>
              sameSolution(state.submissions[id] ?? [], state.solution),
            ).length >
            s.members.length / 2
          : Object.values(state.rituals).filter(
              (x) => x.doneNight !== undefined,
            ).length >= 2;
    if (done) {
      s.completeNight = g.night;
      if (r.config.notifyCompletion)
        for (const id of s.members)
          g.messages.push({
            id: uuid(),
            from: 'host',
            to: id,
            text: 'Your vigil’s puzzle is complete.',
            at: now,
            kind: 'info',
          });
    }
  }
  r.resolvedNight = g.night;
  if (
    r.squads.filter((s) => s.completeNight).length <
    Math.ceil(r.config.threshold * r.squads.length)
  )
    return;
  r.status = 'complete';
  r.completedNight = g.night;
  if (!r.rewardApplied) {
    g.players.forEach((p) => (p.used = false));
    if (g.hms?.nightmare) g.hms.nightmare.used = false;
    if (g.hms) g.hms.stUsed = false;
    r.infoNight = g.night + 1;
    r.refreshPlayers = g.players.filter((p) => !p.departed).map((p) => p.id);
    r.rewardApplied = true;
    g.log.push({
      id: uuid(),
      text: 'The Rite is complete.',
      at: now,
      public: true,
    });
  }
}
export function riteDeadlines(g: Game) {
  const r = g.rite;
  if (
    g.sandbox ||
    g.phase !== 'night' ||
    !r?.config.enabled ||
    r.status !== 'open' ||
    r.timerless
  )
    return [];
  const times: number[] = [r.lockUntil ?? 0, r.windowEnd ?? 0];
  for (const squad of r.squads) {
    if (
      squad.completeNight ||
      (squad.state.type !== 'board' && squad.state.type !== 'lab') ||
      squad.state.solved
    )
      continue;
    const t = squad.state.turn;
    const deadline = t?.vote?.deadline ?? t?.deadline ?? 0;
    if (r.windowEnd === undefined || deadline <= r.windowEnd)
      times.push(deadline);
  }
  return times;
}
