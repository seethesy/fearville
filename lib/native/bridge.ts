// One small, versioned bridge between the web app and the iOS/Android shells.
//
// Contract with the shells (FEAR-93 picks how each shell implements it):
//   window.FearvilleNative = {
//     version: number,                 // the shell's bridge version
//     capabilities: string[],          // see Capability
//     call(method, args?): Promise<unknown>,
//   }
//   Shells send events with
//   window.dispatchEvent(new CustomEvent('fearville:native', { detail: { type, ... } })).
//
// Every wrapper checks its capability first and falls back to a browser
// feature or a safe no-op, so the same code runs in Safari, Chrome and older
// app builds that lack a newer capability.

/** The bridge protocol version this web build speaks. */
export const WEB_BRIDGE_VERSION = 1;

export type Capability =
  | 'secureStorage'
  | 'haptics'
  | 'audio'
  | 'lifecycle'
  | 'share'
  | 'keepAwake'
  | 'push';

type NativeHost = {
  version: number;
  capabilities: string[];
  call(method: string, args?: Record<string, unknown>): Promise<unknown>;
  /** FEAR-120: the installed app, when the shell knows it (optional). */
  app?: { platform?: string; version?: string; build?: string | number };
};

export const NATIVE_EVENT = 'fearville:native';

function host(): NativeHost | undefined {
  if (typeof window === 'undefined') return undefined;
  const native = (window as unknown as { FearvilleNative?: NativeHost })
    .FearvilleNative;
  return native && typeof native.call === 'function' ? native : undefined;
}

/** True inside the iOS or Android app shell. */
export function isNativeShell() {
  return !!host();
}

/** The shell's bridge version, or 0 in a browser. */
export function bridgeVersion() {
  return Number(host()?.version) || 0;
}

/** Capabilities the current shell offers (empty in a browser). */
export function capabilities(): Capability[] {
  const list = host()?.capabilities;
  return Array.isArray(list)
    ? (list.filter((c) => typeof c === 'string') as Capability[])
    : [];
}

/**
 * The installed app (FEAR-120), or null in a browser. Build is 0 when the
 * shell can't report it yet; such clients are never gated.
 */
export function appInfo(): {
  platform: 'ios' | 'android';
  version: string;
  build: number;
  bridgeVersion: number;
} | null {
  const native = host();
  if (!native) return null;
  const platform = native.app?.platform;
  if (platform !== 'ios' && platform !== 'android') return null;
  const version = String(native.app?.version ?? '').replace(/[^\w.+-]/g, '');
  const build = Number(native.app?.build);
  return {
    platform,
    version: version.slice(0, 40) || 'unknown',
    build: Number.isSafeInteger(build) && build > 0 ? build : 0,
    bridgeVersion: bridgeVersion(),
  };
}

export function hasCapability(capability: Capability) {
  return capabilities().includes(capability);
}

/** Call a native method if the capability exists. Never throws. */
async function call(
  capability: Capability,
  method: string,
  args?: Record<string, unknown>,
): Promise<{ ok: boolean; value?: unknown }> {
  const native = host();
  if (!native || !hasCapability(capability)) return { ok: false };
  try {
    return { ok: true, value: await native.call(method, args) };
  } catch {
    return { ok: false };
  }
}

function browserNavigator(): (Navigator & Record<string, unknown>) | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & Record<string, unknown>);
}

// ── Secure storage ──────────────────────────────────────────────────────────
// Account and seat tokens in Keychain / Android Keystore-backed storage. In a
// browser they stay in HttpOnly cookies, which scripts cannot read, so the
// fallback stores nothing and returns null.

export type SecureKey = 'account' | `seat:${string}`;

export const secureStorage = {
  async get(key: SecureKey): Promise<string | null> {
    const result = await call('secureStorage', 'secureStorage.get', { key });
    return result.ok && typeof result.value === 'string' ? result.value : null;
  },
  async set(key: SecureKey, value: string): Promise<boolean> {
    return (await call('secureStorage', 'secureStorage.set', { key, value }))
      .ok;
  },
  async remove(key: SecureKey): Promise<boolean> {
    return (await call('secureStorage', 'secureStorage.remove', { key })).ok;
  },
};

// ── Haptics ─────────────────────────────────────────────────────────────────

export type Haptic = 'tap' | 'error';
const VIBRATION: Record<Haptic, number | number[]> = {
  tap: 10,
  error: [30, 40, 30],
};

/** Light tap on votes and Rite moves; error buzz on an illegal move or timeout. */
export function haptic(kind: Haptic) {
  if (hasCapability('haptics')) {
    void call('haptics', 'haptics.play', { kind });
    return;
  }
  // Android browsers vibrate; Safari has no vibration API.
  const nav = browserNavigator();
  if (typeof nav?.vibrate === 'function') {
    try {
      nav.vibrate(VIBRATION[kind]);
    } catch {
      // Some browsers block vibration without a recent gesture.
    }
  }
}

// ── Audio ───────────────────────────────────────────────────────────────────

export type Cue = 'phase' | 'error';

/**
 * Play a cue natively (respects the silent switch). Returns false when the
 * caller should play its own web audio instead.
 */
export function nativeCue(kind: Cue, volume: number) {
  if (!hasCapability('audio')) return false;
  void call('audio', 'audio.cue', {
    kind,
    volume: Math.max(0, Math.min(1, volume)),
  });
  return true;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export type LifecycleEvent = 'resume' | 'pause' | 'online' | 'offline';

/**
 * Subscribe to app lifecycle and network changes. In the shells these come
 * from the OS; in a browser from page visibility and online/offline events.
 * Returns an unsubscribe function.
 */
export function onLifecycle(
  handler: (event: LifecycleEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const native = hasCapability('lifecycle');
  const fromNative = (event: Event) => {
    const detail = (event as CustomEvent<{ type?: string; state?: string }>)
      .detail;
    if (
      detail?.type === 'lifecycle' &&
      ['resume', 'pause', 'online', 'offline'].includes(detail.state ?? '')
    )
      handler(detail.state as LifecycleEvent);
  };
  const visibility = () =>
    handler(
      typeof document !== 'undefined' && document.hidden ? 'pause' : 'resume',
    );
  const online = () => handler('online');
  const offline = () => handler('offline');
  if (native) window.addEventListener(NATIVE_EVENT, fromNative);
  else if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    window.removeEventListener(NATIVE_EVENT, fromNative);
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
}

// ── Share sheet ─────────────────────────────────────────────────────────────

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

/** Share a table invite link: native sheet, Web Share, then the clipboard. */
export async function share(content: {
  title: string;
  text?: string;
  url: string;
}): Promise<ShareResult> {
  if (hasCapability('share')) {
    const result = await call('share', 'share.open', content);
    if (result.ok) return result.value === false ? 'cancelled' : 'shared';
  }
  const nav = browserNavigator();
  if (typeof nav?.share === 'function') {
    try {
      await nav.share(content);
      return 'shared';
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError')
        return 'cancelled';
    }
  }
  if (typeof nav?.clipboard?.writeText === 'function') {
    try {
      await nav.clipboard.writeText(content.url);
      return 'copied';
    } catch {
      // Clipboard access denied; fall through.
    }
  }
  return 'unavailable';
}

// ── Keep awake ──────────────────────────────────────────────────────────────

/**
 * Ask the shell to keep the screen on (FEAR-98 builds on this). Returns false
 * when there is no native support, so the caller can use the Wake Lock API.
 */
export async function nativeKeepAwake(on: boolean) {
  if (!hasCapability('keepAwake')) return false;
  return (await call('keepAwake', 'keepAwake.set', { on })).ok;
}
