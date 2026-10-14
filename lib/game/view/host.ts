import {
  scriptRoles,
  SCRIPTS,
  setupCounts,
  TEAM_ORDER,
  TEAM_NAMES,
  MAX_PLAYERS,
  role,
  type Game,
  type Actor,
  type Field,
  type Control,
  type Option,
} from '../types.ts';
import { tasks, setupIssues, winHints, candidate, nameOf } from '../engine.ts';
import { pendingDeath } from '../hms.ts';
import { hmsNightFields, deathControl } from '../hms-view.ts';
import { isHof, defaultCharge } from '../hof.ts';
import {
  type AddControl,
  input,
  select,
  num,
  overrideFields,
} from './fields.ts';
export function hostPhaseControls(
  g: Game,
  a: Actor,
  SR: ReturnType<typeof scriptRoles>,
  ps: Option[],
  result: Control[],
  add: AddControl,
) {
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
            g.script ?? 'horrors',
            true,
          ),
        ],
      );
      const distribution = setupCounts(g);
      if (distribution) {
        add(
          'setRoleDistribution',
          'Change role distribution',
          'Set the number of characters in each group. The totals are shown to every player. Counts must add up to the number of players.',
          TEAM_ORDER.filter((team) => SR.some((r) => r.team === team)).map(
            (team) =>
              num(
                team,
                TEAM_NAMES[team],
                distribution[team],
                0,
                g.players.length,
              ),
          ),
        );
        if (g.roleDistribution)
          add(
            'resetRoleDistribution',
            'Use standard distribution',
            'Restore the standard role counts for this script and player count.',
          );
      }
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
          p.role === 'dazed' ||
          (g.players.some((q) => q.role === 'moonshiner') &&
            role(p.role)?.team === 'outsider')
        )
          hiddenDefaults.set('shown_' + p.id, hiddenDefault(p.shown));
        if (p.role === 'lostsoul')
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
          p.role === 'dazed' ||
          (g.players.some((q) => q.role === 'moonshiner') &&
            role(p.role)?.team === 'outsider')
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
        if (p.role === 'lostsoul')
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
      if (isHof(g)) {
        if (
          g.players.some(
            (p) => p.role === 'detective' || p.shown === 'detective',
          )
        ) {
          const villagers = ps.filter((option) =>
            g.players.some(
              (p) =>
                p.id === option.value && role(p.role)?.team === 'townsfolk',
            ),
          );
          setupFields.push(
            select(
              'redHerring',
              'Detective’s false positive (a Villager)',
              villagers,
              villagers.some((o) => o.value === g.redHerring)
                ? g.redHerring
                : (villagers[0]?.value ?? ''),
              true,
            ),
          );
        }
        for (const p of g.players.filter((p) =>
          ['executioner', 'guardian'].includes(p.role),
        )) {
          const options = ps.filter(
            (o) =>
              o.value !== p.id &&
              (p.role !== 'executioner' ||
                g.players.some(
                  (q) => q.id === o.value && role(q.role)?.team !== 'demon',
                )),
          );
          setupFields.push(
            select(
              'charge_' + p.id,
              p.role === 'executioner'
                ? `${p.name} · Executioner’s target (never the Horror)`
                : `${p.name} · Guardian’s ward`,
              options,
              p.charge && options.some((o) => o.value === p.charge)
                ? p.charge
                : defaultCharge(g, p),
              true,
            ),
          );
        }
      }

      add(
        'randomAssign',
        'Randomly assign roles',
        isHof(g)
          ? `Apply the Horrors of Fearville role breakdown for 5–${MAX_PLAYERS} players. Replaces all assigned characters, the Drunk’s shown Villager, Horror bluffs and the Detective’s false positive. You can edit individual roles in Seats afterward.`
          : `Apply a balanced Holy Moon and Stars setup for 5–${MAX_PLAYERS} players (never an Atheist). Replaces all assigned characters, hidden Villagers and Horror bluffs. You can edit individual roles in Seats afterward.`,
      );
      add(
        'start',
        'Deal roles & begin night',
        'Review the script-specific setup decisions below. Defaults are ready, but you can change them before private characters are sent. ' +
          (setupIssues(g).join(' ') || 'Setup is ready.'),
        [...setupFields, ...overrideFields],
      );
    }
    const death = deathControl(g, ps);
    if (death) result.push(death);
    if (g.phase === 'night' && !pendingDeath(g)) {
      const t = tasks(g).find((t) => !t.done);
      if (t) {
        const { fields, description } = hmsNightFields(g, t, ps);
        add(
          'night',
          'Resolve ' + t.name,
          description || 'Review and confirm this step before continuing.',
          [
            { key: 'task', label: '', type: 'hidden', value: t.key },
            { key: 'night', label: '', type: 'hidden', value: g.night },
            ...fields,
            ...overrideFields,
          ],
        );
        add(
          'nightDefer',
          'Do this task later',
          'Move this task behind the other unresolved night tasks. Nothing is announced to players.',
          [
            { key: 'task', label: '', type: 'hidden', value: t.key },
            { key: 'night', label: '', type: 'hidden', value: g.night },
          ],
        );
        add(
          'nightSkip',
          'Skip this task entirely',
          'Complete this task without sending information or applying its effect. Nothing is announced to players.',
          [
            { key: 'task', label: '', type: 'hidden', value: t.key },
            { key: 'night', label: '', type: 'hidden', value: g.night },
          ],
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

    const phaseToken = `${g.day}:${g.night}:${g.phase}`;
    if (!g.sandbox && g.deadline !== null)
      add('pause', 'Pause timer', 'Pause for everyone.', [
        { key: 'phaseToken', label: '', type: 'hidden', value: phaseToken },
      ]);
    else if (!g.sandbox && g.remaining > 0 && g.timers[g.phase])
      add('resume', 'Resume timer', 'Continue the shared countdown.', [
        { key: 'phaseToken', label: '', type: 'hidden', value: phaseToken },
      ]);
    if (!g.sandbox && g.timers[g.phase]) {
      add('extend', 'Add time', 'Extend this timer.', [
        num('seconds', 'Seconds to add', 30),
        { key: 'phaseToken', label: '', type: 'hidden', value: phaseToken },
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
    if (g.phase === 'dayReview')
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
  }
}
