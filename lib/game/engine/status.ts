import {
  role,
  scriptRoles,
  MAX_PLAYERS,
  type Game,
  type Actor,
  type Command,
} from '../types.ts';
import { isMoon, applyStartState } from '../hms.ts';
import { isHof, hofAnnounceCharges } from '../hof.ts';
import { riteSetupCheck } from '../../rite/engine.ts';
import {
  requireThat,
  person,
  clean,
  log,
  message,
  alignment,
  enforce,
} from './shared.ts';
import { death, setupIssues, beginNight } from './lifecycle.ts';
export function statusCommand(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string | undefined {
  switch (c.action) {
    case 'setPlayerStatus': {
      requireThat(g.phase === 'night', 'Change these states during the night.');
      if (c.night !== undefined)
        requireThat(
          c.night === g.night,
          'The night changed. Review this player state again.',
        );
      const p = person(g, c.player);
      const status = clean(c.status);
      requireThat(
        typeof c.active === 'boolean',
        'Choose whether the state is active.',
      );
      const active = c.active;
      switch (status) {
        case 'feared':
          requireThat(isHof(g), 'Fear belongs to Horrors of Fearville.');
          p.feared = active;
          p.poisoned = false;
          break;
        case 'drunk':
          requireThat(
            p.role !== 'drunk',
            'Change the Drunk’s character to remove their drunkenness.',
          );
          p.drunk = active;
          break;
        case 'protected':
          p.protected = active;
          break;
        case 'marked':
          requireThat(isMoon(g), 'Death marks belong to Holy Moon and Stars.');
          p.marked = active;
          break;
        case 'haunted': {
          const nightmare = g.hms?.nightmare;
          requireThat(
            isMoon(g) && nightmare,
            'There is no active Nightmare to bind.',
          );
          if (active) {
            nightmare.bound = p.id;
            nightmare.used = false;
            delete g.hms!.nightmareRedirectTarget;
          } else if (nightmare.bound === p.id) {
            nightmare.bound = '';
            nightmare.used = false;
            delete g.hms!.nightmareRedirectTarget;
          }
          break;
        }
        case 'redirected': {
          const nightmare = g.hms?.nightmare;
          requireThat(
            isMoon(g) && nightmare?.bound === p.id,
            'This player is not haunted.',
          );
          if (active) {
            const target = person(g, c.target);
            requireThat(
              target.id !== p.id,
              'Choose another player as the redirect target.',
            );
            g.hms!.nightmareRedirectTarget = target.id;
            nightmare.used = true;
          } else {
            delete g.hms!.nightmareRedirectTarget;
            nightmare.used = false;
          }
          break;
        }
        default:
          throw Error('Choose a valid player state.');
      }
      log(g, `${p.name} is ${active ? 'now' : 'no longer'} ${status}.`, now);
      return `${p.name} is ${active ? 'now' : 'no longer'} ${status}.`;
    }

    case 'edit': {
      const p = person(g, c.player);
      const name = clean(c.name, 32);
      requireThat(name, 'Enter a seat name.');
      requireThat(
        c.seat === undefined || Number(c.seat) === p.seat,
        'Players choose their own seats.',
      );
      p.name = name;
      requireThat(role(clean(c.role)), 'Choose a character.');
      p.role = clean(c.role);

      const shown = clean(c.shown);
      p.shown =
        p.role === 'lostsoul'
          ? shown || 'lostsoul'
          : shown && role(shown)?.team === 'townsfolk'
            ? shown
            : p.role;
      if (p.role === 'lostsoul') p.acts = clean(c.acts);
      else delete p.acts;
      if (isMoon(g)) p.drunk = !!c.drunk;
      p.marked = !!c.marked;
      const lives = Number(c.extraLife ?? 0);
      requireThat(
        Number.isInteger(lives) && lives >= 0 && lives <= 3,
        'Extra lives must be 0–3.',
      );
      p.extraLife = lives;
      if (isHof(g)) {
        p.feared = !!c.feared;
        const charge = clean(c.charge);
        if (['executioner', 'guardian'].includes(p.role)) {
          requireThat(
            !charge || g.players.some((q) => q.id === charge && q.id !== p.id),
            'Choose another player.',
          );
          p.charge = charge;
        } else delete p.charge;
      }
      requireThat(
        p.role !== 'drunk' || role(p.shown)?.team === 'townsfolk',
        'The Drunk must be shown a Villager.',
      );
      if (isMoon(g)) p.poisoned = !!c.poisoned;
      if (c.protected !== undefined) p.protected = !!c.protected;
      p.ghost = c.ghost !== false;
      p.used = !!c.used;
      p.notes = clean(c.notes, 1000);
      if (c.alive === false && p.alive)
        death(g, p, now, 'Storyteller correction');
      if (c.alive === true) {
        p.alive = true;
        p.nightDeath = 0;
      }
      if (g.phase !== 'night') p.publicAlive = p.alive;
      if (g.phase !== 'lobby')
        message(
          g,
          p.id,
          `Your character is ${role(p.shown)?.name}. Your alignment is ${alignment(p)}.`,
          now,
        );
      log(
        g,
        `Updated seat ${p.seat}: ${p.name}, actual character ${role(p.role)?.name}.`,
        now,
      );
      return `Update ${p.name} at seat ${p.seat}. Actual: ${role(p.role)?.name}; shown: ${role(p.shown)?.name}. ${g.phase !== 'lobby' ? 'Send their current character privately.' : ''}`;
    }

    case 'setRanked': {
      requireThat(actor.host, 'Only the Storyteller can choose ranked mode.');
      requireThat(
        g.phase === 'lobby',
        'Choose ranked mode before the game starts.',
      );
      requireThat(typeof c.ranked === 'boolean', 'Choose casual or ranked.');
      requireThat(!g.sandbox || !c.ranked, 'Sandbox games cannot be ranked.');
      g.ranked = c.ranked;
      return g.ranked ? 'Set this game to ranked.' : 'Set this game to casual.';
    }

    case 'start': {
      riteSetupCheck(g);
      requireThat(
        g.players.every((p) => p.seat > 0),
        'Every player must claim a seat before roles are dealt.',
      );
      requireThat(g.phase === 'lobby', 'The game has already started.');
      requireThat(
        g.players.length >= 5 && g.players.length <= MAX_PLAYERS,
        `Join 5–${MAX_PLAYERS} players before starting.`,
      );
      requireThat(
        g.players.every((p) => role(p.role)),
        'Assign all characters first.',
      );
      requireThat(
        g.players.every((p) =>
          scriptRoles(g.script).some((r) => r.id === p.role),
        ),
        'Assign characters from this script.',
      );
      const goodRoles = scriptRoles(g.script).filter((r) =>
        ['townsfolk', 'outsider'].includes(r.team),
      );
      const suppliedBluffs = [c.bluff1, c.bluff2, c.bluff3]
        .map((value) => clean(value))
        .filter(Boolean);
      if (suppliedBluffs.length) g.bluffs = suppliedBluffs;
      if (c.redHerring) g.redHerring = clean(c.redHerring);
      for (const p of g.players) {
        const shown = clean(c['shown_' + p.id]);
        const acts = clean(c['acts_' + p.id]);
        if (shown) {
          requireThat(
            goodRoles.some((r) => r.id === shown),
            'Choose a valid shown character.',
          );
          p.shown = shown;
        }
        if (acts) {
          requireThat(
            goodRoles.some((r) => r.id === acts && r.team === 'townsfolk'),
            'Choose a valid hidden Villager.',
          );
          p.acts = acts;
        }
      }
      requireThat(
        !g.players.some(
          (p) => p.role === 'drunk' && role(p.shown)?.team !== 'townsfolk',
        ),
        'Choose the Drunk’s shown Villager.',
      );
      if (isHof(g))
        for (const p of g.players)
          if (
            ['executioner', 'guardian'].includes(p.role) &&
            c['charge_' + p.id]
          )
            p.charge = clean(c['charge_' + p.id]);
      enforce(setupIssues(g).length === 0, setupIssues(g).join(' '), c);
      applyStartState(g, c);
      g.gameStartedAt = now;
      delete g.gameEndedAt;
      g.mvpVotes = {};
      g.notebooks = {};
      g.players
        .sort((a, b) => a.seat - b.seat)
        .forEach((p, i) => {
          p.seat = i + 1;
        });
      g.decisions = [];
      g.players.forEach((p) =>
        message(
          g,
          p.id,
          `Your character is ${role(p.shown || p.role)?.name}. Your alignment is ${alignment(p)}.\n${role(p.shown || p.role)?.description}`,
          now,
        ),
      );
      if (isHof(g)) hofAnnounceCharges(g, now);
      beginNight(g, now);
      return 'Deal every player their private character and begin the first night.';
    }
  }
}
