'use client';
// FEAR-174: loading and sending feedback forms from the browser.
import type { Answer, FormContext, FormDefinition } from '@/lib/feedback/forms';
import {
  type KeyValue,
  type Pending,
  readOutbox,
  writeOutbox,
} from '@/lib/feedback/client';
import { isNativeShell } from '@/lib/native/bridge';

export type LoadedForm = FormDefinition & { id: string; version: number };

export function browserStore(): KeyValue {
  try {
    const s = window.localStorage;
    return { get: (k) => s.getItem(k), set: (k, v) => s.setItem(k, v) };
  } catch {
    const memory = new Map<string, string>();
    return {
      get: (k) => memory.get(k) ?? null,
      set: (k, v) => void memory.set(k, v),
    };
  }
}

const cache = new Map<FormContext, Promise<LoadedForm | null>>();

/** The active form for a context, or null when that entry point is off. */
export function loadForm(context: FormContext): Promise<LoadedForm | null> {
  let pending = cache.get(context);
  if (!pending) {
    pending = fetch(`/api/feedback?context=${context}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) return null;
        const data = (await r.json()) as { form?: LoadedForm; error?: string };
        if (!r.ok || !data.form) throw Error(data.error ?? 'Form unavailable.');
        return data.form;
      })
      .catch((e) => {
        cache.delete(context);
        throw e;
      });
    cache.set(context, pending);
    // Pick up edits from the form editor within a few minutes.
    setTimeout(() => cache.delete(context), 5 * 60_000);
  }
  return pending;
}

const GUEST_KEY = 'fv.feedback.guest';
function guestId(store: KeyValue) {
  let id = store.get(GUEST_KEY);
  if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
    id = crypto.randomUUID();
    store.set(GUEST_KEY, id);
  }
  return id;
}

/** Whitelisted app details for bug reports. Never game secrets. */
export function clientDetails(): Record<string, unknown> {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
    connection?: { effectiveType?: string };
  };
  const ua = navigator.userAgent;
  const os =
    nav.userAgentData?.platform ||
    (/iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'Other');
  return {
    platform: isNativeShell() ? 'app' : 'web',
    os,
    connection: navigator.onLine
      ? (nav.connection?.effectiveType ?? 'online')
      : 'offline',
  };
}

async function post(item: Pending, store: KeyValue) {
  const r = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...item, guest: guestId(store) }),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) {
    const error = Error(data.error ?? 'Could not send feedback.');
    (error as Error & { status?: number }).status = r.status;
    throw error;
  }
}

export type SendResult = 'sent' | 'queued';

/**
 * Send answers. When the device is offline (or the request never reaches
 * the server) the answers are kept and sent later; validation errors throw.
 */
export async function sendFeedback(
  form: LoadedForm,
  answers: Record<string, Answer>,
  extra: { subject?: string; code?: string } = {},
): Promise<SendResult> {
  const store = browserStore();
  const item: Pending = {
    form: form.id,
    answers,
    ...extra,
    ...(form.context === 'bug' ? { client: clientDetails() } : {}),
    queued: Date.now(),
  };
  try {
    await post(item, store);
    void flushOutbox();
    return 'sent';
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== undefined && status < 500 && status !== 429) throw e;
    writeOutbox(store, [...readOutbox(store), item]);
    return 'queued';
  }
}

let flushing = false;
/** Try queued submissions again (on load and when back online). */
export async function flushOutbox() {
  if (flushing || typeof navigator === 'undefined' || !navigator.onLine) return;
  flushing = true;
  const store = browserStore();
  try {
    const keep: Pending[] = [];
    const batch = readOutbox(store);
    for (const item of batch) {
      // Drop anything older than a week or rejected by the server.
      if (Date.now() - item.queued > 7 * 86400_000) continue;
      try {
        await post(item, store);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === undefined || status >= 500 || status === 429)
          keep.push(item);
      }
    }
    // Keep anything queued while this batch was being sent.
    const added = readOutbox(store).filter(
      (i) => !batch.some((b) => b.queued === i.queued && b.form === i.form),
    );
    writeOutbox(store, [...keep, ...added]);
  } finally {
    flushing = false;
  }
}
