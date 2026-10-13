import { env } from 'cloudflare:workers';
import { runtimeEnvironment } from './config';
export function currentEnvironment() {
  return runtimeEnvironment(env as unknown as Record<string, unknown>);
}
