// Fast local check for agents and CI: typecheck, lint, unit tests.
// Prints one line per step; output is shown only for a failing step.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const steps = [
  [
    'typecheck',
    ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'],
  ],
  [
    'lint',
    [
      'node_modules/oxlint/bin/oxlint',
      '--quiet',
      'app',
      'lib',
      'components',
      'db',
      'tests',
    ],
  ],
  ['unit', ['scripts/run-unit.mjs']],
];
let failed = false;
for (const [name, args] of steps) {
  const started = Date.now();
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  mkdirSync('work/check-logs', { recursive: true });
  writeFileSync(`work/check-logs/${name}.log`, output);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0) {
    const summary =
      name === 'unit'
        ? output
            .split('\n')
            .at(-1)
            .replace(/^unit: /, '')
        : 'ok';
    console.log(`${name}: ${summary} (${seconds}s)`);
  } else {
    failed = true;
    const lines = output.split('\n');
    console.log(
      `${name}: FAILED (${seconds}s)\n${lines.slice(0, 60).join('\n')}${lines.length > 60 ? `\n… ${lines.length - 60} more lines` : ''}`,
    );
  }
}
process.exit(failed ? 1 : 0);
