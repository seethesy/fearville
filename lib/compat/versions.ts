// FEAR-120: client versions and the minimum/recommended build gate. Pure, so
// the Worker, the web layer and tests share one definition.
//
// Every request from the web layer carries
//   X-Fearville-Client: <platform>/<appVersion>/<build>/<bridgeVersion>  (shells)
//   X-Fearville-Client: web/<buildId>                                   (browsers)
// and the table socket sends the same value in its URL and hello frame.
import type { Builds, Platform } from '../flags/catalog.ts';

export const CLIENT_HEADER = 'X-Fearville-Client';
export const UPDATE_HEADER = 'X-Fearville-Update';

export type ClientInfo =
  | {
      platform: Platform;
      appVersion: string;
      build: number;
      bridgeVersion: number;
    }
  | { platform: 'web'; buildId: string }
  | { platform: 'unknown' };

const token = (s: string) => /^[\w.+-]{1,40}$/.test(s);

export function clientHeader(c: ClientInfo) {
  if (c.platform === 'web') return `web/${c.buildId}`;
  if (c.platform === 'unknown') return 'unknown';
  return `${c.platform}/${c.appVersion}/${c.build}/${c.bridgeVersion}`;
}

/** Parse the header; anything malformed is "unknown" (never gated). */
export function parseClient(value: string | null | undefined): ClientInfo {
  const parts = (value ?? '').trim().split('/');
  if (parts[0] === 'web' && parts.length === 2 && token(parts[1]))
    return { platform: 'web', buildId: parts[1] };
  if (
    (parts[0] === 'ios' || parts[0] === 'android') &&
    parts.length === 4 &&
    parts.every(token) &&
    /^\d{1,9}$/.test(parts[2]) &&
    /^\d{1,4}$/.test(parts[3])
  )
    return {
      platform: parts[0],
      appVersion: parts[1],
      build: Number(parts[2]),
      bridgeVersion: Number(parts[3]),
    };
  return { platform: 'unknown' };
}

export type Compatibility =
  | { status: 'ok' }
  | { status: 'recommended' | 'required'; updateUrl: string };

/**
 * Compare a shell's build with the switches. Browsers, unknown clients and
 * shells that couldn't report a build (0) are never gated.
 */
export function compatibility(c: ClientInfo, builds: Builds): Compatibility {
  if (c.platform !== 'ios' && c.platform !== 'android') return { status: 'ok' };
  const policy = builds[c.platform];
  if (!policy || !c.build) return { status: 'ok' };
  if (policy.minimum && c.build < policy.minimum)
    return { status: 'required', updateUrl: policy.updateUrl };
  if (policy.recommended && c.build < policy.recommended)
    return { status: 'recommended', updateUrl: policy.updateUrl };
  return { status: 'ok' };
}

/** API paths an outdated shell can still reach (to learn it must update). */
export function gateExempt(path: string) {
  return (
    !path.startsWith('/api/') ||
    path === '/api/flags' ||
    path === '/api/health' ||
    path.startsWith('/api/health/')
  );
}

/** The daily-count label for a client: platform plus build or web build. */
export function clientLabel(c: ClientInfo) {
  return c.platform === 'web'
    ? 'web'
    : c.platform === 'unknown'
      ? 'unknown'
      : `${c.platform}/${c.appVersion}/${c.build}`;
}
