// FEAR-121: the build this Worker is running. Deploys set the BUILD_ID var
// (scripts/configure-deployment.mjs) to the same commit the bundle was built
// from; tests override it to simulate a deploy without rebuilding.
import { env } from 'cloudflare:workers';
import { BUILD_ID } from './build';
export function serverBuildId() {
  const value = (env as unknown as { BUILD_ID?: unknown }).BUILD_ID;
  return typeof value === 'string' && /^[\w.-]{1,64}$/.test(value)
    ? value
    : BUILD_ID;
}
