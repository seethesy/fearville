import {
  ROLES,
  role,
  phaseName,
  type Game,
  type Actor,
  type Field,
  type Control,
  type Option,
} from './types.ts';
import {
  tasks,
  setupIssues,
  winHints,
  candidate,
  nameOf,
  healthy,
} from './engine.ts';
const select = (
  key: string,
  label: string,
  options: Option[],
  value = '',
  required = false,
): Field => ({ key, label, type: 'select', options, value, required });
const input = (
  key: string,
  label: string,
  value = '',
  type: Field['type'] = 'text',
): Field => ({ key, label, type, value });
const check = (key: string, label: string, value = false): Field => ({
  key,
  label,
  type: 'checkbox',
  value,
});
const num = (
  key: string,
  label: string,
  value: number,
  min = 1,
  max = 3600,
): Field => ({ key, label, type: 'number', value, min, max, required: true });
const optional = [{ value: '', label: 'None' }];
const roleOptions = ROLES.map((r) => ({ value: r.id, label: r.name }));
const overrideFields: Field[] = [
  check('override', 'Override standard rules'),
  {
    ...input('reason', 'Override reason'),
    hint: 'Required when changing a rules-based suggestion. Explain registration or the correction.',
  },
];
export function controls(g: Game, a: Actor): Control[] {
  const ps = g.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ value: p.id, label: `${p.seat}. ${p.name}` }));
  const result: Control[] = [];
  const add = (
    action: string,
    title: string,
    description: string,
    fields: Field[] = [],
    danger = false,
  ) => result.push({ action, title, description, fields, danger });
  if (a.host) {
    if (g.phase === 'lobby') {
      add(
        'randomAssign',
        'Randomly assign roles',
        'Preview a balanced Trouble Brewing setup for 5–15 players. Replaces all assigned characters, Demon bluffs, and the red herring. You can edit individual roles in Seats afterward.',
      );
      add(
        'start',
        'Deal roles & begin night',
        'Private characters are sent to each player. ' +
          (setupIssues(g).join(' ') || 'Setup is ready.'),
        overrideFields,
      );
    }
    if (g.phase === 'night') {
      const t = tasks(g).find((t) => !t.done);
      if (t) {
        const p = g.players.find((p) => p.id === t.player),
          r = t.role;
        const fields: Field[] = [
          {
            key: 'task',
            label: 'Night task',
            type: 'select',
            options: [{ value: t.key, label: t.name }],
            value: t.key,
          },
        ];
        let description = 'Review and confirm this step before continuing.';
        if (p)
          description += ` ${healthy(p) ? 'Acting player is healthy.' : 'Acting player is drunk or poisoned: simulate the ability; actual effects must fail.'}`;
        if (
          [
            'poisoner',
            'monk',
            'imp',
            'butler',
            'ravenkeeper',
            'fortuneteller',
            'washerwoman',
            'librarian',
            'investigator',
          ].includes(r)
        )
          fields.push(select('target', 'Chosen player', optional.concat(ps)));
        if (
          [
            'fortuneteller',
            'washerwoman',
            'librarian',
            'investigator',
          ].includes(r)
        )
          fields.push(select('target2', 'Second player', optional.concat(ps)));
        if (
          [
            'washerwoman',
            'librarian',
            'investigator',
            'undertaker',
            'ravenkeeper',
          ].includes(r)
        ) {
          const team =
            r === 'washerwoman'
              ? 'townsfolk'
              : r === 'librarian'
                ? 'outsider'
                : r === 'investigator'
                  ? 'minion'
                  : '';
          fields.push(
            select(
              'reveal',
              'Character to reveal',
              optional.concat(
                ROLES.filter((r) => !team || r.team === team).map((r) => ({
                  value: r.id,
                  label: r.name,
                })),
              ),
            ),
          );
        }
        if (r === 'librarian')
          fields.push(check('zero', 'Notify that zero Outsiders are in play'));
        if (['chef', 'empath', 'fortuneteller', 'spy'].includes(r))
          fields.push({
            ...input(
              'info',
              r === 'spy'
                ? 'Replacement Grimoire (required if poisoned)'
                : 'Information (leave blank for calculated suggestion)',
              '',
              'textarea',
            ),
            hint: 'The preview shows what will be sent. Use an override reason for registration changes.',
          });
        if (r === 'imp')
          fields.push(
            select(
              'redirect',
              'Mayor redirection (optional)',
              optional.concat(ps),
            ),
            select(
              'successor',
              'Imp self-kill successor',
              optional.concat(
                ps.filter((o) =>
                  g.players.some(
                    (p) =>
                      p.id === o.value &&
                      p.alive &&
                      role(p.role)?.team === 'minion',
                  ),
                ),
              ),
            ),
            select(
              'outcome',
              'Death ruling',
              [
                { value: 'suggested', label: 'Use suggested result' },
                { value: 'kill', label: 'Death (override if needed)' },
                { value: 'spare', label: 'No death (override if needed)' },
              ],
              'suggested',
            ),
          );
        fields.push(...overrideFields);
        add('night', 'Resolve ' + t.name, description, fields);
        add(
          'nightSkip',
          'Skip this night task',
          'Send no information and apply no effect.',
          [input('reason', 'Reason for skipping')],
          true,
        );
      } else
        add(
          'dawn',
          'Announce dawn',
          'Publish night deaths and start the Discovery timer. ' +
            winHints(g).join(' '),
          overrideFields,
        );
    }
    if (g.deadline !== null) add('pause', 'Pause timer', 'Pause for everyone.');
    else if (g.remaining > 0 && g.timers[g.phase])
      add('resume', 'Resume timer', 'Continue the shared countdown.');
    if (g.timers[g.phase]) {
      add('extend', 'Add time', 'Extend this timer.', [
        num('seconds', 'Seconds to add', 60),
      ]);
      add(
        'advance',
        'Advance phase',
        'End this phase now and advance the game.',
        [],
        true,
      );
    }
    if (g.phase === 'dayReview')
      add(
        'finishDay',
        'Confirm day outcome',
        'Review the ballot leader, character effects, and win conditions before the next night.',
        [
          select(
            'target',
            'Execution override',
            [{ value: '', label: 'Use ballot result' }].concat(ps),
          ),
          select('ruling', 'If a win condition applies', [
            { value: '', label: 'Prompt me if needed' },
            { value: 'good', label: 'Good wins' },
            { value: 'evil', label: 'Evil wins' },
            { value: 'continue', label: 'Continue (override)' },
          ]),
          ...overrideFields,
        ],
      );
    if (
      g.active &&
      ['defense', 'voting'].includes(g.phase) &&
      g.players.find((p) => p.id === g.active?.target)?.role === 'virgin'
    )
      add(
        'virgin',
        'Resolve Virgin execution',
        'Only for the Virgin’s first nomination while alive. Review whether the nominator registers as a Townsfolk.',
        overrideFields,
        true,
      );
    if (!['night', 'lobby', 'ended'].includes(g.phase))
      add(
        'slayer',
        'Resolve a Slayer claim',
        'Allow real and bluffing claims; confirm the public outcome.',
        [
          select('player', 'Claiming player', ps, ps[0]?.value),
          select('target', 'Chosen player', ps, ps[0]?.value),
          select(
            'outcome',
            'Outcome',
            [
              { value: 'suggested', label: 'Use suggested result' },
              { value: 'kill', label: 'Death' },
              { value: 'spare', label: 'No effect' },
            ],
            'suggested',
          ),
          ...overrideFields,
        ],
      );
  }
  const me = g.players.find((p) => p.id === a.id);
  if (!a.host && me && g.phase === 'night' && g.nightPoll?.night === g.night) {
    add(
      'nightPoll',
      'Answer tonight’s poll',
      g.nightPoll.question +
        ' Just for fun. Answers stay private; the favorite is revealed after dawn.',
      [
        select(
          'poll',
          'Tonight’s question',
          [{ value: g.nightPoll.id, label: g.nightPoll.question }],
          g.nightPoll.id,
          true,
        ),
        select(
          'target',
          'Pick a player',
          ps,
          g.nightPoll.answers[a.id] ?? '',
          true,
        ),
      ],
    );
  }
  if (
    g.phase === 'nomination' &&
    (a.host || (me?.alive && !g.nominators.includes(a.id)))
  )
    add(
      'nominate',
      'Make a nomination',
      'Each living player may nominate once per day; each player may be nominated once per day.',
      [
        ...(a.host ? [select('by', 'Nominator', ps, ps[0]?.value)] : []),
        select(
          'target',
          'Nominee',
          ps.filter((o) => a.host || !g.nominees.includes(o.value)),
          '',
          true,
        ),
        ...(a.host ? overrideFields : []),
      ],
    );
  if (g.phase === 'voting' && (a.host || me?.alive || me?.ghost))
    add(
      'vote',
      'Cast your vote',
      'Yes votes count at the end of the timer. A dead player spends their token only on a counted yes vote.',
      [
        ...(a.host ? [select('player', 'Player', ps, ps[0]?.value)] : []),
        select(
          'yes',
          'Vote',
          [
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ],
          String(g.active?.votes[a.id] ?? false),
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
  if (a.host) {
    for (const p of g.players.slice().sort((a, b) => a.seat - b.seat))
      add(
        'edit',
        `Edit seat ${p.seat} · ${p.name}`,
        'Swap seat order, change characters, and correct status. Actual roles and reminders are private.',
        [
          select('player', 'Player', [{ value: p.id, label: p.name }], p.id),
          input('name', 'Seat name', p.name),
          num('seat', 'Seat number', p.seat, 1, g.players.length),
          select('role', 'Actual character', roleOptions, p.role),
          select(
            'shown',
            'Shown Townsfolk (Drunk only)',
            optional.concat(
              ROLES.filter((r) => r.team === 'townsfolk').map((r) => ({
                value: r.id,
                label: r.name,
              })),
            ),
            p.shown,
          ),
          check('alive', 'Alive', p.alive),
          check('ghost', 'Dead vote available', p.ghost),
          check('poisoned', 'Poisoned', p.poisoned),
          check('protected', 'Monk protection', p.protected),
          check('used', 'Once-per-game ability used', p.used),
          input('notes', 'Private reminders', p.notes, 'textarea'),
        ],
      );
    add(
      'configure',
      'Timers & script setup',
      'Timer values are in seconds. New values apply when the next phase begins.',
      [
        ...Object.entries(g.timers).map(([key, value]) =>
          num(key, key[0].toUpperCase() + key.slice(1), value, 5, 3600),
        ),
        ...['bluff1', 'bluff2', 'bluff3'].map((key, i) =>
          select(
            key,
            `Demon bluff ${i + 1}`,
            optional.concat(
              ROLES.filter((r) =>
                ['townsfolk', 'outsider'].includes(r.team),
              ).map((r) => ({ value: r.id, label: r.name })),
            ),
            g.bluffs[i] || '',
          ),
        ),
        select(
          'redHerring',
          'Fortune Teller red herring',
          optional.concat(ps),
          g.redHerring,
        ),
      ],
    );
    if (g.history.length) {
      add(
        'undo',
        'Undo last decision',
        'Restore the preceding game state. Messages remain; any active timer pauses.',
        [],
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
              .slice()
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
          input('reason', 'Reason'),
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
  return result;
}
export function view(g: Game, a: Actor, version: number, now: number) {
  const me = g.players.find((p) => p.id === a.id);
  const leader = candidate(g);
  return {
    code: g.code,
    hostName: g.hostName,
    host: a.host,
    me: a.id,
    phase: g.phase,
    phaseLabel: phaseName[g.phase],
    day: g.day,
    night: g.night,
    version,
    serverNow: now,
    deadline: g.deadline,
    remaining: g.remaining,
    winner: g.winner,
    nightPoll:
      !a.host && me && g.phase === 'night' && g.nightPoll?.night === g.night
        ? {
            id: g.nightPoll.id,
            question: g.nightPoll.question,
            answer: g.nightPoll.answers[a.id] ?? null,
          }
        : null,
    previousNightPoll:
      g.previousNightPoll &&
      (g.phase !== 'night' || g.previousNightPoll.night < g.night)
        ? g.previousNightPoll
        : null,
    players: g.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        alive: a.host ? p.alive : p.publicAlive,
        ghost: g.phase === 'night' && !a.host ? p.ghost : p.ghost,
        ...(a.host
          ? {
              role: p.role,
              shown: p.shown,
              notes: p.notes,
              poisoned: p.poisoned,
              protected: p.protected,
              used: p.used,
            }
          : {}),
        nominated: g.nominees.includes(p.id),
        hasNominated: g.nominators.includes(p.id),
      })),
    character:
      !a.host && g.phase !== 'lobby' && me
        ? {
            name: role(me.shown || me.role)?.name,
            description: role(me.shown || me.role)?.description,
            alignment: ['minion', 'demon'].includes(
              role(me.shown || me.role)?.team || '',
            )
              ? 'evil'
              : 'good',
          }
        : null,
    tasks: a.host && g.phase === 'night' ? tasks(g) : [],
    issues: a.host && g.phase === 'lobby' ? setupIssues(g) : [],
    hints: a.host ? winHints(g) : [],
    active: g.active
      ? {
          id: g.active.id,
          by: g.active.by,
          target: g.active.target,
          threshold: g.active.threshold,
          myVote: g.active.votes[a.id] ?? null,
          ...(a.host ? { votes: g.active.votes } : {}),
        }
      : null,
    ballots: g.ballots.map((b) => ({
      id: b.id,
      by: b.by,
      target: b.target,
      count: b.count,
      threshold: b.threshold,
      ...(a.host ? { invalid: b.invalid } : {}),
    })),
    leader: { ...leader, name: leader.target ? nameOf(g, leader.target) : '' },
    messages: g.messages.filter(
      (m) => a.host || m.to === 'all' || m.to === a.id || m.from === a.id,
    ),
    log: g.log.filter((l) => a.host || l.public).slice(-200),
    controls: controls(g, a),
  };
}
export type GameView = ReturnType<typeof view>;
