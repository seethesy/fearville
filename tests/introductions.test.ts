import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer, type RoleScript } from '../lib/game/types.ts';
import { beginNight, execute, tasks } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';

const host = { id: 'host', host: true };
function setup(script: RoleScript) {
  const g = newGame('INTRO', 'Host');
  g.script = script;
  const roles =
    script === 'classic'
      ? [
          'washerwoman',
          'librarian',
          'chef',
          'monk',
          'soldier',
          'poisoner',
          'imp',
        ]
      : [
          'astronaut',
          'stargazer',
          'diviner',
          'medium',
          'celestial',
          'nightmare',
          'miasma',
        ];
  g.players = roles.map((r, i) => ({
    ...newPlayer(`Seat ${i + 1}`, i + 1),
    role: r,
    shown: r,
  }));
  g.bluffs =
    script === 'classic'
      ? ['mayor', 'empath', 'virgin']
      : ['astrologist', 'mystic', 'priest'];
  execute(g, host, { action: 'start' }, 100);
  return g;
}
for (const script of ['classic', 'holyMoonStars'] as const) {
  void test(`${script}: introductions are private, explicit, and delivered only by the night task`, () => {
    const g = setup(script),
      haunt = g.players[5],
      horror = g.players[6],
      now = g.nightChoiceDeadline! + 1;
    const playerView = (id: string) => view(g, { id, host: false }, 1, now);
    assert.equal(playerView(horror.id).nightIntroduction, null);
    assert.equal(playerView(haunt.id).nightIntroduction, null);
    assert.throws(() =>
      execute(
        g,
        { id: haunt.id, host: false },
        { action: 'night', task: 'minioninfo' },
        now,
      ),
    );
    execute(g, host, { action: 'night', task: 'minioninfo' }, now);
    assert.match(
      playerView(haunt.id).nightIntroduction!.text,
      /You are a Haunt/,
    );
    assert.match(
      playerView(haunt.id).nightIntroduction!.text,
        /Your Horror is Seat 7/,
    );
    assert.equal(playerView(horror.id).nightIntroduction, null);
    execute(g, host, { action: 'night', task: 'demoninfo' }, now + 1);
    const info = playerView(horror.id).nightIntroduction!;
    assert.match(info.text, /You are the Horror/);
    assert.match(info.text, /Your Haunts: Seat 6/);
    assert.match(info.text, /Out-of-play bluffs:/);
    if (script === 'holyMoonStars') {
      assert.match(info.text, /Seat 6 \(Nightmare\)/);
      assert.match(info.text, /A Celestial is in play/);
    }
    assert.ok(
      playerView(horror.id).messages.some(
        (m) => m.id === info.id && m.text === info.text,
      ),
    );
    assert.ok(!playerView(haunt.id).messages.some((m) => m.id === info.id));
    assert.equal(playerView(g.players[0].id).nightIntroduction, null);
    assert.equal(playerView('outsider').nightIntroduction, null);
    assert.equal(view(g, host, 1, now).nightIntroduction, null);
    assert.ok(playerView(horror.id).players.every((p) => !('role' in p)));
    assert.throws(
      () => execute(g, host, { action: 'night', task: 'demoninfo' }, now + 2),
      /changed/,
    );
    assert.equal(g.messages.filter((m) => m.id === info.id).length, 1);
    horror.name = 'Renamed';
    g.players[5].role = 'monk';
    assert.equal(playerView(horror.id).nightIntroduction!.text, info.text);
    horror.departed = true;
    assert.equal(playerView(horror.id).nightIntroduction, null);
  });
  void test(`${script}: skipped tasks do not disclose; dawn and later nights hide the task`, () => {
    const g = setup(script),
      now = g.nightChoiceDeadline! + 1;
    execute(
      g,
      host,
      { action: 'nightSkip', reason: 'Test skipping introduction' },
      now,
    );
    assert.equal(
      view(g, { id: g.players[5].id, host: false }, 1, now).nightIntroduction,
      null,
    );
    execute(g, host, { action: 'night', task: 'demoninfo' }, now + 1);
    const horror = { id: g.players[6].id, host: false };
    assert.ok(view(g, horror, 1, now).nightIntroduction);
    execute(
      g,
      host,
      { action: 'dawn', override: true, reason: 'Test moving to dawn' },
      now + 2,
    );
    assert.equal(view(g, horror, 1, now).nightIntroduction, null);
    beginNight(g, now + 3);
    assert.deepEqual(g.nightIntroductions, {});
    assert.equal(view(g, horror, 1, now).nightIntroduction, null);
    assert.ok(
      !tasks(g).some((t) => ['minioninfo', 'demoninfo'].includes(t.key)),
    );
  });
  void test(`${script}: rewind restores introduction state without unsending messages`, () => {
    const g = setup(script),
      now = g.nightChoiceDeadline! + 1,
      actor = { id: g.players[5].id, host: false };
    execute(g, host, { action: 'night', task: 'minioninfo' }, now);
    const old = view(g, actor, 1, now).nightIntroduction!;
    execute(g, host, { action: 'undo' }, now + 1);
    assert.equal(view(g, actor, 1, now).nightIntroduction, null);
    assert.ok(view(g, actor, 1, now).messages.some((m) => m.id === old.id));
    execute(g, host, { action: 'night', task: 'minioninfo' }, now + 2);
    assert.notEqual(view(g, actor, 1, now).nightIntroduction!.id, old.id);
  });
}
void test('older saves without introductions remain readable', () => {
  const g = setup('classic');
  delete g.nightIntroductions;
  assert.equal(
    view(g, { id: g.players[6].id, host: false }, 1, 100).nightIntroduction,
    null,
  );
});

void test('small tables and Atheist games keep existing introduction restrictions', () => {
  for (const script of ['classic', 'holyMoonStars'] as const) {
    const g = setup(script);
    g.players = g.players.slice(2);
    assert.ok(
      !tasks(g).some((t) => ['minioninfo', 'demoninfo'].includes(t.key)),
    );
  }
  const atheist = setup('holyMoonStars');
  atheist.players[0].role = 'atheist';
  assert.ok(
    !tasks(atheist).some((t) => ['minioninfo', 'demoninfo'].includes(t.key)),
  );
});
