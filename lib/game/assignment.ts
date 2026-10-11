import {
  HMS_ROLES,
  HOF_ROLES,
  TEAM_ORDER,
  TEAM_NAMES,
  MAX_PLAYERS,
  setupCounts,
  role,
  type Game,
} from './types.ts';

// A saved seed makes previews and confirmation deal exactly the same roles.
// The engine rotates it only when a deal is committed to the saved game.
export function assignRandomRoles(g: Game, requested?: unknown): string {
  const configured = setupCounts(g);
  if (!configured || TEAM_ORDER.reduce((total, team) => total + configured[team], 0) !== g.players.length)
    throw Error(`Join 5–${MAX_PLAYERS} players before assigning roles.`);
  const counts = [configured.townsfolk, configured.outsider, configured.minion, configured.demon];
  let seed = 2166136261;
  for (const char of g.assignmentSeed ?? g.players.map((p) => p.id).join(''))
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle<T>(items: T[]): T[] {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  if (g.script === 'holyMoonStars')
    return assignHms(g, counts, requested, shuffle);
  return assignHof(g, requested, shuffle);
}

// Holy Moon and Stars: never deals an Atheist at random (it replaces the evil
// team), though the Storyteller may request one. The Moonshiner swaps a
// Villager for a Fool; Dazed, Lost Soul and Moonshiner Fools receive distinct
// out-of-play Villagers.
function assignHms(
  g: Game,
  counts: number[],
  requested: unknown,
  shuffle: <T>(items: T[]) => T[],
): string {
  const team = (id: string) => role(id)?.team;
  const pool = (t: string) =>
    shuffle(
      HMS_ROLES.filter((r) => r.team === t && r.id !== 'atheist').map(
        (r) => r.id,
      ),
    );
  const expectedFor = (ids: string[]) => {
    if (g.roleDistribution) return counts;
    if (ids.includes('atheist'))
      return [g.players.length - counts[1], counts[1], 0, 0];
    const moon = ids.includes('moonshiner') ? 1 : 0;
    return [counts[0] - moon, counts[1] + moon, counts[2], counts[3]];
  };
  let selected: string[];
  if (requested !== undefined) {
    if (
      !Array.isArray(requested) ||
      requested.length !== g.players.length ||
      new Set(requested).size !== requested.length ||
      !requested.every(
        (id) => typeof id === 'string' && HMS_ROLES.some((r) => r.id === id),
      )
    )
      throw Error('Choose one unique character per player.');
    const expected = expectedFor(requested as string[]);
    if (
      ['townsfolk', 'outsider', 'minion', 'demon'].some(
        (t, i) =>
          (requested as string[]).filter((id) => team(id) === t).length !==
          expected[i],
      )
    )
      throw Error(
        `Choose ${expected[0]} Villagers, ${expected[1]} Fools, ${expected[2]} Haunts and ${expected[3]} Horror for this setup.`,
      );
    selected = (requested as string[]).slice();
  } else {
    const minions = pool('minion').slice(0, counts[2]);
    const e = expectedFor(minions);
    selected = [
      ...pool('townsfolk').slice(0, e[0]),
      ...pool('outsider').slice(0, e[1]),
      ...minions,
      ...pool('demon').slice(0, counts[3]),
    ];
    if (selected.length !== g.players.length || new Set(selected).size !== selected.length)
      throw Error('This distribution cannot be dealt randomly with the available characters. Choose characters manually.');
  }
  const deal = shuffle(selected);
  const moon = selected.includes('moonshiner');
  const hidden = pool('townsfolk').filter((r) => !selected.includes(r));
  const ordered = g.players.slice().sort((a, b) => a.seat - b.seat);
  ordered.forEach((p, i) => {
    p.role = deal[i];
    p.shown = p.role;
    delete p.acts;
    if (p.role === 'lostsoul') {
      p.acts = hidden.shift();
      p.shown = 'lostsoul';
    } else if (p.role === 'dazed' || (moon && team(p.role) === 'outsider'))
      p.shown = hidden.shift() ?? p.role;
  });
  const atheist = selected.includes('atheist');
  g.bluffs = atheist
    ? []
    : shuffle(
        HMS_ROLES.filter(
          (r) =>
            ['townsfolk', 'outsider'].includes(r.team) &&
            r.id !== 'atheist' &&
            !g.players.some(
              (p) => p.role === r.id || p.shown === r.id || p.acts === r.id,
            ),
        ).map((r) => r.id),
      ).slice(0, 3);
  g.redHerring = '';
  return (
    'Assign this random setup (characters remain private until the game starts):\n' +
    ordered
      .map(
        (p) =>
          `${p.seat}. ${p.name}: ${role(p.role)!.name}${p.acts ? ` (acts as ${role(p.acts)!.name})` : p.shown !== p.role ? ` (shown ${role(p.shown)!.name})` : ''}`,
      )
      .join('\n') +
    (g.bluffs.length
      ? '\nHorror bluffs: ' + g.bluffs.map((r) => role(r)!.name).join(', ')
      : '') +
    '\nYou can change individual assignments in Seats before starting.'
  );
}

// Horrors of Fearville: the script's role breakdown, with Travelers. The
// Drunk is shown an out-of-play Villager; one Villager is the Detective's
// false positive. Executioner targets and Guardian wards are chosen when the
// game starts (and can be changed in the start form).
function assignHof(
  g: Game,
  requested: unknown,
  shuffle: <T>(items: T[]) => T[],
): string {
  const expected = setupCounts(g)!;
  const team = (id: string) => role(id)?.team;
  const pool = (t: string) =>
    shuffle(HOF_ROLES.filter((r) => r.team === t).map((r) => r.id));
  let selected: string[];
  if (requested !== undefined) {
    if (
      !Array.isArray(requested) ||
      requested.length !== g.players.length ||
      new Set(requested).size !== requested.length ||
      !requested.every(
        (id) => typeof id === 'string' && HOF_ROLES.some((r) => r.id === id),
      )
    )
      throw Error('Choose one unique character per player.');
    if (
      TEAM_ORDER.some(
        (t) =>
          (requested as string[]).filter((id) => team(id) === t).length !==
          expected[t],
      )
    )
      throw Error(
        'Choose ' +
          TEAM_ORDER.map((t) => `${expected[t]} ${TEAM_NAMES[t]}`).join(', ') +
          ' for this setup.',
      );
    selected = (requested as string[]).slice();
  } else {
    selected = TEAM_ORDER.flatMap((t) => pool(t).slice(0, expected[t]));
    if (selected.length !== g.players.length)
      throw Error('This distribution cannot be dealt with the available characters.');
  }
  const deal = shuffle(selected);
  const shown = pool('townsfolk').find((r) => !selected.includes(r)) ?? '';
  const ordered = g.players.slice().sort((a, b) => a.seat - b.seat);
  ordered.forEach((p, i) => {
    p.role = deal[i];
    p.shown = p.role === 'drunk' ? shown : p.role;
    delete p.acts;
    delete p.charge;
  });
  g.bluffs = shuffle(
    HOF_ROLES.filter(
      (r) =>
        ['townsfolk', 'outsider'].includes(r.team) &&
        !g.players.some((p) => p.role === r.id || p.shown === r.id),
    ).map((r) => r.id),
  ).slice(0, 3);
  const villagers = g.players.filter((p) => team(p.role) === 'townsfolk');
  g.redHerring = shuffle(villagers)[0]?.id ?? '';
  return (
    'Assign this random setup (characters remain private until the game starts):\n' +
    ordered
      .map(
        (p) =>
          `${p.seat}. ${p.name}: ${role(p.role)!.name}${p.role === 'drunk' ? ` (shown ${role(p.shown)?.name})` : ''}`,
      )
      .join('\n') +
    (g.bluffs.length
      ? '\nHorror bluffs: ' + g.bluffs.map((r) => role(r)!.name).join(', ')
      : '') +
    (g.redHerring
      ? '\nDetective’s false positive: ' +
        g.players.find((p) => p.id === g.redHerring)!.name
      : '') +
    '\nYou can change individual assignments in Seats before starting.'
  );
}
