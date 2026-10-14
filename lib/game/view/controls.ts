import {
  scriptRoles,
  role,
  type Game,
  type Actor,
  type Field,
  type Control,
} from '../types.ts';
import { eligibleVoters } from '../engine.ts';
import { isMoon, ST } from '../hms.ts';
import { hmsControls } from '../hms-view.ts';
import { select, overrideFields, input } from './fields.ts';
import { hostPhaseControls } from './host.ts';
import { hostSeatControls } from './seats.ts';
export function controls(g: Game, a: Actor): Control[] {
  const SR = scriptRoles(g.script);
  const roleOptions = SR.map((r) => ({ value: r.id, label: r.name }));
  const ps = g.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      value: p.id,
      label: `${p.seat}. ${p.name}${a.host && p.role ? ` (${role(p.role)?.name ?? p.role})` : ''}`,
    }));
  const result: Control[] = [];
  const add = (
    action: string,
    title: string,
    description: string,
    fields: Field[] = [],
    danger = false,
  ) =>
    result.push({
      action,
      title,
      description,
      fields:
        a.host &&
        action !== 'edit' &&
        !fields.some((f) => f.key === 'phaseToken')
          ? [
              ...fields,
              {
                key: 'phaseToken',
                label: '',
                type: 'hidden',
                value: `${g.day}:${g.night}:${g.phase}`,
              },
            ]
          : fields,
      danger,
    });
  if (!a.host && g.phase === 'lobby') {
    const me = g.players.find((p) => p.id === a.id);
    if (me?.seat)
      add(
        'leaveSeat',
        'Leave Seat',
        'Release your seat and stay in the lobby.',
      );
    else if (me) {
      const open = Array.from(
        {
          length: Math.max(
            5,
            g.players.length,
            ...g.players.map((p) => p.seat),
          ),
        },
        (_, i) => i + 1,
      )
        .filter((seat) => !g.players.some((p) => p.seat === seat))
        .map((seat) => ({ value: String(seat), label: `Seat ${seat}` }));
      add('claimSeat', 'Claim a seat', 'Choose an open place at the table.', [
        select('seat', 'Open seat', open, open[0]?.value),
      ]);
    }
  }
  hostPhaseControls(g, a, SR, ps, result, add);
  hmsControls(g, a, ps, add);
  const me = g.players.find((p) => p.id === a.id);
  if (
    g.phase === 'nomination' &&
    (a.host || (me?.alive && !g.nominators.includes(a.id)))
  )
    add(
      'nominate',
      'Make a nomination',
      'Each living player may nominate once per day; each player may be nominated once per day.',
      [
        ...(a.host
          ? [
              select(
                'by',
                'Nominator',
                ps.filter((o) =>
                  g.players.some(
                    (p) =>
                      p.id === o.value &&
                      p.alive &&
                      !p.departed &&
                      !g.nominators.includes(p.id),
                  ),
                ),
                '',
                true,
              ),
            ]
          : []),
        select(
          'target',
          'Nominee',
          (isMoon(g) && !g.nominees.includes(ST)
            ? [{ value: ST, label: 'The Storyteller' }]
            : []
          ).concat(
            ps.filter(
              (o) =>
                !g.nominees.includes(o.value) &&
                g.players.some(
                  (p) => p.id === o.value && p.alive && !p.departed,
                ),
            ),
          ),
          '',
          true,
        ),
        ...(a.host ? overrideFields : []),
      ],
    );
  const voters = eligibleVoters(g);
  if (
    g.phase === 'voting' &&
    voters.length &&
    (a.host || voters.some((p) => p.id === a.id))
  )
    add(
      'vote',
      'Cast your vote',
      'Votes are public. Voting closes when everyone eligible answers or the timer ends. The nominee cannot vote. A dead player spends their token only on a counted yes.',
      [
        ...(a.host
          ? [
              select(
                'player',
                'Player',
                ps.filter((o) => voters.some((p) => p.id === o.value)),
                voters[0]?.id,
              ),
            ]
          : []),
        select(
          'yes',
          'Vote',
          [
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
            { value: 'null', label: 'Abstain' },
          ],
          String(
            g.active && Object.hasOwn(g.active.votes, a.id)
              ? g.active.votes[a.id]
              : false,
          ),
        ),
      ],
    );
  add(
    'chat',
    a.host ? 'Message a player' : 'Message Storyteller',
    'Private conversation. Keep the app open to receive replies.',
    [
      ...(a.host
        ? [
            select(
              'to',
              'Recipient',
              [
                { value: 'all', label: 'Everyone (public announcement)' },
              ].concat(ps),
              'all',
            ),
          ]
        : []),
      { ...input('text', 'Message', '', 'textarea'), required: true },
    ],
  );
  hostSeatControls(g, a, SR, ps, roleOptions, add);
  if (g.phase === 'ended')
    add(
      'returnLobby',
      'Return to lobby',
      'Keep this lobby, its players, and seat order for another game. The completed game remains available as a recap.',
    );
  return result;
}
