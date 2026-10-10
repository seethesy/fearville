import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  helpSections,
  initialState,
  newlySeen,
  reduce,
  stepsFor,
  suppressionReasons,
  walkthroughTriggers,
  type TutorialEvent,
  type TutorialState,
} from '../lib/tutorials/engine.ts';
import { TUTORIALS, tutorial } from '../lib/tutorials/content.ts';
import { readGuest, writeGuest, isNewScope } from '../lib/tutorials/guest.ts';
import { parseItems } from '../lib/tutorials/validate.ts';
import { iosCatalog } from '../lib/tutorials/ios.ts';
import { ALL_ROLES } from '../lib/game/types.ts';

const run = (events: TutorialEvent[], start = initialState('web')) =>
  events.reduce(reduce, start);
const loaded = (seen: TutorialState['seen'] = {}) =>
  run([
    {
      type: 'load',
      seen: Object.entries(seen).map(([id, status]) => ({ id, status })),
    },
  ]);

void test('a tutorial can be started, advanced, backed up and completed', () => {
  const steps = stepsFor(tutorial('section.messages')!, 'web').length;
  let s = run(
    [
      { type: 'request', id: 'section.messages' },
      { type: 'pump', blocked: false },
    ],
    loaded(),
  );
  assert.deepEqual(s.active, {
    id: 'section.messages',
    step: 0,
    replay: false,
  });
  s = reduce(s, { type: 'back' });
  assert.equal(s.active?.step, 0, 'Back on the first step does nothing');
  s = reduce(s, { type: 'next' });
  assert.equal(s.active?.step, 1);
  s = reduce(s, { type: 'back' });
  assert.equal(s.active?.step, 0);
  for (let i = 0; i < steps; i++) s = reduce(s, { type: 'next' });
  assert.equal(s.active, null);
  assert.equal(s.seen['section.messages'], 'completed');
  // Seen tutorials are not requested again automatically.
  s = run([{ type: 'request', id: 'section.messages' }], s);
  assert.equal(s.queue.length, 0);
});

void test('skip ends only the current tutorial and marks it seen', () => {
  let s = run(
    [
      { type: 'request', id: 'section.messages' },
      { type: 'request', id: 'section.rules' },
      { type: 'pump', blocked: false },
      { type: 'next' },
      { type: 'skip' },
    ],
    loaded(),
  );
  assert.equal(s.seen['section.messages'], 'skipped');
  assert.equal(s.active, null);
  s = reduce(s, { type: 'pump', blocked: false });
  assert.equal(s.active?.id, 'section.rules', 'other tutorials still show');
});

void test('skipping a walkthrough chapter skips the whole walkthrough, not sections', () => {
  let s = run(
    [
      { type: 'request', id: 'walkthrough.start' },
      { type: 'request', id: 'walkthrough.day' },
      { type: 'request', id: 'section.flow' },
      { type: 'pump', blocked: false },
      { type: 'skip' },
    ],
    loaded(),
  );
  for (const id of [
    'walkthrough.lobby',
    'walkthrough.start',
    'walkthrough.day',
  ])
    assert.equal(s.seen[id], 'skipped');
  assert.deepEqual(
    s.queue.map((e) => e.id),
    ['section.flow'],
  );
  s = reduce(s, { type: 'pump', blocked: false });
  assert.equal(s.active?.id, 'section.flow');
});

void test('completing the start chapter covers the Game flow section', () => {
  let s = run(
    [
      { type: 'request', id: 'walkthrough.start' },
      { type: 'request', id: 'section.flow' },
      { type: 'pump', blocked: false },
    ],
    loaded(),
  );
  const steps = stepsFor(tutorial('walkthrough.start')!, 'web').length;
  for (let i = 0; i < steps; i++) s = reduce(s, { type: 'next' });
  assert.equal(s.seen['section.flow'], 'completed');
  s = reduce(s, { type: 'pump', blocked: false });
  assert.equal(s.active, null, 'covered section does not pop up');
  assert.equal(s.queue.length, 0);
});

void test('queued popups wait for every suppression state to end', () => {
  let s = run(
    [
      { type: 'request', id: 'section.night' },
      { type: 'pump', blocked: true },
    ],
    loaded(),
  );
  assert.equal(s.active, null);
  assert.equal(s.queue.length, 1);
  s = reduce(s, { type: 'pump', blocked: true });
  assert.equal(s.active, null);
  s = reduce(s, { type: 'pump', blocked: false });
  assert.equal(s.active?.id, 'section.night');
});

void test('a blocking state suspends the active tutorial at its step', () => {
  let s = run(
    [
      { type: 'request', id: 'section.messages' },
      { type: 'request', id: 'section.rules' },
      { type: 'pump', blocked: false },
      { type: 'next' },
      { type: 'pump', blocked: true },
    ],
    loaded(),
  );
  assert.equal(s.active, null);
  assert.deepEqual(s.queue[0], {
    id: 'section.messages',
    step: 1,
    replay: false,
  });
  s = reduce(s, { type: 'pump', blocked: false });
  assert.deepEqual(s.active, {
    id: 'section.messages',
    step: 1,
    replay: false,
  });
});

void test('nothing shows until progress has loaded, then seen requests drop', () => {
  let s = run([
    { type: 'request', id: 'section.rules' },
    { type: 'request', id: 'section.messages' },
    { type: 'pump', blocked: false },
  ]);
  assert.equal(s.active, null);
  s = run(
    [
      { type: 'load', seen: [{ id: 'section.rules', status: 'completed' }] },
      { type: 'pump', blocked: false },
    ],
    s,
  );
  assert.equal(s.active?.id, 'section.messages');
  assert.equal(s.queue.length, 0);
});

void test('replay plays seen tutorials and whole groups without unmarking', () => {
  let s = loaded({
    'walkthrough.lobby': 'completed',
    'walkthrough.start': 'skipped',
    'walkthrough.day': 'skipped',
  });
  s = run(
    [
      { type: 'replay', id: 'walkthrough.lobby' },
      { type: 'pump', blocked: false },
    ],
    s,
  );
  assert.deepEqual(s.active, {
    id: 'walkthrough.lobby',
    step: 0,
    replay: true,
  });
  assert.deepEqual(
    s.queue.map((e) => e.id),
    ['walkthrough.start', 'walkthrough.day'],
  );
  s = reduce(s, { type: 'skip' });
  // Skipping a replay never downgrades a completion or unmarks anything.
  assert.equal(s.seen['walkthrough.lobby'], 'completed');
  assert.equal(s.seen['walkthrough.start'], 'skipped');
  assert.equal(s.queue.length, 0);
});

void test('replay is deferred while blocked', () => {
  let s = run(
    [
      { type: 'replay', id: 'section.rules' },
      { type: 'pump', blocked: true },
    ],
    loaded({ 'section.rules': 'completed' }),
  );
  assert.equal(s.active, null);
  s = reduce(s, { type: 'pump', blocked: false });
  assert.equal(s.active?.id, 'section.rules');
});

void test('newlySeen reports only changes for persistence', () => {
  assert.deepEqual(
    newlySeen(
      { a: 'completed', b: 'skipped' },
      { a: 'completed', b: 'completed', c: 'skipped' },
    ),
    [
      { id: 'b', status: 'completed' },
      { id: 'c', status: 'skipped' },
    ],
  );
});

void test('unknown and platform-mismatched tutorials are ignored', () => {
  const web = run([{ type: 'request', id: 'section.nope' }], loaded());
  assert.equal(web.queue.length, 0);
  const ios = run([{ type: 'request', id: 'section.cosmetic' }], {
    ...initialState('ios'),
    loaded: true,
  });
  assert.equal(ios.queue.length, 0, 'Cosmetic is web only');
});

void test('walkthrough chapters follow lobby, first night and first day; never the Storyteller', () => {
  assert.deepEqual(
    walkthroughTriggers({ phase: 'lobby', host: false, day: 0 }),
    ['walkthrough.lobby'],
  );
  assert.deepEqual(
    walkthroughTriggers({ phase: 'night', host: false, day: 0 }),
    ['walkthrough.start'],
  );
  assert.deepEqual(
    walkthroughTriggers({ phase: 'nomination', host: false, day: 1 }),
    ['walkthrough.start', 'walkthrough.day'],
  );
  assert.deepEqual(
    walkthroughTriggers({ phase: 'ended', host: false, day: 3 }),
    [],
  );
  assert.deepEqual(
    walkthroughTriggers({ phase: 'lobby', host: true, day: 0 }),
    [],
  );
  assert.deepEqual(
    walkthroughTriggers({
      phase: 'lobby',
      host: false,
      day: 0,
      sandboxHost: true,
    }),
    [],
  );
});

void test('night choices, the Sphinx glimpse and an unanswered vote suppress popups', () => {
  const base = { phase: 'night', host: false, me: 'p1' };
  assert.deepEqual(suppressionReasons(base), []);
  assert.deepEqual(
    suppressionReasons({ ...base, nightChoice: { task: 'x' } }),
    ['night-choice'],
  );
  assert.deepEqual(suppressionReasons({ ...base, glimpse: { id: 'g' } }), [
    'night-glimpse',
  ]);
  const voting = {
    phase: 'voting',
    host: false,
    me: 'p1',
    active: { eligible: ['p1', 'p2'], myVoteSubmitted: false },
  };
  assert.deepEqual(suppressionReasons(voting), ['vote']);
  assert.deepEqual(
    suppressionReasons({
      ...voting,
      active: { eligible: ['p1'], myVoteSubmitted: true },
    }),
    [],
  );
  assert.deepEqual(
    suppressionReasons({ ...voting, me: 'p3' }),
    [],
    'non-voters are not held',
  );
  // Night Rite: the night lock and timed turns or open votes.
  const night = { phase: 'night', host: false, me: 'p1', serverNow: 1000 };
  assert.deepEqual(
    suppressionReasons({ ...night, rite: { lockUntil: 5000, puzzle: null } }),
    ['night-lock'],
  );
  assert.deepEqual(
    suppressionReasons({
      ...night,
      rite: { lockUntil: 500, puzzle: { phase: 'lock' } },
    }),
    ['night-lock'],
  );
  assert.deepEqual(
    suppressionReasons({
      ...night,
      rite: { lockUntil: 500, puzzle: { phase: 'wait' } },
    }),
    [],
  );
  assert.deepEqual(
    suppressionReasons({ ...night, rite: { puzzle: { phase: 'turn' } } }),
    ['rite-turn'],
  );
  assert.deepEqual(
    suppressionReasons({
      ...night,
      rite: { puzzle: { phase: 'wait', vote: { answered: false } } },
    }),
    ['rite-turn'],
  );
  assert.deepEqual(
    suppressionReasons({ ...night, rite: { host: true, lockUntil: 5000 } }),
    [],
    'Storyteller view is not held',
  );
});

void test('guest progress lasts for one seat and resets on a new join', () => {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  assert.equal(isNewScope(store, 'ABCDEF:p1'), true);
  writeGuest(store, 'ABCDEF:p1', { 'section.rules': 'skipped' });
  // Refresh or reconnect on the same seat: still seen.
  assert.deepEqual(readGuest(store, 'ABCDEF:p1'), [
    { id: 'section.rules', status: 'skipped' },
  ]);
  // Pages outside the table use the current seat.
  assert.deepEqual(readGuest(store, null), [
    { id: 'section.rules', status: 'skipped' },
  ]);
  // A new join (another seat) sees everything again.
  assert.equal(isNewScope(store, 'GHIJKL:p4'), true);
  assert.deepEqual(readGuest(store, 'GHIJKL:p4'), []);
  // Broken or blocked storage never throws.
  const broken = {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('blocked');
    },
  };
  assert.deepEqual(readGuest(broken, 'x'), []);
  writeGuest(broken, 'x', {});
  data.set('fv.tutorials.guest', '{nope');
  assert.deepEqual(readGuest(store, 'ABCDEF:p1'), []);
});

void test('the progress API accepts only known tutorials and statuses', () => {
  assert.deepEqual(
    parseItems({
      items: [
        { id: 'section.rules', status: 'completed' },
        { id: 'section.rules', status: 'skipped' },
        { id: 'walkthrough.lobby', status: 'skipped' },
      ],
    }),
    [
      { id: 'section.rules', status: 'completed' },
      { id: 'walkthrough.lobby', status: 'skipped' },
    ],
  );
  assert.deepEqual(parseItems({ id: 'section.night', status: 'skipped' }), [
    { id: 'section.night', status: 'skipped' },
  ]);
  assert.throws(
    () => parseItems({ id: 'section.<script>', status: 'skipped' }),
    /Unknown tutorial/,
  );
  assert.throws(
    () => parseItems({ id: 'section.rules', status: 'seen' }),
    /status/,
  );
  assert.throws(
    () =>
      parseItems({
        items: Array(51).fill({ id: 'section.rules', status: 'skipped' }),
      }),
    /Too many/,
  );
});

void test('Help lists the right tutorials for each viewer', () => {
  const ids = (host: boolean, seated: boolean, ownGuides: string[] = []) =>
    helpSections({
      platform: 'web',
      host,
      seated,
      seen: {},
      ownGuides,
    }).flatMap((s) => s.items.map((i) => i.id));
  const player = ids(false, true);
  assert.ok(player.includes('walkthrough.lobby'));
  assert.ok(!player.includes('walkthrough.start'), 'one entry per walkthrough');
  assert.ok(player.includes('section.messages'));
  assert.ok(
    !player.includes('section.seats'),
    'iPhone-only sections are hidden on web',
  );
  const host = ids(true, false);
  assert.ok(!host.includes('walkthrough.lobby'));
  assert.ok(!host.includes('section.messages'));
  assert.ok(host.includes('section.account'));
  const seen = helpSections({
    platform: 'web',
    host: false,
    seated: true,
    seen: { 'walkthrough.lobby': 'completed', 'walkthrough.start': 'skipped' },
  })[0].items[0];
  assert.equal(
    seen.seen,
    false,
    'a walkthrough is seen only when every chapter is',
  );
});

void test('Help never lists Night Rite guides the player was not given', () => {
  const guide = {
    id: 'guide.test',
    kind: 'guide' as const,
    title: 'Test guide',
    summary: 'x',
    audience: 'player' as const,
    steps: [{ title: 't', body: 'b' }],
  };
  TUTORIALS.push(guide);
  try {
    const list = (own: string[]) =>
      helpSections({
        platform: 'web',
        host: false,
        seated: true,
        seen: {},
        ownGuides: own,
      })
        .flatMap((s) => s.items)
        .map((i) => i.id);
    assert.ok(!list([]).includes('guide.test'));
    assert.ok(list(['guide.test']).includes('guide.test'));
  } finally {
    TUTORIALS.pop();
  }
});

void test('tutorial content never names a character or a team', () => {
  const text = JSON.stringify(TUTORIALS).toLowerCase();
  for (const r of ALL_ROLES) {
    const name = r.name.toLowerCase();
    assert.ok(
      !new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
        text,
      ),
      `tutorial text mentions ${r.name}`,
    );
  }
  for (const word of [
    'evil',
    'good team',
    'villager',
    'haunt',
    'horror',
    'fool',
    'traveler',
    'demon',
    'minion',
    'alignment',
  ])
    assert.ok(!text.includes(word), `tutorial text mentions "${word}"`);
});

void test('tutorial definitions are well formed', () => {
  const ids = new Set<string>();
  for (const t of TUTORIALS) {
    assert.ok(!ids.has(t.id), `duplicate ${t.id}`);
    ids.add(t.id);
    assert.ok(
      stepsFor(t, 'web').length || stepsFor(t, 'ios').length,
      `${t.id} has steps`,
    );
    for (const c of t.covers ?? [])
      assert.ok(tutorial(c), `${t.id} covers unknown ${c}`);
    for (const s of t.steps) {
      assert.ok(s.title.length <= 40, `${t.id}: title too long`);
      assert.ok(s.body.length <= 320, `${t.id}: body too long`);
    }
  }
});

void test('every web target exists in the table or a component', () => {
  const sources = ['app/table/page.tsx', 'components/tutorials/help-menu.tsx']
    .map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8'))
    .join('\n');
  for (const t of TUTORIALS)
    for (const s of stepsFor(t, 'web'))
      if (s.target)
        assert.ok(
          sources.includes(`data-tutorial="${s.target}"`),
          `${t.id}: no element has data-tutorial="${s.target}"`,
        );
});

void test('the iPhone tutorial catalog matches the web content', () => {
  const native = JSON.parse(
    readFileSync(
      new URL('../ios/Fearville/tutorials.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(native, iosCatalog());
});
