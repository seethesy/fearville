// Horrors of Fearville rules. Holy
// Moon and Stars and Horrors of Fearville share the queued engine in hms.ts,
// which calls in here for everything specific to this script.
//
// Key terms (see lib/game/glossary.ts):
//   Fear  — the ability malfunctions, like poison. Basilisk fear lasts that
//           night; Banshee and Monster fear is carried to a later night
//           (Player.fearNight) and applied when it begins.
//   Visit — every ability that chooses a player visits them. Visits are kept
//           for the whole game (Mortician). A Wraith may stay hidden.
//   Save  — a saved player cannot die that night, whatever kills them.
//
// Order of operations for a death (see resolveDeath in hms.ts):
//   1. Prevention: an impaired killer, the Doctor's save (night only), or a
//      condition such as the Hag's "if they are Good".
//   2. The Guardian dies in place of their ward (once per death).
//   3. Death, then triggers: Executioner, Banshee, Hag, Hunter, Monster.
import {
  type Game,
  type Player,
  type Command,
  type DeathItem,
} from '../types.ts';
import {
  requireThat,
  person,
  nameOf,
  log,
  message,
  healthy,
} from '../engine.ts';
import { hms, enqueueDeath, team } from '../hms.ts';
import { clean, roleName } from './shared.ts';
import { savedTonight } from './night.ts';
// ---------------------------------------------------------------- deaths

export function hofPrevented(g: Game, d: DeathItem) {
  if (d.spare) return d.spare;
  if (d.night && savedTonight(g, d.player)) return 'the Doctor’s save';
  return '';
}
export function guardianFor(g: Game, victim: Player) {
  return g.players.find(
    (q) =>
      q.role === 'guardian' &&
      q.charge === victim.id &&
      q.alive &&
      q.id !== victim.id &&
      healthy(q),
  );
}
export function bodyguardFor(g: Game, victim: Player) {
  return g.players.find(
    (q) =>
      q.role === 'bodyguard' && q.alive && !q.departed && q.id !== victim.id,
  );
}
export function validateHofTriggers(
  g: Game,
  v: Player,
  d: DeathItem,
  c: Command,
) {
  const haunt = clean(c.hunterHaunt);
  if (haunt)
    requireThat(
      g.players.some(
        (q) => q.id === haunt && q.alive && team(q.role) === 'minion',
      ),
      'Choose a living Haunt for the Hunter.',
    );
  void d;
}
// After a Horrors of Fearville death.
export function hofAfterKill(
  g: Game,
  v: Player,
  d: DeathItem,
  c: Command,
  now: number,
) {
  const s = hms(g);
  const working = healthy(v);
  if (d.cause === 'execution') {
    (s.executed ??= []).push(v.id);
    for (const q of g.players.filter(
      (q) => q.role === 'executioner' && q.charge === v.id,
    ))
      winTraveler(g, q, now, `${v.name} was executed`);
    if (v.role === 'banshee' && working) {
      const next = g.night + 1;
      for (const q of g.players.filter((q) => team(q.role) === 'townsfolk'))
        q.fearNight = next;
      log(
        g,
        `Banshee executed: every Villager is feared on Night ${next}.`,
        now,
      );
    }
  }
  if (v.role === 'hag') {
    (s.hag ??= {})[v.id] = working;
    log(
      g,
      `${v.name} (Hag) died and may declare another player to die${working ? '' : ' (impaired: it will not work)'}.`,
      now,
    );
  }
  if (v.role === 'hunter' && d.night && working) {
    const haunt = clean(c.hunterHaunt);
    if (haunt) {
      enqueueDeath(g, haunt, 'Hunter', { ready: true, night: true });
      log(g, `Hunter: ${nameOf(g, haunt)} may die too.`, now);
    }
  }
  if (d.by === 'monster' && !d.impaired) {
    const feared = d.monsterFear;
    if (feared && person(g, feared).alive) {
      person(g, feared).fearNight = g.night + 1;
      log(
        g,
        `Monster: ${nameOf(g, feared)} is feared on Night ${g.night + 1}.`,
        now,
      );
    }
  }
  for (const q of g.players.filter(
    (q) => q.role === 'guardian' && q.charge === v.id,
  ))
    log(g, `${q.name}’s ward ${v.name} died.`, now);
}
export function winTraveler(g: Game, p: Player, now: number, why: string) {
  const s = hms(g);
  s.travelerWins ??= [];
  if (s.travelerWins.includes(p.id)) return;
  s.travelerWins.push(p.id);
  log(
    g,
    `${p.name} (${roleName(p.role)}) meets their win condition: ${why}.`,
    now,
  );
}
// ---------------------------------------------------------------- dawn & end

export function hofDawn(g: Game) {
  const s = hms(g);
  for (const p of g.players) p.feared = false;
  s.saves = [];
  delete s.wanderer;
}
// Traveler wins are added to the team result when the game ends.
export function hofFinish(g: Game, now: number) {
  const s = hms(g);
  if (/Travelers?:/.test(g.winner)) return;
  const travelers = g.players.filter((p) => team(p.role) === 'traveler');
  if (!travelers.length) return;
  for (const p of travelers) {
    if (p.role === 'guardian') {
      const ward = g.players.find((q) => q.id === p.charge);
      if (ward?.alive) winTraveler(g, p, now, `${ward.name} lived to the end`);
    }
    if (p.role === 'researcher') {
      const r = s.research?.[p.id];
      if (r?.correct) winTraveler(g, p, now, 'all three roles were correct');
      if (r)
        message(
          g,
          p.id,
          r.correct
            ? 'Your declaration was correct about all three players. You win.'
            : 'Your declaration was not correct about all three players.',
          now,
        );
    }
  }
  const won = travelers.filter((p) => s.travelerWins?.includes(p.id));
  g.winner += won.length
    ? ` · Travelers: ${won.map((p) => `${p.name} (${roleName(p.role)})`).join(', ')} also win`
    : ' · Travelers: none won';
}
export function hofWinHints(g: Game) {
  const s = g.hms;
  const won = (s?.travelerWins ?? []).map((id) => nameOf(g, id));
  return won.length
    ? [`Travelers who have met their win condition: ${won.join(', ')}.`]
    : [];
}
