// Storyteller and player controls for Holy Moon and Stars.
import {
  role,
  type Game,
  type Field,
  type Control,
  type Option,
} from '../types.ts';
import { nameOf, healthy } from '../engine.ts';
import { hms, pendingDeath, preventedBy, fateweaverFor, team } from '../hms.ts';
import { isHof } from '../hof.ts';
import { hofDeathFields } from '../hof-view.ts';
import { select, none, check, roleList, outOfPlay } from './fields.ts';
export function deathControl(g: Game, ps: Option[]): Control | null {
  const s = hms(g);
  const d = pendingDeath(g);
  if (!d) return null;
  if (d.bodyguard && d.bodyguard.decision === undefined) return null;
  const v = g.players.find((p) => p.id === d.player)!;
  const reason = preventedBy(g, d);
  const fields: Field[] = [
    select(
      'death',
      'Death',
      [{ value: d.id, label: `${v.name} · ${d.cause}` }],
      d.id,
      true,
    ),
    select('outcome', 'Outcome', [
      {
        value: '',
        label: `Use suggested result (${reason ? 'survives: ' + reason : 'dies'})`,
      },
      { value: 'kill', label: 'Dies (override if needed)' },
      { value: 'spare', label: 'Survives (override if needed)' },
    ]),
  ];
  const weaver = !d.redirected ? fateweaverFor(g, v) : undefined;
  if (weaver)
    fields.push(
      select(
        'fateweaver',
        `Fateweaver ${weaver.name}: redirect to${healthy(weaver) ? '' : ' (impaired)'}`,
        none.concat(
          ps.filter(
            (o) =>
              o.value !== v.id &&
              g.players.some((p) => p.id === o.value && p.alive),
          ),
        ),
        weaver.pref && weaver.pref !== v.id ? weaver.pref : '',
      ),
    );
  const con = s.constellation;
  if (con?.linked && con.members.includes(v.id))
    for (const m of con.members)
      if (m !== v.id && g.players.some((p) => p.id === m && p.alive))
        fields.push(
          check('link_' + m, `Constellation link: ${nameOf(g, m)} also dies`),
        );
  if (v.role === 'zealot')
    fields.push(
      select(
        'zealotRole',
        'Zealot: ability the Storyteller gains',
        none.concat(roleList()),
        '',
        true,
      ),
    );
  if (v.role === 'priest' && !v.revived && healthy(v))
    fields.push(
      select(
        'priestRole',
        'Priest: returns at the next dawn as',
        none.concat(outOfPlay(g, 'townsfolk')),
      ),
    );
  if (v.role === 'celestial' && d.cause === 'execution' && healthy(v))
    fields.push(
      select(
        'celestialDrunk',
        'Celestial: Villager who becomes drunk',
        none.concat(
          ps.filter((o) =>
            g.players.some(
              (p) =>
                p.id === o.value &&
                team(p.role) === 'townsfolk' &&
                p.id !== v.id,
            ),
          ),
        ),
      ),
    );
  const notes = [`${v.name} (${role(v.role)?.name}) · ${d.cause}.`];
  if (reason) notes.push(`Prevented by ${reason}.`);
  if (isHof(g)) hofDeathFields(g, d, v, ps, fields, notes);
  if (weaver)
    notes.push(
      `${weaver.name} is the Fateweaver next to them and may redirect this death once.`,
    );
  if (v.role === 'nightmare' && d.cause === 'execution')
    notes.push('An executed Nightmare haunts a player from the next night.');
  if (team(v.role) === 'demon') notes.push('The Horror dying means good wins.');
  return {
    action: 'resolveDeath',
    title: 'Resolve death · ' + v.name,
    description: notes.join(' '),
    fields,
    danger: true,
  };
}
