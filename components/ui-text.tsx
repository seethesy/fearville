'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAccount } from '@/components/hub/account-context';
import { UI_TEXT, formatText, type TextKey } from '@/lib/ui-text/registry';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
type Override = { value: string; version: number };
type Version = { id: number; value: string; at: number; admin: string };
const Context = createContext({
  overrides: {} as Record<string, Override>,
  edit: false,
  setEdit: (_value: boolean) => {},
  select: (_key: TextKey) => {},
  refresh: async () => {},
});
export async function adminRequest(body: Record<string, unknown>) {
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as {
    error?: string;
    output?: unknown;
    confirmationRequired?: boolean;
    confirmation?: string;
  };
  if (!r.ok) throw Error(data.error ?? 'Could not save.');
  return data;
}
export function TextProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAccount();
  const admin = state?.account?.role === 'admin';
  const [overrides, setOverrides] = useState<Record<string, Override>>({}),
    [edit, setEdit] = useState(false),
    [key, select] = useState<TextKey | null>(null);
  const [value, setValue] = useState(''),
    [version, setVersion] = useState(0),
    [history, setHistory] = useState<Version[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/ui-text', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok)
        setOverrides(
          ((await r.json()) as { overrides: Record<string, Override> })
            .overrides,
        );
    } catch {
      /* Bundled defaults and last good values remain available. */
    }
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) await refresh();
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    void poll();
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);
  const open = (selected: TextKey) => {
    select(selected);
    setValue(overrides[selected]?.value ?? UI_TEXT[selected]);
    setVersion(overrides[selected]?.version ?? 0);
    setError('');
    setHistory([]);
    void fetch('/api/admin?view=history&key=' + encodeURIComponent(selected))
      .then(async (r) => {
        const d = (await r.json()) as { error?: string; history: Version[] };
        if (!r.ok) throw Error(d.error);
        setHistory(d.history);
      })
      .catch((e) => setError(e.message));
  };
  const save = async (reset = false) => {
    if (!key) return;
    setBusy(true);
    setError('');
    try {
      await adminRequest({ action: 'text', key, value, version, reset });
      await refresh();
      select(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{ overrides, edit: edit && admin, setEdit, select: open, refresh }}
    >
      {children}
      <Dialog
        open={!!key && admin}
        onOpenChange={(v) => {
          if (!v) select(null);
        }}
      >
        <DialogContent className="admin-text-dialog">
          <DialogHeader>
            <DialogTitle>Edit official text</DialogTitle>
          </DialogHeader>
          <code>{key}</code>
          <p>Plain text. Keep named placeholders such as {'{count}'} intact.</p>
          <label className="field">
            Published text
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={4000}
              rows={5}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="admin-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              Save and publish
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Reset to default
            </button>
            <button className="secondary" onClick={() => select(null)}>
              Cancel
            </button>
          </div>
          <details>
            <summary>Version history ({history.length})</summary>
            {history.map((h) => (
              <article key={h.id}>
                <small>
                  Version {h.id} · {new Date(h.at).toLocaleString()}
                </small>
                <p className="admin-plain">{h.value}</p>
                <button
                  disabled={busy}
                  onClick={() => {
                    setValue(h.value);
                  }}
                >
                  Preview this version
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void adminRequest({ command: `text revert ${key} ${h.id}` })
                      .then(async () => {
                        await refresh();
                        select(null);
                      })
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Revert and publish
                </button>
              </article>
            ))}
          </details>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
export const useTextEditor = () => useContext(Context);
export function useText() {
  const { overrides } = useContext(Context);
  return (key: TextKey, values?: Record<string, string | number>) =>
    formatText(overrides[key]?.value ?? UI_TEXT[key], values);
}
export function UiText({
  id,
  values,
}: {
  id: TextKey;
  values?: Record<string, string | number>;
}) {
  const context = useContext(Context);
  const text = formatText(context.overrides[id]?.value ?? UI_TEXT[id], values);
  return context.edit ? (
    <button
      type="button"
      className="editable-text"
      title={id}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        context.select(id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          context.select(id);
        }
      }}
    >
      {text}
    </button>
  ) : (
    <>{text}</>
  );
}
