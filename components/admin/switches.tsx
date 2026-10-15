'use client';
// FEAR-122: view and edit remote switches per environment. Every change is
// audited; kills need a confirmation.
import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '@/components/ui-text';
import {
  PLATFORMS,
  type Builds,
  type Flags,
  type Maintenance,
  type SwitchDef,
  type SwitchState,
} from '@/lib/flags/catalog';

type Row = {
  key: string;
  value: string;
  updated_by: string;
  updated_at: number;
};
type Environment = { name: string; rows: Row[]; flags: Flags };
type Overview = { catalog: SwitchDef[]; environments: Environment[] };

export function RemoteSwitches() {
  const [data, setData] = useState<Overview | null>(null),
    [environment, setEnvironment] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState<{
      key: string;
      label: string;
      token: string;
    } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin?view=switches');
      const d = (await r.json()) as Overview & { error?: string };
      if (!r.ok) throw Error(d.error);
      setData(d);
      setEnvironment((e) => e || d.environments[0]?.name || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load switches.');
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function save(key: string, value: unknown, confirmation?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest({
        action: 'switch',
        environment,
        key,
        value,
        ...(confirmation ? { confirmation } : {}),
      });
      if (result.confirmationRequired) {
        setPending({
          key,
          label: data?.catalog.find((s) => s.key === key)?.label ?? key,
          token: result.confirmation ?? '',
        });
        return;
      }
      setPending(null);
      setNotice(
        `Saved ${key} on ${environment}. Players see it within about 30 seconds.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  const env = data?.environments.find((e) => e.name === environment);
  if (!data || !env)
    return (
      <section className="panel">
        <h2>Remote switches</h2>
        {error ? <p className="error">{error}</p> : <p>Loading…</p>}
      </section>
    );
  const row = (key: string) => env.rows.find((r) => r.key === key);
  const groups = [...new Set(data.catalog.map((s) => s.group))];
  return (
    <section className="panel admin-switches">
      <h2>Remote switches</h2>
      <p>
        Off affects new games and new requests. Kill also ends the feature in
        running games. Changes reach every server within about 30 seconds.
      </p>
      {data.environments.length > 1 && (
        <fieldset
          className="admin-actions admin-inline"
          aria-label="Environment"
        >
          {data.environments.map((e) => (
            <button
              key={e.name}
              className={e.name === environment ? 'primary' : 'secondary'}
              aria-pressed={e.name === environment}
              onClick={() => {
                setEnvironment(e.name);
                setPending(null);
              }}
            >
              {e.name}
            </button>
          ))}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p aria-live="polite">{notice}</p>}
      {pending && (
        <div className="admin-confirm" role="alert">
          <p>
            Kill <strong>{pending.label}</strong> on{' '}
            <strong>{environment}</strong>? It turns off and ends in every
            running game.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void save(pending.key, 'kill', pending.token)}
          >
            Confirm kill
          </button>
          <button className="secondary" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}
      {groups.map((group) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          {data.catalog
            .filter((s) => s.group === group)
            .map((s) => {
              const current: SwitchState = env.flags.switches[s.key] ?? 'on';
              const saved = row(s.key);
              return (
                <div className="admin-switch-row" key={s.key}>
                  <div>
                    <strong>{s.label}</strong> <code>{s.key}</code>
                    {s.reserved && (
                      <small> · takes effect when this feature ships</small>
                    )}
                    {saved && (
                      <small>
                        {' '}
                        · {new Date(saved.updated_at).toLocaleString()}
                      </small>
                    )}
                  </div>
                  <fieldset
                    className="admin-actions admin-inline"
                    aria-label={s.label}
                  >
                    {(
                      [
                        'on',
                        'off',
                        ...(s.killable ? ['kill'] : []),
                      ] as SwitchState[]
                    ).map((value) => (
                      <button
                        key={value}
                        className={current === value ? 'primary' : 'secondary'}
                        aria-pressed={current === value}
                        disabled={busy || current === value}
                        onClick={() => void save(s.key, value)}
                      >
                        {value}
                      </button>
                    ))}
                  </fieldset>
                </div>
              );
            })}
        </fieldset>
      ))}
      <BannerForm
        key={'banner:' + environment + (row('maintenance')?.updated_at ?? 0)}
        value={env.flags.maintenance}
        busy={busy}
        save={(value) => void save('maintenance', value)}
      />
      <BuildsForm
        key={'builds:' + environment + (row('builds')?.updated_at ?? 0)}
        value={env.flags.builds}
        busy={busy}
        save={(value) => void save('builds', value)}
      />
    </section>
  );
}

function BannerForm({
  value,
  busy,
  save,
}: {
  value: Maintenance | null;
  busy: boolean;
  save: (value: Maintenance | null) => void;
}) {
  const [text, setText] = useState(value?.text ?? ''),
    [severity, setSeverity] = useState(value?.severity ?? 'info'),
    [newGamesDisabled, setNew] = useState(value?.newGamesDisabled ?? false);
  return (
    <form
      className="admin-filters"
      onSubmit={(e) => {
        e.preventDefault();
        save({ text, severity, newGamesDisabled });
      }}
    >
      <h3>Maintenance banner</h3>
      <label className="field">
        Text
        <input
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="field">
        Severity
        <select
          value={severity}
          onChange={(e) =>
            setSeverity(e.target.value as Maintenance['severity'])
          }
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={newGamesDisabled}
          onChange={(e) => setNew(e.target.checked)}
        />{' '}
        Pause new games
      </label>
      <button className="primary" disabled={busy || !text.trim()}>
        Show banner
      </button>
      <button
        type="button"
        className="secondary"
        disabled={busy || !value}
        onClick={() => save(null)}
      >
        Remove banner
      </button>
    </form>
  );
}

function BuildsForm({
  value,
  busy,
  save,
}: {
  value: Builds;
  busy: boolean;
  save: (value: Builds) => void;
}) {
  const [draft, setDraft] = useState<Builds>(value);
  return (
    <form
      className="admin-filters"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
    >
      <h3>App builds</h3>
      <p>
        Builds below the minimum must update; below the recommended build see a
        dismissible notice. 0 turns a limit off.
      </p>
      {PLATFORMS.map((platform) => {
        const p = draft[platform] ?? {
          minimum: 0,
          recommended: 0,
          updateUrl: '',
        };
        const set = (patch: Partial<typeof p>) =>
          setDraft((d) => ({ ...d, [platform]: { ...p, ...patch } }));
        return (
          <fieldset key={platform}>
            <legend>{platform === 'ios' ? 'iOS' : 'Android'}</legend>
            <label className="field">
              Minimum build
              <input
                type="number"
                min={0}
                value={p.minimum}
                onChange={(e) => set({ minimum: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              Recommended build
              <input
                type="number"
                min={0}
                value={p.recommended}
                onChange={(e) =>
                  set({ recommended: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label className="field">
              Update link (https, optional)
              <input
                type="url"
                value={p.updateUrl}
                onChange={(e) => set({ updateUrl: e.target.value.trim() })}
              />
            </label>
          </fieldset>
        );
      })}
      <button className="primary" disabled={busy}>
        Save builds
      </button>
    </form>
  );
}
