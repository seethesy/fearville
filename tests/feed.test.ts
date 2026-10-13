import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { view } from '../lib/game/view.ts';
import { feedPage } from '../lib/game/feed.ts';
import { setPhase } from '../lib/game/engine.ts';
void test('live feeds are bounded and older pages preserve privacy and order', () => {
  const g = newGame('123456', 'Host');
  const player = newPlayer('Sam', 1);
  g.players = [player];
  for (let i = 0; i < 650; i++) {
    g.messages.push({
      id: `m${i}`,
      at: i,
      from: 'host',
      to: player.id,
      text: `private ${i}`,
      kind: 'chat',
    });
    g.messages.push({
      id: `other${i}`,
      at: i,
      from: 'host',
      to: 'other',
      text: 'secret',
      kind: 'chat',
    });
    g.log.push({ id: `l${i}`, at: i, text: `entry ${i}`, public: true });
    g.history.push({
      id: `h${i}`,
      at: i,
      text: `decision ${i}`,
      before: 'secret snapshot',
    });
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
  assert.equal(
    host.controls.find((c) => c.action === 'rewind')?.fields[0].options?.length,
    200,
  );
});
void test('compact live recaps defer transcripts while full HTTP details remain available',()=> {
  const g=newGame('123456','Host');g.gameStartedAt=1;
  g.players=[newPlayer('Sam',1)];
  for(let i=0;i<500;i++) g.messages.push({id:`m${i}`,to:'all',from:'host',kind:'chat',at:i,text:'Chat'});
  setPhase(g,'ended',1000);g.winner='Good';
  const actor={id:'host',host:true};
  const full=view(g,actor,1,1000),compact=view(g,actor,1,1000,false,true);
  assert.equal(full.recaps[0].messages?.length,500);
  assert.equal(compact.messages.length,200);
  assert.deepEqual(compact.recaps[0].messages,[]);
  assert.deepEqual(compact.recaps[0].decisions,[]);
  assert.equal(compact.recaps[0].detailsDeferred,true);
  assert.deepEqual(compact.recaps[0].players,full.recaps[0].players);
});
