import catalog from './role-tips.json' with { type: 'json' };
import type { RoleScript } from './types.ts';

// Keep the catalog as JSON so the iOS client can consume the same ordered data.
export const ROLE_TIPS: Record<RoleScript, Record<string, string[]>> = catalog;

export function roleTips(script: RoleScript, perceivedRole: string): string[] {
  return ROLE_TIPS[script]?.[perceivedRole] ?? [];
}
