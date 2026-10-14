import type { CapacitorConfig } from '@capacitor/cli';

// Option (a) from docs/mobile-shell-decision.md (approved): the WebView loads
// the hosted, server-rendered site directly, so the site is the app origin and
// every plugin is available to it. Links to any other host open in the system
// browser. When the site can't load, the WebView shows the bundled
// www/error.html (server.errorPath) with a Retry button.
// Set FEARVILLE_URL to try another environment, then run `npm run sync`.
const site = new URL(
  process.env.FEARVILLE_URL ?? 'https://staging.fearville.app',
);

const config: CapacitorConfig = {
  appId: 'app.fearville.shell',
  appName: 'Fearville',
  webDir: 'www',
  server: {
    url: site.origin,
    errorPath: 'error.html',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#120d14',
    preferredContentMode: 'mobile',
    webContentsDebuggingEnabled: false,
  },
  loggingBehavior: 'none',
  android: { allowMixedContent: false },
};

export default config;
