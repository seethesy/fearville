import {
  role,
  uuid,
  type Actor,
  type Command,
  type Game,
} from '../game/types.ts';
import {
  DEFAULT_CONFIG,
  PATTERNS,
  type Pattern,
  type Plan,
  type RiteConfig,
  type Squad,
  type BoardState,
  type LabState,
  type Block,
  type Vial,
} from './types.ts';
import { rng, shuffle } from './random.ts';
import { boardCandidate, slide, boardSolved, solveBoard } from './board.ts';
import { labCandidate, pour, labSolved, solveLab } from './lab.ts';
import {
  generateGrid,
  validTriples,
  validPlacements,
  sameSolution,
} from './grid.ts';
import { generateRitual, validAltar } from './ritual.ts';
const check: (ok: unknown, message: string) => asserts ok = (ok, message) => {
  if (!ok) throw Error(message);
};
export function planVigils(
  ids: string[],
  patterns: Pattern[],
  seed: string,
): Plan[] {
  check(
    ids.length >= 2 && patterns.length,
    'Choose at least one puzzle and two players.',
  );
  const onlyRitual = patterns.every((p) => p === 'ritual');
  check(
    !onlyRitual || ids.length % 3 === 0,
    'Divination-only games need a player count divisible by three.',
  );
  const count = Math.max(1, Math.round(ids.length / 3)),
    size = Math.floor(ids.length / count),
    extra = ids.length % count;
  const random = rng(seed),
    players = shuffle(ids, random),
    kinds = shuffle(patterns, random);
  let cursor = 0;
  return Array.from({ length: count }, (_, i) => {
    const n = size + Number(i < extra),
      eligible = kinds.filter((k) => k !== 'ritual' || n === 3);
    check(
      eligible.length,
      'These team sizes need another enabled puzzle pattern.',
    );
    return {
      id: `vigil-${i + 1}`,
      kind: eligible[i % eligible.length],
      members: players.slice(cursor, (cursor += n)),
    };
  });
}
export function validatePlans(
  plans: Plan[],
  ids: string[],
  config: RiteConfig,
) {
  check(
    Array.isArray(plans) && plans.length > 0 && plans.length <= 9,
    'Choose valid vigils.',
  );
  const assigned = plans.flatMap((p) => p.members ?? []);
  check(
    assigned.length === ids.length &&
      new Set(assigned).size === ids.length &&
      assigned.every((id) => ids.includes(id)),
    'Every player must belong to exactly one vigil.',
  );
  check(
    new Set(plans.map((p) => p.id)).size === plans.length &&
      plans.every(
        (p) =>
          typeof p.id === 'string' &&
          p.id.length <= 50 &&
          config.patterns.includes(p.kind) &&
          p.members.length >= 2 &&
          p.members.length <= 4 &&
          (p.kind !== 'ritual' || p.members.length === 3),
      ),
    'Use enabled patterns and teams of 2–4; Divination requires three.',
  );
  const sizes = plans.map((p) => p.members.length);
  check(
    Math.max(...sizes) - Math.min(...sizes) <= 1,
    'Vigil sizes must be as equal as possible.',
  );
}
function configOf(value: unknown): RiteConfig {
  const c = { ...DEFAULT_CONFIG, ...(value as Partial<RiteConfig>) };
  check(
    typeof c.enabled === 'boolean' && typeof c.notifyCompletion === 'boolean',
    'Choose valid Rite settings.',
  );
  check(
    Array.isArray(c.patterns) &&
      c.patterns.length > 0 &&
      new Set(c.patterns).size === c.patterns.length &&
      c.patterns.every((p) => Object.hasOwn(PATTERNS, p)),
    'Enable at least one puzzle pattern.',
  );
  for (const [v, lo, hi] of [
    [c.opensNight, 2, 20],
    [c.lockSeconds, 0, 120],
    [c.windowSeconds, 60, 300],
    [c.ritualFirstNight, 2, 20],
    [c.forgedPerEvil, 0, 4],
  ])
    check(
      Number.isInteger(v) && v >= lo && v <= hi,
      'Choose valid Rite timing and clue settings.',
    );
  check(
    Number.isFinite(c.threshold) && c.threshold > 0 && c.threshold <= 1,
    'Completion threshold must be between 1% and 100%.',
  );
  // Return an allowlist, so arbitrary input cannot persist secret/client fields.
  return {
    enabled: c.enabled,
    patterns: c.patterns,
    opensNight: c.opensNight,
    threshold: c.threshold,
    lockSeconds: c.lockSeconds,
    windowSeconds: c.windowSeconds,
    ritualFirstNight: c.ritualFirstNight,
    forgedPerEvil: c.forgedPerEvil,
    notifyCompletion: c.notifyCompletion,
  };
}
export function configureRite(g: Game, c: Command) {
  check(
    g.phase === 'lobby' ||
      (g.rite?.status === 'dormant' &&
        g.night < (g.rite?.config.opensNight ?? 2)),
    'Configure the Rite before it opens.',
  );
  const config = configOf(c.config),
    seed = c.redeal || !g.rite ? uuid() : g.rite.seed;
  const ids = g.players.filter((p) => !p.departed).map((p) => p.id);
  const plans = c.plans
    ? structuredClone(c.plans as Plan[])
    : config.enabled && ids.length >= 2
      ? planVigils(ids, config.patterns, seed)
      : [];
  if (config.enabled && ids.length >= 2) validatePlans(plans, ids, config);
  g.rite = {
    config,
    seed,
    epoch: uuid(),
    plans,
    squads: [],
    status: 'dormant',
    resolvedNight: 0,
  };
  return 'Night Rite setup saved.';
}
export function riteSetupCheck(g: Game) {
  const r = g.rite;
  if (!r?.config.enabled) return;
  const ids = g.players.filter((p) => !p.departed).map((p) => p.id);
  if (
    !r.plans.length ||
    r.plans.flatMap((p) => p.members).some((id) => !ids.includes(id)) ||
    r.plans.flatMap((p) => p.members).length !== ids.length
  )
    r.plans = planVigils(ids, r.config.patterns, r.seed);
  validatePlans(r.plans, ids, r.config);
}
function deal(g: Game, plan: Plan): Squad {
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
  return { ...plan, state };
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
  r.lockUntil = at + r.config.lockSeconds * 1000;
  r.windowEnd = r.lockUntil + r.config.windowSeconds * 1000;
  g.nightChoiceDeadline = Math.min(
    g.nightChoiceDeadline ?? Infinity,
    r.lockUntil,
  );
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
      start: r.lockUntil,
      deadline: r.lockUntil + (s.kind === 'board' ? 5000 : 8000),
      snapshots: {},
      log: [],
      token: uuid(),
    };
  }
}
function boardOf(s: BoardState | LabState): Block[] | Vial[] {
  return s.type === 'board' ? s.blocks : s.vials;
}
function nextTurn(s: Squad, at: number, kind: string, detail?: string) {
  const state = s.state as BoardState | LabState,
    t = state.turn!;
  const player = t.order[t.cursor];
  if (!player) return;
  t.snapshots[player] = structuredClone(boardOf(state));
  t.log.push({ player, at, kind, detail });
  t.cursor++;
  t.token = uuid();
  t.start = at;
  t.deadline = at + (s.kind === 'board' ? 5000 : 8000);
  if (state.solved) t.cursor = t.order.length;
}
function finishVote(s: Squad, at: number) {
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
    state.distance = solveLab(state.vials, 25000)?.length ?? null;
  }
  t.voteResult = { id: vote.id, passed };
  delete t.vote;
  nextTurn(s, at, 'vote', passed ? 'passed' : 'failed');
}
export function tickRite(g: Game, now: number) {
  const r = g.rite;
  let changed = false;
  if (
    r?.config.enabled &&
    (r.status === 'dormant' || r.pendingRedeal?.length) &&
    r.plans.length
  ) {
    // Preparation is resumable and runs in small request budgets, rather than
    // spending several seconds of Worker CPU at the night-2 transition.
    const until = performance.now() + 60;
    r.prepared ??= {};
    r.preparing ??= {};
    for (const plan of r.plans.filter(
      (p) =>
        (p.kind === 'board' || p.kind === 'lab') &&
        (r.status === 'dormant' || r.pendingRedeal?.includes(p.id)),
    )) {
      const key = `${plan.id}:${plan.kind}:${plan.members.length}`;
      if (r.prepared[key]) continue;
      while (performance.now() < until) {
        const attempt = r.preparing[key] ?? 0;
        const candidate =
          plan.kind === 'board'
            ? boardCandidate(
                `${r.seed}:${plan.id}`,
                plan.members.length,
                attempt,
              )
            : labCandidate(
                `${r.seed}:${plan.id}`,
                plan.members.length,
                attempt,
              );
        r.preparing[key] = attempt + 1;
        changed = true;
        if (candidate) {
          r.prepared[key] = candidate;
          if (r.pendingRedeal?.includes(plan.id)) {
            const s = r.squads.find((s) => s.id === plan.id)!;
            s.state = structuredClone(candidate);
            delete s.completeNight;
            r.pendingRedeal = r.pendingRedeal.filter((id) => id !== plan.id);
            if (g.phase === 'night') {
              const start = Math.max(now, r.lockUntil ?? now);
              candidate.turn = {
                order: shuffle(s.members, rng(`${r.seed}:${s.id}:${g.night}`)),
                cursor: 0,
                start,
                deadline: start + (s.kind === 'board' ? 5000 : 8000),
                snapshots: {},
                log: [],
                token: uuid(),
              };
              s.state = structuredClone(candidate);
              r.windowEnd = Math.max(
                r.windowEnd ?? 0,
                start + r.config.windowSeconds * 1000,
              );
            }
          }
          break;
        }
      }
    }
  }
  if (
    !r?.config.enabled ||
    r.status !== 'open' ||
    g.phase !== 'night' ||
    now < (r.lockUntil ?? Infinity)
  )
    return changed;
  for (const s of r.squads) {
    if (r.pendingRedeal?.includes(s.id)) continue;
    if (s.state.type !== 'board' && s.state.type !== 'lab') continue;
    const t = s.state.turn;
    if (!t) continue;
    if (t.vote && now >= t.vote.deadline) {
      finishVote(s, t.vote.deadline);
      changed = true;
    }
    while (!t.vote && t.cursor < t.order.length && now > t.deadline + 750) {
      nextTurn(s, t.deadline + 750, 'timeout');
      changed = true;
    }
  }
  return changed;
}
export function riteReady(g: Game, now: number) {
  const r = g.rite;
  if (!r?.config.enabled || r.status !== 'open') return true;
  return (
    now >= (r.windowEnd ?? Infinity) &&
    !r.pendingRedeal?.length &&
    r.squads.every(
      (s) =>
        s.completeNight ||
        (s.state.type !== 'board' && s.state.type !== 'lab') ||
        !s.state.turn ||
        s.state.turn.cursor >= s.state.turn.order.length,
    )
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
export const REFRESH_INFO = {
  horrors: ['sheriff', 'hoflibrarian', 'teacher'],
  holyMoonStars: ['stargazer', 'astrologist', 'mystic', 'astronaut', 'prophet'],
};
export function refreshedInfoRoles(g: Game) {
  return g.rite?.infoNight === g.night
    ? REFRESH_INFO[g.script === 'holyMoonStars' ? 'holyMoonStars' : 'horrors']
    : [];
}
export function riteAction(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string | null {
  if (!c.action.startsWith('rite') && c.action !== 'configureRite') return null;
  if (c.action === 'configureRite') {
    check(actor.host, 'Only the Storyteller can configure the Rite.');
    return configureRite(g, c);
  }
  const r = g.rite;
  check(r?.config.enabled, 'The Night Rite is disabled.');
  if (c.action === 'riteRedeal' || c.action === 'riteForce') {
    check(actor.host, 'Only the Storyteller can do that.');
    if (c.action === 'riteForce') {
      check(
        g.phase === 'night' && r.status === 'open',
        'No Rite window to resolve.',
      );
      r.windowEnd = now;
      r.pendingRedeal = [];
      for (const s of r.squads)
        if (s.state.type === 'board' || s.state.type === 'lab') {
          if (s.state.turn) {
            delete s.state.turn.vote;
            s.state.turn.cursor = s.state.turn.order.length;
          }
        }
      return 'Rite window closed. Current results will resolve at dawn.';
    }
    check(
      r.status !== 'complete',
      'A rewarded Rite cannot be redealt. Rewind first.',
    );
    const s = r.squads.find((s) => s.id === c.squad);
    check(s, 'Choose a vigil.');
    r.seed = uuid();
    r.epoch = uuid();
    if (s.kind === 'board' || s.kind === 'lab') {
      const key = `${s.id}:${s.kind}:${s.members.length}`;
      delete r.prepared?.[key];
      delete r.preparing?.[key];
      r.pendingRedeal = [...new Set([...(r.pendingRedeal ?? []), s.id])];
      return 'A fresh vigil puzzle is preparing.';
    }
    Object.assign(s, deal(g, s));
    delete s.completeNight;
    return 'Vigil puzzle redealt.';
  }
  check(
    !actor.host && g.players.some((p) => p.id === actor.id && !p.departed),
    'Use your own player seat.',
  );
  const s = r.squads.find((s) => s.members.includes(actor.id));
  check(s, 'Your vigil has not opened.');
  check(
    c.epoch === r.epoch && c.night === g.night,
    'This Rite action belongs to an earlier window.',
  );
  if (c.action === 'riteNotes') {
    check(
      s.state.type === 'grid' && validPlacements(c.placements),
      'Choose five different characters, places, and activities.',
    );
    s.state.placements[actor.id] = structuredClone(c.placements);
    return 'Working board saved.';
  }
  const failure = 'That action could not be completed.';
  check(
    g.phase === 'night' &&
      r.status === 'open' &&
      !s.completeNight &&
      !r.pendingRedeal?.includes(s.id) &&
      now >= (r.lockUntil ?? Infinity) &&
      now <= (r.windowEnd ?? -1),
    failure,
  );
  if (c.action === 'riteGridSubmit') {
    check(s.state.type === 'grid' && validTriples(c.solution), failure);
    s.state.submissions[actor.id] = structuredClone(c.solution);
    return 'Your submission was recorded.';
  }
  if (c.action === 'riteRitualPerform') {
    check(s.state.type === 'ritual', failure);
    const ritual = s.state.rituals[actor.id];
    check(
      g.night >= r.config.ritualFirstNight &&
        !ritual.doneNight &&
        !ritual.attempts.some((a) => a.night === g.night) &&
        validAltar(c.altar, ritual.controls),
      failure,
    );
    ritual.altar = structuredClone(c.altar);
    const ok = ritual.target.every((t) =>
      ritual.altar.some((a) => a.control === t.control && a.value === t.value),
    );
    ritual.attempts.push({ night: g.night, ok });
    if (ok) ritual.doneNight = g.night;
    return ok ? 'The ritual is performed.' : 'The ritual falters';
  }
  check(s.state.type === 'board' || s.state.type === 'lab', failure);
  const state = s.state,
    t = state.turn;
  check(t, failure);
  if (c.action === 'riteLabBallot') {
    check(
      state.type === 'lab' &&
        t.vote &&
        c.vote === t.vote.id &&
        actor.id !== t.vote.caller &&
        now < t.vote.deadline &&
        typeof c.yes === 'boolean' &&
        !Object.hasOwn(t.vote.ballots, actor.id),
      failure,
    );
    t.vote.ballots[actor.id] = c.yes;
    if (
      s.members
        .filter((id) => id !== t.vote!.caller)
        .every((id) => Object.hasOwn(t.vote!.ballots, id))
    )
      finishVote(s, now);
    return 'Your vote was recorded.';
  }
  check(
    !t.vote &&
      t.order[t.cursor] === actor.id &&
      c.turn === t.token &&
      now <= t.deadline + 750 &&
      !state.solved,
    failure,
  );
  if (c.action === 'ritePass') {
    nextTurn(s, now, 'pass');
    return 'Your turn is over.';
  }
  if (c.action === 'riteBoardMove') {
    check(state.type === 'board', failure);
    const next = slide(state.blocks, {
      block: String(c.block),
      x: Number(c.x),
      y: Number(c.y),
    });
    check(next, failure);
    state.blocks = next;
    state.solved = boardSolved(next);
    state.distance = solveBoard(next, 25000)?.length ?? null;
    nextTurn(
      s,
      now,
      'move',
      `${String(c.block)}: ${Number(c.x)},${Number(c.y)}`,
    );
    return 'Your move was recorded.';
  }
  if (c.action === 'riteLabPour') {
    check(state.type === 'lab', failure);
    const next = pour(state.vials, { from: String(c.from), to: String(c.to) });
    check(next, failure);
    state.history.push({
      night: g.night,
      before: structuredClone(state.vials),
      from: String(c.from),
      to: String(c.to),
    });
    state.vials = next;
    const solution = solveLab(next, 25000);
    if (solution === null) {
      state.vials = structuredClone(state.nightStart);
      state.history = state.history.filter((h) => h.night !== g.night);
      t.ruined = uuid();
    }
    state.solved = labSolved(state.vials);
    state.distance = solution === null ? null : (solution?.length ?? null);
    nextTurn(s, now, 'pour', `${String(c.from)} → ${String(c.to)}`);
    return solution === null
      ? 'The brew is ruined. The laboratory resets to the start of tonight.'
      : 'Your pour was recorded.';
  }
  if (c.action === 'riteLabCall') {
    check(
      state.type === 'lab' &&
        ['undo', 'reset'].includes(String(c.kind)) &&
        (c.kind !== 'undo' || state.history.at(-1)?.night === g.night),
      failure,
    );
    t.vote = {
      id: uuid(),
      kind: c.kind as 'undo' | 'reset',
      caller: actor.id,
      deadline: now + 5000,
      ballots: {},
    };
    return 'A vote has been called.';
  }
  throw Error(failure);
}
