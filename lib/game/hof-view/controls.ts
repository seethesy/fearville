// Storyteller and player controls for Horrors of Fearville.
import {
  type Game,
  type Actor,
  type Field,
  type Option,
  type Player,
} from '../types.ts';
import { nameOf, healthy } from '../engine.ts';
import { actsAs } from '../hms.ts';
import { DAY, check, select, none, roles } from './fields.ts';
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
