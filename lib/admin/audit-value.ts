import { createHash } from 'node:crypto';
import { parseCommand } from './commands.ts';
// Audit operational changes without duplicating hidden game information.
const PRIVATE_KEYS = new Set([
  'name', 'email', 'handle', 'googleEmail', 'hostName', 'storyteller',
  'role',
  'shown',
  'notes',
  'notebook',
  'notebooks',
  'nightChoices',
  'nightChoiceTasks',
  'nightIntroductions',
  'acts',
  'token',
  'accountToken',
  'credentialHash',
  'sessionHash',
  'confirmation',
]);
export function auditTarget(action: string, target: string) {
  return /^(inspect|xp (give|remove|set)|grant|revoke|ban|unban|mute|unmute|signout|reset|kick)$/.test(action)
    ? 'account:' + createHash('sha256').update(target).digest('hex') : target;
}
export function auditParameters(value: unknown) {
  if (!value || typeof value !== 'object' || !('input' in value)) return auditValue(value);
  try {
    const { spec, args } = parseCommand(value.input);
    return { command: spec.name, arguments: { ...args, ...(args.account ? { account: auditTarget(spec.name, String(args.account)) } : {}) } };
  } catch { return { command: 'invalid command' }; }
}
export function auditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(auditValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !PRIVATE_KEYS.has(key))
        .map(([key, child]) => [key, auditValue(child)]),
    );
  return value;
}
