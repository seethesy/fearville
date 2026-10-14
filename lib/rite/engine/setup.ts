import { uuid, type Command, type Game } from '../../game/types.ts';
import {
  DEFAULT_CONFIG,
  PATTERNS,
  type Pattern,
  type Plan,
  type RiteConfig,
} from '../types.ts';
import { rng, shuffle } from '../random.ts';
export const check: (ok: unknown, message: string) => asserts ok = (
  ok,
  message,
) => {
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
export function configOf(value: unknown): RiteConfig {
  const c = { ...DEFAULT_CONFIG, ...(value as Partial<RiteConfig>) };
  check(typeof c.timed === 'boolean', 'Choose valid Rite timing.');
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
    timed: c.timed,
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
    timerless: !config.timed || !!g.sandbox,
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
