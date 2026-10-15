// FEAR-122 remote switches: catalog parsing and how switches act on games.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer, type Game } from '../lib/game/types.ts';
import { beginNight } from '../lib/game/engine.ts';
import { DEFAULT_CONFIG, type Pattern } from '../lib/rite/types.ts';
import { configureRite, resolveRite } from '../lib/rite/engine.ts';
import {
  DEFAULT_FLAGS,
  fromRows,
  parseValue,
  publicEnabled,
  publicFlags,
  type Flags,
} from '../lib/flags/catalog.ts';
import {
  applyStartFlags,
  enforceKills,
  NEW_GAMES_OFF,
  RITE_CLOSED,
} from '../lib/flags/game.ts';

const flags = (switches: Flags['switches'], extra: Partial<Flags> = {}) => ({
  ...DEFAULT_FLAGS,
  switches,
  ...extra,
});
function lobby(patterns: Pattern[] = ['grid', 'ritual'], n = 6): Game {
  const g = newGame('FLAG', 'Host');
  g.players = Array.from({ length: n }, (_, i) => ({
    ...newPlayer(`Player ${i}`, i + 1),
    id: `p${i}`,
    role: i === n - 1 ? 'monster' : 'vigilante',
    shown: i === n - 1 ? 'monster' : 'vigilante',
  }));
  configureRite(g, {
    action: 'configureRite',
    config: { ...DEFAULT_CONFIG, patterns },
  });
  return g;
}
function running(patterns: Pattern[] = ['grid', 'ritual']) {
  const g = lobby(patterns);
  g.gameStartedAt = 1;
  beginNight(g, 100);
  beginNight(g, 200); // night 2: the Rite opens
  assert.equal(g.rite!.status, 'open');
  return g;
}

void test('switch values validate; unknown or broken rows never take features down', () => {
  assert.equal(parseValue('rite.grid', 'kill'), 'kill');
  assert.equal(parseValue('signups', false), 'off');
  assert.throws(() => parseValue('signups', 'kill'), /no kill/);
  assert.throws(() => parseValue('script.horrors', 'maybe'), /on, off or kill/);
  assert.deepEqual(
    parseValue('maintenance', {
      text: ' Back soon ',
      severity: 'warning',
      newGamesDisabled: true,
    }),
    { text: 'Back soon', severity: 'warning', newGamesDisabled: true },
  );
  assert.throws(() =>
    parseValue('maintenance', { text: '', severity: 'info' }),
  );
  assert.deepEqual(
    parseValue('builds', { ios: { minimum: 12, recommended: 10 } }),
    { ios: { minimum: 12, recommended: 12, updateUrl: '' } },
  );
  assert.throws(() =>
    parseValue('builds', { ios: { minimum: 1, updateUrl: 'http://x' } }),
  );
  const f = fromRows([
    { key: 'rite.lab', value: '"off"' },
    { key: 'nonsense', value: '"off"' },
    { key: 'guests', value: 'not json' },
  ]);
  assert.deepEqual(f.switches, { 'rite.lab': 'off' });
  const p = publicFlags(flags({ rite: 'kill', guests: 'on' }));
  assert.deepEqual(p.off, ['rite']);
  assert.equal(publicEnabled(p, 'rite.grid'), false);
  assert.equal(publicEnabled(p, 'guests'), true);
  assert.equal(publicEnabled(null, 'rite'), true);
});

void test('starting a game captures switches: off patterns leave the Rite, off scripts and paused games refuse', () => {
  const g = lobby(['grid', 'ritual', 'board']);
  applyStartFlags(g, flags({ 'rite.board': 'off' }), 1);
  assert.deepEqual(g.rite!.config.patterns, ['grid', 'ritual']);
  assert.ok(g.rite!.plans.every((p) => p.kind !== 'board'));
  assert.ok(g.rite!.config.enabled);

  const off = lobby();
  applyStartFlags(off, flags({ rite: 'off' }), 1);
  assert.equal(off.rite!.config.enabled, false);

  // Only Divination left with a count it can't split: the Rite turns off.
  const odd = lobby(['grid', 'ritual'], 7);
  applyStartFlags(odd, flags({ 'rite.grid': 'off' }), 1);
  assert.equal(odd.rite!.config.enabled, false);

  assert.throws(
    () => applyStartFlags(lobby(), flags({ 'script.horrors': 'off' }), 1),
    /Choose another script/,
  );
  assert.throws(
    () =>
      applyStartFlags(
        lobby(),
        flags(
          {},
          {
            maintenance: {
              text: 'Upgrading',
              severity: 'info',
              newGamesDisabled: true,
            },
          },
        ),
        1,
      ),
    new RegExp(NEW_GAMES_OFF.slice(0, 20)),
  );
});

void test('off (not kill) never touches a running game', () => {
  const g = running();
  const before = JSON.stringify(g);
  assert.equal(
    enforceKills(g, flags({ rite: 'off', 'rite.grid': 'off' }), 300),
    false,
  );
  assert.equal(JSON.stringify(g), before);
});

void test('killing the Rite closes it with no reward and tells the table', () => {
  const g = running();
  assert.equal(enforceKills(g, flags({ rite: 'kill' }), 300), true);
  assert.equal(g.rite!.config.enabled, false);
  assert.equal(g.rite!.squads.length, 0);
  assert.ok(g.messages.some((m) => m.text === RITE_CLOSED && m.to === 'all'));
  resolveRite(g, 400, true);
  assert.notEqual(g.rite!.status, 'complete');
  assert.ok(!g.rite!.rewardApplied);
  // Idempotent: a second pass changes nothing.
  assert.equal(enforceKills(g, flags({ rite: 'kill' }), 500), false);
});

void test('killing one pattern withdraws its vigils; the threshold counts the rest', () => {
  const g = running(['grid', 'ritual']);
  const grid = g.rite!.squads.find((s) => s.kind === 'grid')!;
  const ritual = g.rite!.squads.find((s) => s.kind === 'ritual')!;
  assert.equal(enforceKills(g, flags({ 'rite.grid': 'kill' }), 300), true);
  assert.deepEqual(
    g.rite!.squads.map((s) => s.id),
    [ritual.id],
  );
  assert.deepEqual(g.rite!.config.patterns, ['ritual']);
  for (const id of grid.members)
    assert.ok(g.messages.some((m) => m.to === id && /withdrawn/.test(m.text)));
  assert.equal(enforceKills(g, flags({ 'rite.grid': 'kill' }), 301), false);
  // The remaining vigil alone decides: complete it and the Rite completes.
  g.rite!.squads[0].completeNight = g.night;
  resolveRite(g, 400, true);
  assert.equal(g.rite!.status, 'complete');
});

void test('killing every open pattern closes the Rite; dormant Rites re-plan', () => {
  const all = running(['grid', 'ritual']);
  enforceKills(all, flags({ 'rite.grid': 'kill', 'rite.ritual': 'kill' }), 300);
  assert.equal(all.rite!.config.enabled, false);

  const dormant = lobby(['grid', 'ritual', 'board']);
  dormant.gameStartedAt = 1;
  beginNight(dormant, 100); // night 1: still dormant
  assert.equal(dormant.rite!.status, 'dormant');
  assert.equal(
    enforceKills(dormant, flags({ 'rite.board': 'kill' }), 150),
    true,
  );
  assert.ok(dormant.rite!.plans.every((p) => p.kind !== 'board'));
  assert.ok(dormant.rite!.config.enabled);
});
