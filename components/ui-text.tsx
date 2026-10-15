'use client';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAccount } from '@/components/hub/account-context';
import {
  UI_TEXT,
  formatText,
  textFormat,
  textGroup,
  type TextKey,
} from '@/lib/ui-text/registry';
import { diffWords } from '@/lib/ui-text/diff';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  type Draft,
  type Override,
  TextContext,
  useLiveText,
} from './text-context';
import { MarkdownText } from './markdown-text';

export { useLiveText } from './text-context';

type Version = {
  id: number;
  value: string;
  at: number;
  editor: string;
  summary: string | null;
};

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

// FEAR-173: wiki edits go through /api/ui-text (admin or trusted editors).
async function textRequest(body: Record<string, unknown>) {
  const r = await fetch('/api/ui-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as { error?: string };
  if (!r.ok) throw Error(data.error ?? 'Could not save.');
  return data;
}

export function TextProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAccount();
  const accountId = state?.account?.id;
  const [overrides, setOverrides] = useState<Record<string, Override>>({}),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [role, setRole] = useState({ editor: false, admin: false }),
    [edit, setEdit] = useState(false),
    [key, select] = useState<string | null>(null);
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
  const refreshDrafts = useCallback(async () => {
    try {
      const r = await fetch('/api/ui-text?view=drafts', { cache: 'no-store' });
      if (r.ok)
        setDrafts(
          ((await r.json()) as { drafts: Record<string, Draft> }).drafts,
        );
    } catch {
      /* Keep the last drafts. */
    }
  }, []);
  useEffect(() => {
    let live = true;
    if (!accountId) {
      const t = setTimeout(() => setRole({ editor: false, admin: false }), 0);
      return () => clearTimeout(t);
    }
    void fetch('/api/ui-text?view=me', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ editor?: boolean; admin?: boolean }>)
      .then((d) => {
        if (live) setRole({ editor: !!d.editor, admin: !!d.admin });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [accountId]);
  const canEdit = role.editor;
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) {
        await refresh();
        if (edit && canEdit) await refreshDrafts();
      }
      if (!stopped) timer = setTimeout(poll, edit ? 5000 : 3000);
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
  }, [refresh, refreshDrafts, edit, canEdit]);
  const both = async () => {
    await Promise.all([refresh(), refreshDrafts()]);
  };
  return (
    <TextContext.Provider
      value={{
        overrides,
        drafts,
        edit: edit && canEdit,
        canEdit,
        admin: role.admin,
        setEdit,
        select: (k) => {
          if (Object.hasOwn(UI_TEXT, k)) select(k);
        },
        refresh: both,
      }}
    >
      {children}
      {canEdit && (
        <button
          type="button"
          className={'text-edit-toggle ' + (edit ? 'primary' : 'secondary')}
          aria-pressed={edit}
          onClick={() => setEdit(!edit)}
        >
          <Pencil aria-hidden="true" size={14} />{' '}
          {edit ? 'Editing text' : 'Edit text'}
        </button>
      )}
      {key && canEdit && (
        <TextEditorDialog
          key={key}
          textKey={key}
          override={overrides[key]}
          draft={drafts[key]}
          onClose={() => select(null)}
          onChanged={both}
        />
      )}
    </TextContext.Provider>
  );
}

function Preview({ textKey, value }: { textKey: string; value: string }) {
  return textFormat(textKey) === 'markdown' ? (
    <div className="text-preview">
      <MarkdownText text={value} />
    </div>
  ) : (
    <p className="text-preview admin-plain">{value}</p>
  );
}

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <p className="text-diff admin-plain">
      {diffWords(before, after).map((p, i) =>
        p.t === 'same' ? (
          <span key={i}>{p.v}</span>
        ) : p.t === 'add' ? (
          <ins key={i}>{p.v}</ins>
        ) : (
          <del key={i}>{p.v}</del>
        ),
      )}
    </p>
  );
}

function TextEditorDialog({
  textKey,
  override,
  draft,
  onClose,
  onChanged,
}: {
  textKey: string;
  override?: Override;
  draft?: Draft;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const fallback = UI_TEXT[textKey];
  const published = override?.value ?? fallback;
  const [value, setValue] = useState(draft?.value ?? published),
    [summary, setSummary] = useState(draft?.summary ?? ''),
    [saved, setSaved] = useState<{ value: string; summary: string } | null>(
      draft ? { value: draft.value, summary: draft.summary ?? '' } : null,
    ),
    [tab, setTab] = useState<'write' | 'preview'>('write'),
    [history, setHistory] = useState<Version[] | null>(null),
    [compare, setCompare] = useState<number | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const markdown = textFormat(textKey) === 'markdown';
  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(
        '/api/ui-text?view=history&key=' + encodeURIComponent(textKey),
        { cache: 'no-store' },
      );
      const d = (await r.json()) as { error?: string; history: Version[] };
      if (!r.ok) throw Error(d.error);
      setHistory(d.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
    }
  }, [textKey]);
  useEffect(() => {
    const t = setTimeout(() => void loadHistory(), 0);
    return () => clearTimeout(t);
  }, [loadHistory]);
  const unsaved =
    value !== (saved?.value ?? published) ||
    (!!saved && summary !== saved.summary);
  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await textRequest({ key: textKey, ...body });
      setNotice(done);
      await Promise.all([onChanged(), loadHistory()]);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const versions = history ?? [];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="admin-text-dialog">
        <DialogHeader>
          <DialogTitle>Edit official text</DialogTitle>
          <DialogDescription>
            {textGroup(textKey)} · <code>{textKey}</code> ·{' '}
            {markdown
              ? 'Markdown: **bold**, *italic*, - lists, [link](https://…), [[Glossary term]].'
              : 'Plain text.'}{' '}
            Keep named placeholders such as {'{count}'} intact. Changes reach
            players only when you publish.
          </DialogDescription>
        </DialogHeader>
        <p className="hint">
          {saved
            ? `Draft ${draft ? `by ${draft.editor}` : ''} — not live yet.`
            : override
              ? `Live: version ${override.version}.`
              : 'Live: the bundled default.'}
        </p>
        <div className="admin-actions" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'write'}
            className={tab === 'write' ? 'primary' : 'secondary'}
            onClick={() => setTab('write')}
          >
            Write
          </button>
          <button
            role="tab"
            aria-selected={tab === 'preview'}
            className={tab === 'preview' ? 'primary' : 'secondary'}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
        {tab === 'write' ? (
          <label className="field">
            Text
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={4000}
              rows={markdown ? 10 : 3}
            />
          </label>
        ) : (
          <Preview textKey={textKey} value={value} />
        )}
        {value !== published && (
          <details>
            <summary>Changes from the live text</summary>
            <Diff before={published} after={value} />
          </details>
        )}
        <label className="field">
          Edit summary
          <input
            value={summary}
            maxLength={200}
            placeholder="What changed and why"
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <output className="hint">{notice}</output>}
        <div className="admin-actions">
          <button
            className="secondary"
            disabled={busy || !unsaved}
            onClick={async () => {
              if (
                await act(
                  { action: 'draft', value, summary },
                  'Draft saved. Players still see the live text.',
                )
              )
                setSaved({ value, summary });
            }}
          >
            Save draft
          </button>
          <button
            className="primary"
            disabled={busy || !saved || unsaved}
            title={
              unsaved ? 'Save the draft first' : !saved ? 'No draft' : undefined
            }
            onClick={async () => {
              if (
                await act(
                  { action: 'publish', version: override?.version ?? 0 },
                  'Published. Players see it within a few seconds.',
                )
              )
                setSaved(null);
            }}
          >
            Publish this field
          </button>
          {saved && (
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                if (await act({ action: 'discard' }, 'Draft discarded.')) {
                  setSaved(null);
                  setValue(published);
                  setSummary('');
                }
              }}
            >
              Discard draft
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <details>
          <summary>History ({versions.length + 1} versions)</summary>
          <ol className="text-history">
            {versions.map((v, i) => {
              const older = versions[i + 1]?.value ?? fallback;
              return (
                <li key={v.id}>
                  <div>
                    <strong>Version {v.id}</strong> ·{' '}
                    {new Date(v.at).toLocaleString()} · {v.editor}
                    {i === 0 && ' · live'}
                  </div>
                  {v.summary && <em>{v.summary}</em>}
                  <div className="admin-actions">
                    <button
                      className="secondary"
                      aria-expanded={compare === v.id}
                      onClick={() =>
                        setCompare(compare === v.id ? null : v.id)
                      }
                    >
                      {compare === v.id ? 'Hide changes' : 'Show changes'}
                    </button>
                    {i > 0 && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            { action: 'revert', to: v.id },
                            `Reverted to version ${v.id}.`,
                          )
                        }
                      >
                        Revert to this
                      </button>
                    )}
                  </div>
                  {compare === v.id && <Diff before={older} after={v.value} />}
                </li>
              );
            })}
            <li>
              <div>
                <strong>Default</strong> · bundled with the app
                {versions.length === 0 && ' · live'}
              </div>
              {versions.length > 0 && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      { action: 'revert', to: 0 },
                      'Reset to the default text.',
                    )
                  }
                >
                  Revert to default
                </button>
              )}
            </li>
          </ol>
        </details>
      </DialogContent>
    </Dialog>
  );
}

export const useTextEditor = () => useContext(TextContext);
export function useText() {
  const live = useLiveText();
  return (key: TextKey, values?: Record<string, string | number>) =>
    formatText(live(key), values);
}

/**
 * Editable official text. In edit mode an admin or trusted editor sees a
 * pencil to open the editor; drafts show with a dashed outline.
 * Markdown keys render as blocks unless `inline` (inside a <p> or heading).
 */
export function UiText({
  id,
  values,
  fallback,
  inline,
}: {
  id: TextKey;
  values?: Record<string, string | number>;
  fallback?: string;
  inline?: boolean;
}) {
  const context = useContext(TextContext);
  const live = useLiveText();
  const raw = formatText(live(id, fallback), values);
  const content =
    textFormat(id) === 'markdown' ? (
      <MarkdownText text={raw} inline={inline} />
    ) : (
      raw
    );
  if (!context.edit || !Object.hasOwn(UI_TEXT, id)) return <>{content}</>;
  const Wrapper = textFormat(id) === 'markdown' && !inline ? 'div' : 'span';
  return (
    <Wrapper
      className={'editable-text' + (context.drafts[id] ? ' has-draft' : '')}
      title={id + (context.drafts[id] ? ' (draft)' : '')}
    >
      {content}
      <button
        type="button"
        className="edit-pencil"
        aria-label={`Edit text ${id}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          context.select(id);
        }}
      >
        <Pencil aria-hidden="true" size={12} />
      </button>
    </Wrapper>
  );
}
