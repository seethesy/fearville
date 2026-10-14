// Holy Moon and Stars rules. Uses the shared queued night engine.
//
// Order of operations for any death (see resolveDeath):
//   1. Targeting: Dazed and Nightmare redirects are applied when the
//      ability resolves, so a queued death already names the final target.
//   2. Prevention: Extra Life, then the Celestial (day only).
//   3. Fateweaver: may move a remaining death once; the new target is queued
//      again and passes through prevention again.
//   4. Death, then triggers: Constellation link, Zealot, Priest self-revival,
//      Celestial execution, Nightmare execution, Moonshiner.
import { role, type Game } from '../types.ts';
import { isHof, hofDawn, hofWinHints } from '../hof.ts';
import {
  requireThat,
  person,
  nameOf,
  log,
  message,
  alignment,
} from '../engine.ts';
import { hms, roleName, atheistInPlay, team } from './shared.ts';
// ---------------------------------------------------------------- dawn & day

export function hmsDawn(g: Game, now: number) {
  const s = hms(g);
  requireThat(!s.deathQueue.length, 'Resolve every queued death before dawn.');
  for (const ch of s.dawnChanges) {
    const p = person(g, ch.player);
    const old = p.role;
    p.role = ch.role;
    p.shown = ch.role;
    delete p.acts;
    p.drunk = false;
    p.used = false;
    p.misses = 0;
    if (ch.kind === 'revive') {
      p.alive = true;
      p.ghost = true;
      p.nightDeath = 0;
      p.marked = false;
      p.executed = false;
    }
    message(
      g,
      p.id,
      `${ch.kind === 'revive' ? 'You have returned to life. ' : ''}Your character is now ${roleName(ch.role)}. Your alignment is ${alignment(p)}.\n${role(ch.role)?.description}`,
      now,
    );
    log(
      g,
      `${p.name}: ${roleName(old)} → ${roleName(ch.role)} (${ch.kind === 'revive' ? 'revived' : 'Gravedigger'}).`,
      now,
    );
  }
  s.dawnChanges = [];
  if (s.channel) {
    const id = 'channel:' + s.channel.id;
    const lines = g.messages
      .filter((m) => m.to === id)
      .map((m) => `${nameOf(g, m.from)}: ${m.text}`);
    log(
      g,
      `Medium channel (${nameOf(g, s.channel.a)} ↔ ${nameOf(g, s.channel.b)}) closed.${lines.length ? '\n' + lines.join('\n') : ' No messages.'}`,
      now,
    );
    delete s.channel;
  }
  if (isHof(g)) hofDawn(g);
}
export function hmsWinHints(g: Game) {
  const alive = g.players.filter((p) => p.alive);
  const travelers = isHof(g) ? hofWinHints(g) : [];
  if (atheistInPlay(g))
    return alive.length <= 2
      ? [
          'Two players remain with an Atheist in play: evil (the Storyteller) wins.',
        ]
      : [];
  const horror = alive.some((p) => team(p.role) === 'demon');
  const hints: string[] = [];
  if (!horror) hints.push('No living Horror: good wins.');
  if (alive.length <= 2 && horror)
    hints.push('Two or fewer living players with a living Horror: evil wins.');
  return [...hints, ...travelers];
}
