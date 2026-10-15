// FEAR-196: shell-mode browser E2E. Builds the Worker, migrates a fresh local
// D1, serves the compiled site (with its static assets) through `wrangler
// dev`, serves mobile/www for the offline page, then runs Playwright
// (WebKit iPhone + Chromium Pixel projects, see playwright.config.ts).
//
//   npm run test:e2e                         build + all specs
//   npm run test:e2e -- --no-build           reuse dist/
//   npm run test:e2e -- --project=pixel-chromium tests/e2e/shell.spec.ts
//
// CI runs this (ci.yml `e2e` job); agents don't run it unless asked.
import { spawn, spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const passThrough = args.filter((arg) => arg !== '--no-build');
const logDir = path.join('work', 'e2e-logs');
mkdirSync(logDir, { recursive: true });
const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const persist = mkdtempSync(path.join(tmpdir(), 'fearville-e2e-'));

function quiet(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    writeFileSync(path.join(logDir, `${label}.log`), output);
    console.log(
      `FAIL ${label}\n${output.trim().split('\n').slice(-30).join('\n')}`,
    );
    process.exit(1);
  }
}
const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

if (!skipBuild)
  quiet(
    process.execPath,
    ['node_modules/vinext/dist/cli.js', 'build'],
    'build',
  );
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

// The compiled site with its assets, as `npm start` serves it. Dummy Google
// client values only enable the sign-in buttons; the test never reaches Google.
const port = await freePort();
// HTTPS like production: the account cookie is Secure, and WebKit drops
// Secure cookies on plain http (wrangler serves a self-signed certificate).
const base = `https://127.0.0.1:${port}`;
let serverLog = '';
const server = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--persist-to',
    persist,
    '--show-interactive-dev-session=false',
    '--log-level',
    'warn',
    '--local-protocol',
    'https',
    '--var',
    'GOOGLE_CLIENT_ID:e2e-client',
    '--var',
    'GOOGLE_CLIENT_SECRET:e2e-secret',
  ],
  {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
server.stdout.on('data', (chunk) => (serverLog += chunk));
server.stderr.on('data', (chunk) => (serverLog += chunk));

// mobile/www, served statically for the bundled offline/error page.
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
};
const www = path.resolve('mobile/www');
const statics = http.createServer((request, response) => {
  const file = path.join(
    www,
    decodeURIComponent(new URL(request.url, 'http://x').pathname),
  );
  if (!file.startsWith(www + path.sep) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});
const staticPort = await freePort();
await new Promise((resolve) =>
  statics.listen(staticPort, '127.0.0.1', resolve),
);

function stop() {
  statics.close();
  if (server.exitCode === null) server.kill('SIGTERM');
  try {
    rmSync(persist, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* Windows may still hold a handle. */
  }
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const deadline = Date.now() + 90_000;
for (;;) {
  // The local self-signed certificate is trusted for this loopback check only.
  const ready = await new Promise((resolve) => {
    const request = https.get(
      base + '/api/health',
      { rejectUnauthorized: false, timeout: 2000 },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.on('error', () => resolve(false));
    request.on('timeout', () => request.destroy());
  });
  if (ready) break;
  if (server.exitCode !== null || Date.now() > deadline) {
    writeFileSync(path.join(logDir, 'server.log'), serverLog);
    console.log(
      `FAIL server did not start\n${serverLog.trim().split('\n').slice(-30).join('\n')}`,
    );
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

// Async, so this process keeps serving mobile/www while the tests run.
const status = await new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...passThrough],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_BASE_URL: base,
        E2E_STATIC_URL: `http://127.0.0.1:${staticPort}`,
        E2E_PERSIST: persist,
      },
    },
  );
  child.on('close', (code) => resolve(code ?? 1));
});
if (status !== 0) writeFileSync(path.join(logDir, 'server.log'), serverLog);
process.exit(status);
