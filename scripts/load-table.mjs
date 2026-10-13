#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { TableConnection } from '../lib/game/socket-client.ts';
import { boardMoves } from '../lib/rite/board.ts';
import { pour } from '../lib/rite/lab.ts';
import { claimSeats } from '../tests/claim-seats.mjs';

export function targetURL(input) {
  const url = new URL(input);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (!local && url.origin !== 'https://staging.fearville.app') ||
    (local && !['http:', 'https:'].includes(url.protocol))
  )
    throw Error(
      'Load tests require https://staging.fearville.app or a loopback server.',
    );
  return url.origin;
}
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}
export function statistics(values) {
  return Object.fromEntries(
    [
      ['p50', 0.5],
      ['p95', 0.95],
      ['p99', 0.99],
    ].map(([key, p]) => [key, percentile(values, p)]),
  );
}
export function optionsFromArgs(args) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      tables: { type: 'string', default: '5' },
      players: { type: 'string', default: '18' },
      cycles: { type: 'string', default: '3' },
      bursts: { type: 'string', default: '5' },
      output: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) return { help: true };
  if (!values.url) throw Error('--url is required.');
  const options = {
    url: targetURL(values.url),
    output: values.output || `work/table-load-${Date.now()}.json`,
  };
  for (const [key, min, max] of [
    ['tables', 1, 5],
    ['players', 5, 18],
    ['cycles', 1, 10],
    ['bursts', 1, 30],
  ]) {
    const number = Number(values[key]);
    if (!Number.isInteger(number) || number < min || number > max)
      throw Error(`--${key} must be ${min}–${max}.`);
    options[key] = number;
  }
  return options;
}
const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));
async function waitFor(test, ms = 20000) {
  const deadline = performance.now() + ms;
  while (!test()) {
    if (performance.now() >= deadline)
      throw Error('Load-test synchronization timed out.');
    await sleep(10);
  }
}
export function controlCommand(view, action, payload = {}) {
  const control = view.controls.find((c) => c.action === action);
  return {
    ...Object.fromEntries(
      (control?.fields ?? []).map((f) => [
        f.key,
        f.value ?? (f.type === 'select' ? f.options?.[0]?.value : ''),
      ]),
    ),
    action,
    version: view.version,
    ...payload,
  };
}
class Bot {
  view;
  connected = false;
  stopped = false;
  measuring = false;
  offset = 0;
  arrivals = [];
  pings = new Map();
  constructor(base, token, code, index, tableIndex, report) {
    this.index = index;
    this.tableIndex = tableIndex;
    this.report = report;
    this.connection = new TableConnection({
      code,
      me: '',
      poll: async () => {},
      status: (open) => {
        if (!open && this.connected && !this.stopped && this.measuring)
          report.reconnects++;
        if (open && this.wasConnected)
          void this.syncClock().catch(() =>
            report.errors.push({
              table: this.tableIndex,
              seat: this.index,
              kind: 'clock-sync-failed',
            }),
          );
        if (open) this.wasConnected = true;
        this.connected = open;
      },
      view: (frame) => {
        if (!this.view || frame.version >= this.view.version)
          this.view = frame.data;
        this.arrivals.push({ version: frame.version, at: Date.now() });
        if (this.arrivals.length > 10000) this.arrivals.shift();
      },
      connect: () => {
        const url = new URL('/api/table/socket', base);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('code', code);
        const socket = new WebSocket(url, {
          headers: { Authorization: `Bearer ${token}`, Origin: base },
          followRedirects: false,
        });
        socket.on('message', (raw) => {
          let frame;
          try {
            frame = JSON.parse(raw.toString());
          } catch {
            return;
          }
          // The initial authenticated view tells the bot its seat id. It is
          // retained by the same connection for every subsequent frame.
          if (frame.type === 'view' && !this.view) this.identity(frame.data.me);
          if (frame.type === 'pong') this.pings.get(frame.id)?.(frame);
        });
        this.transport = socket;
        return socket;
      },
    });
  }
  identity(me) {
    // setIdentity only accepts the first server-established identity.
    this.connection.setIdentity(me);
  }
  async start() {
    this.connection.start();
    await waitFor(() => this.connected && this.view);
    await this.syncClock();
  }
  async syncClock() {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const id = randomUUID(),
        started = Date.now();
      let timer;
      const frame = await new Promise((done, fail) => {
        this.pings.set(id, done);
        timer = setTimeout(
          () => fail(Error('Clock synchronization timed out.')),
          10000,
        );
        this.transport.send(JSON.stringify({ type: 'ping', id }));
      }).finally(() => {
        clearTimeout(timer);
        this.pings.delete(id);
      });
      const ended = Date.now(),
        rtt = ended - started;
      if (rtt < best) {
        best = rtt;
        this.offset = frame.serverNow - (started + ended) / 2;
      }
    }
  }
  async act(command, { measured = true, fanout } = {}) {
    const id = randomUUID(),
      started = performance.now();
    let timer;
    let ack;
    try {
      ack = await Promise.race([
        this.connection.send(command, id),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error('Load acknowledgement timed out.')),
            20000,
          );
        }),
      ]);
    } catch {
      this.report.errors.push({
        table: this.tableIndex,
        seat: this.index,
        action: command.action,
        kind: 'timeout',
      });
      throw Error('Load acknowledgement timed out.');
    } finally {
      clearTimeout(timer);
    }
    const record = {
      table: this.tableIndex,
      seat: this.index,
      action: command.action,
      id,
      rttMs: performance.now() - started,
      ok: !!ack?.ok,
    };
    if (measured) this.report.actions.push(record);
    if (!ack?.ok) {
      this.report.errors.push({
        table: this.tableIndex,
        seat: this.index,
        action: command.action,
        kind: 'rejected',
        status: ack?.status ?? 400,
        reason: [
          'The table changed. Review this action again.',
          'Wait for the night choice timer to finish.',
          'The Night Rite window is still open.',
          'Night tasks remain.',
          'Voting is not open.',
          'The ballot changed. Reopen voting.',
          'Each timer must be 5–3600 seconds.',
        ].includes(ack?.error)
          ? ack.error
          : 'action-rejected',
      });
      throw Error(`Load action ${command.action} was rejected.`);
    }
    if (ack.data?.game && ack.data.game.version >= this.view.version)
      this.view = ack.data.game;
    if (ack.data?.rite && ack.data.version >= this.view.version)
      this.view = {
        ...this.view,
        rite: ack.data.rite,
        version: ack.data.version,
        serverNow: ack.data.serverNow,
      };
    if (fanout) {
      if (!Number.isFinite(ack.committedAt) || !Number.isInteger(ack.version))
        throw Error(
          'Staging lacks commit timing metadata; deploy FEAR-90 before measuring fan-out.',
        );
      await waitFor(() =>
        fanout.every((bot) =>
          bot.arrivals.some((frame) => frame.version >= ack.version),
        ),
      );
      const last = Math.max(
        ...fanout.map(
          (bot) =>
            bot.arrivals.find((frame) => frame.version >= ack.version).at -
            bot.offset,
        ),
      );
      this.report.fanout.push({
        table: this.tableIndex,
        id,
        version: ack.version,
        viewerCount: fanout.length,
        ms: Math.max(0, last - ack.committedAt),
      });
    }
    return ack;
  }
  control(action, payload, settings) {
    return this.act(controlCommand(this.view, action, payload), settings);
  }
  stop() {
    this.stopped = true;
    this.connection.stop();
  }
}
async function riteBurst(table) {
  const { host, bots } = table;
  if (!host.view.rite?.host || host.view.rite.status !== 'open') return;
  // All vigils submit concurrently, but each bot sees only its own puzzle.
  const actions = bots.flatMap((bot) => {
    const r = bot.view.rite,
      puzzle = r && !r.host ? r.puzzle : null;
    if (!puzzle || puzzle.phase !== 'turn') return [];
    let move;
    if (puzzle.type === 'board') move = boardMoves(puzzle.blocks)[0]?.move;
    if (puzzle.type === 'lab') {
      outer: for (const from of puzzle.vials)
        for (const to of puzzle.vials)
          if (pour(puzzle.vials, { from: from.id, to: to.id })) {
            move = { from: from.id, to: to.id };
            break outer;
          }
    }
    const command =
      puzzle.type === 'board'
        ? {
            action: move ? 'riteBoardMove' : 'ritePass',
            ...move,
            turn: puzzle.turn,
          }
        : puzzle.type === 'lab'
          ? {
              action: move ? 'riteLabPour' : 'ritePass',
              ...move,
              turn: puzzle.turn,
            }
          : puzzle.type === 'grid'
            ? {
                action: 'riteNotes',
                placements: Array.from({ length: 5 }, (_, location) => ({
                  location,
                  character: location,
                  activity: location,
                })),
              }
            : { action: 'riteRitualPick', altar: puzzle.altar };
    return [
      bot.act({
        ...command,
        epoch: r.epoch,
        night: bot.view.night,
        version: bot.view.version,
      }),
    ];
  });
  actions.push(
    host.act(
      {
        action: 'chat',
        to: 'all',
        text: 'Load test: simultaneous vigils',
        messageId: randomUUID(),
      },
      { fanout: [host, ...bots] },
    ),
  );
  await Promise.all(actions);
}
async function play(table, options) {
  const { host, bots } = table;
  await host.control('randomAssign', { override: true }, { measured: false });
  await host.control('start', { override: true }, { measured: false });
  for (let cycle = 0; cycle < options.cycles; cycle++) {
    await waitFor(() =>
      bots.every(
        (bot) =>
          bot.view.phase === 'night' && bot.view.night === host.view.night,
      ),
    );
    await host.act(
      {
        action: 'chat',
        to: 'all',
        text: `Load night ${cycle + 1}`,
        messageId: randomUUID(),
      },
      { fanout: [host, ...bots] },
    );
    for (let burst = 0; burst < options.bursts; burst++) {
      // Each seat waits for its ack, so RTT excludes time queued locally.
      // All seats and all tables still send their burst concurrently.
      await Promise.all(
        bots.map((bot) =>
          bot.act({
            action: 'chat',
            text: `Load burst ${cycle + 1}/${burst + 1}`,
            messageId: randomUUID(),
          }),
        ),
      );
    }
    await riteBurst(table);
    if (host.view.rite?.host && host.view.rite.status === 'open')
      await host.act({
        action: 'riteForce',
        epoch: host.view.rite.epoch,
        night: host.view.night,
        version: host.view.version,
      });
    await sleep(
      (host.view.nightChoiceDeadline ?? Date.now()) -
        Date.now() -
        host.offset +
        50,
    );
    while (host.view.tasks.some((task) => !task.done))
      await host.control('nightSkip', {}, { measured: false });
    await host.control('dawn', { override: true });
    await host.control('advance');
    await host.control('advance');
    await waitFor(() => bots.every((bot) => bot.view.phase === 'nomination'));
    await bots[0].control('nominate', { target: bots.at(-1).view.me });
    await waitFor(() => host.view.phase === 'defense');
    await host.control('advance');
    await waitFor(() => bots.every((bot) => bot.view.phase === 'voting'));
    const ballot = host.view.active.id,
      eligible = host.view.active.eligible;
    await Promise.all(
      bots
        .filter((bot) => eligible.includes(bot.view.me))
        .map((bot) => bot.act({ action: 'vote', ballot, yes: false })),
    );
    await waitFor(() => host.view.phase === 'nomination');
    await host.control('advance');
    await host.control('finishDay');
  }
}
export async function runLoad(
  options,
  {
    sessionFetch = fetch,
    accountToken = process.env.FEAR_LOAD_ACCOUNT_TOKEN,
    entryDelay = 2100,
  } = {},
) {
  const base = targetURL(options.url),
    tables = [];
  const report = {
    startedAt: new Date().toISOString(),
    target: base,
    tables: options.tables,
    players: options.players,
    cycles: options.cycles,
    bursts: options.bursts,
    runner: process.env.RUNNER_NAME ?? 'local',
    actions: [],
    fanout: [],
    errors: [],
    reconnects: 0,
  };
  if (
    !base.startsWith('http://localhost') &&
    !base.startsWith('http://127.0.0.1') &&
    !accountToken
  )
    throw Error(
      'Set FEAR_LOAD_ACCOUNT_TOKEN to a staging player-account session credential.',
    );
  let lastEntry = 0;
  let setupStage = 'health';
  async function session(body, token) {
    await sleep(lastEntry + entryDelay - Date.now());
    lastEntry = Date.now();
    const response = await sessionFetch(base + '/api/session', {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body.action === 'create' && accountToken
          ? { 'X-Account-Authorization': `Bearer ${accountToken}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw Error(
        `Load session ${body.action} failed with HTTP ${response.status}.`,
      );
    return response.json();
  }
  try {
    const health = await fetch(base + '/api/health', {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const identity = await health.json();
    if (
      !health.ok ||
      !identity.ok ||
      (new URL(base).hostname === 'staging.fearville.app' &&
        identity.environment !== 'staging')
    )
      throw Error('Target did not confirm a healthy staging environment.');
    report.build = identity.build;
    for (let index = 0; index < options.tables; index++) {
      setupStage = 'create';
      const created = await session({
        action: 'create',
        name: `Load storyteller ${index + 1}`,
      });
      const table = {
        code: created.code,
        token: created.token,
        bots: [],
        host: null,
      };
      tables.push(table);
      setupStage = 'join';
      const seats = [];
      for (let seat = 0; seat < options.players; seat++)
        seats.push(
          await session({
            action: 'join',
            code: created.code,
            name: `Load player ${seat + 1}`,
          }),
        );
      setupStage = 'claim-seats';
      await claimSeats(
        base,
        seats.map((seat) => seat.token),
      );
      setupStage = 'construct-bots';
      table.host = new Bot(
        base,
        created.token,
        created.code,
        0,
        index + 1,
        report,
      );
      table.bots = seats.map(
        (seat, i) =>
          new Bot(base, seat.token, created.code, i + 1, index + 1, report),
      );
      setupStage = 'connect';
      await Promise.all([table.host, ...table.bots].map((bot) => bot.start()));
      setupStage = 'configure-timers';
      const config = controlCommand(table.host.view, 'configure');
      for (const key of [
        'discovery',
        'discussion',
        'nomination',
        'defense',
        'voting',
        'nightChoice',
      ])
        config[key] = key === 'nightChoice' ? 5 : 3600;
      await table.host.act(config, { measured: false });
      const ids = table.host.view.players.map((player) => player.id),
        count = Math.round(ids.length / 3);
      const kinds = ['board', 'lab', 'grid', 'ritual'];
      const plans = Array.from({ length: count }, (_, i) => {
        const size =
          Math.floor(ids.length / count) + Number(i < ids.length % count);
        const offset =
          Math.floor(ids.length / count) * i + Math.min(i, ids.length % count);
        const kind =
          kinds[i % kinds.length] === 'ritual' && size !== 3
            ? 'grid'
            : kinds[i % kinds.length];
        return {
          id: `load-${i}`,
          kind,
          members: ids.slice(offset, offset + size),
        };
      });
      setupStage = 'configure-vigils';
      await table.host.act(
        {
          action: 'configureRite',
          version: table.host.view.version,
          config: { enabled: true, timed: false, ritualFirstNight: 2 },
          plans,
        },
        { measured: false },
      );
      await waitFor(() => !table.host.view.rite.preparing);
    }
    setupStage = 'play';
    for (const table of tables)
      for (const bot of [table.host, ...table.bots]) bot.measuring = true;
    const outcomes = await Promise.allSettled(
      tables.map((table) => play(table, options)),
    );
    for (let i = 0; i < outcomes.length; i++)
      if (outcomes[i].status === 'rejected')
        report.errors.push({
          table: i + 1,
          kind: 'scenario-failed',
          lastAction: report.actions
            .filter((action) => action.table === i + 1)
            .at(-1)?.action,
        });
  } catch (error) {
    report.errors.push({
      kind: 'setup-failed',
      stage: setupStage,
      errorType: error.name,
      ...(typeof error.actual === 'number'
        ? { actualStatus: error.actual }
        : {}),
      ...(error.message?.startsWith('Load session ')
        ? { message: error.message }
        : {}),
      ...(error.message?.startsWith('Cannot read ') ||
      error.message?.startsWith('this.')
        ? { message: error.message }
        : {}),
    });
  } finally {
    for (const table of tables)
      for (const bot of [table.host, ...table.bots])
        if (bot) bot.measuring = false;
    // These are disposable casual tables. Close the game, return it to its
    // lobby and delete only the exact tables created by this run.
    for (const table of tables) {
      try {
        if (table.host?.connected && table.host.view.phase !== 'lobby') {
          if (table.host.view.phase !== 'ended')
            await table.host.control(
              'end',
              { winner: 'good' },
              { measured: false },
            );
          await table.host.control('returnLobby', {}, { measured: false });
        }
        await session({ action: 'deleteLobby' }, table.token);
      } catch {
        report.errors.push({
          table: tables.indexOf(table) + 1,
          kind: 'cleanup-failed',
        });
      }
      table.host?.stop();
      for (const bot of table.bots) bot.stop();
    }
  }
  report.completedAt = new Date().toISOString();
  report.rtt = statistics(report.actions.map((action) => action.rttMs));
  report.push = statistics(report.fanout.map((push) => push.ms));
  report.latencyTargetPassed = report.rtt.p95 !== null && report.rtt.p95 < 150;
  report.passed =
    report.actions.length > 0 &&
    report.fanout.length > 0 &&
    !report.errors.length &&
    (new URL(base).hostname !== 'staging.fearville.app' ||
      report.latencyTargetPassed);
  const path = resolve(options.output);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  console.table([
    {
      Tables: tables.length,
      Seats: options.players + 1,
      Actions: report.actions.length,
      'RTT p50': report.rtt.p50?.toFixed(1) ?? 'n/a',
      'RTT p95': report.rtt.p95?.toFixed(1) ?? 'n/a',
      'RTT p99': report.rtt.p99?.toFixed(1) ?? 'n/a',
      'Fan-out p50': report.push.p50?.toFixed(1) ?? 'n/a',
      'Fan-out p95': report.push.p95?.toFixed(1) ?? 'n/a',
      'Fan-out p99': report.push.p99?.toFixed(1) ?? 'n/a',
      Errors: report.errors.length,
      Reconnects: report.reconnects,
      Result: report.passed ? 'PASS' : 'FAIL',
      Details: path,
    },
  ]);
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const options = optionsFromArgs(process.argv.slice(2));
  if (options.help)
    console.log(
      'node --experimental-strip-types scripts/load-table.mjs --url https://staging.fearville.app --tables 5 --players 18 [--cycles 3 --bursts 5 --output work/table-load.json]',
    );
  else {
    const report = await runLoad(options);
    process.exitCode = report.passed ? 0 : 1;
  }
}
