'use client';
import { useEffect, useState } from 'react';
import { accountAction, useAccount } from '@/components/hub/account-context';
import { UiText, adminRequest, useTextEditor } from '@/components/ui-text';
import { UI_TEXT, type TextKey } from '@/lib/ui-text/registry';
import { ReportQueue } from './reports';
type Entry = { command: string; output: unknown };
export default function AdminShell() {
  const { refresh } = useAccount();
  const text = useTextEditor();
  const [tab, setTab] = useState('console'),
    [input, setInput] = useState(''),
    [entries, setEntries] = useState<Entry[]>([]),
    [commands, setCommands] = useState<string[]>([]),
    [cursor, setCursor] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmation, setConfirmation] = useState<string | null>(null),
    [confirmationToken, setConfirmationToken] = useState('');
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]),
    [action, setAction] = useState(''),
    [target, setTarget] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function run(command: string, confirmed = false) {
    setBusy(true);
    setError('');
    try {
      const data = await adminRequest({
        command,
        ...(confirmed ? { confirmation: confirmationToken } : {}),
      });
      setEntries((e) => [...e.slice(-99), { command, output: data.output }]);
      if (data.confirmationRequired) {
        setConfirmation(command);
        setConfirmationToken(data.confirmation ?? '');
      } else {
        setConfirmation(null);
        setInput('');
      }
      if (!confirmed) {
        setCommands((h) => [...h, command]);
        setCursor(commands.length + 1);
      }
      await text.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed.');
      setConfirmation(null);
    } finally {
      setBusy(false);
    }
  }
  async function loadAudit(page = 0) {
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({
        action,
        target,
        from,
        to,
        offset: String(page),
      });
      const r = await fetch('/api/admin?' + query);
      const d = (await r.json()) as {
        error?: string;
        audit: Record<string, unknown>[];
      };
      if (!r.ok) throw Error(d.error);
      setAudit(d.audit);
      setOffset(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load audit.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-shell">
      <header>
        <div>
          <p className="eyebrow">FEARVILLE · ADMIN ACCOUNT</p>
          <h1>Administration</h1>
          <p>Console, table oversight, and official text.</p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            void accountAction({ action: 'signout' })
              .then(() => refresh())
              .catch((e) => setError(e.message));
          }}
        >
          Sign out
        </button>
      </header>
      <nav aria-label="Administration">
        {['console', 'reports', 'text', 'audit'].map((t) => (
          <button
            key={t}
            className={tab === t ? 'primary' : 'secondary'}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              setTab(t);
              if (t === 'audit') void loadAudit();
            }}
          >
            {t === 'console'
              ? 'Developer console'
              : t === 'reports' ? 'Moderation queue' : t === 'text'
                ? 'Edit official text'
                : 'Audit log'}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {tab === 'reports' && <ReportQueue />}
      {tab === 'console' && (
        <section className="panel">
          <h2>Developer console</h2>
          <p>
            Use <code>help</code> for commands and <code>catalog</code> for item
            IDs. Accounts accept a username or ID.
          </p>
          <div
            className="admin-scrollback"
            role="log"
            aria-label="Command output"
          >
            {entries.length === 0 && <p>Ready. Every command is audited.</p>}
            {entries.map((entry, i) => (
              <article key={i}>
                <strong>› {entry.command}</strong>
                <pre>{JSON.stringify(entry.output, null, 2)}</pre>
              </article>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(input);
            }}
          >
            <label className="field">
              Command
              <input
                autoComplete="off"
                spellCheck={false}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setConfirmation(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = Math.max(
                      0,
                      Math.min(
                        commands.length,
                        cursor + (e.key === 'ArrowUp' ? -1 : 1),
                      ),
                    );
                    setCursor(next);
                    setInput(commands[next] ?? '');
                  }
                }}
                placeholder="help"
                maxLength={2000}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !input.trim() || !!confirmation}
            >
              Run command
            </button>
          </form>
          {confirmation && (
            <div className="admin-confirm" role="alert">
              <p>
                Review the before/after preview above. Apply{' '}
                <strong>{confirmation}</strong>?
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void run(confirmation, true)}
              >
                Confirm command
              </button>
              <button
                className="secondary"
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      )}
      {tab === 'text' && (
        <section>
          <div className="admin-actions">
            <h2>Official text preview</h2>
            <label>
              <input
                type="checkbox"
                checked={text.edit}
                onChange={(e) => text.setEdit(e.target.checked)}
              />{' '}
              Edit mode
            </label>
          </div>
          <p>
            Turn on edit mode, then click highlighted text. Saves are published
            to connected clients within a few seconds.
          </p>
          <div className="panel">
            <h1>
              <UiText id="home.welcome" />
            </h1>
            <p>
              <UiText id="home.tagline" />
            </p>
            <h2>
              <UiText id="home.choose" />
            </h2>
            <p>
              <UiText id="home.subtitle" />
            </p>
            <div className="admin-actions">
              <UiText id="home.create" />
              <UiText id="home.join" />
              <UiText id="home.sandbox" />
            </div>
          </div>
          {['home', 'lobby', 'flow', 'nav', 'footer', 'tutorial'].map(
            (group) => (
              <section className="panel" key={group}>
                <h2>{group === 'tutorial' ? 'Tutorials' : group}</h2>
                {(Object.keys(UI_TEXT) as TextKey[])
                  .filter((key) => key.startsWith(group + '.'))
                  .map((key) => (
                    <div className="admin-text-row" key={key}>
                      <small>{key}</small>
                      <p>
                        <UiText id={key} values={{ count: 8 }} />
                      </p>
                    </div>
                  ))}
              </section>
            ),
          )}
        </section>
      )}
      {tab === 'audit' && (
        <section className="panel">
          <h2>Audit log</h2>
          <form
            className="admin-filters"
            onSubmit={(e) => {
              e.preventDefault();
              void loadAudit();
            }}
          >
            <label>
              Action
              <input
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </label>
            <label>
              Target
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <label>
              From
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Filter
            </button>
          </form>
          <p>Newest first. Entries are immutable.</p>
          {audit.map((row) => (
            <details key={String(row.id)}>
              <summary>
                {new Date(Number(row.at)).toLocaleString()} ·{' '}
                {String(row.action)} · {String(row.result)} ·{' '}
                {String(row.target)}
              </summary>
              <pre>{JSON.stringify(row, null, 2)}</pre>
            </details>
          ))}
          <div className="admin-actions">
            <button
              disabled={busy || offset === 0}
              onClick={() => void loadAudit(Math.max(0, offset - 100))}
            >
              Newer
            </button>
            <button
              disabled={busy || audit.length < 100}
              onClick={() => void loadAudit(offset + 100)}
            >
              Older
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
