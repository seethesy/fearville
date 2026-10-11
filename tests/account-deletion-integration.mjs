// FEAR-118: deleting an account with friends, ratings, finished games, a live
// seat and a hosted game leaves no personal data, keeps "Former player" seats
// and keeps the star value of ratings it gave. Local D1 only.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.CT_TEST_URL || 'http://localhost:3000';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Fixtures are local-only.',
);
const id = 'del-' + randomBytes(6).toString('hex');
const X = id + '-x',
  Y = id + '-y',
  Z = id + '-z';
const NAME = 'Xavier Quill' + id.slice(-4);
const EMAIL = `${id}-x@example.invalid`;
const COMMENT = 'comment-by-x-' + id;
const NOTE = 'note-by-x-' + id;
const CHAT = 'chat-by-x-' + id;
const PHOTO = 'data:image/png;base64,' + id;
const token = {
  [X]: randomBytes(32).toString('base64url'),
  [Y]: randomBytes(32).toString('base64url'),
  [Z]: randomBytes(32).toString('base64url'),
};
const sha = (s) => createHash('sha256').update(s).digest('hex');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function sql(statement) {
  mkdirSync('work', { recursive: true });
  const file = `work/${id}.sql`;
  writeFileSync(file, statement);
  const out = execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--config',
      'wrangler.local.json',
      '--file',
      file,
      '--json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out.slice(out.indexOf('[')));
}
const rows = (statement) => sql(statement).at(-1).results;

const recap = (players) =>
  JSON.stringify({
    id: 'R',
    ended: 2,
    winner: 'good',
    script: 'horrors',
    players: players.map(([pid, name]) => ({
      id: pid,
      name,
      role: 'Watchman',
      shown: 'Watchman',
      avatar: pid === 'px' ? PHOTO : 'ghost',
      notebook: pid === 'px' ? { text: NOTE } : undefined,
    })),
    decisions: [
      { id: 'd', at: 1, actor: 'Storyteller', text: `${NAME} was executed.` },
    ],
    messages: [
      { id: 'm', from: 'px', to: 'pz', text: CHAT, at: 1, kind: 'chat' },
    ],
    votes: {},
  });

sql(`
INSERT INTO accounts(id,name,email,created) VALUES (${q(X)},${q(NAME)},${q(EMAIL)},0),(${q(Y)},'Storyteller Y','${id}-y@example.invalid',0),(${q(Z)},'Friend Z','${id}-z@example.invalid',0);
INSERT INTO account_sessions(hash,account,expires) VALUES ('${sha(token[X])}',${q(X)},${Date.now() + 600000}),('${sha(token[Y])}',${q(Y)},${Date.now() + 600000}),('${sha(token[Z])}',${q(Z)},${Date.now() + 600000});
INSERT INTO identities(id,account,provider) VALUES ('google:${X}',${q(X)},'google');
INSERT INTO friendships(requester,addressee,status,created,updated) VALUES (${q(X)},${q(Z)},'accepted',0,0);
INSERT INTO account_settings(account) VALUES (${q(X)});
INSERT INTO account_profiles(account,lobby_name) VALUES (${q(X)},${q(NAME)});
INSERT INTO tutorial_progress(account,tutorial,status,updated) VALUES (${q(X)},'lobby','completed',0);
INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended,recap) VALUES ('${id}-g1','111111',${q(Y)},'Storyteller Y','good','test',5,1,1,1,2,${q(
  recap([
    ['px', NAME],
    ['pz', 'Friend Z'],
  ]),
)});
INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended) VALUES ('${id}-g2','222222',${q(X)},${q(NAME)},'evil','test',5,1,1,1,2);
INSERT INTO game_players(game,player,account,name,role,team,won,alive) VALUES ('${id}-g1','px',${q(X)},${q(NAME)},'watchman','good',1,1),('${id}-g1','pz',${q(Z)},'Friend Z','watchman','good',1,1),('${id}-g2','pz',${q(Z)},'Friend Z','watchman','good',0,1);
INSERT INTO storyteller_ratings(game,rater,storyteller,stars,comment,created) VALUES ('${id}-g1',${q(X)},${q(Y)},4,${q(COMMENT)},0),('${id}-g2',${q(Z)},${q(X)},5,'for x',0);
`);

async function call(path, account, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': id,
      ...(account ? { 'X-Account-Authorization': 'Bearer ' + account } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}

// A live table hosted by Y where X holds a player seat.
const lobby = await call('/api/session', token[Y], {
  action: 'create',
  name: 'Storyteller Y',
});
assert.equal(lobby.status, 200, JSON.stringify(lobby.data));
const joined = await call('/api/session', token[X], {
  action: 'join',
  code: lobby.data.code,
  name: NAME,
});
assert.equal(joined.status, 200, JSON.stringify(joined.data));
assert.ok(
  JSON.stringify(
    rows(`SELECT state FROM sessions WHERE code=${q(lobby.data.code)}`),
  ).includes(NAME),
);

assert.equal(
  (
    await call('/api/accounts', token[X], {
      action: 'delete',
      confirm: 'DELETE',
    })
  ).status,
  200,
);
assert.equal((await call('/api/accounts', token[X])).data.account, null);

// All checks read the database in one batch: separate wrangler processes
// touching the local SQLite file while the worker runs can crash the worker.
const keyed = [
  ['accounts', 'id'],
  ['identities', 'account'],
  ['account_sessions', 'account'],
  ['account_seats', 'account'],
  ['account_settings', 'account'],
  ['account_profiles', 'account'],
  ['tutorial_progress', 'account'],
  ['game_players', 'account'],
  ['friendships', 'requester'],
  ['friendships', 'addressee'],
  ['storyteller_ratings', 'rater'],
  ['storyteller_ratings', 'storyteller'],
];
const tables = rows(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
).map((t) => t.name);
const results = sql(
  [
    ...keyed.map(
      ([table, column]) =>
        `SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=${q(X)};`,
    ),
    `SELECT name FROM game_players WHERE game='${id}-g1' AND player='px';`,
    `SELECT host_name FROM games WHERE id='${id}-g2';`,
    `SELECT r.stars, r.comment, a.name, a.email FROM storyteller_ratings r JOIN accounts a ON a.id=r.rater WHERE r.game='${id}-g1';`,
    `SELECT AVG(stars) AS avg FROM storyteller_ratings WHERE storyteller=${q(Y)};`,
    `SELECT COUNT(*) AS n FROM storyteller_ratings WHERE game='${id}-g2';`,
    ...tables.map((table) => `SELECT * FROM ${table};`),
  ].join('\n'),
).map((r) => r.results);

// Nothing keyed to the account remains.
keyed.forEach(([table, column], i) =>
  assert.equal(results[i][0].n, 0, `${table}.${column}`),
);
let at = keyed.length;
// Former player seats and hosted-game name.
assert.equal(results[at++][0].name, 'Former player');
assert.equal(results[at++][0].host_name, 'Former player');
// Ratings given keep their stars (Y's average unchanged), without comment.
assert.deepEqual(results[at++], [
  { stars: 4, comment: '', name: 'Former player', email: '' },
]);
assert.equal(results[at++][0].avg, 4);
// Ratings received as Storyteller are deleted.
assert.equal(results[at++][0].n, 0);
// No personal data anywhere: every table's rows are free of the name, email,
// account id, comment, notes, chat text and photo.
tables.forEach((table, i) => {
  const dump = JSON.stringify(results[at + i]);
  for (const secret of [NAME, EMAIL, X, COMMENT, NOTE, CHAT, PHOTO])
    assert.ok(!dump.includes(secret), `${table} still contains ${secret}`);
});

// Clean up the remaining fixtures (cascades remove the rest).
sql(
  `DELETE FROM sessions WHERE code=${q(lobby.data.code)}; DELETE FROM games WHERE id LIKE '${id}-%'; DELETE FROM accounts WHERE id IN (${q(Y)},${q(Z)}) OR (id LIKE 'former-%' AND id NOT IN (SELECT rater FROM storyteller_ratings));`,
);
console.log(
  'PASS: account deletion removes identities, sessions, friendships, settings, profile, tutorial progress and seats; anonymises finished games, recaps, live seats and given ratings; no personal data remains.',
);
