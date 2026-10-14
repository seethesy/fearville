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
import {
  role,
  uuid,
  HMS_ROLES,
  type Game,
  type Player,
  type Command,
  type HmsState,
  type NightChoice,
} from '../types.ts';
import { isHof } from '../hof.ts';
import { requireThat, person, nameOf, message } from '../engine.ts';
import {
  type Task,
  clean,
  enforce,
  roleName,
  seatNeighbors,
  GRANTABLE,
  actsAs,
  ONCE,
  team,
  TARGETING,
} from './shared.ts';
import { openNightmareDecision } from './choices.ts';
import { enqueueDeath } from './night.ts';
import { suggestions } from './suggestions.ts';
export type ResolveAbilityContext = {
  r: string;
  hits: string[];
  s: HmsState;
  p: Player;
  fine: boolean;
  send: (text: string, minimal?: string) => void;
  H: Player[];
  summary: string;
  readonly info: string;
  choice: NightChoice | undefined;
  isST: boolean;
  pass: boolean;
  once: () => void;
  count: number;
};
export function resolveAbility(
  g: Game,
  t: Task,
  c: Command,
  now: number,
  context: ResolveAbilityContext,
): string {
  const { r, hits, s, p, fine, send, H, choice, isST, pass, once, count } =
    context;
  let summary = context.summary;

  // Horrors of Fearville abilities resolved above.
  switch (isHof(g) ? 'hof' : r) {
    case 'hof':
      break;
    case 'constellation': {
      const members = hits;
      s.constellation = { owner: p.id, members, linked: fine };
      send(
        `Your Constellation: ${H.map((q) => q.name).join(', ')}.`,
        H.map((q) => q.name).join(', '),
      );
      summary = `Constellation linked ${H.map((q) => q.name).join(', ')}${fine ? '' : ' (impaired: no link)'}.`;
      break;
    }
    case 'stargazer':
      s.stargazer[p.id] = hits[0];
      send(
        `You are watching ${H[0].name}. Ask the Storyteller about them at any time.`,
        H[0].name,
      );
      summary = `Stargazer watches ${H[0].name}.`;
      break;
    case 'astrologist': {
      s.astrologist[p.id] = hits;
      const shown = ['reveal1', 'reveal2', 'reveal3'].map((k) => clean(c[k]));
      requireThat(
        shown.every((x) => role(x)) && new Set(shown).size === 3,
        'Choose three different characters.',
      );
      const inPlay = new Set(g.players.map((q) => q.role));
      const owned = shown.filter((x) => H.some((q) => q.role === x)).length;
      const absent = shown.filter((x) => !inPlay.has(x)).length;
      enforce(
        !fine || (owned === 1 && absent === 2),
        'Exactly one character must belong to a chosen player and two must be out of play.',
        c,
      );
      send(
        `One of these characters belongs to one of ${H.map((q) => q.name).join(', ')}: ${shown.map(roleName).join(', ')}.`,
        shown.map(roleName).join(', '),
      );
      summary = context.info;
      break;
    }
    case 'mystic': {
      enforce(
        seatNeighbors(g, p).some((q) => q.id === hits[0]),
        'The Mystic must choose a neighbor.',
        c,
      );
      const links = ['link1', 'link2', 'link3']
        .map((k) => clean(c[k]))
        .filter(Boolean);
      requireThat(
        links.every((id) => g.players.some((q) => q.id === id)) &&
          new Set(links).size === links.length,
        'Choose different players.',
      );
      send(
        links.length
          ? `${H[0].name} may be connected to ${links.map((id) => nameOf(g, id)).join(', ')}.`
          : `You sense no connections around ${H[0].name}.`,
        links.length ? links.map((id) => nameOf(g, id)).join(', ') : 'Nobody',
      );
      summary = context.info;
      break;
    }
    case 'astronaut':
    case 'prophet':
    case 'insomniac':
    case 'spirit': {
      const suggested = suggestions(g, t, {
        id: '',
        target: hits[0] ?? '',
        target2: '',
      });
      const given = clean(c.info, 2000) || suggested;
      enforce(
        !fine || !clean(c.info, 2000) || given === suggested,
        'This differs from the calculated information.',
        c,
      );
      const text =
        r === 'astronaut'
          ? given === 'none'
            ? 'There is no evil player near you.'
            : `The nearest evil player is ${given} seat${given === '1' ? '' : 's'} from you.`
          : r === 'prophet'
            ? `Haunt and Horror characters in play: ${given}.`
            : given;
      const minimal =
        r === 'insomniac'
          ? given
              .replace(/^Visited by: /, '')
              .replace(/\. Neighbors who visited someone: /, '\n')
              .replace(/\.$/, '')
          : given;
      send(text, minimal);
      summary = text;
      break;
    }
    case 'diviner': {
      const q = choice?.text || clean(c.question, 500) || 'your question';
      s.questions[p.id] = q;
      const answer = clean(c.target);
      requireThat(
        g.players.some((x) => x.id === answer),
        'Choose the player to suggest.',
      );
      send(
        `You asked: “${q}”. The Storyteller suggests you speak to ${nameOf(g, answer)}.`,
        nameOf(g, answer),
      );
      summary = context.info;
      break;
    }
    case 'medium': {
      const target = H[0];
      enforce(
        s.nightStartDead.includes(target.id),
        'The Medium must choose a player who was dead at the start of the night.',
        c,
      );
      if (fine) {
        s.medium = { medium: p.id, target: target.id, night: g.night };
        if (!isST)
          s.channel = { id: uuid(), a: p.id, b: target.id, night: g.night };
        const can =
          GRANTABLE.includes(actsAs(target)) &&
          !(ONCE.includes(actsAs(target)) && target.used);
        message(
          g,
          target.id,
          `The Medium has reached you. ${can ? 'You may use your night ability tonight.' : 'Your ability cannot be used again.'} You can talk privately with them until dawn.`,
          now,
        );
        send(
          `You have reached ${target.name}. You can talk privately until dawn.`,
          target.name,
        );
      } else send(`You reach out to ${target.name}…`, target.name);
      summary = `Medium chose ${target.name}.${fine ? '' : ' Impaired: no channel or ability.'}`;
      break;
    }
    case 'gravedigger':
    case 'priest':
    case 'necromancer': {
      if (pass) {
        send('You did not use your ability tonight.', 'Passed');
        summary = `${role(r)?.name} passed.`;
        break;
      }
      const target = H[0];
      enforce(
        s.nightStartDead.includes(target.id),
        'Choose a player who was dead at the start of the night.',
        c,
      );
      requireThat(
        r === 'gravedigger' || team(target.role) !== 'demon',
        'The Horror cannot be revived.',
      );
      let newRole = target.role;
      if (r === 'priest' && team(target.role) === 'minion')
        newRole = clean(c.newRole);
      if (r === 'necromancer' && team(target.role) !== 'minion')
        newRole = clean(c.newRole);
      if (newRole !== target.role) {
        const want = r === 'priest' ? 'townsfolk' : 'minion';
        requireThat(
          team(newRole) === want && HMS_ROLES.some((x) => x.id === newRole),
          `Choose an out-of-play ${want === 'townsfolk' ? 'Villager' : 'Haunt'} for the revived player.`,
        );
        enforce(
          !g.players.some((q) => q.role === newRole),
          'That character is already in play.',
          c,
        );
      }
      once();
      const allowed = r !== 'gravedigger' || c.refuse !== true;
      if (fine && allowed) {
        s.dawnChanges.push({
          id: uuid(),
          kind: r === 'gravedigger' ? 'become' : 'revive',
          player: r === 'gravedigger' ? p.id : target.id,
          role: newRole,
          by: p.id,
        });
        summary =
          r === 'gravedigger'
            ? `At dawn ${p.name} becomes the ${roleName(newRole)}.`
            : `At dawn ${target.name} returns as the ${roleName(newRole)}.`;
      } else
        summary = `${role(r)?.name} chose ${target.name}. ${fine ? 'The Storyteller refused the change.' : 'Impaired: nothing happens.'}`;
      send(`You chose ${target.name}.`, target.name);
      break;
    }
    case 'guess': {
      const con = s.constellation!;
      const pairs = con.members.map((m, i) => ({
        player: m,
        role:
          clean(c['guess' + (i + 1)]) ||
          choice?.guesses?.find((x) => x.player === m)?.role ||
          '',
      }));
      if (c.pass === true || (choice?.pass && !pairs.some((x) => x.role))) {
        send('You keep your guess for another night.', 'Passed');
        summary = 'Constellation passed.';
        break;
      }
      requireThat(
        pairs.every((x) => role(x.role)),
        'Choose a character for each member.',
      );
      const correct = pairs.every(
        (x) =>
          (person(g, x.player).shown || person(g, x.player).role) === x.role,
      );
      const outcome =
        clean(c.outcome) || (fine && correct ? 'correct' : 'wrong');
      enforce(
        outcome === (fine && correct ? 'correct' : 'wrong'),
        'This differs from the actual characters.',
        c,
      );
      const member = clean(c.rewardPlayer);
      const other = clean(c.killMember);
      if (outcome === 'correct') {
        requireThat(con.members.includes(member), 'Choose a member to reward.');
        requireThat(
          clean(c.reward) !== 'revive' || !person(g, member).alive,
          'Only a dead member can be revived.',
        );
      } else
        requireThat(
          !other || (con.members.includes(other) && other !== p.id),
          'Choose another Constellation member.',
        );
      once();
      if (outcome === 'correct') {
        const kind = clean(c.reward);
        if (kind === 'revive') {
          s.dawnChanges.push({
            id: uuid(),
            kind: 'revive',
            player: member,
            role: person(g, member).role,
            by: p.id,
          });
        } else
          person(g, member).extraLife = (person(g, member).extraLife ?? 0) + 1;
        send('Your guess was correct.', 'Resolved');
        summary = `Constellation guessed correctly: ${kind === 'revive' ? nameOf(g, member) + ' returns at dawn' : nameOf(g, member) + ' gains an extra life'}.`;
      } else {
        con.linked = false;
        if (c.killSelf === true && p.alive)
          enqueueDeath(g, p.id, 'Constellation guess');
        if (other) enqueueDeath(g, other, 'Constellation guess');
        send('Your guess was wrong. The link is broken.', 'Resolved');
        summary = `Constellation guessed wrong; link broken.${c.killSelf === true ? ' ' + p.name + ' may die.' : ''}${other ? ' ' + nameOf(g, other) + ' may die.' : ''}`;
      }
      break;
    }
    case 'miasma':
      if (fine) s.infected = { target: H[0].id, by: p.id, night: g.night };
      send(`You infect ${H[0].name}.`);
      summary = `Miasma infects ${H[0].name}.${fine ? '' : ' Impaired: no plague.'}`;
      break;
    case 'grimreaper':
      if (fine) H[0].marked = true;
      send(`You mark ${H[0].name}.`);
      summary = `Grim Reaper marks ${H[0].name}.${fine ? '' : ' Impaired: no mark.'}`;
      break;
    case 'werewolf': {
      if (!count) {
        const step = g.night % 3;
        send(`You prepare for the full moon (${step}/2).`);
        summary = `Werewolf prepares (${step}/2).`;
        break;
      }
      H.forEach((q) => enqueueDeath(g, q.id, 'Werewolf', { impaired: !fine }));
      send(`You choose ${H.map((q) => q.name).join(', ')}.`);
      summary = `Werewolf chooses ${H.map((q) => q.name).join(', ')}. Deaths resolve after the Insomniac.`;
      break;
    }
    case 'dreameater': {
      const guesses: { player: string; role: string }[] = [];
      for (let i = 1; i <= 15; i++) {
        const pl = clean(c[`g${i}player`]);
        const ro = clean(c[`g${i}role`]);
        if (pl && ro) guesses.push({ player: pl, role: ro });
      }
      requireThat(
        guesses.every(
          (x) => g.players.some((q) => q.id === x.player) && role(x.role),
        ),
        'Each guess needs a player and a character.',
      );
      if (!guesses.length) {
        send('You make no guesses tonight.');
        summary = 'Dreameater made no guesses.';
        break;
      }
      const right = guesses.filter((x) => {
        const q = person(g, x.player);
        return (q.shown || q.role) === x.role;
      });
      const wrong = guesses.length - right.length;
      if (fine) {
        const holder = isST ? null : p;
        const misses = (holder?.misses ?? 0) + wrong;
        if (holder) holder.misses = misses;
        if (misses >= 3 && holder) {
          enqueueDeath(g, holder.id, 'Dreameater’s third wrong guess');
          summary = `Dreameater reaches ${misses} wrong guesses and will die; tonight’s correct guesses do not count.`;
        } else {
          right.forEach((x) => enqueueDeath(g, x.player, 'Dreameater'));
          summary = `Dreameater: ${right.length} correct (${right.map((x) => nameOf(g, x.player)).join(', ') || 'none'}), ${wrong} wrong (${misses} total).`;
        }
      } else summary = 'Dreameater is impaired: no guesses take effect.';
      send('Your guesses are recorded.');
      break;
    }
    case 'nightmare': {
      const target = H[0];
      enforce(
        TARGETING.includes(actsAs(target)) && target.alive,
        'Choose a living player with a nighttime targeting ability.',
        c,
      );
      s.nightmare!.bound = target.id;
      openNightmareDecision(g, now);
      send(
        `You now haunt ${target.name}. Once, you may redirect their ability.`,
      );
      summary = `Nightmare haunts ${target.name}.`;
      break;
    }
    default:
      summary = clean(c.info, 2000) || 'Recorded.';
      if (clean(c.info, 2000)) send(summary);
  }
  return summary;
}
