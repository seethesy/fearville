import {
  scriptRoles,
  role,
  phaseName,
  type Game,
  type Actor,
  type Option,
} from '../types.ts';
import { isMoon } from '../hms.ts';
import { isHof } from '../hof.ts';
import { LIVE_FEED_LIMIT } from '../feed.ts';
import {
  type AddControl,
  select,
  input,
  optional,
  check,
  num,
} from './fields.ts';
export function hostSeatControls(
  g: Game,
  a: Actor,
  SR: ReturnType<typeof scriptRoles>,
  ps: Option[],
  roleOptions: Option[],
  add: AddControl,
) {
  if (a.host) {
    for (const p of g.players.slice().sort((a, b) => a.seat - b.seat))
      add(
        'edit',
        `Edit seat ${p.seat} · ${p.name}`,
        'Change characters and correct status. Actual roles and reminders are private.',
        [
          select('player', 'Player', [{ value: p.id, label: p.name }], p.id),
          input('name', 'Seat name', p.name),
          select('role', 'Actual character', roleOptions, p.role),
          select(
            'shown',
            isMoon(g)
              ? 'Shown Villager (Dazed, Moonshiner Fools, drunk players)'
              : 'Shown Villager (Drunk only)',
            optional.concat(
              SR.filter((r) => r.team === 'townsfolk').map((r) => ({
                value: r.id,
                label: r.name,
              })),
            ),
            p.shown === p.role ? '' : p.shown,
          ),
          ...(isHof(g)
            ? [
                check('feared', 'Feared tonight', !!p.feared),
                select(
                  'charge',
                  'Executioner’s target or Guardian’s ward',
                  optional.concat(ps.filter((o) => o.value !== p.id)),
                  p.charge ?? '',
                ),
              ]
            : []),
          ...(isMoon(g)
            ? [
                select(
                  'acts',
                  'Hidden Villager (Lost Soul only)',
                  optional.concat(
                    SR.filter((r) => r.team === 'townsfolk').map((r) => ({
                      value: r.id,
                      label: r.name,
                    })),
                  ),
                  p.acts ?? '',
                ),
                check(
                  'drunk',
                  'Drunk for the rest of the game (set automatically at start)',
                  !!p.drunk,
                ),
                check('marked', 'Marked by the Grim Reaper', !!p.marked),
                num('extraLife', 'Extra lives', p.extraLife ?? 0, 0, 3),
              ]
            : []),
          check('alive', 'Alive', p.alive),
          check('ghost', 'Dead vote available', p.ghost),
          ...(isMoon(g) ? [check('poisoned', 'Poisoned', p.poisoned)] : []),
          check('protected', 'Protected', p.protected),
          check('used', 'Once-per-game ability used', p.used),
          input('notes', 'Private reminders', p.notes, 'textarea'),
        ],
      );
    add(
      'configure',
      g.sandbox ? 'Script setup' : 'Timers & script setup',
      g.sandbox
        ? 'Set Horror bluffs and other script reminders. Timers are disabled in Sandbox.'
        : 'Timer values are in seconds. New values apply when the next phase begins.',
      [
        ...(g.sandbox
          ? []
          : Object.entries({ nightChoice: 60, ...g.timers }).map(
              ([key, value]) =>
                num(
                  key,
                  key === 'nightChoice'
                    ? 'Night choices'
                    : key[0].toUpperCase() + key.slice(1),
                  value,
                  5,
                  3600,
                ),
            )),
        ...['bluff1', 'bluff2', 'bluff3'].map((key, i) =>
          select(
            key,
            `Horror bluff ${i + 1}`,
            optional.concat(
              SR.filter(
                (r) =>
                  ['townsfolk', 'outsider'].includes(r.team) &&
                  !g.players.some(
                    (p) =>
                      p.role === r.id ||
                      (p.role === 'drunk' && p.shown === r.id),
                  ),
              ).map((r) => ({ value: r.id, label: r.name })),
            ),
            g.bluffs[i] || '',
          ),
        ),
        ...(isMoon(g)
          ? []
          : [
              select(
                'redHerring',
                isHof(g)
                  ? 'Detective’s false positive (a Villager)'
                  : 'Fortune Teller red herring',
                optional.concat(
                  ps.filter((o) =>
                    g.players.some(
                      (p) =>
                        p.id === o.value &&
                        (isHof(g)
                          ? ['townsfolk']
                          : ['townsfolk', 'outsider']
                        ).includes(role(p.role)?.team ?? ''),
                    ),
                  ),
                ),
                g.redHerring,
              ),
            ]),
      ],
    );
    if (g.history.length) {
      add(
        'undo',
        'Undo last decision',
        'Restore the preceding game state. Messages remain; any active timer pauses.',
        [
          {
            key: 'history',
            label: '',
            type: 'hidden',
            value: g.history.at(-1)!.id,
          },
        ],
        true,
      );
      add(
        'rewind',
        'Revert to an earlier decision',
        'Revert that decision and all later game changes. Information already read cannot be unseen.',
        [
          select(
            'history',
            'Restore state before',
            g.history
              .slice(-LIVE_FEED_LIMIT)
              .reverse()
              .map((h) => ({
                value: h.id,
                label:
                  new Date(h.at).toISOString().slice(11, 19) + ' · ' + h.text,
              })),
            g.history.at(-1)!.id,
          ),
        ],
        true,
      );
    }
    if (g.phase !== 'lobby') {
      add(
        'overridePhase',
        'Change phase manually',
        'Preserves existing day counters and task completion. Use rewind to restore an earlier round.',
        [
          select(
            'phase',
            'Phase',
            ['night', 'discovery', 'discussion', 'nomination', 'dayReview'].map(
              (p) => ({
                value: p,
                label: phaseName[p as keyof typeof phaseName],
              }),
            ),
            'night',
          ),
        ],
        true,
      );
      add(
        'end',
        'End game',
        'Confirm a winning team after reviewing character effects.',
        [
          select(
            'winner',
            'Winning team',
            [
              { value: 'good', label: 'Good' },
              { value: 'evil', label: 'Evil' },
            ],
            'good',
          ),
        ],
        true,
      );
    }
  }
}
