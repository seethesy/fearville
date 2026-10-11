// FEAR-93 spike: when the site runs inside the Capacitor shell, expose the
// shell's plugins as window.FearvilleNative (the FEAR-96 bridge contract).
// Lives in the web build so it ships with the site, not with app updates.
// Inert in browsers: window.Capacitor only exists inside the shell.

type Plugin = Record<string, (...args: unknown[]) => Promise<unknown>> & {
  addListener?: (event: string, handler: (data: Record<string, unknown>) => void) => unknown;
};
type CapacitorGlobal = {
  isNativePlatform(): boolean;
  isPluginAvailable(name: string): boolean;
  Plugins: Record<string, Plugin | undefined>;
};

const SHELL_BRIDGE_VERSION = 1;

export function installCapacitorBridge() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { Capacitor?: CapacitorGlobal; FearvilleNative?: unknown };
  const cap = w.Capacitor;
  if (!cap?.isNativePlatform() || w.FearvilleNative) return;
  const plugin = (name: string) => (cap.isPluginAvailable(name) ? cap.Plugins[name] : undefined);
  const haptics = plugin('Haptics'),
    share = plugin('Share'),
    keepAwake = plugin('KeepAwake'),
    secure = plugin('SecureStoragePlugin'),
    app = plugin('App'),
    network = plugin('Network'),
    browser = plugin('Browser');
  const emit = (detail: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent('fearville:native', { detail }));

  const methods: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  const capabilities: string[] = [];
  if (haptics) {
    capabilities.push('haptics');
    methods['haptics.play'] = (a) =>
      a.kind === 'error'
        ? haptics.notification({ type: 'ERROR' })
        : haptics.impact({ style: 'LIGHT' });
  }
  if (share) {
    capabilities.push('share');
    methods['share.open'] = async (a) => {
      try {
        await share.share({ title: a.title, text: a.text, url: a.url });
        return true;
      } catch {
        return false; // cancelled
      }
    };
  }
  if (keepAwake) {
    capabilities.push('keepAwake');
    methods['keepAwake.set'] = (a) => (a.on ? keepAwake.keepAwake() : keepAwake.allowSleep());
  }
  if (secure) {
    capabilities.push('secureStorage');
    methods['secureStorage.get'] = async (a) =>
      ((await secure.get({ key: a.key }).catch(() => null)) as { value?: string } | null)?.value ?? null;
    methods['secureStorage.set'] = (a) => secure.set({ key: a.key, value: a.value });
    methods['secureStorage.remove'] = (a) => secure.remove({ key: a.key });
  }
  if (app?.addListener) {
    capabilities.push('lifecycle');
    app.addListener('appStateChange', (s) =>
      emit({ type: 'lifecycle', state: s.isActive ? 'resume' : 'pause' }),
    );
    // Sign-in returns through fearville://signin?code=… (lib/accounts/callback.ts).
    app.addListener('appUrlOpen', (e) => {
      const url = String(e.url ?? '');
      if (!url.startsWith('fearville://signin')) return;
      void browser?.close?.().catch(() => {});
      const params = new URL(url.replace('fearville://', 'https://x/')).searchParams;
      emit({ type: 'signin', code: params.get('code'), error: params.get('error') });
    });
  }
  network?.addListener?.('networkStatusChange', (s) =>
    emit({ type: 'lifecycle', state: s.connected ? 'online' : 'offline' }),
  );
  if (browser) {
    // Google refuses OAuth in embedded WebViews: open the flow in the system
    // browser sheet (SFSafariViewController / Custom Tabs).
    capabilities.push('auth');
    methods['auth.open'] = (a) => browser.open({ url: a.url, presentationStyle: 'popover' });
  }

  w.FearvilleNative = {
    version: SHELL_BRIDGE_VERSION,
    capabilities,
    call: (method: string, args: Record<string, unknown> = {}) => {
      const run = methods[method];
      return run ? run(args) : Promise.reject(new Error(`Unknown native method ${method}`));
    },
  };
}
