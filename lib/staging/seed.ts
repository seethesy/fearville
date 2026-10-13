// Synthetic records only: no provider identities or sign-in credentials.
export const SEED_ACCOUNT_PREFIX = 'staging-fixture-';
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function seedStatements(now: number) {
  const accounts = [
    { id: 'host', name: 'QA Storyteller', handle: 'stage_qa_storyteller' },
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `player-${i + 1}`,
      name: `QA Player ${i + 1}`,
      handle: `stage_qa_player_${i + 1}`,
    })),
  ];
  const sql: string[] = [];
  for (const account of accounts) {
    const id = SEED_ACCOUNT_PREFIX + account.id;
    sql.push(
      `INSERT INTO accounts(id,name,email,handle,created) VALUES (${quote(id)},${quote(account.name)},${quote(id + '@example.invalid')},${quote(account.handle)},${now}) ON CONFLICT(id) DO NOTHING;`,
    );
    sql.push(
      `INSERT INTO account_profiles(account,lobby_name) VALUES (${quote(id)},${quote(account.name)}) ON CONFLICT(account) DO NOTHING;`,
    );
    sql.push(
      `INSERT INTO account_settings(account) VALUES (${quote(id)}) ON CONFLICT(account) DO NOTHING;`,
    );
  }
  for (let i = 1; i <= 5; i++)
    sql.push(
      `INSERT INTO friendships(requester,addressee,status,created,updated) VALUES ('staging-fixture-host','staging-fixture-player-${i}','accepted',${now},${now}) ON CONFLICT(requester,addressee) DO NOTHING;`,
    );
  for (let round = 1; round <= 3; round++) {
    const id = `staging-fixture-game-${round}`;
    const started = now - round * 86400000;
    sql.push(
      `INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended,script,host_xp) VALUES ('${id}','SEED0${round}','staging-fixture-host','QA Storyteller','good','Synthetic staging sample',5,2,2,${started},${started + 1800000},'horrors',25) ON CONFLICT(id) DO NOTHING;`,
    );
    for (let i = 1; i <= 5; i++)
      sql.push(
        `INSERT INTO game_players(game,player,account,name,role,team,won,alive,base_xp) VALUES ('${id}','p${i}','staging-fixture-player-${i}','QA Player ${i}','watchman','good',1,1,75) ON CONFLICT(game,player) DO NOTHING;`,
      );
  }
  return sql;
}
