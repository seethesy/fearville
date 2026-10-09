import { claimSeats } from './claim-seats.mjs';
import assert from 'node:assert/strict';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
for (const script of ['horrors', 'holyMoonStars']) {
  const host = await call('/api/session', '', {
    action: 'create',
    name: 'Introduction QA',
  });
  const seats = [];
  for (let i = 0; i < 7; i++)
    seats.push(
      await call('/api/session', '', {
        action: 'join',
        code: host.code,
        name: `Intro ${i + 1}`,
      }),
    );
  await claimSeats(base, seats.map((s) => s.token));
  let g = await call('/api/game', host.token);
  async function act(c) {
    g = (await call('/api/game', host.token, { ...c, version: g.version }))
      .game;
  }
  await act({ action: 'setScript', script });
  const roles =
    script === 'horrors'
      ? [
          'sheriff',
          'hoflibrarian',
          'teacher',
          'doctor',
          'lostwanderer',
          'basilisk',
          'monster',
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
  for (let i = 0; i < 7; i++)
    await act({
      action: 'edit',
      player: g.players[i].id,
      name: g.players[i].name,
      seat: i + 1,
      role: roles[i],
      alive: true,
      ghost: true,
    });
  const bluffs =
    script === 'horrors'
      ? ['bodyguard', 'judge', 'vigilante']
      : ['astrologist', 'mystic', 'priest'];
  await act({
    action: 'configure',
    discovery: 300,
    discussion: 120,
    nomination: 120,
    defense: 30,
    voting: 30,
    nightChoice: 5,
    bluff1: bluffs[0],
    bluff2: bluffs[1],
    bluff3: bluffs[2],
  });
  await act({ action: 'start' });
  assert.equal(
    (await call('/api/game', seats[6].token)).nightIntroduction,
    null,
  );
  await new Promise((r) => setTimeout(r, 5500));
  g = await call('/api/game', host.token);
  await act({ action: 'night', task: 'minioninfo' });
  await act({ action: 'night', task: 'demoninfo' });
  const horror = await call('/api/game', seats[6].token);
  const haunt = await call('/api/game', seats[5].token);
  const good = await call('/api/game', seats[0].token);
  assert.match(horror.nightIntroduction.text, /You are the Horror/);
  assert.match(horror.nightIntroduction.text, /Your Haunts: Intro 6/);
  assert.match(haunt.nightIntroduction.text, /Your Horror is Intro 7/);
  assert.equal(good.nightIntroduction, null);
  assert.ok(
    !good.messages.some(
      (m) =>
        m.id === horror.nightIntroduction.id ||
        m.id === haunt.nightIntroduction.id,
    ),
  );
  assert.equal(g.nightIntroduction, null);
  assert.ok(horror.players.every((p) => !('role' in p)));
  console.log(`PASS: ${script} private first-night task delivery over HTTP.`);
  if (process.argv.includes('--browser') && script === 'holyMoonStars')
    console.log(
      JSON.stringify({
        code: host.code,
        horror: seats[6].token,
        haunt: seats[5].token,
      }),
    );
}
