// FEAR-122 remote switches: the catalog and pure helpers. Storage lives in
// flags.ts; game enforcement in game.ts. Everything here is safe to import
// from client components.
import { PATTERNS, type Pattern } from '../rite/types.ts';
import { SCRIPTS, type RoleScript } from '../game/types/setup.ts';

/** on: available. off: unavailable for new games/requests. kill: off, and running features end. */
export type SwitchState = 'on' | 'off' | 'kill';
export type Severity = 'info' | 'warning' | 'critical';
export type Maintenance = {
  text: string;
  severity: Severity;
  newGamesDisabled: boolean;
};
export type Platform = 'ios' | 'android';
export type BuildPolicy = {
  /** Builds below this get "Update required" (0 = no minimum). */
  minimum: number;
  /** Builds below this get "Update available" (0 = no recommendation). */
  recommended: number;
  /** App Store / TestFlight / Play link; blank shows text only. */
  updateUrl: string;
};
export type Builds = Partial<Record<Platform, BuildPolicy>>;
export type Flags = {
  switches: Record<string, SwitchState>;
  maintenance: Maintenance | null;
  builds: Builds;
};

export type SwitchDef = {
  key: string;
  label: string;
  group: 'Night Rite' | 'Scripts' | 'Accounts' | 'Notifications' | 'Shop';
  /** Kill ends the running feature; otherwise off only affects new games/requests. */
  killable?: boolean;
  /** Defined ahead of the feature; enforcement lands with that feature. */
  reserved?: boolean;
};

export const SWITCHES: SwitchDef[] = [
  { key: 'rite', label: 'Night Rite', group: 'Night Rite', killable: true },
  ...(Object.entries(PATTERNS) as [Pattern, string][]).map(
    ([pattern, label]) => ({
      key: 'rite.' + pattern,
      label,
      group: 'Night Rite' as const,
      killable: true,
    }),
  ),
  ...(Object.entries(SCRIPTS) as [RoleScript, string][]).map(
    ([script, label]) => ({
      key: 'script.' + script,
      label,
      group: 'Scripts' as const,
    }),
  ),
  { key: 'signups', label: 'New sign-ups', group: 'Accounts' },
  { key: 'guests', label: 'Guest play', group: 'Accounts' },
  {
    key: 'push',
    label: 'Push notifications',
    group: 'Notifications',
    reserved: true,
  },
  { key: 'shop', label: 'Shop', group: 'Shop', reserved: true },
  {
    key: 'purchases.web',
    label: 'Web purchases (Stripe)',
    group: 'Shop',
    reserved: true,
  },
  {
    key: 'purchases.ios',
    label: 'iOS in-app purchases',
    group: 'Shop',
    reserved: true,
  },
  {
    key: 'purchases.android',
    label: 'Android purchases',
    group: 'Shop',
    reserved: true,
  },
];
/** Value keys that are not on/off switches. */
export const VALUE_KEYS = ['maintenance', 'builds'] as const;
export const PLATFORMS: Platform[] = ['ios', 'android'];
export const DEFAULT_FLAGS: Flags = {
  switches: {},
  maintenance: null,
  builds: {},
};

export function switchDef(key: string) {
  return SWITCHES.find((s) => s.key === key);
}
export function isFlagKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    (!!switchDef(key) || (VALUE_KEYS as readonly string[]).includes(key))
  );
}

/** Missing rows mean "on"; a feature is only ever off by an explicit row. */
export function state(flags: Flags, key: string): SwitchState {
  return flags.switches[key] ?? 'on';
}
export function enabled(flags: Flags, key: string) {
  return state(flags, key) === 'on';
}
export const riteEnabled = (f: Flags) => enabled(f, 'rite');
export const patternEnabled = (f: Flags, p: Pattern) =>
  riteEnabled(f) && enabled(f, 'rite.' + p);
export const scriptEnabled = (f: Flags, s: string) => enabled(f, 'script.' + s);
export const newGamesAllowed = (f: Flags) => !f.maintenance?.newGamesDisabled;

const integer = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1e9;

/** Validate a stored or submitted value for a key. Throws a user-facing error. */
export function parseValue(key: string, value: unknown): unknown {
  const def = switchDef(key);
  if (def) {
    if (value === true) value = 'on';
    if (value === false) value = 'off';
    if (value !== 'on' && value !== 'off' && value !== 'kill')
      throw Error('Use on, off or kill.');
    if (value === 'kill' && !def.killable)
      throw Error(`${def.label} has no kill; turn it off for new games.`);
    return value;
  }
  if (key === 'maintenance') {
    if (value === null) return null;
    const m = value as Partial<Maintenance>;
    if (
      !m ||
      typeof m !== 'object' ||
      typeof m.text !== 'string' ||
      !m.text.trim() ||
      m.text.length > 280 ||
      !['info', 'warning', 'critical'].includes(m.severity as string) ||
      typeof (m.newGamesDisabled ?? false) !== 'boolean'
    )
      throw Error(
        'A banner needs text (up to 280 characters) and a severity of info, warning or critical.',
      );
    return {
      text: m.text.trim(),
      severity: m.severity as Severity,
      newGamesDisabled: !!m.newGamesDisabled,
    } satisfies Maintenance;
  }
  if (key === 'builds') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Builds must be an object keyed by platform.');
    const out: Builds = {};
    for (const [platform, raw] of Object.entries(value)) {
      if (!PLATFORMS.includes(platform as Platform))
        throw Error('Builds are set for ios or android.');
      const p = raw as Partial<BuildPolicy>;
      const url = p?.updateUrl ?? '';
      if (
        !p ||
        !integer(p.minimum ?? 0) ||
        !integer(p.recommended ?? 0) ||
        typeof url !== 'string' ||
        url.length > 300 ||
        (url && !/^https:\/\/[^\s]+$/.test(url))
      )
        throw Error(
          'Builds need whole-number minimum/recommended builds and an https update link (or blank).',
        );
      out[platform as Platform] = {
        minimum: p.minimum ?? 0,
        recommended: Math.max(p.recommended ?? 0, p.minimum ?? 0),
        updateUrl: url,
      };
    }
    return out;
  }
  throw Error('Unknown switch.');
}

/** Build a Flags object from stored rows, ignoring unknown or invalid rows. */
export function fromRows(rows: { key: string; value: string }[]): Flags {
  const flags: Flags = { switches: {}, maintenance: null, builds: {} };
  for (const row of rows) {
    try {
      const value = parseValue(row.key, JSON.parse(row.value));
      if (switchDef(row.key)) flags.switches[row.key] = value as SwitchState;
      else if (row.key === 'maintenance')
        flags.maintenance = value as Maintenance | null;
      else if (row.key === 'builds') flags.builds = value as Builds;
    } catch {
      /* An unreadable row never takes a feature down. */
    }
  }
  return flags;
}

/** What every client may see: no audit data, only what the UI needs. */
export type PublicFlags = {
  maintenance: Maintenance | null;
  off: string[];
  builds: Builds;
};
export function publicFlags(f: Flags): PublicFlags {
  return {
    maintenance: f.maintenance,
    off: Object.entries(f.switches)
      .filter(([, s]) => s !== 'on')
      .map(([k]) => k),
    builds: f.builds,
  };
}
/** Client-side check against the public subset. */
export function publicEnabled(p: PublicFlags | null | undefined, key: string) {
  if (!p) return true;
  if (key.startsWith('rite.') && p.off.includes('rite')) return false;
  return !p.off.includes(key);
}
