import type { GameView } from './view.ts';
export const TABLE_API_VERSION = 1;
export type ViewEnvelope = {
  type: 'view';
  version: number;
  serverNow: number;
  data: GameView;
  cause?: string;
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
