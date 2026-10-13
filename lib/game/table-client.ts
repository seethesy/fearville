import { env } from 'cloudflare:workers';
import type { GameTable } from './table-object';
export function table(code: string) {
  const binding = (env as unknown as { GAME_TABLE: DurableObjectNamespace<GameTable> }).GAME_TABLE;
  if (!binding) throw Error('The table service is not configured.');
  return binding.get(binding.idFromName(code));
}
