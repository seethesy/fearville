// FEAR-122: how remote switches act on a game. Pure functions (tested in
// tests/flags.test.ts); the GameTable object calls them with current flags.
import { uuid, type Game } from '../game/types.ts';
import { planVigils, validatePlans } from '../rite/engine/setup.ts';
import { PATTERNS, type Pattern } from '../rite/types.ts';
import {
  newGamesAllowed,
  patternEnabled,
  riteEnabled,
  scriptEnabled,
  state,
  type Flags,
} from './catalog.ts';
import { SCRIPTS } from '../game/types/setup.ts';

export const RITE_CLOSED =
  'The Night Rite was closed by the developers for this game. No reward will be given.';
export const NEW_GAMES_OFF =
  'New games are paused for maintenance. Try again soon.';

function tell(g: Game, to: string[], text: string, now: number) {
  for (const id of to)
    g.messages.push({
      id: uuid(),
      from: 'host',
      to: id,
      text,
      at: now,
      kind: 'info',
    });
}
function seated(g: Game) {
  return g.players.filter((p) => !p.departed).map((p) => p.id);
}

/** End a running Rite gracefully: no reward, a message for everyone. */
export function closeRite(g: Game, now: number, text = RITE_CLOSED) {
  const r = g.rite;
  if (!r?.config.enabled) return false;
  // A disabled config makes every Rite step a no-op (opening, turns,
  // resolution), so the night proceeds as if the Rite were off.
  r.config = { ...r.config, enabled: false };
  r.plans = [];
  r.squads = [];
  delete r.pendingRedeal;
  delete r.lockUntil;
  delete r.windowEnd;
  g.log.push({ id: uuid(), text, at: now, public: true });
  tell(g, ['all'], text, now);
  return true;
}

/** Re-plan dormant vigils for the remaining patterns, or close the Rite. */
function replan(g: Game, patterns: Pattern[], now: number, text: string) {
  const r = g.rite!;
  if (!patterns.length) return closeRite(g, now, text);
  const ids = seated(g);
  try {
    const config = { ...r.config, patterns };
    const plans = planVigils(ids, patterns, r.seed);
    validatePlans(plans, ids, config);
    r.config = config;
    r.plans = plans;
    return true;
  } catch {
    // e.g. only Divination left with a player count not divisible by three.
    return closeRite(g, now, text);
  }
}

/**
 * Called just before a game starts: switches are captured here. Turned-off
 * patterns leave the Rite (vigils are re-planned); a turned-off Rite is off.
 * Throws when the game may not start at all.
 */
export function applyStartFlags(g: Game, f: Flags, now: number) {
  if (!newGamesAllowed(f)) throw Error(NEW_GAMES_OFF);
  if (!g.sandbox && !scriptEnabled(f, g.script ?? 'horrors'))
    throw Error(
      `${SCRIPTS[(g.script ?? 'horrors') as keyof typeof SCRIPTS] ?? 'This script'} is unavailable right now. Choose another script.`,
    );
  const r = g.rite;
  if (!r?.config.enabled) return;
  const unavailable =
    'Some Night Rite puzzles are unavailable right now, so this game has none.';
  if (!riteEnabled(f)) {
    r.config = { ...r.config, enabled: false };
    r.plans = [];
    g.log.push({
      id: uuid(),
      text: 'The Night Rite is unavailable right now, so this game has none.',
      at: now,
      public: false,
    });
    return;
  }
  const kept = r.config.patterns.filter((p) => patternEnabled(f, p));
  if (kept.length === r.config.patterns.length) return;
  const dropped = r.config.patterns
    .filter((p) => !kept.includes(p))
    .map((p) => PATTERNS[p]);
  if (replan(g, kept, now, unavailable))
    g.log.push({
      id: uuid(),
      text: `Unavailable puzzles removed from the Night Rite: ${dropped.join(', ')}.`,
      at: now,
      public: false,
    });
}

/**
 * Apply kill switches to a running game. Returns true when the game changed.
 * Killing the Rite closes it; killing one pattern withdraws that pattern's
 * unfinished vigils and the completion threshold counts the rest.
 */
export function enforceKills(g: Game, f: Flags, now: number) {
  const r = g.rite;
  if (
    !r?.config.enabled ||
    r.status === 'complete' ||
    g.phase === 'lobby' ||
    g.phase === 'ended'
  )
    return false;
  if (state(f, 'rite') === 'kill') return closeRite(g, now);
  const killed = r.config.patterns.filter(
    (p) => state(f, 'rite.' + p) === 'kill',
  );
  if (!killed.length) return false;
  const names = killed.map((p) => PATTERNS[p]).join(', ');
  const kept = r.config.patterns.filter((p) => !killed.includes(p));
  if (r.status === 'dormant')
    return replan(g, kept, now, `${RITE_CLOSED} (${names} was withdrawn.)`);
  const withdrawn = r.squads.filter(
    (s) => killed.includes(s.kind) && !s.completeNight,
  );
  // Keep the killed pattern out of any later re-plan or redeal.
  if (kept.length) r.config = { ...r.config, patterns: kept };
  if (!withdrawn.length) return !!kept.length;
  const remaining = r.squads.filter((s) => !withdrawn.includes(s));
  if (!remaining.length) return closeRite(g, now);
  r.squads = remaining;
  r.plans = r.plans.filter((p) => !withdrawn.some((s) => s.id === p.id));
  r.pendingRedeal = r.pendingRedeal?.filter((id) =>
    remaining.some((s) => s.id === id),
  );
  r.epoch = uuid();
  tell(
    g,
    withdrawn.flatMap((s) => s.members),
    `Your vigil’s puzzle (${names}) was withdrawn by the developers. The Rite continues with the other vigils.`,
    now,
  );
  g.log.push({
    id: uuid(),
    text: `${names} was withdrawn from the Night Rite; the remaining vigils decide it.`,
    at: now,
    public: true,
  });
  return true;
}
