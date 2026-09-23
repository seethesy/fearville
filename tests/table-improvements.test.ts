import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute, tasks } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
import { eligibleField } from '../lib/game/choices.ts';
const host = { id: 'host', host: true };
function setup() {
  const g = newGame('TEST', 'Host');
  g.players = ['investigator', 'monk', 'butler', 'poisoner', 'imp'].map(
    (r, i) => ({ ...newPlayer(r, i + 1), role: r, shown: r }),
  );
  return g;
}
void test('moving a seat inserts in order, preserves roles, and is host-only', () => {
  const g = setup();
  const p = g.players[0];
  assert.throws(
    () =>
      execute(
        g,
        { id: p.id, host: false },
        { action: 'moveSeat', player: p.id, seat: 3 },
        1,
      ),
    /Storyteller/,
  );
  execute(g, host, { action: 'moveSeat', player: p.id, seat: 3 }, 2);
  assert.deepEqual(
    g.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => p.role),
    ['monk', 'butler', 'investigator', 'poisoner', 'imp'],
  );
  assert.equal(g.messages.length, 0);
});
void test('night deaths are private until dawn; all seats receive the same announcement', () => {
  const g = setup();
  g.phase = 'night';
  g.night = 2;
  const p = g.players[1];
  p.alive = false;
  p.nightDeath = 2;
  const actor = { id: g.players[0].id, host: false };
  assert.equal(view(g, actor, 1, 1).dawnAnnouncement, null);
  assert.equal(view(g, actor, 1, 1).players[1].alive, true);
  execute(g, host, { action: 'dawn', override: true, reason: 'Test dawn' }, 2);
  assert.deepEqual(view(g, actor, 2, 2).dawnAnnouncement?.names, ['monk']);
  assert.deepEqual(
    view(g, actor, 2, 2).dawnAnnouncement,
    view(g, host, 2, 2).dawnAnnouncement,
  );
  assert.equal(view(g, actor, 2, 2).players[1].alive, false);
});
void test('public counts never expose a Baron adjustment or actual roles', () => {
  const g = setup();
  g.players[3].role = 'baron';
  const v = view(g, { id: g.players[0].id, host: false }, 1, 1);
  assert.deepEqual(v.standardCounts, [3, 0, 1, 1]);
  assert.ok(v.players.every((p) => !('role' in p)));
});
void test('Investigator choices match eligible minions and distinct targets while allowing misinformation', () => {
  const g = setup();
  g.phase = 'night';
  g.night = 1;
  g.done = tasks(g)
    .filter((t) => t.role !== 'investigator')
    .map((t) => t.key);
  const v = view(g, host, 1, 1);
  const c = v.controls.find((c) => c.action === 'night')!;
  const values = {
    task: c.fields[0].value,
    target: g.players[3].id,
    target2: g.players[1].id,
  };
  const reveal = c.fields.find((f) => f.key === 'reveal')!;
  assert.deepEqual(
    eligibleField(reveal, c, values, v).options?.map((o) => o.value),
    ['', 'poisoner'],
  );
  assert.ok(
    !eligibleField(
      c.fields.find((f) => f.key === 'target2')!,
      c,
      values,
      v,
    ).options?.some((o) => o.value === values.target),
  );
  assert.ok(
    eligibleField(reveal, c, { ...values, override: true }, v).options?.some(
      (o) => o.value === 'baron',
    ),
  );
  assert.ok(!reveal.options?.some((o) => o.value === 'imp'));
});
void test('nomination lists exclude dead and used nominators and previously nominated targets', () => {
  const g = setup();
  g.phase = 'nomination';
  g.players[0].alive = false;
  g.nominators = [g.players[1].id];
  g.nominees = [g.players[2].id];
  const c = view(g, host, 1, 1).controls.find((c) => c.action === 'nominate')!;
  assert.equal(c.fields.find((f) => f.key === 'by')?.options?.length, 3);
  assert.ok(
    !c.fields
      .find((f) => f.key === 'target')
      ?.options?.some((o) => o.value === g.players[2].id),
  );
});
