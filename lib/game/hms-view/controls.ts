// Storyteller and player controls for Holy Moon and Stars.
import { type Game, type Actor, type Field, type Option } from '../types.ts';
import { actsAs, livingNeighbors, stActor, team } from '../hms.ts';
import { isHof } from '../hof.ts';
import { hofControls } from '../hof-view.ts';
import { check, select, none } from './fields.ts';
export function hmsControls(
  g: Game,
  a: Actor,
  ps: Option[],
  add: (
    action: string,
    title: string,
    description: string,
    fields?: Field[],
    danger?: boolean,
  ) => void,
) {
  if (isHof(g)) return hofControls(g, a, ps, add);
  const s = g.hms;
  const running = g.phase !== 'lobby' && g.phase !== 'ended';
  const day = [
    'discovery',
    'discussion',
    'nomination',
    'defense',
    'voting',
    'dayReview',
  ].includes(g.phase);
  const living = g.players.filter((p) => p.alive).length;
  const confirm = (label: string) => [
    { ...check('confirm', label), required: true },
  ];
  if (a.host) {
    if (running) {
      const prophets = g.players.filter((p) => p.role === 'prophet' && p.alive);
      if (prophets.length)
        add(
          'prophetReveal',
          'Prophet revealed their information',
          'Queue the Prophet and, optionally, one living neighbor to die tonight.',
          [
            select(
              'player',
              'Prophet',
              ps.filter((o) => prophets.some((p) => p.id === o.value)),
              prophets[0].id,
              true,
            ),
            select(
              'neighbor',
              'Neighbor who also dies',
              none.concat(
                ps.filter((o) =>
                  livingNeighbors(g, prophets[0]).some((p) => p.id === o.value),
                ),
              ),
            ),
          ],
          true,
        );
      if (
        g.players.some(
          (p) =>
            (team(p.role) === 'outsider' &&
              p.shown !== p.role &&
              p.role !== 'lostsoul') ||
            (p.role === 'lostsoul' && p.shown !== 'lostsoul'),
        )
      )
        add(
          'soberFools',
          'Sober up the Fools',
          'Every Fool learns their real character. Dazed and Lost Soul abilities still do not work.',
          confirm('Reveal real characters to the Fools'),
          true,
        );
      const st = stActor(g);
      if (st?.role === 'astrophage' && !s?.stUsed && day && living > 4)
        add(
          'astrophage',
          'End the day early (Storyteller’s Astrophage)',
          'Ends today with no execution and starts the night.',
          confirm('End the day now'),
          true,
        );
      if (
        st?.role === 'grimreaper' &&
        g.players.some((p) => p.marked && p.alive)
      )
        add(
          'reap',
          'Reap marked players (Storyteller’s Grim Reaper)',
          'Every marked player dies now.',
          confirm('Kill every marked player'),
          true,
        );
    }
    return;
  }
  const me = g.players.find((p) => p.id === a.id);
  if (!me || !running) return;
  if (me.role === 'astrophage' && me.alive && !me.used && day && living > 4)
    add(
      'astrophage',
      'End the day early',
      'Once per game. Ends today immediately with no execution; everyone sees that the day ended.',
      confirm('End the day now'),
      true,
    );
  if (
    me.role === 'grimreaper' &&
    me.alive &&
    g.players.some((p) => p.marked && p.alive)
  )
    add(
      'reap',
      'Reap your marks',
      `Marked: ${g.players
        .filter((p) => p.marked && p.alive)
        .map((p) => p.name)
        .join(', ')}. Every marked player dies now.`,
      confirm('Kill every marked player'),
      true,
    );
  if (actsAs(me) === 'fateweaver' && me.alive && !me.used)
    add(
      'fateweaverPref',
      'Fateweaver: choose a redirect',
      'If one of your living neighbors dies, you ask the Storyteller to move the death to this player.',
      [
        select(
          'target',
          'Redirect to',
          none.concat(ps.filter((o) => o.value !== me.id)),
          me.pref ?? '',
        ),
      ],
    );
}
