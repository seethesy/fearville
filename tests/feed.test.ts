import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { view } from '../lib/game/view.ts';
import { feedPage } from '../lib/game/feed.ts';
void test('live feeds are bounded and older pages preserve privacy and order', () => {
  const g = newGame('123456', 'Host');
  const player = newPlayer('Sam', 1); g.players = [player];
  for (let i = 0; i < 650; i++) {
    g.messages.push({ id: `m${i}`, at: i, from: 'host', to: player.id, text: `private ${i}`, kind: 'chat' });
    g.messages.push({ id: `other${i}`, at: i, from: 'host', to: 'other', text: 'secret', kind: 'chat' });
    g.log.push({ id: `l${i}`, at: i, text: `entry ${i}`, public: true });
    g.history.push({ id: `h${i}`, at: i, text: `decision ${i}`, before: 'secret snapshot' });
  }
  const actor = { id: player.id, host: false };
  const live = view(g, actor, 1, 1000);
  assert.equal(live.messages.length, 200);
  assert.equal(live.log.length, 200);
  assert.equal(live.messages[0].id, 'm450');
  const older = feedPage(g, actor, 'messages', live.feeds.messages!);
  assert.equal(older.items[0].id, 'm250');
  assert.ok(older.items.every((m) => m.id.startsWith('m')));
  assert.throws(() => feedPage(g, actor, 'history'), /Storyteller/);
  assert.throws(() => feedPage(g, actor, 'messages', 'other600'), /changed/);
  const decisions = feedPage(g, { id: 'host', host: true }, 'history');
  assert.ok(decisions.items.every((item) => !Object.hasOwn(item, 'before')));
  const host = view(g, { id: 'host', host: true }, 1, 1000);
  assert.equal(host.controls.find((c) => c.action === 'rewind')?.fields[0].options?.length, 200);
});
