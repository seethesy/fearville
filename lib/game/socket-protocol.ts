import type { GameView } from './view.ts';
import type { Command } from './types.ts';
export type ActionEnvelope = { type: 'action'; id: string; command: Command };
export type ActionAck = {
  type: 'ack';
  id: string;
  ok: boolean;
  error?: string;
  status?: number;
  summary?: string;
  version?: number;
  serverNow?: number;
  committedAt?: number;
  data?: Record<string, unknown>;
};
export function actionID(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,99}$/.test(value);
}
export function normalizeCommand(value: unknown): Command {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Choose an action.');
  const command = { ...value } as Command;
  if (typeof command.action !== 'string') throw Error('Choose an action.');
  if (
    ['vote', 'correctVote'].includes(command.action) &&
    typeof command.yes === 'string'
  ) {
    if (!['true', 'false', 'null'].includes(command.yes))
      throw Error('Choose yes, no, or abstain.');
    command.yes = command.yes === 'null' ? null : command.yes === 'true';
  }
  return command;
}
export const TABLE_API_VERSION = 1;
export type ViewEnvelope = {
  type: 'view';
  version: number;
  serverNow: number;
  data: GameView;
  cause?: string;
  committedAt?: number;
};
export function viewContent(data: GameView) {
  const { version: _version, serverNow: _serverNow, ...content } = data;
  return JSON.stringify(content);
}
export function parseViewEnvelope(
  raw: string,
  code: string,
  me: string,
): ViewEnvelope | null {
  try {
    const value = JSON.parse(raw) as ViewEnvelope;
    if (
      value.type !== 'view' ||
      !Number.isInteger(value.version) ||
      !Number.isFinite(value.serverNow) ||
      value.data?.code !== code ||
      value.data?.me !== me ||
      value.data.version !== value.version ||
      value.data.serverNow !== value.serverNow
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
