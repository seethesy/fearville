import { COUNTS, ROLES, role, type Game } from './types.ts';

// A saved seed makes previews and confirmation deal exactly the same roles.
// The engine rotates it only when a deal is committed to the saved game.
export function assignRandomRoles(g: Game, requested?: unknown): string {
  const counts = COUNTS[g.players.length];
  if (!counts) throw Error('Join 5–15 players before assigning roles.');
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
  const pool = (team: string) =>
    shuffle(ROLES.filter((r) => r.team === team).map((r) => r.id));
  const minions = pool('minion').slice(0, counts[2]);
  const extra = minions.includes('baron') ? 2 : 0;
  const selected = [
    ...pool('townsfolk').slice(0, counts[0] - extra),
    ...pool('outsider').slice(0, counts[1] + extra),
    ...minions,
    'imp',
  ];
  if (requested !== undefined) {
    if (
      !Array.isArray(requested) ||
      requested.length !== g.players.length ||
      new Set(requested).size !== requested.length ||
      !requested.every((id) => typeof id === 'string' && role(id))
    )
      throw Error('Choose one unique character per player.');
    const extraOutsiders = requested.includes('baron') ? 2 : 0;
    const expected = [
      counts[0] - extraOutsiders,
      counts[1] + extraOutsiders,
      counts[2],
      counts[3],
    ];
    if (
      ['townsfolk', 'outsider', 'minion', 'demon'].some(
        (team, i) =>
          requested.filter((id) => role(id)?.team === team).length !==
          expected[i],
      )
    )
      throw Error(
        `Choose ${expected[0]} Townsfolk, ${expected[1]} Outsiders, ${expected[2]} Minions and ${expected[3]} Demon for this setup.`,
      );
    selected.splice(0, selected.length, ...(requested as string[]));
  }
  const deal = shuffle(selected);
  const drunkShown = pool('townsfolk').find((r) => !selected.includes(r))!;
  g.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .forEach((p, i) => {
      p.role = deal[i];
      p.shown = p.role === 'drunk' ? drunkShown : p.role;
    });
  g.bluffs = shuffle(
    ROLES.filter(
      (r) =>
        ['townsfolk', 'outsider'].includes(r.team) &&
        !g.players.some((p) => p.role === r.id || p.shown === r.id),
    ).map((r) => r.id),
  ).slice(0, 3);
  g.redHerring = shuffle(
    g.players.filter((p) =>
      ['townsfolk', 'outsider'].includes(role(p.role)!.team),
    ),
  )[0].id;
  return (
    'Assign this random setup (characters remain private until the game starts):\n' +
    g.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map(
        (p) =>
          `${p.seat}. ${p.name}: ${role(p.role)!.name}${p.role === 'drunk' ? ` (shown ${role(p.shown)!.name})` : ''}`,
      )
      .join('\n') +
    '\nDemon bluffs: ' +
    g.bluffs.map((r) => role(r)!.name).join(', ') +
    '\nFortune Teller red herring: ' +
    g.players.find((p) => p.id === g.redHerring)!.name +
    '\nYou can change individual assignments in Seats before starting.'
  );
}
