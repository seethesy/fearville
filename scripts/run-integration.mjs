// Run every HTTP integration suite against a local server with local D1.
//
//   npm run test:integration                 build, migrate, run all suites
//   npm run test:integration -- rite social  only suites whose name contains a filter
//   npm run test:integration -- --no-build   reuse the existing dist/ build
//
// Prints `PASS name` / `FAIL name` plus the first ~30 lines of each failure,
// and exits non-zero when any suite fails. Full output of failing suites is
// written to work/integration-logs/ (uploaded as a CI artifact).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const filters = args.filter((arg) => !arg.startsWith('--'));
const logDir = path.join('work', 'integration-logs');
const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const started = Date.now();
const persist = mkdtempSync(path.join(tmpdir(), 'fearville-tests-'));
process.env.CT_D1_PERSIST = persist;
process.on('exit', () => {
  try {
    rmSync(persist, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch {
    /* Preserve test status if Windows still holds a handle. */
  }
});
mkdirSync(logDir, { recursive: true });

function quiet(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    writeFileSync(
      path.join(logDir, `${label}.log`),
      `${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
      .trim()
      .split('\n');
    console.log(`FAIL ${label}\n${output.slice(-30).join('\n')}`);
    process.exit(1);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

// 1. Build the worker (output hidden unless it fails).
if (!skipBuild)
  quiet(
    process.execPath,
    ['node_modules/vinext/dist/cli.js', 'build'],
    'build',
  );

// 2. Migrate a fresh isolated database. Never modify the developer database or
// accept a partially applied migration as success.
quiet(
  process.execPath,
  [
    wrangler,
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--config',
    'wrangler.local.json',
    '--persist-to',
    persist,
  ],
  'migrations',
);

// 3. Start the compiled worker on a free port.
const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port: free } = server.address();
    server.close(() => resolve(free));
  });
});
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['scripts/local-api-test-server.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => (serverLog += chunk));
server.stderr.on('data', (chunk) => (serverLog += chunk));
const stopServer = () => {
  if (server.exitCode === null && server.connected) server.send('shutdown');
};
process.on('exit', stopServer);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
server.on('error', (error) => {
  serverLog += error.message;
});

const deadline = Date.now() + 60_000;
for (;;) {
  try {
    await fetch(url + '/api/accounts', { signal: AbortSignal.timeout(2000) });
    break;
  } catch {
    if (server.exitCode !== null || Date.now() > deadline) {
      console.log(
        `FAIL server did not start\n${serverLog.trim().split('\n').slice(-30).join('\n')}`,
      );
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// 4. Run the suites one at a time.
const suites = readdirSync('tests')
  .filter(
    (file) => file === 'integration.mjs' || file.endsWith('-integration.mjs'),
  )
  .filter(
    (file) =>
      !filters.length || filters.some((filter) => file.includes(filter)),
  )
  .sort();
if (!suites.length)
  throw new Error('No integration suites matched the filters.');
const failed = [];
for (const file of suites) {
  const name = file.replace(/\.mjs$/, '');
  const suiteStart = Date.now();
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join('tests', file)], {
      env: { ...process.env, CT_TEST_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      output += '\nTimed out after 5 minutes.';
      child.kill('SIGKILL');
    }, 300_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
  const seconds = ((Date.now() - suiteStart) / 1000).toFixed(1);
  if (result.code === 0) {
    console.log(`PASS ${name} (${seconds}s)`);
  } else {
    failed.push(name);
    console.log(
      `FAIL ${name} (${seconds}s)\n${result.output.trim().split('\n').slice(0, 30).join('\n')}\n`,
    );
    mkdirSync(logDir, { recursive: true });
    writeFileSync(path.join(logDir, `${name}.log`), result.output);
  }
}

stopServer();
await new Promise((resolve) => {
  if (server.exitCode !== null) return resolve();
  const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
  server.once('close', () => {
    clearTimeout(timer);
    resolve();
  });
});
const total = ((Date.now() - started) / 1000).toFixed(0);
const passed = suites.length - failed.length;
console.log(
  `integration: ${passed} passed, ${failed.length} failed (${total}s)`,
);
if (failed.length) {
  mkdirSync(logDir, { recursive: true });
  writeFileSync(path.join(logDir, 'server.log'), serverLog);
}
process.exit(failed.length ? 1 : 0);
