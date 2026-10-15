// FEAR-93 spike: when the site runs inside the Capacitor shell, expose the
// shell's plugins as window.FearvilleNative (the FEAR-96 bridge contract).
// Lives in the web build so it ships with the site, not with app updates.
// Inert in browsers: window.Capacitor only exists inside the shell.

type Plugin = Record<string, (...args: unknown[]) => Promise<unknown>> & {
  addListener?: (
    event: string,
    handler: (data: Record<string, unknown>) => void,
  ) => unknown;
};
type CapacitorGlobal = {
  isNativePlatform(): boolean;
  getPlatform?(): string;
  isPluginAvailable(name: string): boolean;
  Plugins: Record<string, Plugin | undefined>;
};

const SHELL_BRIDGE_VERSION = 1;

export function installCapacitorBridge() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    Capacitor?: CapacitorGlobal;
    FearvilleNative?: unknown;
  };
  const cap = w.Capacitor;
  if (!cap?.isNativePlatform() || w.FearvilleNative) return;
  const plugin = (name: string) =>
    cap.isPluginAvailable(name) ? cap.Plugins[name] : undefined;
  const haptics = plugin('Haptics'),
    share = plugin('Share'),
    keepAwake = plugin('KeepAwake'),
    secure = plugin('SecureStoragePlugin'),
    app = plugin('App'),
    network = plugin('Network'),
    browser = plugin('Browser'),
    // iOS only: ASWebAuthenticationSession (mobile/native/ios).
    authSheet = plugin('FearvilleAuth');
  const emit = (detail: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent('fearville:native', { detail }));

  const methods: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  > = {};
  const capabilities: string[] = [];
  // Sign-in returns through fearville://signin?code=… (lib/accounts/callback.ts).
  const emitSignin = (url: string) => {
    const params = new URL(url.replace('fearville://', 'https://x/'))
      .searchParams;
    emit({
      type: 'signin',
      code: params.get('code'),
      error: params.get('error'),
    });
  };
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
    methods['keepAwake.set'] = (a) =>
      a.on ? keepAwake.keepAwake() : keepAwake.allowSleep();
  }
  if (secure) {
    capabilities.push('secureStorage');
    methods['secureStorage.get'] = async (a) =>
      (
        (await secure.get({ key: a.key }).catch(() => null)) as {
          value?: string;
        } | null
      )?.value ?? null;
    methods['secureStorage.set'] = (a) =>
      secure.set({ key: a.key, value: a.value });
    methods['secureStorage.remove'] = (a) => secure.remove({ key: a.key });
  }
  if (app?.addListener) {
    capabilities.push('lifecycle');
    app.addListener('appStateChange', (s) =>
      emit({ type: 'lifecycle', state: s.isActive ? 'resume' : 'pause' }),
    );
    // Android: Custom Tabs hand fearville://signin?code=… back to the app.
    app.addListener('appUrlOpen', (e) => {
      const url = typeof e.url === 'string' ? e.url : '';
      if (!url.startsWith('fearville://signin')) return;
      void browser?.close?.().catch(() => {});
      emitSignin(url);
    });
  }
  network?.addListener?.('networkStatusChange', (s) =>
    emit({ type: 'lifecycle', state: s.connected ? 'online' : 'offline' }),
  );
  if (authSheet || browser) {
    // Google refuses OAuth in embedded WebViews, so sign-in runs in the
    // system's sign-in browser: ASWebAuthenticationSession on iOS, Custom
    // Tabs on Android. Either way the result arrives as a 'signin' event.
    capabilities.push('auth');
    methods['auth.open'] = async (a) => {
      if (authSheet) {
        const result = (await authSheet.start({ url: a.url })) as {
          url?: string;
          cancelled?: boolean;
        };
        if (result?.url) emitSignin(result.url);
        return !result?.cancelled;
      }
      await browser!.open({ url: a.url });
      return true;
    };
  }

  // FEAR-120: the installed app's platform and build for X-Fearville-Client.
  // Filled asynchronously; until then the build is 0 (never gated).
  const appDetails: { platform: string; version: string; build: string } = {
    platform: cap.getPlatform?.() ?? '',
    version: '',
    build: '0',
  };
  void app
    ?.getInfo?.()
    .then((info) => {
      const i = info as { version?: string; build?: string } | undefined;
      appDetails.version = String(i?.version ?? '');
      appDetails.build = String(i?.build ?? '0');
      emit({ type: 'app' });
    })
    .catch(() => {});
  w.FearvilleNative = {
    version: SHELL_BRIDGE_VERSION,
    capabilities,
    app: appDetails,
    call: (method: string, args: Record<string, unknown> = {}) => {
      const run = methods[method];
      return run
        ? run(args)
        : Promise.reject(new Error(`Unknown native method ${method}`));
    },
  };
}
