// Storyteller and player controls for Horrors of Fearville.
import {
  role,
  HOF_ROLES,
  TEAM_NAMES,
  type Game,
  type Actor,
  type Field,
  type Option,
  type Team,
  type DeathItem,
  type Player,
} from './types.ts';
import { nameOf, healthy } from './engine.ts';
import {
  hms,
  actsAs,
  seatNeighbors,
  livingNeighbors,
  team,
  type Task,
} from './hms.ts';
import {
  seenVisitors,
  morticianFinds,
  psychicSuggestion,
  detectiveAnswer,
  judgeAnswer,
  savedTonight,
  guardianFor,
} from './hof.ts';

const select = (
  key: string,
  label: string,
  options: Option[],
  value = '',
  required = false,
): Field => ({ key, label, type: 'select', options, value, required });
const check = (key: string, label: string, value = false): Field => ({
  key,
  label,
  type: 'checkbox',
  value,
});
const text = (key: string, label: string, hint = ''): Field => ({
  key,
  label,
  type: 'textarea',
  value: '',
  ...(hint ? { hint } : {}),
});
const none = [{ value: '', label: 'None' }];
const roles = (filter: (t: Team) => boolean = () => true) =>
  HOF_ROLES.filter((r) => filter(r.team)).map((r) => ({
    value: r.id,
    label: r.name,
  }));
const DAY = [
  'discovery',
  'discussion',
  'nomination',
  'defense',
  'voting',
  'dayReview',
];

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

export function hofControls(
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
  const s = g.hms;
  const day = DAY.includes(g.phase);
  const running = g.phase !== 'lobby' && g.phase !== 'ended';
  const living = (except = '') =>
    ps.filter((o) =>
      g.players.some(
        (q) => q.id === o.value && q.alive && !q.departed && q.id !== except,
      ),
    );
  const confirm = (label: string) => [
    { ...check('confirm', label), required: true },
  ];
  const offer = s?.deathQueue.find(
    (d) => d.ready && d.bodyguard && d.bodyguard.decision === undefined,
  );
  if (offer && (a.host || a.id === offer.bodyguard?.player)) {
    const victim = nameOf(g, offer.player);
    const fields: Field[] = [
      { key: 'death', label: '', type: 'hidden', value: offer.id },
    ];
    add(
      'bodyguardAccept',
      'Die in ' + victim + '’s place',
      `The Storyteller confirmed that ${victim} will die tonight. Take their place?`,
      fields,
      true,
    );
    add(
      'bodyguardDecline',
      'Let ' + victim + ' die',
      `Decline to take ${victim}’s place.`,
      fields,
    );
  }
  const researchFields = (except: string) =>
    [1, 2, 3].flatMap((i) => [
      select(
        'player' + i,
        `Player ${i}`,
        none.concat(living(except)),
        '',
        true,
      ),
      select('role' + i, `Role ${i}`, none.concat(roles()), '', true),
    ]);
  const hags = g.players.filter(
    (q) => q.role === 'hag' && s?.hag && q.id in s.hag,
  );
  const canHag = (q: Player) =>
    !(g.phase === 'night' && q.nightDeath === g.night);
  if (a.host) {
    if (!running) return;
    const vigilantes = g.players.filter(
      (q) =>
        (actsAs(q) === 'vigilante' && q.alive && !q.used) ||
        q.id === s?.vigilante?.player,
    );
    if (day && vigilantes.length) {
      const pending = s?.vigilante;
      const p = g.players.find((q) => q.id === pending?.player);
      const works = !!p && actsAs(p) === 'vigilante' && healthy(p);
      add(
        'vigilante',
        pending
          ? 'Resolve Vigilante declaration'
          : 'Record a Vigilante declaration',
        pending
          ? `${nameOf(g, pending.player)} declared they want to kill ${nameOf(g, pending.target)}. Suggested: ${works ? 'they die' : 'no effect (the Vigilante is drunk)'}.`
          : 'Use when a player declares aloud. Once per game, by day; the target may die instantly.',
        [
          select(
            'player',
            'Vigilante',
            ps.filter((o) => vigilantes.some((q) => q.id === o.value)),
            pending?.player ?? vigilantes[0].id,
            true,
          ),
          select(
            'target',
            'Declared player',
            living(),
            pending?.target ?? '',
            true,
          ),
          select('outcome', 'Outcome', [
            { value: '', label: 'Use suggested result' },
            { value: 'kill', label: 'They die (override if needed)' },
            { value: 'spare', label: 'No effect (override if needed)' },
          ]),
          check('override', 'Override standard rules'),
        ],
        true,
      );
    }
    const researchers = g.players.filter(
      (q) => q.role === 'researcher' && !q.used,
    );
    if (day && researchers.length)
      add(
        'researcherDeclare',
        'Record a Researcher declaration',
        'Once per game. Only you learn whether it is correct; the Researcher finds out at the end of the game.',
        [
          select(
            'player',
            'Researcher',
            ps.filter((o) => researchers.some((q) => q.id === o.value)),
            researchers[0].id,
            true,
          ),
          ...researchFields(''),
        ],
      );
    const ready = hags.filter(canHag);
    if (ready.length)
      add(
        'hagDeclare',
        'Record the Hag’s declaration',
        'The declared player may die tonight if they are Good.',
        [
          select(
            'player',
            'Hag',
            ps.filter((o) => ready.some((q) => q.id === o.value)),
            ready[0].id,
            true,
          ),
          select('target', 'Declared player', living(), '', true),
        ],
        true,
      );
    return;
  }
  const me = g.players.find((q) => q.id === a.id);
  if (!me || !running) return;
  if (
    day &&
    actsAs(me) === 'vigilante' &&
    me.alive &&
    !me.used &&
    !s?.vigilante
  )
    add(
      'vigilanteDeclare',
      'Declare a kill (Vigilante)',
      'Once per game. Your declaration is public: “I am the Vigilante and I declare that I want to kill…”. They may die instantly.',
      [
        select('target', 'Player to kill', living(me.id), '', true),
        ...confirm('Make this declaration publicly'),
      ],
      true,
    );
  if (day && me.role === 'researcher' && !me.used)
    add(
      'researcherDeclare',
      'Declare three roles (Researcher)',
      'Once per game. Your declaration is public. You learn whether you were right at the end of the game.',
      researchFields(me.id),
    );
  if (me.role === 'hag' && hags.includes(me) && canHag(me))
    add(
      'hagDeclare',
      'Declare a player to die (Hag)',
      'Your declaration is public. If they are Good, they may die tonight.',
      [select('target', 'Player', living(me.id), '', true)],
      true,
    );
}
