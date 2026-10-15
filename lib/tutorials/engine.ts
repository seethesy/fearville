import type {
  Platform,
  SeenItem,
  SeenStatus,
  Tutorial,
  TutorialStep,
} from './types.ts';
import { TUTORIALS, tutorial as lookup } from './content.ts';

// ---------------------------------------------------------------------------
// Pure tutorial state machine shared by browsers and mobile shells.
// Side effects (persisting seen items, switching
// tabs) are derived by the caller from state changes.
// ---------------------------------------------------------------------------

export interface Entry {
  id: string;
  step: number;
  // Started from Help. Replays never un-mark anything; finishing or skipping
  // one only (re)marks it seen, so it cannot cause an unwanted auto-popup.
  replay: boolean;
}
export interface TutorialState {
  // Tutorial definitions resolved for this platform.
  platform: Platform;
  active: Entry | null;
  // Waiting tutorials, in order. A suspended tutorial returns to the front.
  queue: Entry[];
  // Seen ids and how they ended (completed or skipped).
  seen: Record<string, SeenStatus>;
  // Progress has loaded (accounts) or the guest store was read.
  loaded: boolean;
}
export type TutorialEvent =
  | { type: 'load'; seen: SeenItem[] }
  | { type: 'request'; id: string; replay?: boolean }
  | { type: 'replay'; id: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'pump'; blocked: boolean }
  | { type: 'reset' };

export function initialState(platform: Platform = 'web'): TutorialState {
  return { platform, active: null, queue: [], seen: {}, loaded: false };
}

const onPlatform = (platform: Platform, platforms?: Platform[]) =>
  !platforms || platforms.includes(platform);

export function stepsFor(t: Tutorial, platform: Platform): TutorialStep[] {
  return t.steps
    .filter((s) => onPlatform(platform, s.platforms))
    .map((s) =>
      platform === 'ios' && s.ios
        ? {
            ...s,
            title: s.ios.title ?? s.title,
            body: s.ios.body ?? s.body,
          }
        : s,
    );
}
export function available(
  id: string,
  platform: Platform,
): Tutorial | undefined {
  const t = lookup(id);
  if (!t || !onPlatform(platform, t.platforms)) return undefined;
  return stepsFor(t, platform).length ? t : undefined;
}
export function groupOf(id: string): string[] {
  const t = lookup(id);
  if (!t?.group) return [id];
  return TUTORIALS.filter((x) => x.group === t.group).map((x) => x.id);
}

const queued = (s: TutorialState, id: string) =>
  s.active?.id === id || s.queue.some((e) => e.id === id);

function mark(
  seen: TutorialState['seen'],
  ids: string[],
  status: SeenStatus,
): TutorialState['seen'] {
  const next = { ...seen };
  for (const id of ids) {
    // A completion is never downgraded to skipped.
    if (status === 'skipped' && next[id] === 'completed') continue;
    next[id] = status;
  }
  return next;
}

export function reduce(
  state: TutorialState,
  event: TutorialEvent,
): TutorialState {
  switch (event.type) {
    case 'load': {
      const seen = { ...state.seen };
      for (const item of event.seen)
        if (seen[item.id] !== 'completed') seen[item.id] = item.status;
      // Drop automatic requests that turned out to be seen already.
      const keep = (e: Entry) => e.replay || !seen[e.id];
      return {
        ...state,
        seen,
        loaded: true,
        active: state.active && keep(state.active) ? state.active : null,
        queue: state.queue.filter(keep),
      };
    }
    case 'request': {
      if (!available(event.id, state.platform)) return state;
      if (queued(state, event.id)) return state;
      if (!event.replay && state.seen[event.id]) return state;
      const entry = { id: event.id, step: 0, replay: !!event.replay };
      return event.replay
        ? { ...state, queue: [entry, ...state.queue] }
        : { ...state, queue: [...state.queue, entry] };
    }
    case 'replay': {
      // Replaying a grouped tutorial plays the whole group from its start.
      const ids = groupOf(event.id).filter((id) =>
        available(id, state.platform),
      );
      const entries = ids.map((id) => ({ id, step: 0, replay: true }));
      return {
        ...state,
        queue: [...entries, ...state.queue.filter((e) => !ids.includes(e.id))],
      };
    }
    case 'next': {
      if (!state.active) return state;
      const t = lookup(state.active.id)!;
      const last = stepsFor(t, state.platform).length - 1;
      if (state.active.step < last)
        return {
          ...state,
          active: { ...state.active, step: state.active.step + 1 },
        };
      return {
        ...state,
        active: null,
        seen: mark(state.seen, [t.id, ...(t.covers ?? [])], 'completed'),
      };
    }
    case 'back':
      if (!state.active || state.active.step === 0) return state;
      return {
        ...state,
        active: { ...state.active, step: state.active.step - 1 },
      };
    case 'skip': {
      if (!state.active) return state;
      const group = groupOf(state.active.id);
      // Skip ends only this tutorial (and the rest of its group). Unrelated
      // queued tutorials still show.
      return {
        ...state,
        active: null,
        seen: mark(state.seen, group, 'skipped'),
        queue: state.queue.filter((e) => !group.includes(e.id)),
      };
    }
    case 'pump': {
      if (event.blocked || !state.loaded) {
        if (!state.active) return state;
        // Suspend: put the active tutorial back at the front, same step.
        return {
          ...state,
          active: null,
          queue: [state.active, ...state.queue],
        };
      }
      if (state.active || !state.queue.length) return state;
      // Automatic requests that became seen while waiting (for example a
      // section a finished walkthrough already covered) are dropped.
      const waiting = state.queue.filter((e) => e.replay || !state.seen[e.id]);
      if (!waiting.length) return { ...state, queue: [] };
      const [next, ...rest] = waiting;
      return { ...state, active: next, queue: rest };
    }
    case 'reset':
      return { ...state, seen: {}, active: null, queue: [] };
  }
}

// Ids newly marked between two states, for persistence.
export function newlySeen(
  before: TutorialState['seen'],
  after: TutorialState['seen'],
): SeenItem[] {
  return Object.entries(after)
    .filter(([id, status]) => before[id] !== status)
    .map(([id, status]) => ({ id, status }));
}

// ---------------------------------------------------------------------------
// Triggers and suppression, derived from the public game view.
// ---------------------------------------------------------------------------

const DAY_PHASES = [
  'discovery',
  'discussion',
  'nomination',
  'defense',
  'voting',
  'dayReview',
];

export interface TriggerView {
  phase: string;
  host: boolean;
  day: number;
  sandboxHost?: boolean;
}
// Walkthrough chapters that apply right now, in order. The reducer ignores
// any already seen.
export function walkthroughTriggers(view: TriggerView): string[] {
  if (view.host || view.sandboxHost) return [];
  if (view.phase === 'lobby') return ['walkthrough.lobby'];
  if (view.phase === 'ended') return [];
  const ids = ['walkthrough.start'];
  if (view.day >= 1 && DAY_PHASES.includes(view.phase))
    ids.push('walkthrough.day');
  return ids;
}

// FEAR-19: Storyteller tour chapters that apply right now. Only ever for the
// Storyteller's own view (a sandbox host viewing as a player is not the
// Storyteller for this purpose). The lobby chapter in the lobby; the play
// chapter once the game has started.
export function hostTourTriggers(view: TriggerView): string[] {
  if (!view.host) return [];
  if (view.phase === 'lobby') return ['tour.lobby'];
  if (view.phase === 'ended') return [];
  return ['tour.play'];
}

// Storyteller-only panels with a first-open tutorial, by table tab.
export function hostSectionFor(host: boolean, tab: string): string {
  if (!host) return '';
  return tab === 'seats'
    ? 'host-seats'
    : tab === 'control'
      ? 'host-controls'
      : '';
}

// Night Rite guide: a seated player's own pattern guide pops up during the
// nights before the Rite opens (night 1 for everyone who is seated then).
export interface GuideView {
  phase: string;
  host: boolean;
  sandboxHost?: boolean;
  night: number;
  rite?: {
    host?: boolean;
    opensNight?: number;
    squad?: { kind: string };
  } | null;
}
export function riteGuideTrigger(view: GuideView): string | null {
  const rite = view.rite;
  if (view.host || view.sandboxHost || !rite || rite.host || !rite.squad)
    return null;
  if (view.phase !== 'night' || view.night < 1) return null;
  if (view.night >= (rite.opensNight ?? 2)) return null;
  return `guide.${rite.squad.kind}`;
}

export interface SuppressionView {
  phase: string;
  host: boolean;
  me: string;
  nightChoice?: unknown;
  glimpse?: unknown;
  active?: {
    eligible: string[];
    myVoteSubmitted?: boolean;
  } | null;
  serverNow?: number;
  // Night Rite (players): the 30-second night lock and timed turns.
  rite?: {
    host?: boolean;
    lockUntil?: number;
    puzzle?: {
      phase: string;
      vote?: { answered: boolean } | null;
    } | null;
  } | null;
}
// Reasons the game itself blocks popups. Components add their own blockers
// (open dialogs, Night Rite timed turns, the night lock) at runtime.
export function suppressionReasons(view: SuppressionView): string[] {
  const reasons: string[] = [];
  if (view.nightChoice) reasons.push('night-choice');
  if (view.glimpse) reasons.push('night-glimpse');
  if (
    view.phase === 'voting' &&
    !view.host &&
    view.active?.eligible.includes(view.me) &&
    !view.active.myVoteSubmitted
  )
    reasons.push('vote');
  const rite = view.rite && !view.rite.host ? view.rite : null;
  if (
    rite &&
    (rite.puzzle?.phase === 'lock' ||
      (view.phase === 'night' &&
        rite.lockUntil !== undefined &&
        (view.serverNow ?? 0) < rite.lockUntil))
  )
    reasons.push('night-lock');
  if (
    rite?.puzzle &&
    (rite.puzzle.phase === 'turn' ||
      (rite.puzzle.vote && !rite.puzzle.vote.answered))
  )
    reasons.push('rite-turn');
  return reasons;
}

// ---------------------------------------------------------------------------
// Help menu (FEAR-20)
// ---------------------------------------------------------------------------
export interface HelpItem {
  id: string;
  title: string;
  summary: string;
  seen: boolean;
}
export interface HelpSection {
  title: string;
  items: HelpItem[];
}
export function helpSections(options: {
  platform: Platform;
  host: boolean;
  seated: boolean;
  // Night Rite pattern guides the player is entitled to (their own only).
  ownGuides?: string[];
  seen: TutorialState['seen'];
}): HelpSection[] {
  const { platform, host, seated, seen } = options;
  const own = new Set(options.ownGuides ?? []);
  const fits = (t: Tutorial) =>
    !!available(t.id, platform) &&
    (t.audience === 'all' || (t.audience === 'host' ? host : seated && !host));
  const item = (t: Tutorial): HelpItem => ({
    id: t.id,
    title: t.title,
    summary: t.summary,
    seen: groupOf(t.id).every((id) => !!seen[id]),
  });
  const firstOfGroup = (t: Tutorial, i: number, all: Tutorial[]) =>
    !t.group || all.findIndex((x) => x.group === t.group) === i;
  const of = (kind: Tutorial['kind']) =>
    TUTORIALS.filter((t) => t.kind === kind && fits(t));
  const sections: HelpSection[] = [
    {
      title: 'Getting started',
      items: of('walkthrough').filter(firstOfGroup).map(item),
    },
    {
      title: 'Storyteller tour',
      // One entry; replaying it plays every chapter (FEAR-19).
      items: of('tour').filter(firstOfGroup).map(item),
    },
    {
      title: 'Your Night Rite guide',
      // Never list other patterns' guides: that would reveal vigil setups.
      items: of('guide')
        .filter((t) => own.has(t.id))
        .map(item),
    },
    { title: 'Sections', items: of('section').map(item) },
  ];
  return sections.filter((s) => s.items.length);
}
