export type Random = () => number;
export function createRandom(seed: string | number): Random {
  let state = 2166136261;
  for (const c of String(seed))
    state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function integer(rng: Random, min: number, max: number) {
  return min + Math.floor(rng() * (max - min + 1));
}
export function shuffle<T>(items: readonly T[], rng: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = integer(rng, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function pick<T>(items: readonly T[], rng: Random): T {
  return items[integer(rng, 0, items.length - 1)];
}
