// Storyteller and player controls for Horrors of Fearville.
import {
  role,
  TEAM_NAMES,
  type Game,
  type Field,
  type Option,
  type Team,
} from '../types.ts';
import { nameOf } from '../engine.ts';
import {
  hms,
  seatNeighbors,
  livingNeighbors,
  team,
  type Task,
} from '../hms.ts';
import {
  seenVisitors,
  morticianFinds,
  psychicSuggestion,
  detectiveAnswer,
  judgeAnswer,
  savedTonight,
} from '../hof.ts';
import { select, check, none, text, roles } from './fields.ts';
// Night task fields for Horrors of Fearville abilities. Target selects for
// abilities that choose players are added by hmsNightFields.
export function hofNightFields(
  g: Game,
  t: Task,
  ps: Option[],
  fields: Field[],
  notes: string[],
) {
  const s = hms(g);
  const choice = g.nightChoices?.[t.key];
  const p = g.players.find((q) => q.id === t.player);
  const value = (key: string) =>
    fields.find((f) => f.key === key)?.value as string | undefined;
  const chosen = (key: string) =>
    g.players.find((q) => q.id === value(key)) ?? null;
  if (p?.feared) notes.push(`${p.name} is feared tonight.`);
  // Lost Wanderer: others visiting their player may be redirected.
  const w = s.wanderer;
  if (w && p && p.id !== w.player) {
    const near = g.players.find((q) => q.id === w.target);
    if (
      near &&
      [choice?.target, choice?.target2].includes(near.id) &&
      fields.some((f) => f.key === 'target')
    )
      notes.push(
        `${near.name} is with the Lost Wanderer: you may redirect this visit to one of their neighbors (${seatNeighbors(
          g,
          near,
        )
          .map((q) => q.name)
          .join(', ')}).`,
      );
  }
  const answer = (calc: string) => {
    fields.push(
      select(
        'info',
        'Answer (blank uses the calculation)',
        [
          { value: '', label: `Use calculated (${calc || '…'})` },
          { value: 'Yes', label: 'Yes' },
          { value: 'No', label: 'No' },
        ],
        '',
      ),
    );
    if (calc) notes.push('Calculated: ' + calc + '.');
  };
  switch (t.role) {
    case 'basilisk':
      notes.push('The chosen player is feared for the rest of tonight.');
      break;
    case 'doctor':
      notes.push('The chosen player cannot die tonight.');
      break;
    case 'monster':
    case 'wraith': {
      const target = chosen('target');
      if (target && savedTonight(g, target.id))
        notes.push(`${target.name} is saved tonight.`);
      if (t.role === 'wraith')
        fields.push(
          check(
            'hidden',
            'The Wraith stays hidden (not detected visiting)',
            !!choice?.flag,
          ),
        );
      else {
        const near = target ? livingNeighbors(g, target) : [];
        fields.push(
          select(
            'monsterFear',
            'If the target dies: neighbor to fear next night',
            none.concat(near.map((q) => ({ value: q.id, label: q.name }))),
            near.some((q) => q.id === choice?.fearTarget)
              ? choice!.fearTarget
              : (near[0]?.id ?? ''),
          ),
        );
      }
      break;
    }
    case 'detective': {
      const [a, b] = [chosen('target'), chosen('target2')];
      answer(a && b ? detectiveAnswer(g, a, b) : '');
      notes.push(
        `False positive: ${nameOf(g, g.redHerring)}. Yes if either player is a Horror or the false positive.`,
      );
      break;
    }
    case 'judge': {
      const [a, b] = [chosen('target'), chosen('target2')];
      answer(a && b ? judgeAnswer(a, b) : '');
      notes.push('Yes if both players have the same alignment.');
      break;
    }
    case 'watchman': {
      const target = chosen('target');
      const calc = target
        ? seenVisitors(g, target.id, p?.id)
            .map((id) => nameOf(g, id))
            .join(', ')
        : '';
      fields.push(
        text(
          'info',
          'Visitor names (blank uses the calculation)',
          target ? 'Calculated: ' + (calc || 'nobody') : '',
        ),
      );
      if (target)
        notes.push(
          `Visitors to ${target.name}: ${calc || 'nobody'}. Hidden Wraith visits are excluded.`,
        );
      break;
    }
    case 'mortician': {
      const target = chosen('target');
      const found = target
        ? morticianFinds(g, target.id, p?.id)
        : { roles: [], visitors: [] };
      fields.push(
        text(
          'info',
          'Roles that visited (blank uses the calculation)',
          target ? 'Calculated: ' + (found.roles.join(', ') || 'none') : '',
        ),
        select(
          'name',
          'Visitor’s name (3 or more visitors)',
          none.concat(
            found.visitors.map((id) => ({ value: id, label: nameOf(g, id) })),
          ),
          found.visitors.length >= 3 ? found.visitors[0] : '',
        ),
      );
      if (target)
        notes.push(
          `${target.name} was visited by ${found.visitors.length} different player${found.visitors.length === 1 ? '' : 's'} this game.`,
        );
      break;
    }
    case 'psychic': {
      const last = s.psychic?.[p?.id ?? ''];
      const field = fields.find((f) => f.key === 'target');
      if (field && !field.value && p) field.value = psychicSuggestion(g, p);
      notes.push(
        'You choose who the Psychic visits.' +
          (g.night > 1 && last
            ? ` Last night they visited a ${TEAM_NAMES[last as Team]?.replace(/s$/, '')}: choose a different role type.`
            : ''),
      );
      break;
    }
    case 'sheriff':
    case 'hoflibrarian': {
      const want: Team = t.role === 'sheriff' ? 'minion' : 'townsfolk';
      const holders = g.players.filter(
        (q) => team(q.role) === want && q.id !== p?.id,
      );
      const holder = holders[0];
      const other = g.players.find(
        (q) => q.id !== holder?.id && q.id !== p?.id,
      );
      fields.push(
        select(
          'target',
          'First player',
          none.concat(ps),
          holder?.id ?? '',
          true,
        ),
        select(
          'target2',
          'Second player',
          none.concat(ps),
          other?.id ?? '',
          true,
        ),
        select(
          'reveal',
          want === 'minion' ? 'Haunt to reveal' : 'Villager to reveal',
          none.concat(roles((x) => x === want)),
          holder?.role ?? '',
          true,
        ),
      );
      notes.push('One of the two players must have the character.');
      break;
    }
    case 'teacher': {
      const near = p ? seatNeighbors(g, p) : [];
      fields.push(
        select(
          'reveal',
          'Role to reveal',
          none.concat(roles()),
          near[0]?.role ?? '',
          true,
        ),
      );
      notes.push(
        `Neighbors: ${near.map((q) => `${q.name} (${role(q.role)?.name})`).join(', ')}.`,
      );
      break;
    }
  }
}
