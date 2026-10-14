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
import { type Game, type Player, type Command } from '../types.ts';
import {
  requireThat,
  person,
  nameOf,
  log,
  message,
  healthy,
  alignment,
} from '../engine.ts';
import { hms, seats, enqueueDeath, actsAs } from '../hms.ts';
import {
  clean,
  isDay,
  enforce,
  isHofRole,
  roleName,
  running,
  isHof,
  hash,
} from './shared.ts';
// ---------------------------------------------------------------- day

// Day declarations and Storyteller rulings. Returns null when the action is
// not a Horrors of Fearville one.
export function hofAction(
  g: Game,
  actor: { id: string; host: boolean },
  c: Command,
  now: number,
): string | null {
  const s = hms(g);
  switch (c.action) {
    case 'bodyguardAccept':
    case 'bodyguardDecline': {
      const d = s.deathQueue.find((item) => item.id === clean(c.death));
      requireThat(
        d?.bodyguard && d.bodyguard.decision === undefined,
        'This Bodyguard offer is no longer available.',
      );
      requireThat(
        actor.host || actor.id === d.bodyguard.player,
        'Only the Bodyguard can answer this offer.',
      );
      const accepted = c.action === 'bodyguardAccept';
      d.bodyguard.decision = accepted;
      log(
        g,
        `Bodyguard ${nameOf(g, d.bodyguard.player)} ${accepted ? 'offers to die' : 'declines to die'} in ${nameOf(g, d.player)}’s place.`,
        now,
      );
      return accepted
        ? 'You offered to die in their place.'
        : 'You declined the offer.';
    }
    case 'vigilanteDeclare': {
      requireThat(!actor.host, 'Use “Resolve Vigilante declaration”.');
      const me = person(g, actor.id);
      requireThat(
        actsAs(me) === 'vigilante' && me.alive && !me.used,
        'You cannot declare a kill.',
      );
      requireThat(isDay(g), 'Declarations are made during the day.');
      requireThat(!s.vigilante, 'A Vigilante declaration is already waiting.');
      const target = person(g, c.target);
      requireThat(
        target.alive && target.id !== me.id && !target.departed,
        'Choose another living player.',
      );
      requireThat(c.confirm === true, 'Confirm your declaration.');
      me.used = true;
      s.vigilante = { player: me.id, target: target.id };
      message(
        g,
        'all',
        `${me.name}: “I am the Vigilante and I declare that I want to kill ${target.name}.”`,
        now,
      );
      log(
        g,
        `${me.name} declares as the Vigilante against ${target.name}.`,
        now,
        true,
      );
      return 'Declaration made. The Storyteller decides what happens.';
    }
    case 'vigilante': {
      requireThat(actor.host, 'Only the Storyteller can do that.');
      requireThat(isDay(g), 'The Vigilante acts during the day.');
      const p = person(g, clean(c.player) || s.vigilante?.player);
      const target = person(g, clean(c.target) || s.vigilante?.target);
      requireThat(target.alive, 'Choose a living player.');
      const declared = s.vigilante?.player === p.id;
      if (!declared)
        enforce(
          actsAs(p) === 'vigilante' && p.alive && !p.used,
          'This player cannot use the Vigilante ability.',
          c,
        );
      const works = actsAs(p) === 'vigilante' && healthy(p);
      const outcome = clean(c.outcome) || (works ? 'kill' : 'spare');
      enforce(
        outcome === (works ? 'kill' : 'spare'),
        'This differs from the suggested outcome.',
        c,
      );
      p.used = true;
      delete s.vigilante;
      if (!declared)
        message(
          g,
          'all',
          `${p.name}: “I am the Vigilante and I declare that I want to kill ${target.name}.”`,
          now,
        );
      if (outcome === 'kill') {
        enqueueDeath(g, target.id, 'Vigilante', { ready: true });
        log(
          g,
          `The Vigilante’s declaration against ${target.name} succeeds.`,
          now,
          true,
        );
        return `${target.name} may die now. Resolve the death.`;
      }
      log(
        g,
        `The Vigilante’s declaration against ${target.name} has no effect.`,
        now,
        true,
      );
      message(g, 'all', `Nothing happens to ${target.name}.`, now);
      return 'No effect.';
    }
    case 'researcherDeclare': {
      const p = actor.host ? person(g, c.player) : person(g, actor.id);
      requireThat(
        p.role === 'researcher' && !p.used,
        'This player cannot make a Researcher declaration.',
      );
      requireThat(isDay(g), 'Declarations are made during the day.');
      const guesses = [1, 2, 3].map((i) => ({
        player: clean(c['player' + i]),
        role: clean(c['role' + i]),
      }));
      requireThat(
        new Set(guesses.map((x) => x.player)).size === 3 &&
          guesses.every(
            (x) =>
              isHofRole(x.role) &&
              g.players.some(
                (q) => q.id === x.player && q.alive && q.id !== p.id,
              ),
          ),
        'Name a role for three different living players.',
      );
      const correct = guesses.every((x) => person(g, x.player).role === x.role);
      p.used = true;
      (s.research ??= {})[p.id] = { guesses, correct };
      message(
        g,
        'all',
        `${p.name}: “I am the Researcher and I declare that ${guesses
          .map((x) => `${nameOf(g, x.player)} is the ${roleName(x.role)}`)
          .join(', ')
          .replace(/, ([^,]*)$/, ' and $1')}.”`,
        now,
      );
      log(
        g,
        `Researcher ${p.name}’s declaration is ${correct ? 'correct' : 'wrong'} (revealed at the end of the game).`,
        now,
      );
      return actor.host
        ? `Declaration recorded: ${correct ? 'correct' : 'wrong'}. The Researcher learns the result at the end of the game.`
        : 'Declaration made. You learn the result at the end of the game.';
    }
    case 'hagDeclare': {
      requireThat(running(g), 'The game is not running.');
      const hag = actor.host ? person(g, c.player) : person(g, actor.id);
      requireThat(
        hag.role === 'hag' && s.hag && hag.id in s.hag,
        'This player has no Hag declaration to make.',
      );
      requireThat(
        !(g.phase === 'night' && hag.nightDeath === g.night),
        'Wait until morning to make your declaration.',
      );
      const target = person(g, c.target);
      requireThat(
        target.alive && target.id !== hag.id && !target.departed,
        'Choose another living player.',
      );
      const working = s.hag[hag.id];
      delete s.hag[hag.id];
      const ready = g.phase === 'night' && g.done.includes('deaths');
      const spare = !working
        ? 'the Hag’s ability is impaired'
        : alignment(target) !== 'good'
          ? 'they are not Good'
          : '';
      enqueueDeath(g, target.id, 'Hag', {
        ready,
        night: true,
        by: 'hag',
        ...(spare ? { spare } : {}),
      });
      message(
        g,
        'all',
        `${hag.name}: “I am the Hag and I declare that ${target.name} will die.”`,
        now,
      );
      log(
        g,
        `Hag ${hag.name} declares ${target.name}. They may die tonight${spare ? ` (suggested: survives, ${spare})` : ''}.`,
        now,
      );
      return actor.host
        ? `${target.name} is queued to die tonight${spare ? `; suggested to survive because ${spare}` : ''}.`
        : 'Declaration made.';
    }
  }
  return null;
}
// ---------------------------------------------------------------- Sphinx

// The Sphinx's glimpse: every player's role, shown in a popup until the
// night-choice timer ends. A feared Sphinx sees a scrambled glimpse.
export function sphinxGlimpse(g: Game, me: Player | undefined, now: number) {
  if (!isHof(g) || g.phase !== 'night' || !me || me.departed) return null;
  if (me.role !== 'sphinx' || !me.alive) return null;
  const deadline = g.nightChoiceDeadline ?? 0;
  if (!g.sandbox && now >= deadline) return null;
  const basilisk = g.players.find(
    (q) =>
      actsAs(q) === 'basilisk' &&
      q.alive &&
      healthy(q) &&
      Object.entries(g.nightChoices ?? {}).some(
        ([key, choice]) =>
          key === 'basilisk:' + q.id && choice.target === me.id,
      ),
  );
  const ordered = seats(g);
  let roles = ordered.map((p) => p.role);
  if (!healthy(me) || basilisk) {
    const seed = `${g.code}:${g.night}:${me.id}`;
    roles = roles
      .map((r, i) => ({ r, k: hash(seed + i) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.r);
  }
  return {
    id: `${g.night}:${me.id}`,
    night: g.night,
    deadline: g.sandbox ? null : deadline,
    entries: ordered.map((p, i) => ({
      seat: p.seat,
      name: p.name,
      role: roleName(roles[i]),
      alive: p.publicAlive,
    })),
  };
}
