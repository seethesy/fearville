import {
  ROLES,
  scriptRoles,
  SCRIPTS,
  COUNTS,
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
  eligibleVoters,
  nightChoiceTask,
} from './engine.ts';
import {
  isHms,
  ST,
  nightChoiceDeadlineFor,
  nightChoiceWindowDeadline,
} from './hms.ts';
import { hmsNightFields, deathControl, hmsControls } from './hms-view.ts';
import { recapOf } from './lobby.ts';
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
const overrideFields: Field[] = [check('override', 'Override standard rules')];
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
  ) => result.push({ action, title, description, fields, danger });
  if (a.host) {
    if (g.phase === 'lobby') {
      if (g.sandbox) {
        add(
          'addDummy',
          'Add dummy player',
          'Add a simulated seat that you can control by switching point of view.',
          [
            input(
              'name',
              'Dummy player name',
              `Player ${g.players.length + 1}`,
            ),
          ],
        );
        for (const player of g.players.filter((p) => p.dummy))
          add(
            'removeDummy',
            `Remove ${player.name}`,
            'Remove this dummy seat from the Sandbox.',
            [
              select(
                'player',
                'Dummy player',
                [{ value: player.id, label: player.name }],
                player.id,
                true,
              ),
            ],
            true,
          );
      }
      add(
        'setScript',
        'Change role script',
        'Choose the script before starting. Assigned characters must come from the selected script.',
        [
          select(
            'script',
            'Role script',
            Object.entries(SCRIPTS).map(([value, label]) => ({ value, label })),
            g.script ?? 'classic',
            true,
          ),
        ],
      );
    }
    if (g.phase === 'lobby') {
      const outOfPlayGood = SR.filter(
        (r) =>
          ['townsfolk', 'outsider'].includes(r.team) &&
          !g.players.some((p) => p.role === r.id),
      ).map((r) => ({ value: r.id, label: r.name }));
      const outOfPlayVillagers = SR.filter(
        (r) =>
          r.team === 'townsfolk' && !g.players.some((p) => p.role === r.id),
      ).map((r) => ({ value: r.id, label: r.name }));
      const setupFields: Field[] = [
        { key: 'confirmSetup', label: '', type: 'hidden', value: true },
      ];
      const reservedHidden = new Set<string>();
      const hiddenDefault = (current?: string) => {
        const validCurrent = outOfPlayVillagers.some(
          (option) => option.value === current,
        );
        const value =
          validCurrent && !reservedHidden.has(current!)
            ? current!
            : (outOfPlayVillagers.find(
                (option) => !reservedHidden.has(option.value),
              )?.value ?? '');
        if (value) reservedHidden.add(value);
        return value;
      };
      const hiddenDefaults = new Map<string, string>();
      for (const p of g.players) {
        if (p.role === 'drunk')
          hiddenDefaults.set('shown_' + p.id, hiddenDefault(p.shown));
        if (
          isHms(g) &&
          (p.role === 'dazed' ||
            (g.players.some((q) => q.role === 'moonshiner') &&
              role(p.role)?.team === 'outsider'))
        )
          hiddenDefaults.set('shown_' + p.id, hiddenDefault(p.shown));
        if (isHms(g) && p.role === 'lostsoul')
          hiddenDefaults.set('acts_' + p.id, hiddenDefault(p.acts));
      }
      const bluffPool = outOfPlayGood.filter(
        (option) => !reservedHidden.has(option.value),
      );
      const bluffDefaults: string[] = [];
      for (let i = 0; i < 3; i++) {
        const current = g.bluffs[i];
        const value = bluffPool.some(
          (option) =>
            option.value === current && !bluffDefaults.includes(current),
        )
          ? current
          : (bluffPool.find((option) => !bluffDefaults.includes(option.value))
              ?.value ?? '');
        bluffDefaults.push(value);
      }
      if (!g.players.some((p) => p.role === 'atheist'))
        for (let i = 0; i < 3; i++)
          setupFields.push(
            select(
              `bluff${i + 1}`,
              `Horror bluff ${i + 1}`,
              outOfPlayGood,
              bluffDefaults[i],
              g.players.length >= 7,
            ),
          );
      for (const p of g.players) {
        if (p.role === 'drunk')
          setupFields.push(
            select(
              'shown_' + p.id,
              `${p.name} · Drunk’s shown Villager`,
              outOfPlayVillagers,
              hiddenDefaults.get('shown_' + p.id) ?? '',
              true,
            ),
          );
        if (
          isHms(g) &&
          (p.role === 'dazed' ||
            (g.players.some((q) => q.role === 'moonshiner') &&
              role(p.role)?.team === 'outsider'))
        )
          setupFields.push(
            select(
              'shown_' + p.id,
              `${p.name} · shown Villager`,
              outOfPlayVillagers,
              hiddenDefaults.get('shown_' + p.id) ?? '',
              true,
            ),
          );
        if (isHms(g) && p.role === 'lostsoul')
          setupFields.push(
            select(
              'acts_' + p.id,
              `${p.name} · Lost Soul’s hidden Villager`,
              outOfPlayVillagers,
              hiddenDefaults.get('acts_' + p.id) ?? '',
              true,
            ),
          );
      }
      if (
        !isHms(g) &&
        g.players.some(
          (p) => p.role === 'fortuneteller' || p.shown === 'fortuneteller',
        )
      )
        setupFields.push(
          select(
            'redHerring',
            'Fortune Teller red herring',
            ps.filter((option) =>
              g.players.some(
                (p) =>
                  p.id === option.value &&
                  ['townsfolk', 'outsider'].includes(role(p.role)?.team ?? ''),
              ),
            ),
            g.redHerring ||
              g.players.find((p) =>
                ['townsfolk', 'outsider'].includes(role(p.role)?.team ?? ''),
              )?.id ||
              '',
            true,
          ),
        );
      add(
        'randomAssign',
        'Randomly assign roles',
        isHms(g)
          ? 'Apply a balanced Holy Moon and Stars setup for 5–15 players (never an Atheist). Replaces all assigned characters, hidden Villagers and Horror bluffs. You can edit individual roles in Seats afterward.'
          : 'Apply a balanced Fearville Classic setup for 5–15 players. Replaces all assigned characters, Horror bluffs, and the red herring. You can edit individual roles in Seats afterward.',
      );
      add(
        'start',
        'Deal roles & begin night',
        'Review the script-specific setup decisions below. Defaults are ready, but you can change them before private characters are sent. ' +
          (setupIssues(g).join(' ') || 'Setup is ready.'),
        setupFields,
      );
    }
    const death = isHms(g) ? deathControl(g, ps) : null;
    if (death) result.push(death);
    if (g.phase === 'night' && isHms(g) && !death) {
      const t = tasks(g).find((t) => !t.done);
      if (t) {
        const { fields, description } = hmsNightFields(g, t, ps);
        add(
          'night',
          'Resolve ' + t.name,
          description || 'Review and confirm this step before continuing.',
          [
            { key: 'task', label: '', type: 'hidden', value: t.key },
            ...fields,
            ...overrideFields,
          ],
        );
        add(
          'nightDefer',
          'Do this task later',
          'Move this task behind the other unresolved night tasks. Nothing is announced to players.',
          [],
        );
        add(
          'nightSkip',
          'Skip this task entirely',
          'Complete this task without sending information or applying its effect. Nothing is announced to players.',
          [],
          true,
        );
      } else
        add(
          'dawn',
          'Announce dawn',
          'Publish night deaths, apply revivals and character changes, close the Medium’s channel, and start Discovery. ' +
            winHints(g).join(' '),
          [],
        );
    }
    if (g.phase === 'night' && !isHms(g)) {
      const t = tasks(g).find((t) => !t.done);
      if (t) {
        const p = g.players.find((p) => p.id === t.player),
          r = t.role;
        const fields: Field[] = [
          { key: 'task', label: '', type: 'hidden', value: t.key },
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
          fields.push(
            select(
              'target',
              'Chosen player',
              optional.concat(
                ps.filter(
                  (o) => !['monk', 'butler'].includes(r) || o.value !== p?.id,
                ),
              ),
            ),
          );
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
          fields.push(check('zero', 'Notify that zero Fools are in play'));
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
            hint: 'Leave blank to use the calculated information.',
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
        const choice = g.nightChoices?.[t.key];
        if (choice) {
          for (const field of fields) {
            if (field.key === 'target') field.value = choice.target;
            if (field.key === 'target2') field.value = choice.target2;
          }
          description += ` Player selected ${nameOf(g, choice.target)}${choice.target2 ? ' and ' + nameOf(g, choice.target2) : ''}. Confirm to resolve.`;
        }
        add('night', 'Resolve ' + t.name, description, fields);
        add(
          'nightDefer',
          'Do this task later',
          'Move this task behind the other unresolved night tasks. Nothing is announced to players.',
          [],
        );
        add(
          'nightSkip',
          'Skip this task entirely',
          'Complete this task without sending information or applying its effect. Nothing is announced to players.',
          [],
          true,
        );
      } else
        add(
          'dawn',
          'Announce dawn',
          'Publish night deaths and start the Discovery timer. ' +
            winHints(g).join(' '),
          [],
        );
    }
    if (!g.sandbox && g.deadline !== null)
      add('pause', 'Pause timer', 'Pause for everyone.');
    else if (!g.sandbox && g.remaining > 0 && g.timers[g.phase])
      add('resume', 'Resume timer', 'Continue the shared countdown.');
    if (!g.sandbox && g.timers[g.phase]) {
      add('extend', 'Add time', 'Extend this timer.', [
        num('seconds', 'Seconds to add', 30),
      ]);
      add(
        'advance',
        'Advance phase',
        'End this phase now and advance the game.',
        [],
        true,
      );
    }
    if (
      g.sandbox &&
      ['discovery', 'discussion', 'nomination', 'defense', 'voting'].includes(
        g.phase,
      )
    )
      add(
        'advance',
        'Advance phase',
        'Sandbox timers are disabled. Advance whenever you are ready.',
        [],
        true,
      );
    if (g.phase === 'dayReview' && isHms(g))
      add(
        'finishDay',
        'Confirm day outcome',
        (g.execution
          ? `Executed today: ${nameOf(g, g.execution)}.`
          : candidate(g).target
            ? `Ballot leader: ${nameOf(g, candidate(g).target)}. Their execution and all win conditions will be calculated automatically.`
            : 'No execution today.') +
          ' Confirm to apply the automatic result.',
        [],
      );
    if (g.phase === 'dayReview' && !isHms(g))
      add(
        'finishDay',
        'Confirm day outcome',
        `${candidate(g).target ? `${nameOf(g, candidate(g).target)} is the ballot leader and will be executed.` : candidate(g).tied ? 'The vote is tied, so nobody will be executed.' : 'Nobody qualified for execution.'} Character effects and win conditions will be calculated automatically.`,
        [],
      );
    if (
      !isHms(g) &&
      g.active &&
      ['defense', 'voting'].includes(g.phase) &&
      g.players.find((p) => p.id === g.active?.target)?.role === 'virgin'
    )
      add(
        'virgin',
        'Resolve Virgin execution',
        'Only for the Virgin’s first nomination while alive. Review whether the nominator registers as a Villager.',
        overrideFields,
        true,
      );
    if (!isHms(g) && !['night', 'lobby', 'ended'].includes(g.phase))
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
  if (isHms(g)) hmsControls(g, a, ps, add);
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
          (isHms(g) && !g.nominees.includes(ST)
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
            isHms(g)
              ? 'Shown Villager (Dazed, Moonshiner Fools, drunk players)'
              : 'Shown Villager (Drunk only)',
            optional.concat(
              SR.filter((r) => r.team === 'townsfolk').map((r) => ({
                value: r.id,
                label: r.name,
              })),
            ),
            isHms(g) && p.shown === p.role ? '' : p.shown,
          ),
          ...(isHms(g)
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
          check('poisoned', 'Poisoned', p.poisoned),
          ...(isHms(g)
            ? []
            : [check('protected', 'Monk protection', p.protected)]),
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
        ...(isHms(g)
          ? []
          : [
              select(
                'redHerring',
                'Fortune Teller red herring',
                optional.concat(
                  ps.filter((o) =>
                    g.players.some(
                      (p) =>
                        p.id === o.value &&
                        ['townsfolk', 'outsider'].includes(
                          role(p.role)?.team ?? '',
                        ),
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
  if (g.phase === 'ended')
    add(
      'returnLobby',
      'Return to lobby',
      'Keep this lobby, its players, and seat order for another game. The completed game remains available as a recap.',
    );
  return result;
}
export function view(
  g: Game,
  a: Actor,
  version: number,
  now: number,
  sandboxHost = false,
) {
  const me = g.players.find((p) => p.id === a.id);
  const leader = candidate(g);
  const choiceTask = nightChoiceTask(g, a.id);
  const currentTask =
    g.phase === 'night' ? tasks(g).find((t) => !t.done) : null;
  const actingPlayer = g.players.find((p) => p.id === currentTask?.player);
  return {
    code: g.code,
    sandbox: !!g.sandbox,
    sandboxHost,
    script: g.script ?? 'classic',
    scriptName: SCRIPTS[g.script ?? 'classic'],
    nightIntroduction:
      !a.host && me && !me.departed && g.phase === 'night' && g.night === 1
        ? (g.nightIntroductions?.[a.id] ?? null)
        : null,
    nightChoice:
      !a.host &&
      choiceTask?.player === a.id &&
      now < nightChoiceDeadlineFor(g, choiceTask)
        ? {
            task: choiceTask.key,
            deadline: g.sandbox ? null : nightChoiceDeadlineFor(g, choiceTask),
            conditional: choiceTask.role === 'ravenkeeper',
            round: choiceTask.round,
            count: choiceTask.count,
            text: 'text' in choiceTask ? !!choiceTask.text : false,
            guesses:
              'guesses' in choiceTask ? (choiceTask.guesses ?? null) : null,
            members:
              'members' in choiceTask
                ? (choiceTask.members ?? []).map((id) => ({
                    id,
                    name: nameOf(g, id),
                  }))
                : [],
            optional: 'optional' in choiceTask ? !!choiceTask.optional : false,
            label: 'label' in choiceTask ? (choiceTask.label ?? '') : '',
            options: choiceTask.options.map((p) => ({
              ...p,
              knownRole:
                role(me?.role ?? '')?.team === 'demon' &&
                role(g.players.find((q) => q.id === p.id)?.role ?? '')?.team ===
                  'minion'
                  ? role(g.players.find((q) => q.id === p.id)!.role)?.name
                  : undefined,
            })),
            choice: g.nightChoices?.[choiceTask.key] ?? null,
          }
        : null,
    nightConfirmation:
      a.host && currentTask
        ? {
            task: currentTask.key,
            playerName: actingPlayer?.name ?? '',
            poisoned: !!actingPlayer?.poisoned,
            ability:
              role(currentTask.role)?.description ??
              (currentTask.role === 'nightmareRuling'
                ? 'Privately resolve the Nightmare’s requested redirect before the haunted ability lands.'
                : ''),
            statuses: [
              { name: 'Poisoned', active: !!actingPlayer?.poisoned },
              {
                name: 'Drunk',
                active: !!actingPlayer?.drunk || actingPlayer?.role === 'drunk',
              },
              {
                name: 'Redirected',
                active:
                  !!actingPlayer &&
                  g.hms?.nightmare?.bound === actingPlayer.id &&
                  !!g.hms.nightmareRedirectTarget,
              },
              {
                name: 'Protected',
                active: !!actingPlayer?.protected,
              },
              {
                name: 'Infected',
                active: g.hms?.infected?.target === actingPlayer?.id,
              },
              {
                name: 'Marked',
                active: !!actingPlayer?.marked,
              },
              {
                name: 'Haunted',
                active:
                  !!actingPlayer && g.hms?.nightmare?.bound === actingPlayer.id,
              },
            ],
            choice: g.nightChoices?.[currentTask.key] ?? null,
          }
        : null,
    standardCounts: COUNTS[g.players.length] ?? null,
    channel:
      !a.host &&
      g.phase === 'night' &&
      g.hms?.channel &&
      [g.hms.channel.a, g.hms.channel.b].includes(a.id)
        ? {
            with: nameOf(
              g,
              g.hms.channel.a === a.id ? g.hms.channel.b : g.hms.channel.a,
            ),
            id: g.hms.channel.id,
          }
        : null,
    storytellerAbility:
      a.host && g.hms?.stRole ? (role(g.hms.stRole)?.name ?? null) : null,
    pendingDeaths: a.host ? (g.hms?.deathQueue.length ?? 0) : 0,
    dawnAnnouncement:
      g.phase !== 'night' && g.phase !== 'lobby'
        ? (g.dawnAnnouncement ?? null)
        : null,
    hostName: g.hostName,
    host: a.host,
    me: a.id,
    phase: g.phase,
    phaseLabel: phaseName[g.phase],
    day: g.day,
    night: g.night,
    version,
    serverNow: now,
    nightChoiceDeadline:
      g.phase === 'night' && !g.sandbox ? nightChoiceWindowDeadline(g) : null,
    deadline: g.deadline,
    remaining: g.remaining,
    winner: g.winner,
    execution: g.execution,
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
    recaps:
      g.phase === 'ended'
        ? [...(g.recaps ?? []), recapOf(g, now)]
        : (g.recaps ?? []),
    players: g.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        avatar: p.avatar,
        portraitFrame: p.portraitFrame ?? 'simple',
        deathEffect: p.deathEffect ?? 'spirit',
        publicAlive: p.publicAlive,
        departed: !!p.departed,
        dummy: !!p.dummy,
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
          myVoteSubmitted: Object.hasOwn(g.active.votes, a.id),
          votes: g.active.votes,
          eligible: eligibleVoters(g).map((p) => p.id),
        }
      : null,
    ballots: g.ballots.map((b) => ({
      id: b.id,
      by: b.by,
      target: b.target,
      count: b.count,
      threshold: b.threshold,
      votes: b.votes,
      correctable:
        a.host &&
        !g.active &&
        ['nomination', 'dayReview'].includes(g.phase) &&
        b.id === g.ballots.at(-1)?.id &&
        !!b.voterState,
      eligible:
        b.voterState
          ?.filter(
            (p) => p.id !== b.target && !p.departed && (p.alive || p.ghost),
          )
          .map((p) => p.id) ?? [],
      ...(a.host ? { invalid: b.invalid } : {}),
    })),
    leader: { ...leader, name: leader.target ? nameOf(g, leader.target) : '' },
    messages: g.messages.filter((m) =>
      a.host
        ? true
        : m.to.startsWith('channel:')
          ? g.phase === 'night' &&
            m.to === 'channel:' + g.hms?.channel?.id &&
            [g.hms?.channel?.a, g.hms?.channel?.b].includes(a.id)
          : m.to === 'all' || m.to === a.id || m.from === a.id,
    ),
    log: g.log.filter((l) => a.host || l.public).slice(-200),
    controls: controls(g, a),
  };
}
export type GameView = ReturnType<typeof view>;
