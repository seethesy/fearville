// FEAR-30: end-to-end QA for the FEAR-15 epic (tutorials, Night Rite guides
// and role tips). Unlike tests/tutorials.test.ts, which feeds the tutorial
// engine hand-written views, these tests drive real games through the game
// engine and `view()` (the /api/game payload), then run the same trigger,
// suppression, Help and queue logic the table uses (TableTutorials and the
// TutorialProvider). The HTTP payload checks live in
// tests/tutorials-qa-integration.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newGame,
  newPlayer,
  role,
  type Game,
  type RoleScript,
} from '../lib/game/types.ts';
import { execute, beginNight } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
import { ROLE_TIPS, roleTips } from '../lib/game/role-tips.ts';
import { configureRite, riteAction } from '../lib/rite/engine.ts';
import { DEFAULT_CONFIG, PATTERNS, type Pattern } from '../lib/rite/types.ts';
import { generateBoard } from '../lib/rite/board.ts';
import { generateLab } from '../lib/rite/lab.ts';
import {
  available,
  helpSections,
  hostSectionFor,
  hostTourTriggers,
  initialState,
  reduce,
  riteGuideTrigger,
  stepsFor,
  suppressionReasons,
  walkthroughTriggers,
  type TutorialEvent,
  type TutorialState,
} from '../lib/tutorials/engine.ts';
import { TUTORIALS, tutorial } from '../lib/tutorials/content.ts';
import { readGuest, writeGuest, isNewScope } from '../lib/tutorials/guest.ts';

type View = ReturnType<typeof view>;
const host = { id: 'host', host: true };
const seat = (id: string) => ({ id, host: false });
const run = (events: TutorialEvent[], start: TutorialState) =>
  events.reduce(reduce, start);
const loaded = (seen: TutorialState['seen'] = {}) =>
  reduce(initialState('web'), {
    type: 'load',
    seen: Object.entries(seen).map(([id, status]) => ({ id, status })),
  });

// Sixteen Horrors players: every role type, a Drunk who believes they are
// the Teacher, and all four Night Rite patterns in play.
const HOF_TABLE = [
  'doctor',
  'detective',
  'watchman',
  'bodyguard',
  'psychic',
  'judge',
  'mortician',
  'vigilante',
  'teacher',
  'drunk',
  'hag',
  'lostwanderer',
  'banshee',
  'basilisk',
  'sphinx',
  'monster',
];
const BELIEVED: Record<string, string> = { drunk: 'teacher', dazed: 'mystic' };

function started(
  roles: string[],
  patterns: Pattern[] = ['board', 'grid', 'ritual', 'lab'],
  script: RoleScript = 'horrors',
) {
  const g = newGame('QA', 'Host');
  g.script = script;
  g.players = roles.map((r, i) => ({
    ...newPlayer(`P${i + 1}`, i + 1),
    id: `p${i}`,
    role: r,
    shown: BELIEVED[r] ?? r,
  }));
  g.bluffs = [];
  configureRite(g, {
    action: 'configureRite',
    config: { ...DEFAULT_CONFIG, enabled: true, patterns },
  });
  execute(g, host, { action: 'start', override: true }, 1000);
  return g;
}
// Certified fixtures so the Rite opens without asynchronous preparation.
function prepare(g: Game) {
  g.rite!.prepared = Object.fromEntries(
    g
      .rite!.plans.filter((p) => p.kind === 'board' || p.kind === 'lab')
      .map((p) => [
        `${p.id}:${p.kind}:${p.members.length}`,
        p.kind === 'board'
          ? generateBoard(`qa-${p.id}`, p.members.length)
          : generateLab(`qa-${p.id}`, p.members.length),
      ]),
  );
}
const playerView = (g: Game, id: string, now = 2000) =>
  view(g, seat(id), 1, now);
const hostView = (g: Game, now = 2000) => view(g, host, 1, now);
const perceived = (g: Game, id: string) => {
  const p = g.players.find((x) => x.id === id)!;
  return p.shown || p.role;
};
const ownKind = (g: Game, id: string) =>
  g.rite!.plans.find((p) => p.members.includes(id))?.kind;

// What the table requests for a view on a tab: the same engine calls
// TableTutorials makes (walkthrough, Storyteller tour, Storyteller sections,
// the player's Night Rite guide).
function requested(v: View, tab = 'flow'): string[] {
  const trigger = {
    phase: v.phase,
    host: v.host,
    day: v.day,
    sandboxHost: v.sandboxHost,
  };
  const host = hostSectionFor(v.host, tab);
  const guide = riteGuideTrigger(v);
  return [
    ...walkthroughTriggers(trigger),
    ...hostTourTriggers(trigger),
    ...(host ? [`section.${host}`] : []),
    ...(guide ? [guide] : []),
  ];
}
// Help as the table builds it (app/table/page.tsx → HelpMenu).
function helpFor(v: View) {
  const own =
    v.rite && !v.rite.host && v.rite.squad
      ? [`guide.${v.rite.squad.kind}`]
      : [];
  return helpSections({
    platform: 'web',
    host: v.host,
    seated: !v.host && !v.sandboxHost,
    ownGuides: own,
    seen: {},
  }).flatMap((s) => s.items.map((i) => i.id));
}

// ---------------------------------------------------------------------------
// Who sees what
// ---------------------------------------------------------------------------

void test('real views: the Storyteller tour reaches only the Storyteller, the walkthrough only players', () => {
  const g = newGame('QA', 'Host');
  g.script = 'horrors';
  g.players = HOF_TABLE.map((r, i) => ({
    ...newPlayer(`P${i + 1}`, i + 1),
    id: `p${i}`,
    role: r,
    shown: BELIEVED[r] ?? r,
  }));
  const check = (label: string) => {
    for (const tab of ['flow', 'seats', 'control', 'messages', 'script']) {
      const h = requested(hostView(g), tab);
      assert.ok(
        h.some((id) => id.startsWith('tour.')),
        `${label}: Storyteller gets the tour (${tab})`,
      );
      assert.ok(
        !h.some(
          (id) => id.startsWith('walkthrough.') || id.startsWith('guide.'),
        ),
        `${label}: no player content for the Storyteller (${tab})`,
      );
      for (const p of g.players) {
        const ids = requested(playerView(g, p.id), tab);
        assert.ok(
          !ids.some(
            (id) => id.startsWith('tour.') || id.startsWith('section.host-'),
          ),
          `${label}: ${p.id} is offered Storyteller content on ${tab}`,
        );
        assert.ok(
          ids.some((id) => id.startsWith('walkthrough.')),
          label,
        );
      }
    }
    for (const p of g.players)
      assert.ok(
        !helpFor(playerView(g, p.id)).some(
          (id) => id.startsWith('tour.') || id.startsWith('section.host-'),
        ),
        `${label}: player Help lists Storyteller content`,
      );
    assert.ok(helpFor(hostView(g)).includes('tour.lobby'), label);
  };
  check('lobby');
  configureRite(g, {
    action: 'configureRite',
    config: { ...DEFAULT_CONFIG, enabled: true, patterns: ['grid', 'ritual'] },
  });
  g.bluffs = [];
  execute(g, host, { action: 'start', override: true }, 1000);
  assert.equal(g.phase, 'night');
  check('night 1');
});

void test('real views: on night 1 each player is offered only their own vigil’s guide, for every pattern', () => {
  for (const kind of Object.keys(PATTERNS) as Pattern[]) {
    const g = started(HOF_TABLE.slice(0, 9), [kind]);
    assert.equal(g.night, 1);
    for (const p of g.players) {
      const v = playerView(g, p.id);
      assert.equal(riteGuideTrigger(v), `guide.${kind}`, `${kind}: ${p.id}`);
      assert.ok(stepsFor(tutorial(`guide.${kind}`)!, 'web').length);
    }
    assert.equal(riteGuideTrigger(hostView(g)), null);
  }
  // Mixed patterns: the guide, Help and the view itself name only the
  // player's own pattern.
  const g = started(HOF_TABLE);
  const kinds = new Set(g.rite!.plans.map((p) => p.kind));
  assert.equal(kinds.size, 4, 'all four patterns are in play');
  for (const p of g.players) {
    const own = ownKind(g, p.id)!;
    const v = playerView(g, p.id);
    assert.equal(riteGuideTrigger(v), `guide.${own}`);
    const guides = helpFor(v).filter((id) => id.startsWith('guide.'));
    assert.deepEqual(guides, [`guide.${own}`], `${p.id} Help guides`);
  }
});

void test('the Night 1 guide is not offered once the Rite opens', () => {
  const g = started(HOF_TABLE);
  prepare(g);
  beginNight(g, 5000);
  assert.equal(g.night, 2);
  assert.equal(g.rite!.status, 'open');
  for (const p of g.players)
    assert.equal(riteGuideTrigger(playerView(g, p.id, 5001)), null, p.id);
});

// ---------------------------------------------------------------------------
// Leak tests
// ---------------------------------------------------------------------------

function assertNoLeaks(g: Game, now: number, label: string) {
  const script = (g.script ?? 'horrors') as RoleScript;
  const allTips = Object.entries(ROLE_TIPS[script]);
  for (const p of g.players) {
    const v = playerView(g, p.id, now);
    const wire = JSON.stringify(v);
    const believed = perceived(g, p.id);
    // Tips: exactly the role the player believes they have.
    assert.deepEqual(
      v.character?.tips,
      roleTips(script, believed),
      `${label}: ${p.id} tips`,
    );
    const own = new Set(roleTips(script, believed));
    for (const [id, tips] of allTips)
      for (const tip of tips)
        if (!own.has(tip))
          assert.ok(
            !wire.includes(JSON.stringify(tip).slice(1, -1)),
            `${label}: ${p.id} (${p.role}) sees a tip for ${id}`,
          );
    // No other player's character in any form. The one exception is the
    // Sphinx's glimpse, this script's grimoire peek (the Spy's equivalent),
    // which only the Sphinx ever receives.
    if (v.glimpse)
      assert.equal(p.role, 'sphinx', `${label}: ${p.id} receives a glimpse`);
    const rest = JSON.stringify({ ...v, glimpse: null });
    assert.ok(!/"(role|shown|acts)":/.test(rest), `${label}: role fields`);
    // A Drunk-type player is never told what they really are.
    if (p.role !== believed)
      assert.ok(
        !wire.includes(`"${role(p.role)!.name}"`),
        `${label}: ${p.id} learns their real character`,
      );
    // Night Rite: no other vigil's pattern or members.
    const kind = ownKind(g, p.id);
    if (kind) {
      for (const other of Object.keys(PATTERNS) as Pattern[])
        if (other !== kind)
          assert.ok(
            !wire.includes(PATTERNS[other]),
            `${label}: ${p.id} sees ${other}`,
          );
      for (const plan of g.rite!.plans.filter((x) => x.kind !== kind))
        assert.ok(!wire.includes(`"${plan.id}"`), `${label}: other vigil id`);
    }
  }
}

void test('payloads never carry other players’ roles, other vigils’ patterns or other roles’ tips (Horrors)', () => {
  const g = started(HOF_TABLE);
  assertNoLeaks(g, 2000, 'night 1');
  prepare(g);
  beginNight(g, 5000);
  assertNoLeaks(g, 5001, 'night 2');
  beginNight(g, 9000);
  assertNoLeaks(g, 9001, 'night 3');
});

void test('payloads never leak in Holy Moon and Stars, and the Dazed sees their believed role’s tips', () => {
  const g = started(
    [
      'astrologist',
      'mystic',
      'astronaut',
      'stargazer',
      'prophet',
      'insomniac',
      'diviner',
      'dazed',
      'zealot',
      'necromancer',
      'werewolf',
    ],
    ['grid', 'ritual'],
    'holyMoonStars',
  );
  assertNoLeaks(g, 2000, 'HMS night 1');
  const dazed = g.players.find((p) => p.role === 'dazed')!;
  assert.deepEqual(
    playerView(g, dazed.id).character?.tips,
    roleTips('holyMoonStars', 'mystic'),
  );
});

void test('evil-team tips never reach a player who does not believe they hold that role', () => {
  // Every minion and demon tip is guidance for that team. A good player,
  // including one who registers or acts as something else, sees none of it.
  const g = started(HOF_TABLE);
  const evil = g.players.filter((p) =>
    ['minion', 'demon'].includes(role(p.role)!.team),
  );
  const evilTips = evil.flatMap((p) => roleTips('horrors', p.role));
  assert.ok(evilTips.length, 'the fixture has evil-team tips');
  for (const p of g.players.filter((x) => !evil.includes(x))) {
    const wire = JSON.stringify(playerView(g, p.id));
    for (const tip of evilTips)
      assert.ok(!wire.includes(tip), `${p.id} (${p.role}) sees an evil tip`);
  }
  // The Drunk's own catalog entry is never delivered (they see the Teacher's).
  const drunk = g.players.find((p) => p.role === 'drunk')!;
  for (const tip of roleTips('horrors', 'drunk'))
    assert.ok(!JSON.stringify(playerView(g, drunk.id)).includes(tip));
});

void test('tutorial and guide content is identical for every player and names no one', () => {
  // Content is static data; whatever a player is shown is the same for
  // anyone shown that tutorial, so it can carry nothing about the table.
  const g = started(HOF_TABLE);
  const names = g.players.map((p) => p.name);
  const text = JSON.stringify(TUTORIALS);
  for (const name of names)
    assert.ok(!new RegExp(`\\b${name}\\b`).test(text), name);
  for (const t of TUTORIALS)
    assert.deepEqual(
      stepsFor(t, 'web'),
      stepsFor(tutorial(t.id)!, 'web'),
      'content does not depend on the viewer',
    );
});

// ---------------------------------------------------------------------------
// Suppression: popups wait for timed states, then appear
// ---------------------------------------------------------------------------

function queueBehind(reasons: string[], id: string) {
  return run(
    [
      { type: 'request', id },
      { type: 'pump', blocked: reasons.length > 0 },
    ],
    loaded(),
  );
}

void test('real views: a Rite turn holds popups until the turn passes, then the queued popup shows', () => {
  const g = started(HOF_TABLE);
  prepare(g);
  beginNight(g, 5000);
  const squad = g.rite!.squads.find((s) => s.kind === 'board')!;
  const state = squad.state as { turn: { order: string[]; cursor: number } };
  const current = state.turn.order[state.turn.cursor % state.turn.order.length];
  let reasons = suppressionReasons(playerView(g, current, 5001));
  assert.ok(reasons.includes('rite-turn'), 'the turn holds popups');
  let s = queueBehind(reasons, 'section.messages');
  assert.equal(s.active, null, 'nothing pops up during the turn');
  assert.deepEqual(
    s.queue.map((e) => e.id),
    ['section.messages'],
  );
  riteAction(
    g,
    host,
    { action: 'ritePassTurn', squad: squad.id, epoch: g.rite!.epoch, night: 2 },
    5002,
  );
  reasons = suppressionReasons(playerView(g, current, 5003)).filter(
    // Vigils are randomly assigned: the current member may also hold a
    // Sphinx glimpse. This test isolates the Rite blocker, not those tasks.
    (r) => !['night-choice', 'night-glimpse'].includes(r),
  );
  assert.ok(!reasons.includes('rite-turn'));
  s = reduce(s, { type: 'pump', blocked: reasons.length > 0 });
  assert.equal(s.active?.id, 'section.messages', 'shown once the turn ends');
});

void test('real views: an open night choice holds popups; the Laboratory turn does too', () => {
  const g = started(HOF_TABLE);
  prepare(g);
  beginNight(g, 5000);
  const choosing = g.players.filter(
    (p) => playerView(g, p.id, 5001).nightChoice,
  );
  assert.ok(choosing.length, 'some players have a night choice open');
  for (const p of choosing)
    assert.ok(
      suppressionReasons(playerView(g, p.id, 5001)).includes('night-choice'),
    );
  const lab = g.rite!.squads.find((s) => s.kind === 'lab')!;
  const t = (lab.state as { turn: { order: string[]; cursor: number } }).turn;
  const current = t.order[t.cursor % t.order.length];
  assert.ok(
    suppressionReasons(playerView(g, current, 5001)).includes('rite-turn'),
  );
  // Waiting members are not held by the Rite.
  for (const id of t.order.filter((id) => id !== current))
    assert.ok(
      !suppressionReasons(playerView(g, id, 5001)).includes('rite-turn'),
    );
});

void test('no night lock ever reaches a player, and the lock contract still holds popups', () => {
  // The 30-second view-only lock was removed when the Rite moved to open,
  // untimed turns: players never receive a lock phase or lock deadline, so
  // nothing is ever held for one. If a lock returns, suppression is ready.
  const g = started(HOF_TABLE);
  prepare(g);
  for (const night of [2, 3]) {
    beginNight(g, night * 5000);
    for (const p of g.players) {
      const v = playerView(g, p.id, night * 5000 + 1);
      assert.ok(v.rite && !v.rite.host);
      assert.equal(v.rite.lockUntil, undefined, `${p.id} night ${night}`);
      assert.notEqual(
        (v.rite.puzzle as { phase?: string } | null)?.phase,
        'lock',
      );
      assert.ok(!suppressionReasons(v).includes('night-lock'));
    }
  }
  const locked = {
    phase: 'night',
    host: false,
    me: 'p1',
    serverNow: 20000,
    rite: { lockUntil: 35000, puzzle: null },
  };
  assert.ok(suppressionReasons(locked).includes('night-lock'));
  assert.ok(
    !suppressionReasons({ ...locked, serverNow: 36000 }).includes('night-lock'),
  );
  assert.ok(
    suppressionReasons({
      ...locked,
      rite: { puzzle: { phase: 'lock' } },
    }).includes('night-lock'),
  );
});

void test('every queued popup waits for every blocker and shows afterwards, in order', () => {
  let s = run(
    [
      { type: 'request', id: 'walkthrough.start' },
      { type: 'request', id: 'section.night' },
      { type: 'request', id: 'guide.board' },
      { type: 'pump', blocked: true },
    ],
    loaded(),
  );
  assert.equal(s.active, null);
  s = reduce(s, { type: 'pump', blocked: false });
  const shown: string[] = [];
  while (s.active) {
    shown.push(s.active.id);
    s = reduce(s, { type: 'skip' });
    s = reduce(s, { type: 'pump', blocked: false });
  }
  assert.deepEqual(shown, [
    'walkthrough.start',
    'section.night',
    'guide.board',
  ]);
});

// ---------------------------------------------------------------------------
// Flows: guest versus account, Skip at every step, replay from Help
// ---------------------------------------------------------------------------

void test('Skip works at every step of every tutorial, ending only that tutorial', () => {
  for (const t of TUTORIALS)
    for (const platform of ['web', 'ios'] as const) {
      if (!available(t.id, platform)) continue;
      const steps = stepsFor(t, platform).length;
      for (let k = 0; k < steps; k++) {
        const other =
          t.id === 'section.messages' ? 'section.rules' : 'section.messages';
        let s = reduce(initialState(platform), { type: 'load', seen: [] });
        s = run(
          [
            { type: 'request', id: t.id },
            { type: 'request', id: other },
            { type: 'pump', blocked: false },
          ],
          s,
        );
        assert.equal(s.active?.id, t.id);
        for (let i = 0; i < k; i++) s = reduce(s, { type: 'next' });
        assert.equal(s.active?.step, k);
        s = reduce(s, { type: 'skip' });
        assert.equal(s.active, null, `${t.id} step ${k}`);
        assert.equal(s.seen[t.id], 'skipped');
        assert.equal(s.seen[other], undefined, 'other tutorials untouched');
        for (const c of t.covers ?? [])
          if (c !== other)
            assert.notEqual(s.seen[c], 'completed', 'skip never covers');
        s = reduce(s, { type: 'pump', blocked: false });
        if (available(other, platform))
          assert.equal(s.active?.id, other, 'the next tutorial still shows');
      }
    }
});

void test('every Help entry replays for its viewer, seen or not, without unmarking', () => {
  const viewers = [
    { host: true, seated: false, ownGuides: [] },
    { host: false, seated: true, ownGuides: ['guide.lab'] },
  ];
  for (const viewer of viewers) {
    const allSeen = Object.fromEntries(
      TUTORIALS.map((t) => [t.id, 'completed' as const]),
    );
    const items = helpSections({
      platform: 'web',
      ...viewer,
      seen: allSeen,
    }).flatMap((s) => s.items);
    assert.ok(items.length);
    for (const item of items) {
      assert.equal(item.seen, true);
      let s = loaded(allSeen);
      s = run(
        [
          { type: 'replay', id: item.id },
          { type: 'pump', blocked: false },
        ],
        s,
      );
      assert.equal(s.active?.id, item.id, `replay ${item.id}`);
      assert.equal(s.active?.replay, true);
      s = reduce(s, { type: 'skip' });
      assert.equal(s.seen[item.id], 'completed', 'a completion stays');
    }
  }
});

void test('accounts see each tutorial once on any device; guests see them again on every join', () => {
  const ids = [
    'walkthrough.lobby',
    'section.messages',
    'tour.lobby',
    'section.host-controls',
  ];
  // Account: progress from the server applies on a second device.
  let server: TutorialState['seen'] = {};
  for (const id of ids) {
    let s = run(
      [
        { type: 'request', id },
        { type: 'pump', blocked: false },
      ],
      loaded(server),
    );
    assert.equal(s.active?.id, id, `account first time: ${id}`);
    s = reduce(s, { type: 'skip' });
    server = { ...server, ...s.seen };
    const again = run(
      [
        { type: 'request', id },
        { type: 'pump', blocked: false },
      ],
      loaded(server),
    );
    assert.equal(again.active, null, `account second device: ${id}`);
  }
  // Guest: seen within one seat (refresh), reset on a new join.
  const store = new Map<string, string>();
  const kv = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  for (const id of ids) {
    store.clear();
    writeGuest(kv, 'AAAAAA:p1', { [id]: 'completed' });
    const seenHere = Object.fromEntries(
      readGuest(kv, 'AAAAAA:p1').map((i) => [i.id, i.status]),
    );
    assert.equal(
      run(
        [
          { type: 'request', id },
          { type: 'pump', blocked: false },
        ],
        loaded(seenHere),
      ).active,
      null,
      `guest refresh: ${id}`,
    );
    assert.ok(isNewScope(kv, 'BBBBBB:p1'));
    const fresh = Object.fromEntries(
      readGuest(kv, 'BBBBBB:p1').map((i) => [i.id, i.status]),
    );
    assert.equal(
      run(
        [
          { type: 'request', id },
          { type: 'pump', blocked: false },
        ],
        loaded(fresh),
      ).active?.id,
      id,
      `guest new join: ${id}`,
    );
  }
});

void test('role tips: the list is on the Game Flow screen and the toggle is in Help and Settings', () => {
  const page = readFileSync(
    new URL('../app/table/page/flow.tsx', import.meta.url),
    'utf8',
  );
  assert.match(page, /<RoleTipsPanel[\s\S]*?tips=\{game\.character\.tips\}/);
  const help = readFileSync(
    new URL('../components/tutorials/help-menu.tsx', import.meta.url),
    'utf8',
  );
  assert.match(help, /<RoleTipsToggle/);
  const tips = readFileSync(
    new URL('../components/role-tips.tsx', import.meta.url),
    'utf8',
  );
  // The list collapses accessibly and the toggle is a labelled checkbox,
  // on by default for guests.
  assert.match(tips, /aria-expanded=/);
  assert.match(tips, /aria-controls=/);
  assert.match(tips, /aria-label="Role tips"/);
  assert.match(tips, /type="checkbox"[\s\S]*?Show role tips/);
  assert.match(tips, /useState\(true\)/);
});

// ---------------------------------------------------------------------------
// Accessibility and layout (static checks; see docs/tutorials-qa.md for the
// manual checklist at 400px and desktop)
// ---------------------------------------------------------------------------

void test('the tutorial overlay is an accessible modal', () => {
  const overlay = readFileSync(
    new URL('../components/tutorials/overlay.tsx', import.meta.url),
    'utf8',
  );
  for (const pattern of [
    /aria-modal="true"/,
    /aria-labelledby=\{titleId\}/,
    /aria-describedby=\{bodyId\}/,
    /aria-live="polite"/,
    // Escape asks before skipping; Tab is trapped in the card.
    /e\.key === 'Escape'/,
    /e\.key !== 'Tab'/,
    // Focus moves to the primary action and returns afterwards.
    /primary\.current\?\.focus\(\)/,
    /previous\?\.focus\?\.\(\)/,
    // Reduced motion: no smooth scrolling.
    /prefers-reduced-motion: reduce/,
    // Decorative layers are hidden from screen readers.
    /tutorial-spotlight"\s+aria-hidden="true"/,
  ])
    assert.match(overlay, pattern, String(pattern));
  const help = readFileSync(
    new URL('../components/tutorials/help-menu.tsx', import.meta.url),
    'utf8',
  );
  assert.match(help, /aria-haspopup="dialog"/);
  assert.match(help, /aria-label=\{`\$\{item\.seen \? 'Replay' : 'Start'\}/);
});

void test('the tutorial card fits a 400px phone and honours reduced motion', () => {
  const css = readFileSync(
    new URL('../app/styles/globals/tutorials.css', import.meta.url),
    'utf8',
  );
  const card = css.match(/\.tutorial-card \{[^}]*\}/)?.[0] ?? '';
  // Never wider than the viewport minus 16px gutters, and scrolls if tall.
  assert.match(card, /width: min\(\d+px, calc\(100vw - 32px\)\)/);
  assert.match(card, /max-height: calc\(100dvh - 32px\)/);
  assert.match(card, /overflow-y: auto/);
  const reduced = [
    ...css.matchAll(
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g,
    ),
  ].map((m) => m[1]);
  assert.ok(
    reduced.some(
      (block) =>
        block.includes('.tutorial-card') &&
        block.includes('.tutorial-spotlight') &&
        block.includes('animation: none'),
    ),
  );
  // Step text is short enough for one card on a phone.
  for (const t of TUTORIALS)
    for (const s of t.steps) assert.ok(s.body.length <= 320, t.id);
});

// ---------------------------------------------------------------------------
// Regression: Night Rite from Night 2 onward, with vigils assigned at start
// ---------------------------------------------------------------------------

void test('regression: vigils fixed at game start run the Rite unchanged from night 2 onward', () => {
  const g = started(HOF_TABLE);
  const r = g.rite!;
  const plans = JSON.stringify(r.plans.map((p) => [p.id, p.kind, p.members]));
  // Night 1: vigils known, nothing playable yet.
  assert.equal(r.status, 'dormant');
  assert.equal(r.squads.length, 0);
  for (const p of g.players) {
    const v = playerView(g, p.id);
    assert.ok(v.rite && !v.rite.host);
    assert.equal(v.rite.puzzle, null);
    assert.equal(v.rite.opensNight, 2);
    assert.equal(v.rite.squad.kind, ownKind(g, p.id));
  }
  // Night 2: the Rite opens with exactly the vigils dealt at start.
  prepare(g);
  beginNight(g, 5000);
  assert.equal(r.status, 'open');
  assert.equal(
    JSON.stringify(r.squads.map((s) => [s.id, s.kind, s.members])),
    plans,
  );
  for (const s of r.squads) {
    const phases = s.members.map(
      (id) =>
        (playerView(g, id, 5001).rite as { puzzle?: { phase: string } }).puzzle
          ?.phase,
    );
    if (s.kind === 'board' || s.kind === 'lab')
      assert.equal(
        phases.filter((p) => p === 'turn').length,
        1,
        `${s.kind}: one member holds the turn`,
      );
    else assert.ok(phases.every(Boolean), `${s.kind}: every member plays`);
  }
  // Night 3: the same vigils continue with their saved puzzles.
  const saved = JSON.stringify(r.squads.map((s) => s.state));
  beginNight(g, 9000);
  assert.equal(g.night, 3);
  assert.equal(
    JSON.stringify(r.squads.map((s) => [s.id, s.kind, s.members])),
    plans,
  );
  for (const s of r.squads)
    if (s.kind === 'board')
      assert.deepEqual(
        (s.state as { blocks: unknown }).blocks,
        JSON.parse(saved)[r.squads.indexOf(s)].blocks,
        'the board carries over',
      );
});
