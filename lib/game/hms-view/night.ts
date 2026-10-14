// Storyteller and player controls for Holy Moon and Stars.
import { role, type Game, type Field, type Option } from '../types.ts';
import { nameOf, healthy } from '../engine.ts';
import {
  hms,
  actorOf,
  targetCount,
  TARGETING,
  suggestions,
  astrologistSuggestion,
  connections,
  livingNeighbors,
  ST,
  type Task,
} from '../hms.ts';
import { isHof } from '../hof.ts';
import { hofNightFields } from '../hof-view.ts';
import { select, none, roleList, text, outOfPlay, check } from './fields.ts';
export function hmsNightFields(g: Game, t: Task, ps: Option[]) {
  const s = hms(g);
  const choice = g.nightChoices?.[t.key];
  const fields: Field[] = [];
  const notes: string[] = [];
  const r = t.role;
  if (r === 'nightmareRuling') {
    const nightmare = s.nightmare;
    const plan = nightmare
      ? g.nightChoices?.['nightmareRedirect:' + nightmare.player]
      : undefined;
    return {
      fields: [
        select('target', 'Redirected target', ps, plan?.target ?? '', true),
      ],
      description:
        'The Nightmare chose a redirect. Confirm or privately change where the haunted player’s ability lands; the haunted player is not notified.',
    };
  }
  const p = t.player ? actorOf(g, t.player) : null;
  if (p && p.id !== ST)
    notes.push(
      healthy(p)
        ? 'Acting player is healthy.'
        : `Acting player is ${isHof(g) ? 'feared or drunk' : 'drunk or poisoned'}: their ability fails, but you may still give (false) information.`,
    );
  if (p?.role === 'lostsoul')
    notes.push(
      `${p.name} is a Lost Soul acting as the ${role(r)?.name} without knowing it.`,
    );
  const count = r === 'guess' ? 0 : targetCount(r, g);
  const chosen = [choice?.target, choice?.target2, choice?.target3].slice(
    0,
    count,
  );
  const submitted = chosen.slice();
  if (
    count &&
    s.nightmare?.bound === p?.id &&
    s.nightmareRedirectTarget &&
    s.nightmare?.used
  )
    chosen[0] = s.nightmareRedirectTarget;
  if (count) {
    const once = ['gravedigger', 'priest', 'necromancer', 'mortician'].includes(
      r,
    );
    for (let i = 0; i < count; i++)
      fields.push(
        select(
          ['target', 'target2', 'target3'][i],
          count === 1
            ? 'Chosen player' + (once ? ' (blank to pass)' : '')
            : `Chosen player ${i + 1}`,
          none.concat(ps),
          chosen[i] ?? '',
        ),
      );
    if (TARGETING.includes(r)) {
      const n = s.nightmare;
      const bound = !!n && !n.used && n.bound === p?.id;
      const plan = bound
        ? g.nightChoices?.['nightmareRedirect:' + n!.player]
        : undefined;
      submitted.forEach((id) => {
        const q = g.players.find((x) => x.id === id);
        if (q?.role === 'dazed')
          notes.push(
            `${q.name} is Dazed: you may redirect to a living neighbor (${livingNeighbors(
              g,
              q,
            )
              .map((x) => x.name)
              .join(', ')}) or a player of their choice.`,
          );
      });
      if (bound)
        notes.push(
          `The Nightmare (${nameOf(g, n!.player)}) haunts this player and may redirect once${plan && !plan.pass ? `; they asked for ${nameOf(g, plan.target)}` : plan?.pass ? '; they passed tonight' : ''}. Apply Dazed redirects first, then the Nightmare’s.`,
        );
      if (bound && plan && !plan.pass)
        notes.push('Resolve the Nightmare redirect task before this ability.');
    }
  }
  if (choice?.pass) notes.push('The player passed.');
  if (isHof(g)) {
    hofNightFields(g, t, ps, fields, notes);
    if (choice && count && !choice.pass)
      notes.push(
        `Player selected ${chosen.map((id) => nameOf(g, id ?? '')).join(', ')}.`,
      );
    return { fields, description: notes.join(' ') };
  }
  switch (r) {
    case 'astrologist': {
      const sug = choice
        ? astrologistSuggestion(g, chosen.filter(Boolean) as string[])
        : ['', '', ''];
      for (let i = 0; i < 3; i++)
        fields.push(
          select(
            'reveal' + (i + 1),
            `Character ${i + 1}`,
            none.concat(roleList()),
            sug[i],
          ),
        );
      notes.push(
        'One character must belong to a chosen player and two must be out of play.',
      );
      break;
    }
    case 'mystic': {
      const sug = choice
        ? connections(
            g,
            g.players.find((q) => q.id === choice.target)!,
          ).slice(0, 3)
        : [];
      for (let i = 0; i < 3; i++)
        fields.push(
          select(
            'link' + (i + 1),
            `Connected player ${i + 1}`,
            none.concat(ps),
            sug[i] ?? '',
          ),
        );
      break;
    }
    case 'astronaut':
    case 'prophet':
    case 'insomniac':
    case 'spirit': {
      const sug = suggestions(g, t, choice);
      fields.push(
        text(
          'info',
          'Information (blank uses the calculation)',
          '',
          sug ? 'Calculated: ' + sug : '',
        ),
      );
      if (sug) notes.push('Calculated: ' + sug);
      break;
    }
    case 'diviner':
      notes.push(
        choice?.text
          ? `Question: “${choice.text}”`
          : 'No question was submitted; ask them directly.',
      );
      fields.push(
        select('target', 'Player to suggest', none.concat(ps), '', true),
      );
      break;
    case 'priest':
      fields.push(
        select(
          'newRole',
          'If reviving a Haunt: Villager they return as',
          none.concat(outOfPlay(g, 'townsfolk')),
        ),
      );
      break;
    case 'necromancer':
      fields.push(
        select(
          'newRole',
          'If reviving a Villager or Fool: Haunt they return as',
          none.concat(outOfPlay(g, 'minion')),
        ),
      );
      break;
    case 'gravedigger':
      fields.push(
        check('refuse', 'Refuse the change (setup-changing character)'),
      );
      break;
    case 'guess': {
      const members = s.constellation?.members ?? [];
      const mo = members.map((id) => ({ value: id, label: nameOf(g, id) }));
      members.forEach((id, i) =>
        fields.push(
          select(
            'guess' + (i + 1),
            `Guess for ${nameOf(g, id)}`,
            none.concat(roleList()),
            choice?.guesses?.find((x) => x.player === id)?.role ?? '',
          ),
        ),
      );
      const right = members.every((id, i) => {
        const q = g.players.find((x) => x.id === id);
        return q && (q.shown || q.role) === choice?.guesses?.[i]?.role;
      });
      if (choice?.guesses)
        notes.push(
          `The guess is ${right ? 'correct' : 'wrong'} by shown characters.`,
        );
      fields.push(
        check(
          'pass',
          'The Constellation passes (keeps the guess)',
          !!choice?.pass,
        ),
        select('outcome', 'Outcome', [
          { value: '', label: 'Use suggested result' },
          { value: 'correct', label: 'Correct' },
          { value: 'wrong', label: 'Wrong' },
        ]),
        select(
          'reward',
          'If correct: reward',
          [
            { value: 'life', label: 'Grant an extra life' },
            { value: 'revive', label: 'Revive at dawn' },
          ],
          'life',
        ),
        select('rewardPlayer', 'If correct: member', none.concat(mo)),
        check('killSelf', 'If wrong: the Constellation dies tonight'),
        select(
          'killMember',
          'If wrong: another member dies tonight',
          none.concat(mo.filter((o) => o.value !== p?.id)),
        ),
      );
      break;
    }
    case 'dreameater': {
      const rows = Math.min(15, (choice?.guesses?.length ?? 0) + 3);
      for (let i = 0; i < rows; i++) {
        const x = choice?.guesses?.[i];
        fields.push(
          select(
            `g${i + 1}player`,
            `Guess ${i + 1}: player`,
            none.concat(ps),
            x?.player ?? '',
          ),
          select(
            `g${i + 1}role`,
            `Guess ${i + 1}: character`,
            none.concat(roleList()),
            x?.role ?? '',
          ),
        );
      }
      const misses = g.players.find((q) => q.id === t.player)?.misses ?? 0;
      notes.push(
        `Wrong guesses so far: ${misses}. Guesses are judged against shown characters.`,
      );
      break;
    }
    case 'plague':
      notes.push(
        `${nameOf(g, s.infected?.target ?? '')} dies of the plague and their living neighbors are poisoned tonight.`,
      );
      break;
    case 'deaths':
      notes.push(
        `${s.deathQueue.length} queued death${s.deathQueue.length === 1 ? '' : 's'}: ${s.deathQueue.map((d) => `${nameOf(g, d.player)} (${d.cause})`).join(', ') || 'none'}.`,
      );
      break;
    case 'werewolf':
      if (!count) notes.push(`Preparation night (${g.night % 3}/2).`);
      break;
    case 'nightmare':
      notes.push(
        'Choose a living player whose ability targets players at night.',
      );
      break;
  }
  if (choice && count && !choice.pass)
    notes.push(
      `Player selected ${chosen.map((id) => nameOf(g, id ?? '')).join(', ')}.`,
    );
  return { fields, description: notes.join(' ') };
}
