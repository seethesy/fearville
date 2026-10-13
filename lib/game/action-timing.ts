export type ActionTiming = { id: string; started: number; duration?: number };
export async function timedActionFetch(input: string, init: RequestInit) {
  const started = performance.now(),
    id = crypto.randomUUID();
  const announce = (detail: ActionTiming) =>
    window.dispatchEvent(
      new CustomEvent('fearville:action-timing', { detail }),
    );
  announce({ id, started });
  try {
    const body =
      typeof init.body === 'string'
        ? JSON.stringify({ ...JSON.parse(init.body), requestId: id })
        : init.body;
    return await fetch(input, { ...init, body });
  } finally {
    announce({ id, started, duration: performance.now() - started });
  }
}
