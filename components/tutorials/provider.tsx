'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  initialState,
  newlySeen,
  reduce,
  stepsFor,
  type TutorialState,
} from '@/lib/tutorials/engine';
import { sectionTutorial, tutorial } from '@/lib/tutorials/content';
import {
  isNewScope,
  readGuest,
  writeGuest,
  type KeyValue,
} from '@/lib/tutorials/guest';
import type { SeenItem } from '@/lib/tutorials/types';
import { TutorialOverlay } from './overlay';

// One provider for the whole app (app/layout.tsx). It owns the tutorial
// queue, decides when a popup may show, and persists what has been seen:
// on the server for accounts, per seat on this device for guests.

interface TutorialApi {
  state: TutorialState;
  // null until progress has loaded.
  account: boolean | null;
  blocked: boolean;
  request: (id: string) => void;
  replay: (id: string) => void;
  sectionOpened: (section: string) => void;
  setScope: (scope: string | null) => void;
  setBlocker: (key: string, active: boolean) => void;
  setNavigator: (navigate: ((tab: string) => void) | null) => void;
  reset: () => Promise<void>;
}
const TutorialContext = createContext<TutorialApi | null>(null);

function storage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function post(body: unknown) {
  const r = await fetch('/api/tutorials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as { error?: string; seen?: SeenItem[] };
  if (!r.ok) throw Error(data.error || 'Tutorial progress was not saved.');
  return data;
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, 'web', initialState);
  const [account, setAccount] = useState<boolean | null>(null);
  const [blockers, setBlockers] = useState<Record<string, boolean>>({});
  // The replay waiting behind a blocking state, for a short notice.
  const [deferred, setDeferred] = useState<string | null>(null);
  const scope = useRef<string | null>(null);
  const navigator = useRef<((tab: string) => void) | null>(null);
  const persisted = useRef<TutorialState['seen'] | null>(null);
  const outbox = useRef<SeenItem[]>([]);
  const blocked = Object.values(blockers).some(Boolean);

  // Load progress once per page load.
  useEffect(() => {
    let live = true;
    void (async () => {
      let signedIn = false,
        seen: SeenItem[] = [];
      try {
        const r = await fetch('/api/tutorials', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const data = (await r.json()) as {
          account?: boolean;
          seen?: SeenItem[];
        };
        if (r.ok && data.account) {
          signedIn = true;
          seen = data.seen ?? [];
        }
      } catch {
        // Offline: behave as a guest for this page load.
      }
      if (!live) return;
      if (!signedIn) seen = readGuest(storage(), scope.current);
      setAccount(signedIn);
      dispatch({ type: 'load', seen });
    })();
    return () => {
      live = false;
    };
  }, []);

  // Persist newly seen tutorials.
  useEffect(() => {
    if (!state.loaded || account === null) return;
    if (persisted.current === null) {
      persisted.current = state.seen;
      return;
    }
    const items = newlySeen(persisted.current, state.seen);
    persisted.current = state.seen;
    if (!account) {
      writeGuest(storage(), scope.current, state.seen);
      return;
    }
    if (!items.length && !outbox.current.length) return;
    const batch = [...outbox.current, ...items];
    outbox.current = [];
    post({ action: 'mark', items: batch }).catch(() => {
      // Retry with the next change.
      outbox.current = [...batch, ...outbox.current].slice(-50);
    });
  }, [state.seen, state.loaded, account]);

  // Show the next queued tutorial when nothing blocks it; suspend the
  // active one when a blocking state begins.
  useEffect(() => {
    dispatch({ type: 'pump', blocked });
  }, [blocked, state.active, state.queue, state.loaded]);

  // Open the tutorial's tab when it starts, and a step's own tab when a tour
  // moves between tabs (FEAR-19).
  const activeId = state.active?.id;
  const activeStep = state.active?.step ?? 0;
  useEffect(() => {
    if (!activeId) return;
    const t = tutorial(activeId);
    if (!t) return;
    const step = stepsFor(t, 'web')[activeStep];
    const tab = step?.tab ?? t.tab;
    if (tab) navigator.current?.(tab);
  }, [activeId, activeStep]);

  // Stable callbacks: components call these from effects.
  const accountRef = useRef(account);
  const blockedRef = useRef(blocked);
  useEffect(() => {
    accountRef.current = account;
    blockedRef.current = blocked;
  }, [account, blocked]);
  const setScope = useCallback((next: string | null) => {
    if (scope.current === next) return;
    scope.current = next;
    if (accountRef.current === false && next && isNewScope(storage(), next)) {
      // A new seat is a new join: guests see every tutorial again.
      writeGuest(storage(), next, {});
      persisted.current = {};
      dispatch({ type: 'reset' });
      dispatch({ type: 'load', seen: [] });
    }
  }, []);
  // The guest's scope may be set before progress has loaded.
  useEffect(() => {
    if (account !== false || !scope.current) return;
    if (isNewScope(storage(), scope.current))
      writeGuest(storage(), scope.current, {});
  }, [account]);
  const request = useCallback(
    (id: string) => dispatch({ type: 'request', id }),
    [],
  );
  const replay = useCallback((id: string) => {
    setDeferred(blockedRef.current ? id : null);
    dispatch({ type: 'replay', id });
  }, []);
  const sectionOpened = useCallback((section: string) => {
    const t = sectionTutorial(section);
    if (t) dispatch({ type: 'request', id: t.id });
  }, []);
  const setBlocker = useCallback(
    (key: string, active: boolean) =>
      setBlockers((current) =>
        !!current[key] === active ? current : { ...current, [key]: active },
      ),
    [],
  );
  const setNavigator = useCallback(
    (navigate: ((tab: string) => void) | null) => {
      navigator.current = navigate;
    },
    [],
  );
  const reset = useCallback(async () => {
    if (accountRef.current) await post({ action: 'reset' });
    else writeGuest(storage(), scope.current, {});
    persisted.current = {};
    dispatch({ type: 'reset' });
    dispatch({ type: 'load', seen: [] });
  }, []);
  const api = useMemo<TutorialApi>(
    () => ({
      state,
      account,
      blocked,
      request,
      replay,
      sectionOpened,
      setScope,
      setBlocker,
      setNavigator,
      reset,
    }),
    [
      state,
      account,
      blocked,
      request,
      replay,
      sectionOpened,
      setScope,
      setBlocker,
      setNavigator,
      reset,
    ],
  );

  const active = state.active ? tutorial(state.active.id) : undefined;
  return (
    <TutorialContext.Provider value={api}>
      {children}
      {active && state.active && (
        <TutorialOverlay
          key={active.id}
          tutorial={active}
          steps={stepsFor(active, 'web')}
          index={state.active.step}
          onNext={() => dispatch({ type: 'next' })}
          onBack={() => dispatch({ type: 'back' })}
          onSkip={() => dispatch({ type: 'skip' })}
        />
      )}
      {deferred && !active && state.queue.some((e) => e.id === deferred) && (
        <output className="tutorial-deferred">
          Your tutorial starts when this timed step ends.
          <button
            className="text-action"
            onClick={() => setDeferred(null)}
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </output>
      )}
    </TutorialContext.Provider>
  );
}

const noop: TutorialApi = {
  state: initialState('web'),
  account: null,
  blocked: false,
  request: () => {},
  replay: () => {},
  sectionOpened: () => {},
  setScope: () => {},
  setBlocker: () => {},
  setNavigator: () => {},
  reset: async () => {},
};
export function useTutorials(): TutorialApi {
  return useContext(TutorialContext) ?? noop;
}

// Show a section's tutorial the first time it opens.
export function useSectionTutorial(section: string, open = true) {
  const { sectionOpened } = useTutorials();
  useEffect(() => {
    if (open) sectionOpened(section);
  }, [section, open, sectionOpened]);
}

// Hold every tutorial popup while `active` (night lock, timed turns, open
// dialogs). Queued popups show when the last blocker clears.
export function useTutorialBlocker(key: string, active: boolean) {
  const { setBlocker } = useTutorials();
  useEffect(() => {
    setBlocker(key, active);
    return () => setBlocker(key, false);
  }, [key, active, setBlocker]);
}

// Component form of useTutorialBlocker for places after an early return.
export function TutorialHold({
  name,
  active,
}: {
  name: string;
  active: boolean;
}) {
  useTutorialBlocker(name, active);
  return null;
}
