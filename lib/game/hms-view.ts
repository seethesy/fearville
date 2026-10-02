// Storyteller and player controls for Holy Moon and Stars.
import {
  role,
  HMS_ROLES,
  type Game,
  type Actor,
  type Field,
  type Control,
  type Option,
} from './types.ts';
import { nameOf, healthy } from './engine.ts';
import {
  hms,
  actorOf,
  actsAs,
  targetCount,
  TARGETING,
  suggestions,
  astrologistSuggestion,
  connections,
  pendingDeath,
  preventedBy,
  fateweaverFor,
  livingNeighbors,
  stActor,
  team,
  ST,
  type Task,
} from './hms.ts';

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
const text = (key: string, label: string, value = '', hint = ''): Field => ({
  key,
  label,
  type: 'textarea',
  value,
  ...(hint ? { hint } : {}),
});
const none = [{ value: '', label: 'None' }];
const roleList = (filter: (id: string) => boolean = () => true) =>
  HMS_ROLES.filter((r) => filter(r.id)).map((r) => ({
    value: r.id,
    label: r.name,
  }));
const outOfPlay = (g: Game, t: string) =>
  roleList((id) => team(id) === t && !g.players.some((p) => p.role === id));

export function hmsNightFields(g: Game, t: Task, ps: Option[]) {
  const s = hms(g);
  const choice = g.nightChoices?.[t.key];
  const fields: Field[] = [];
  const notes: string[] = [];
  const r = t.role;
  if (r === 'nightmareRuling') {
    const nightmare = s.nightmare;
    const plan = nightmare
      ? g.nightChoices?.['nightmareRedirect:' + nightmare.player]
      : undefined;
    return {
      fields: [
        select('target', 'Redirected target', ps, plan?.target ?? '', true),
      ],
      description:
        'The Nightmare chose a redirect. Confirm or privately change where the haunted player’s ability lands; the haunted player is not notified.',
    };
  }
  const p = t.player ? actorOf(g, t.player) : null;
  if (p && p.id !== ST)
    notes.push(
      healthy(p)
        ? 'Acting player is healthy.'
        : 'Acting player is drunk or poisoned: their ability fails, but you may still give (false) information.',
    );
  if (p?.role === 'lostsoul')
    notes.push(
      `${p.name} is a Lost Soul acting as the ${role(r)?.name} without knowing it.`,
    );
  const count = r === 'guess' ? 0 : targetCount(r, g);
  const chosen = [choice?.target, choice?.target2, choice?.target3].slice(
    0,
    count,
  );
  const submitted = chosen.slice();
  if (
    count &&
    s.nightmare?.bound === p?.id &&
    s.nightmareRedirectTarget &&
    s.nightmare?.used
  )
    chosen[0] = s.nightmareRedirectTarget;
  if (count) {
    const once = ['gravedigger', 'priest', 'necromancer'].includes(r);
    for (let i = 0; i < count; i++)
      fields.push(
        select(
          ['target', 'target2', 'target3'][i],
          count === 1
            ? 'Chosen player' + (once ? ' (blank to pass)' : '')
            : `Chosen player ${i + 1}`,
          none.concat(ps),
          chosen[i] ?? '',
        ),
      );
    if (TARGETING.includes(r)) {
      const n = s.nightmare;
      const bound = !!n && !n.used && n.bound === p?.id;
      const plan = bound
        ? g.nightChoices?.['nightmareRedirect:' + n!.player]
        : undefined;
      submitted.forEach((id) => {
        const q = g.players.find((x) => x.id === id);
        if (q?.role === 'dazed')
          notes.push(
            `${q.name} is Dazed: you may redirect to a living neighbor (${livingNeighbors(
              g,
              q,
            )
              .map((x) => x.name)
              .join(', ')}) or a player of their choice.`,
          );
      });
      if (bound)
        notes.push(
          `The Nightmare (${nameOf(g, n!.player)}) haunts this player and may redirect once${plan && !plan.pass ? `; they asked for ${nameOf(g, plan.target)}` : plan?.pass ? '; they passed tonight' : ''}. Apply Dazed redirects first, then the Nightmare’s.`,
        );
      if (bound && plan && !plan.pass)
        notes.push('Resolve the Nightmare redirect task before this ability.');
    }
  }
  if (choice?.pass) notes.push('The player passed.');
  switch (r) {
    case 'astrologist': {
      const sug = choice
        ? astrologistSuggestion(g, chosen.filter(Boolean) as string[])
        : ['', '', ''];
      for (let i = 0; i < 3; i++)
        fields.push(
          select(
            'reveal' + (i + 1),
            `Character ${i + 1}`,
            none.concat(roleList()),
            sug[i],
          ),
        );
      notes.push(
        'One character must belong to a chosen player and two must be out of play.',
      );
      break;
    }
    case 'mystic': {
      const sug = choice
        ? connections(
            g,
            g.players.find((q) => q.id === choice.target)!,
          ).slice(0, 3)
        : [];
      for (let i = 0; i < 3; i++)
        fields.push(
          select(
            'link' + (i + 1),
            `Connected player ${i + 1}`,
            none.concat(ps),
            sug[i] ?? '',
          ),
        );
      break;
    }
    case 'astronaut':
    case 'prophet':
    case 'insomniac':
    case 'spirit': {
      const sug = suggestions(g, t, choice);
      fields.push(
        text(
          'info',
          'Information (blank uses the calculation)',
          '',
          sug ? 'Calculated: ' + sug : '',
        ),
      );
      if (sug) notes.push('Calculated: ' + sug);
      break;
    }
    case 'diviner':
      notes.push(
        choice?.text
          ? `Question: “${choice.text}”`
          : 'No question was submitted; ask them directly.',
      );
      fields.push(
        select('target', 'Player to suggest', none.concat(ps), '', true),
      );
      break;
    case 'priest':
      fields.push(
        select(
          'newRole',
          'If reviving a Haunt: Villager they return as',
          none.concat(outOfPlay(g, 'townsfolk')),
        ),
      );
      break;
    case 'necromancer':
      fields.push(
        select(
          'newRole',
          'If reviving a Villager or Fool: Haunt they return as',
          none.concat(outOfPlay(g, 'minion')),
        ),
      );
      break;
    case 'gravedigger':
      fields.push(
        check('refuse', 'Refuse the change (setup-changing character)'),
      );
      break;
    case 'guess': {
      const members = s.constellation?.members ?? [];
      const mo = members.map((id) => ({ value: id, label: nameOf(g, id) }));
      members.forEach((id, i) =>
        fields.push(
          select(
            'guess' + (i + 1),
            `Guess for ${nameOf(g, id)}`,
            none.concat(roleList()),
            choice?.guesses?.find((x) => x.player === id)?.role ?? '',
          ),
        ),
      );
      const right = members.every((id, i) => {
        const q = g.players.find((x) => x.id === id);
        return q && (q.shown || q.role) === choice?.guesses?.[i]?.role;
      });
      if (choice?.guesses)
        notes.push(
          `The guess is ${right ? 'correct' : 'wrong'} by shown characters.`,
        );
      fields.push(
        check(
          'pass',
          'The Constellation passes (keeps the guess)',
          !!choice?.pass,
        ),
        select('outcome', 'Outcome', [
          { value: '', label: 'Use suggested result' },
          { value: 'correct', label: 'Correct' },
          { value: 'wrong', label: 'Wrong' },
        ]),
        select(
          'reward',
          'If correct: reward',
          [
            { value: 'life', label: 'Grant an extra life' },
            { value: 'revive', label: 'Revive at dawn' },
          ],
          'life',
        ),
        select('rewardPlayer', 'If correct: member', none.concat(mo)),
        check('killSelf', 'If wrong: the Constellation dies tonight'),
        select(
          'killMember',
          'If wrong: another member dies tonight',
          none.concat(mo.filter((o) => o.value !== p?.id)),
        ),
      );
      break;
    }
    case 'dreameater': {
      const rows = Math.min(15, (choice?.guesses?.length ?? 0) + 3);
      for (let i = 0; i < rows; i++) {
        const x = choice?.guesses?.[i];
        fields.push(
          select(
            `g${i + 1}player`,
            `Guess ${i + 1}: player`,
            none.concat(ps),
            x?.player ?? '',
          ),
          select(
            `g${i + 1}role`,
            `Guess ${i + 1}: character`,
            none.concat(roleList()),
            x?.role ?? '',
          ),
        );
      }
      const misses = g.players.find((q) => q.id === t.player)?.misses ?? 0;
      notes.push(
        `Wrong guesses so far: ${misses}. Guesses are judged against shown characters.`,
      );
      break;
    }
    case 'plague':
      notes.push(
        `${nameOf(g, s.infected?.target ?? '')} dies of the plague and their living neighbors are poisoned tonight.`,
      );
      break;
    case 'deaths':
      notes.push(
        `${s.deathQueue.length} queued death${s.deathQueue.length === 1 ? '' : 's'}: ${s.deathQueue.map((d) => `${nameOf(g, d.player)} (${d.cause})`).join(', ') || 'none'}.`,
      );
      break;
    case 'werewolf':
      if (!count) notes.push(`Preparation night (${g.night % 3}/2).`);
      break;
    case 'nightmare':
      notes.push(
        'Choose a living player whose ability targets players at night.',
      );
      break;
  }
  if (choice && count && !choice.pass)
    notes.push(
      `Player selected ${chosen.map((id) => nameOf(g, id ?? '')).join(', ')}.`,
    );
  return { fields, description: notes.join(' ') };
}

export function deathControl(g: Game, ps: Option[]): Control | null {
  const s = hms(g);
  const d = pendingDeath(g);
  if (!d) return null;
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
