// FEAR-196: a Storyteller and players in shell mode, from the lobby to a day
// vote: share invite, keep-awake on/off and haptics reach the fake plugins;
// resume re-syncs; layouts fit; no player ever receives another's role.
import { expect, test, type Page, type WebSocket } from '@playwright/test';
import {
  dismissTutorials,
  expectNativeCall,
  expectNoHorizontalOverflow,
  expectSafeAreaPadding,
  fakeShell,
  fireNative,
  nativeCalls,
  ok,
  platformOf,
  seat,
  signedIn,
} from './support';

const ROLES = [
  'sheriff',
  'hoflibrarian',
  'teacher',
  'judge',
  'lostwanderer',
  'basilisk',
  'monster',
];

/** Watch a page's table socket for views that leak other players' roles. */
function watchFrames(page: Page) {
  const leaks: string[] = [];
  page.on('websocket', (ws: WebSocket) =>
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string' || !payload.startsWith('{')) return;
      const frame = JSON.parse(payload) as {
        type?: string;
        data?: { players?: Record<string, unknown>[] };
      };
      if (frame.type === 'view')
        for (const p of frame.data?.players ?? [])
          if ('role' in p || 'shown' in p)
            leaks.push(JSON.stringify(p).slice(0, 80));
    }),
  );
  return leaks;
}

test('lobby to day vote in shell mode', async ({
  browser,
  playwright,
}, info) => {
  test.setTimeout(240_000);
  const platform = platformOf(info);
  const device = { ...info.project.use } as Record<string, unknown>;
  delete device.browserName;
  const newShell = async () => {
    const context = await browser.newContext({
      ...device,
      baseURL: process.env.E2E_BASE_URL,
      ignoreHTTPSErrors: true,
    });
    await fakeShell(context, platform);
    return context;
  };

  // Storyteller (signed in) creates the table from a shell page.
  const hostContext = await newShell();
  await signedIn(hostContext, 'E2E Storyteller');
  const created = await ok(
    await hostContext.request.post('/api/session', {
      data: { action: 'create', name: 'E2E Storyteller' },
    }),
  );
  const code: string = created.code;
  const api = () =>
    playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL,
      ignoreHTTPSErrors: true,
    });
  const host = seat(await api(), created.token);

  // Two players with shell pages; five more join over HTTP only.
  const shells = [await newShell(), await newShell()];
  const tokens: string[] = [];
  for (const [i, context] of shells.entries())
    tokens.push(
      (
        await ok(
          await context.request.post('/api/session', {
            data: { action: 'join', code, name: `Shell ${i + 1}` },
          }),
        )
      ).token,
    );
  for (let i = 0; i < 5; i++)
    tokens.push(
      (
        await ok(
          await (
            await api()
          ).post('/api/session', {
            data: { action: 'join', code, name: `Http ${i + 1}` },
          }),
        )
      ).token,
    );
  const seats = await Promise.all(
    tokens.map(async (token) => seat(await api(), token)),
  );
  for (const [i, s] of seats.entries())
    await s.post({ action: 'claimSeat', seat: i + 1 });

  // Host: share invite → native share sheet with the join link.
  const hostPage = await hostContext.newPage();
  await hostPage.goto('/table');
  await dismissTutorials(hostPage);
  await hostPage
    .getByRole('button', { name: /share invite link/i })
    .first()
    .click();
  await expectNativeCall(hostPage, 'Share.share', (args) =>
    String((args as { url?: string }).url).endsWith(`/?join=${code}`),
  );

  // Players: keep-awake while seated, off when the setting is turned off.
  const pages: Page[] = [];
  const leaks: string[][] = [];
  for (const context of shells) {
    const page = await context.newPage();
    leaks.push(watchFrames(page));
    await page.goto('/table');
    await dismissTutorials(page);
    pages.push(page);
  }
  const [a, b] = pages;
  await expectNativeCall(a, 'KeepAwake.keepAwake');
  await a.evaluate(() => {
    localStorage.setItem('fearville:keep-awake', 'false');
    window.dispatchEvent(new Event('fearville:keep-awake-changed'));
  });
  await expectNativeCall(a, 'KeepAwake.allowSleep');
  await a.evaluate(() => {
    localStorage.removeItem('fearville:keep-awake');
    window.dispatchEvent(new Event('fearville:keep-awake-changed'));
  });
  await expect
    .poll(async () => (await nativeCalls(a, 'KeepAwake.keepAwake')).length)
    .toBe(2);
  // Lobby layout.
  await expectNoHorizontalOverflow(a);
  await expectSafeAreaPadding(a);

  // Storyteller sets up and starts (night 1).
  let state = await host.get();
  const act = async (payload: Record<string, unknown>) => {
    state = await host.get();
    state = (await host.post({ ...payload, version: state.version })).game;
  };
  for (const [i, p] of state.players.entries())
    await act({
      action: 'edit',
      player: p.id,
      name: p.name,
      seat: p.seat,
      role: ROLES[i],
      alive: true,
      ghost: true,
    });
  await act({
    action: 'configure',
    nightChoice: 5,
    discovery: 5,
    discussion: 5,
    nomination: 60,
    defense: 5,
    voting: 30,
    bluff1: 'doctor',
    bluff2: 'watchman',
    bluff3: 'bodyguard',
    redHerring: state.players[0].id,
  });
  await act({ action: 'start' });
  for (const page of pages) {
    const mine = (await page.evaluate(
      async () => await (await fetch('/api/game')).json(),
    )) as {
      phase: string;
      players: Record<string, unknown>[];
      character: { name: string };
    };
    expect(mine.phase).toBe('night');
    // Hidden information: only my own character.
    expect(
      mine.players.every((p: Record<string, unknown>) => !('role' in p)),
    ).toBe(true);
    // Characters stay concealed until tapped; the card is on the page.
    await expect(page.getByText(mine.character.name).first()).toBeAttached();
    await expectNoHorizontalOverflow(page);
    await expectSafeAreaPadding(page);
  }
  // Night Rite screen (opens on night 2; setup is visible from night 1).
  const rite = a.getByRole('tab', { name: /rite/i }).first();
  if (await rite.isVisible().catch(() => false)) {
    await rite.click();
    await expectNoHorizontalOverflow(a);
    await expectSafeAreaPadding(a);
  }

  // Lifecycle: while "backgrounded" with no live socket, the table changes;
  // the resume event re-syncs without waiting for the 30 s fallback poll.
  await b.routeWebSocket(/\/api\/table\/socket/, () => {});
  await b.reload();
  await dismissTutorials(b);
  await fireNative(b, 'App.appStateChange', { isActive: false });
  await act({
    action: 'chat',
    to: 'all',
    text: 'Resume check from the Storyteller',
  });
  // Resume must re-sync now (the fallback poll is 30 s away).
  const resync = b.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/game' &&
      r.request().method() === 'GET',
    { timeout: 5_000 },
  );
  await fireNative(b, 'App.appStateChange', { isActive: true });
  const synced = await (await resync).json();
  expect(JSON.stringify(synced.messages)).toContain(
    'Resume check from the Storyteller',
  );

  // Dawn → nominations → vote; the shell page's vote plays a haptic tap.
  await new Promise((r) => setTimeout(r, 5500));
  await act({ action: 'dawn', override: true, reason: 'E2E flow' });
  await expect
    .poll(async () => (await host.get()).phase, { timeout: 20_000 })
    .toBe('nomination');
  const me = async (page: Page) =>
    (
      (await page.evaluate(
        async () => await (await fetch('/api/game')).json(),
      )) as { me: string }
    ).me;
  const target = await me(b);
  await seats[2].post({
    action: 'nominate',
    target,
    version: (await host.get()).version,
  });
  await act({ action: 'advance' });
  await expect
    .poll(async () => (await host.get()).phase, { timeout: 20_000 })
    .toBe('voting');
  await a.getByRole('button', { name: 'Cast your vote' }).first().click();
  const dialog = a.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await dialog
    .getByRole('button', { name: /^(Cast your vote|Confirm|Apply)$/ })
    .last()
    .click();
  await expectNativeCall(a, 'Haptics.impact');

  for (const list of leaks) expect(list).toEqual([]);
  for (const context of [hostContext, ...shells]) await context.close();
});
