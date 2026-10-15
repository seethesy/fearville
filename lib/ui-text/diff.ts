// FEAR-173: word-level diff between two text versions for the history view.
export type DiffPart = { t: 'same' | 'add' | 'del'; v: string };

const words = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

/** LCS over words (and whitespace runs). Fine for texts up to 4,000 chars. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  // Trim the common prefix and suffix first: most edits are small.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  const n = x.length;
  const m = y.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] =
        x[i] === y[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const mid: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      mid.push({ t: 'same', v: x[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) mid.push({ t: 'del', v: x[i++] });
    else mid.push({ t: 'add', v: y[j++] });
  }
  while (i < n) mid.push({ t: 'del', v: x[i++] });
  while (j < m) mid.push({ t: 'add', v: y[j++] });
  const parts = [
    { t: 'same' as const, v: a.slice(0, start).join('') },
    ...mid,
    { t: 'same' as const, v: a.slice(endA).join('') },
  ];
  // Merge neighbours of the same kind.
  const out: DiffPart[] = [];
  for (const p of parts) {
    if (!p.v) continue;
    const prev = out.at(-1);
    if (prev && prev.t === p.t) prev.v += p.v;
    else out.push({ ...p });
  }
  return out;
}
