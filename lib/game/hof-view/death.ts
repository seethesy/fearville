// Storyteller and player controls for Horrors of Fearville.
import {
  type Game,
  type Field,
  type Option,
  type DeathItem,
  type Player,
} from '../types.ts';
import { nameOf, healthy } from '../engine.ts';
import { team } from '../hms.ts';
import { guardianFor } from '../hof.ts';
import { check, select, none } from './fields.ts';
export function hofDeathFields(
  g: Game,
  d: DeathItem,
  v: Player,
  ps: Option[],
  fields: Field[],
  notes: string[],
) {
  const guardian = !d.redirected ? guardianFor(g, v) : undefined;
  if (guardian) {
    fields.push(
      check('guardian', `Guardian ${guardian.name} dies in their place`, true),
    );
    notes.push(`${guardian.name} is ${v.name}’s Guardian.`);
  }
  if (v.role === 'hunter' && d.night && healthy(v))
    fields.push(
      select(
        'hunterHaunt',
        'Hunter: a Haunt who also dies (optional)',
        none.concat(
          ps.filter((o) =>
            g.players.some(
              (q) => q.id === o.value && q.alive && team(q.role) === 'minion',
            ),
          ),
        ),
      ),
    );
  if (d.by === 'monster' && d.monsterFear)
    notes.push(
      `If ${v.name} dies, the Monster fears ${nameOf(g, d.monsterFear)} next night.`,
    );
  if (v.role === 'hag')
    notes.push('The Hag may then declare another player to die.');
  if (v.role === 'banshee' && d.cause === 'execution' && healthy(v))
    notes.push('An executed Banshee fears every Villager tonight.');
  for (const q of g.players.filter(
    (q) => q.role === 'executioner' && q.charge === v.id,
  ))
    if (d.cause === 'execution')
      notes.push(`${q.name} (Executioner) wins if this execution happens.`);
}
