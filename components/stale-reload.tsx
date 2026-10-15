'use client';
// FEAR-121: reload pages running old JavaScript after a deploy, without
// breaking a game. Outside a game the page reloads at once; mid-game it waits
// for the next phase change while the player isn't mid-action; a protocol
// bump reloads immediately after saving the text being typed. Seats survive
// reloads (HttpOnly seat cookie), so players land back at their table.
import { useEffect, useSyncExternalStore } from 'react';
import { BUILD_ID } from '@/lib/runtime/build';
import { TABLE_API_VERSION } from '@/lib/game/socket-protocol';
import {
  BUILD_EVENT,
  inGame,
  reloadDecision,
  safeToReload,
  type BuildNotice,
} from '@/lib/compat/stale';

const RELOADED = 'fearville:reloaded-for';
const DRAFT = 'fearville:reload-draft';
let table: { phaseKey: string; phase?: string } | null = null;
let pending: { buildId: string; since: string } | null = null;
let updating = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

function session(key: string, value?: string | null) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* Private mode: no loop guard or draft; still safe. */
  }
  return null;
}
function editing() {
  const el = document.activeElement;
  return (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    !!el.value
  );
}
function saveDraft() {
  const el = document.activeElement;
  if (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    el.value &&
    (el.id || el.name)
  )
    session(
      DRAFT,
      JSON.stringify({
        path: location.pathname + location.search,
        id: el.id,
        name: el.name,
        value: el.value,
      }),
    );
}
function restoreDraft() {
  const raw = session(DRAFT);
  if (!raw) return;
  let draft: { path: string; id: string; name: string; value: string };
  try {
    draft = JSON.parse(raw);
  } catch {
    session(DRAFT, null);
    return;
  }
  if (draft.path !== location.pathname + location.search) return;
  let tries = 0;
  const timer = setInterval(() => {
    const el = (
      draft.id
        ? document.getElementById(draft.id)
        : document.querySelector(`[name="${CSS.escape(draft.name)}"]`)
    ) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el || ++tries > 50) {
      clearInterval(timer);
      session(DRAFT, null);
      if (!el || el.value) return;
      // React-controlled fields need the native setter plus an input event.
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el),
        'value',
      );
      descriptor?.set?.call(el, draft.value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, 100);
}
function reload(buildId: string) {
  // Loop guard: if the page is still stale after one reload (a cached
  // bundle), stop rather than reloading forever.
  if (updating || session(RELOADED) === buildId) return;
  session(RELOADED, buildId);
  updating = true;
  changed();
  setTimeout(() => location.reload(), 800);
}
function onBuild(notice: BuildNotice) {
  const decision = reloadDecision(
    notice,
    { buildId: BUILD_ID, apiVersion: TABLE_API_VERSION },
    inGame(table?.phase),
  );
  const id = notice.buildId ?? 'protocol-' + notice.apiVersion;
  if (decision === 'immediate') {
    saveDraft();
    reload(id);
  } else if (decision === 'now') reload(id);
  else if (decision === 'safe' && !pending)
    pending = { buildId: id, since: table?.phaseKey ?? '' };
}

/** Root-layout component: listens for build notices, shows the toast. */
export function StaleReload() {
  const showing = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => updating,
    () => false,
  );
  useEffect(() => {
    const timer = setTimeout(restoreDraft, 0);
    const handler = (e: Event) =>
      onBuild((e as CustomEvent<BuildNotice>).detail ?? {});
    window.addEventListener(BUILD_EVENT, handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(BUILD_EVENT, handler);
    };
  }, []);
  return showing ? (
    <div className="updating-toast" aria-live="polite">
      Updating…
    </div>
  ) : null;
}

/**
 * The table screen reports its phase so a pending update reloads at the next
 * phase change (or right away once the game is back in the lobby or over).
 */
export function useSafeReload(
  phase: string | undefined,
  phaseKey: string,
  busy: boolean,
) {
  useEffect(() => {
    table = { phase, phaseKey };
    if (!pending) return;
    if (
      !inGame(phase) ||
      safeToReload({
        phaseKey,
        pendingSince: pending.since,
        busy,
        editing: editing(),
      })
    )
      reload(pending.buildId);
  }, [phase, phaseKey, busy]);
  useEffect(
    () => () => {
      table = null;
    },
    [],
  );
}
