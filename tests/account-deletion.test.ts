import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymiseSeat, FORMER_PLAYER } from '../lib/accounts/deletion.ts';

const recap = {
  id: 'ABC:1',
  players: [
    {
      id: 'p1',
      name: 'Xavier',
      avatar: 'data:image/png;base64,AAAA',
      notebook: { text: 'secret plan' },
    },
    { id: 'p2', name: 'Zoe', avatar: 'ghost', notebook: { text: 'zoe notes' } },
  ],
  decisions: [
    {
      id: 'd1',
      at: 1,
      actor: 'Storyteller',
      text: 'Xavier was executed. Xavierson lived.',
    },
  ],
  messages: [
    {
      id: 'm1',
      from: 'p1',
      to: 'p2',
      text: 'hello from Xavier',
      at: 1,
      kind: 'chat',
    },
    { id: 'm2', from: 'p2', to: 'p1', text: 'hi Xavier', at: 2, kind: 'chat' },
  ],
  notebooks: { p1: { text: 'secret plan' }, p2: { text: 'zoe notes' } },
};

void test('anonymiseSeat removes the seat name, photo, notes and messages', () => {
  const out = anonymiseSeat(recap, 'p1', 'Xavier') as typeof recap;
  const text = JSON.stringify(out);
  assert.equal(out.players[0].name, FORMER_PLAYER);
  assert.equal(out.players[0].avatar, 'ghost');
  assert.equal('notebook' in out.players[0], false);
  assert.equal(out.notebooks.p1, undefined);
  assert.deepEqual(
    out.messages.map((m) => m.id),
    ['m2'],
  );
  assert.ok(
    !/Xavier\b/.test(text.replace(/Xavierson/g, '')),
    'name gone from all strings',
  );
  assert.ok(!text.includes('secret plan'));
  assert.equal(
    out.decisions[0].text,
    `${FORMER_PLAYER} was executed. Xavierson lived.`,
  );
  assert.equal(out.messages[0].text, `hi ${FORMER_PLAYER}`);
});

void test('anonymiseSeat leaves other seats untouched and does not mutate input', () => {
  const before = JSON.stringify(recap);
  const out = anonymiseSeat(recap, 'p1', 'Xavier') as typeof recap;
  assert.equal(JSON.stringify(recap), before);
  assert.deepEqual(out.players[1], recap.players[1]);
  assert.deepEqual(out.notebooks.p2, recap.notebooks.p2);
});
