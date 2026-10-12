import type { CapacitorConfig } from '@capacitor/cli';

// Option (b) from docs/mobile-shell-decision.md: a bundled start page
// (www/index.html) navigates to the hosted site; only these hosts stay in
// the WebView. Set FEARVILLE_URL to try another environment.
const site = new URL(
  process.env.FEARVILLE_URL ?? 'https://staging.fearville.app',
);

const config: CapacitorConfig = {
  appId: 'app.fearville.shell',
  appName: 'Fearville',
  webDir: 'www',
  server: {
    allowNavigation: [site.hostname, 'fearville.app', 'staging.fearville.app'],
    // Option (a) fallback if check 1 fails: uncomment to load the site as the
    // app origin instead of navigating to it.
    // url: site.origin,
  },
  ios: { contentInset: 'never', scheme: 'Fearville' },
  android: { allowMixedContent: false },
};

export default config;
