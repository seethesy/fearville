// Run unit tests quietly. With no arguments runs tests/*.test.ts;
// otherwise runs only the files given: `npm run test:unit -- tests/rite.test.ts`.
import { spawnSync } from 'node:child_process';

const files = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--disable-warning=ExperimentalWarning',
    '--test',
    '--test-reporter=./scripts/quiet-reporter.mjs',
    ...(files.length ? files : ['tests/*.test.ts']),
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
