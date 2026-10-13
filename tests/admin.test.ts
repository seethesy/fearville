import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  allowlisted,
  adminSessionValid,
  ADMIN_SESSION_MS,
} from '../lib/admin/policy.ts';
import { COMMANDS, parseCommand } from '../lib/admin/commands.ts';
import { UI_TEXT, validateText, formatText } from '../lib/ui-text/registry.ts';
import { auditValue, auditTarget, auditParameters } from '../lib/admin/audit-value.ts';
void test('admin audit omits hidden game information and credentials recursively', () => {
  const result = auditValue({
    code: 'ABCDEF',
    players: [{ id: 'p', role: 'horror', shown: 'watchman', name: 'Player' }],
    notebooks: { p: 'secret' },
    token: 'secret',
    nested: { nightChoices: { p: 'victim' }, status: 'ended' },
  });
  assert.deepEqual(result, {
    code: 'ABCDEF',
    players: [{ id: 'p' }],
    nested: { status: 'ended' },
  });
  assert.ok(!JSON.stringify(auditParameters({ input: 'xp give alice 500' })).includes('alice'));
  assert.notEqual(auditTarget('xp give', 'alice'), 'alice');
});
const email = 'sybertechlabs@gmail.com';
void test('admin requires exact allowlist, Google provenance, current session and verified matching email', () => {
  const now = 10000000;
  const session = {
    role: 'admin',
    googleEmail: email,
    verifiedEmail: email,
    provider: 'google',
    issued: now - 100,
    expires: now + 10000,
  };
  assert.ok(adminSessionValid(session, email, now));
  for (const address of [
    'sybertechlabs+admin@gmail.com',
    'sybertechlabs@gmail.com.evil.test',
    'sybertechlаbs@gmail.com',
    'other@gmail.com',
    '',
  ])
    assert.equal(allowlisted(address, email), false, address);
  assert.ok(allowlisted(email.toUpperCase(), email));
  assert.equal(allowlisted(email, email + ',other@gmail.com'), false);
  assert.equal(adminSessionValid(session, '', now), false);
  for (const change of [
    { role: 'player' },
    { provider: 'apple' },
    { verifiedEmail: null },
    { googleEmail: null },
    { verifiedEmail: 'other@gmail.com' },
    { expires: now },
    { issued: now - ADMIN_SESSION_MS },
    { issued: now + 1 },
    { issued: 0 },
  ])
    assert.equal(
      adminSessionValid({ ...session, ...change }, email, now),
      false,
      JSON.stringify(change),
    );
});
void test('command parser validates typed arguments and never accepts additional commands', () => {
  assert.equal(parseCommand('xp give @alice 500').args.amount, 500);
  assert.equal(
    parseCommand('ban alice repeated harassment').args.reason,
    'repeated harassment',
  );
  for (const input of [
    'xp give alice -1',
    'xp give alice 1.5',
    'xp give alice 1000001',
    'xp give alice Infinity',
    'xp give alice 3 ban bob',
    'help extra',
    'unknown',
    'grant',
    'text revert home.welcome NaN',
  ])
    assert.throws(() => parseCommand(input), { message: /./ }, input);
  assert.ok(
    COMMANDS.filter((s) => ['ban', 'reset', 'endgame'].includes(s.name)).every(
      (s) => s.confirm,
    ),
  );
});
void test('text values remain literal, preserve placeholder sets, and have native defaults', () => {
  assert.equal(
    validateText('home.welcome', '<script>alert(1)</script>'),
    '<script>alert(1)</script>',
  );
  assert.throws(() => validateText('lobby.players', 'Players'));
  assert.throws(() => validateText('lobby.players', '{count} {secret}'));
  assert.throws(() => validateText('__proto__', 'value'));
  assert.throws(() => validateText('home.welcome', 'a'.repeat(4001)));
  assert.equal(formatText('{count} players', { count: 8 }), '8 players');
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        new URL('../ios/Fearville/ui-text.json', import.meta.url),
        'utf8',
      ),
    ),
    UI_TEXT,
  );
});
