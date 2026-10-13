export type Argument = {
  name: string;
  type: 'string' | 'integer';
  optional?: boolean;
  rest?: boolean;
  max?: number;
};
export type CommandSpec = {
  name: string;
  description: string;
  args: Argument[];
  confirm?: boolean;
};
const account: Argument = { name: 'account', type: 'string' };
const amount: Argument = { name: 'amount', type: 'integer', max: 1_000_000 };
const lobby: Argument = { name: 'lobby', type: 'string' };
export const COMMANDS: CommandSpec[] = [
  { name: 'reports', description: 'List the moderation queue, oldest first.', args: [{ name: 'status', type: 'string', optional: true }] },
  { name: 'report', description: 'Resolve a report: dismiss, warn, remove or suspend.', args: [{ name: 'report', type: 'string' }, { name: 'decision', type: 'string' }, { name: 'note', type: 'string', optional: true, rest: true }], confirm: true },
  { name: 'help', description: 'List commands and usage.', args: [] },
  {
    name: 'inspect',
    description:
      'Inspect an account by username or ID. Guests have no account.',
    args: [account],
  },
  ...['give', 'remove', 'set'].map((verb) => ({
    name: 'xp ' + verb,
    description: 'Adjust XP; level is recalculated from the balance.',
    args: [account, amount],
  })),
  { name: 'catalog', description: 'List grantable item IDs.', args: [] },
  ...['grant', 'revoke'].map((name) => ({
    name,
    description: 'Grant or revoke a catalog item.',
    args: [account, { name: 'item', type: 'string' as const }],
  })),
  {
    name: 'ban',
    description: 'Ban and remove account from all tables.',
    args: [
      account,
      { name: 'reason', type: 'string', optional: true, rest: true },
    ],
    confirm: true,
  },
  { name: 'unban', description: 'Restore sign-in access.', args: [account] },
  {
    name: 'mute',
    description: 'Block communication for minutes (omit for indefinite).',
    args: [
      account,
      { name: 'minutes', type: 'integer', optional: true, max: 525600 },
    ],
  },
  { name: 'unmute', description: 'Restore communication.', args: [account] },
  {
    name: 'signout',
    description:
      'Revoke all account, device-seat and pending sign-in sessions.',
    args: [account],
  },
  {
    name: 'reset',
    description: 'Reset XP, Elo and granted items; retain game history.',
    args: [account],
    confirm: true,
  },
  {
    name: 'lobbies',
    description: 'List active tables (up to 100; use lobby to inspect a code).',
    args: [],
  },
  {
    name: 'lobby',
    description: 'Inspect a table without becoming a participant.',
    args: [lobby],
  },
  {
    name: 'kick',
    description: 'Remove account from a table, or all tables if omitted.',
    args: [account, { ...lobby, optional: true }],
  },
  {
    name: 'endgame',
    description: 'End as administratively canceled; no winner or rewards.',
    args: [lobby],
    confirm: true,
  },
  {
    name: 'storyteller',
    description:
      'Transfer Storyteller access to an account; an active seated player is removed from play.',
    args: [lobby, account],
  },
  {
    name: 'text history',
    description: 'Show immutable text versions.',
    args: [{ name: 'key', type: 'string' }],
  },
  {
    name: 'text revert',
    description: 'Publish a previous version as a new version.',
    args: [
      { name: 'key', type: 'string' },
      { name: 'version', type: 'integer', max: Number.MAX_SAFE_INTEGER },
    ],
  },
];
export function usage(spec: CommandSpec) {
  return (
    spec.name +
    spec.args
      .map((a) => (a.optional ? ` [${a.name}]` : ` <${a.name}>`))
      .join('')
  );
}
export function parseCommand(input: unknown) {
  if (typeof input !== 'string' || input.length > 2000 || !input.trim())
    throw Error('Enter a command; use help for usage.');
  const tokens = input.trim().split(/\s+/);
  const spec = [...COMMANDS]
    .sort((a, b) => b.name.length - a.name.length)
    .find((s) => s.name.split(' ').every((part, i) => tokens[i] === part));
  if (!spec) throw Error('Unknown command. Use help.');
  const values = tokens.slice(spec.name.split(' ').length);
  const args: Record<string, string | number> = {};
  let index = 0;
  for (const arg of spec.args) {
    const raw = arg.rest ? values.slice(index).join(' ') : values[index];
    if (!raw) {
      if (!arg.optional) throw Error('Usage: ' + usage(spec));
      continue;
    }
    index = arg.rest ? values.length : index + 1;
    if (arg.type === 'integer') {
      if (
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(Number(raw)) ||
        Number(raw) > (arg.max ?? 1_000_000)
      )
        throw Error(
          `${arg.name} must be an integer between 0 and ${arg.max ?? 1_000_000}.`,
        );
      args[arg.name] = Number(raw);
    } else {
      if (raw.length > 500) throw Error(`${arg.name} is too long.`);
      args[arg.name] = raw;
    }
  }
  if (index < values.length)
    throw Error('Too many arguments. Usage: ' + usage(spec));
  return { spec, args };
}
