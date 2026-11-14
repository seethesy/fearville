import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { RITE_ART } from '../lib/rite/art-assets.ts';
import { grimoireLayout, grimoireLabels } from '../lib/rite/art-layout.ts';
import { CONTROL_COUNTS, controlLabel } from '../lib/rite/ritual.ts';
import type { ControlName } from '../lib/rite/types.ts';

void test('every legal puzzle identity has painted art, including every ritual state', () => {
  const keys = new Set(Object.keys(RITE_ART.sprites));
  for (let i = 0; i < 5; i++)
    for (const kind of ['character', 'activity', 'location'])
      assert.ok(keys.has(`sphinx/${kind}-${i}`));
  for (const [control, count] of Object.entries(CONTROL_COUNTS))
    for (let value = 0; value < count; value++)
      assert.ok(keys.has(`divination/${control}-${value}`));
  for (let i = 0; i < 8; i++) assert.ok(keys.has(`divination/symbol-${i}`));
  for (let i = 0; i < 7; i++) assert.ok(keys.has(`laboratory/shell-${i}`));
  for (let i = 0; i < 10; i++) assert.ok(keys.has(`laboratory/liquid-${i}`));
  assert.ok(keys.has('escape/carriage-h2'));
  for (const [length, kinds] of [
    [2, ['wood', 'crates', 'car']],
    [3, ['tree', 'brick', 'coach']],
  ] as const)
    for (const kind of kinds)
      for (const direction of ['h', 'v'])
        assert.ok(keys.has(`escape/${kind}-${direction}${length}`));
});

void test('runtime images are real WebP files and every CSS/art reference ships in public', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../public/rite/manifest.json', import.meta.url),
      'utf8',
    ),
  ) as { files: { file: string; bytes: number }[] };
  const files = new Set(manifest.files.map((f) => f.file));
  for (const entry of manifest.files) {
    const url = new URL('../public' + entry.file, import.meta.url);
    assert.equal(statSync(url).size, entry.bytes, entry.file);
    const bytes = readFileSync(url);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', entry.file);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', entry.file);
  }
  for (const art of [
    ...Object.values(RITE_ART.sprites),
    ...Object.values(RITE_ART.surfaces),
  ]) {
    assert.ok(files.has(art.src), art.src);
    if ('srcSet' in art)
      for (const candidate of art.srcSet.split(', '))
        assert.ok(files.has(candidate.split(' ')[0]), candidate);
  }
  for (const scene of Object.values(RITE_ART.scenes))
    assert.ok(files.has(scene));
  for (const css of [
    '../app/styles/rite/painted.css',
    '../app/styles/puzzles.css',
  ]) {
    const source = readFileSync(new URL(css, import.meta.url), 'utf8');
    for (const [, asset] of source.matchAll(
      /url\(['"]?(\/rite\/[^)'"\s]+)['"]?\)/g,
    ))
      assert.ok(files.has(asset), asset);
  }
});

void test('grimoire rows keep symbols, setting art and complete labels clear at phone and desktop sizes', () => {
  for (const width of [228, 242, 252, 272, 312, 342, 382, 680, 999, 1000, 1200])
    for (const [control, count] of Object.entries(CONTROL_COUNTS) as [
      ControlName,
      number,
    ][]) {
      const layout = grimoireLayout(width, control, count);
      assert.equal(layout.symbolSize, 48);
      assert.equal(layout.controlWidth, 180);
      assert.equal(layout.labelSize, 14);
      assert.ok(width - layout.side * 2 >= 180);
      for (let value = 0; value < count; value++) {
        const labels = grimoireLabels(control, controlLabel(control, value));
        const settingBottom =
          (layout.wide ? 4 : 84) + 80 + 6 + labels.length * 18;
        assert.ok(
          settingBottom < layout.rowHeight,
          `${width}px ${control}: label collides with next entry`,
        );
        assert.ok(
          layout.top + 64 + value * layout.rowHeight + settingBottom <
            layout.height - layout.bottom,
        );
      }
      assert.equal(layout.spread, width >= 1000);
      if (layout.spread) assert.equal(layout.bottom, 160);
    }
});

void test('Escape artwork uses the same 56px cell geometry at all three board sizes', () => {
  for (const board of RITE_ART.boards) {
    assert.equal(board.play.x, 24);
    assert.equal(board.play.y, 24);
    assert.equal(board.play.width, board.n * 56);
    assert.equal(board.canvas.width, board.play.width + 48);
    assert.equal(board.exit.x, board.play.x + board.play.width);
    assert.equal(board.exit.y, board.play.y + 2 * 56);
  }
});
