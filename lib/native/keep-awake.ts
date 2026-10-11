import { nativeKeepAwake } from './bridge.ts';

type Sentinel = {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
};
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> };

/**
 * Keep the screen on until the returned stop function runs. Uses the app
 * shell's native keep-awake when available, otherwise the Screen Wake Lock
 * API, re-acquired whenever the page becomes visible again (browsers release
 * the lock when a tab is hidden). Silently does nothing where unsupported.
 */
export function keepScreenAwake(): () => void {
  if (typeof document === 'undefined') return () => {};
  let stopped = false;
  let native = false;
  let lock: Sentinel | null = null;
  let requesting = false;
  const acquire = async () => {
    if (stopped || native || lock || requesting) return;
    requesting = true;
    try {
      if (await nativeKeepAwake(true)) {
        native = true;
        if (stopped) void nativeKeepAwake(false);
        return;
      }
      const api = (typeof navigator === 'undefined'
        ? undefined
        : (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock);
      if (!api || document.visibilityState !== 'visible') return;
      const sentinel = await api.request('screen');
      if (stopped) {
        void sentinel.release().catch(() => {});
        return;
      }
      lock = sentinel;
      sentinel.addEventListener('release', () => {
        if (lock === sentinel) lock = null;
      });
    } catch {
      // Denied (low battery, no permission) or unsupported: just skip.
    } finally {
      requesting = false;
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  document.addEventListener('visibilitychange', onVisibility);
  void acquire();
  return () => {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    if (native) void nativeKeepAwake(false);
    const held = lock;
    lock = null;
    void held?.release().catch(() => {});
  };
}
