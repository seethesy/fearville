import assert from 'node:assert/strict';
import { hostFixtureFetch } from './host-fixture.mjs';
import { runLoad } from '../scripts/load-table.mjs';
const base = process.env.CT_TEST_URL || 'http://127.0.0.1:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const report = await runLoad(
  {
    url: base,
    tables: 1,
    players: 18,
    cycles: 2,
    bursts: 1,
    output: 'work/load-runner-integration.json',
  },
  { sessionFetch: hostFixtureFetch, entryDelay: 0 },
);
assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
assert.ok(report.actions.length >= 70);
assert.ok(report.actions.some((action) => action.action === 'riteBoardMove'));
assert.ok(report.actions.some((action) => action.action === 'riteLabPour'));
assert.ok(report.actions.some((action) => action.action === 'riteNotes'));
assert.ok(report.actions.some((action) => action.action === 'riteRitualPick'));
assert.ok(report.fanout.some((push) => push.viewerCount === 19));
assert.equal(report.reconnects, 0);
// Local CI validates behavior; the staging workflow owns the 150 ms SLA.
assert.equal(report.passed, true);
console.log(
  'PASS: load runner, 19 sockets, two cycles, all vigil patterns, votes, chat, commit fan-out and cleanup.',
);
