'use client';
import { useState } from 'react';
import { ITEM_CATALOG } from '@/lib/admin/catalog';
import { Upload } from 'lucide-react';
import { useAccount, accountAction } from './account-context';
import { AVATARS } from '@/lib/game/avatars';
import { type DeathEffectId } from '@/lib/game/cosmetics';
import { HANDLE_COOLDOWN } from '@/lib/accounts/preferences';
import { PlayerAvatar } from '@/components/player-avatar';
import { DeathEffectPicker } from '@/components/death-effect-picker';
import { portrait } from '@/components/avatar-picker';
export function ProfileEditor() {
  const { state, refresh } = useAccount();
  const [avatar, setAvatar] = useState(state?.profile?.avatar || 'ghost');
  const [deathEffect, setDeathEffect] = useState<DeathEffectId>(
    state?.profile?.deathEffect || 'spirit',
  );
  const [lobbyName, setLobbyName] = useState(
    state?.profile?.lobbyName || state?.account?.name || '',
  );
  const [handle, setHandle] = useState(state?.account?.handle || '');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const nextChange = state?.account?.handleChangedAt
    ? state.account.handleChangedAt + HANDLE_COOLDOWN
    : 0;
  const [now] = useState(Date.now);
  const locked = nextChange > now;
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await accountAction(body);
      await refresh();
      setNotice(
        body.action === 'handle'
          ? 'Username updated.'
          : 'Profile saved. These defaults apply when you join your next lobby.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel profile-editor">
      <div className="profile-identity">
        <div className="profile-portrait">
          <PlayerAvatar avatar={avatar} id="profile-preview" />
        </div>
        <div>
          <p className="eyebrow">YOUR IDENTITY</p>
          <h2>
            {state?.account?.handle
              ? '@' + state.account.handle
              : 'Make yourself known.'}
          </h2>
          <p className="muted">Your look, at every table.</p>
        </div>
      </div>
      {!!state?.items?.length && <section><h3>Awarded items</h3><ul>{state.items.map(id=><li key={id}>{ITEM_CATALOG.find(item=>item.id===id)?.name ?? id}</li>)}</ul></section>}
      <details className="profile-options">
        <summary className="secondary">Edit profile & cosmetics</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({ action: 'handle', handle });
          }}
        >
          <label className="field">
            Unique username
            <div className="input-action">
              <input
                value={handle}
                disabled={busy || locked}
                onChange={(e) => setHandle(e.target.value)}
                maxLength={20}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                pattern="[A-Za-z0-9_]{3,20}"
                placeholder="your_username"
                required
              />
              <button
                className="secondary"
                disabled={
                  busy ||
                  locked ||
                  handle.toLowerCase() === state?.account?.handle ||
                  handle.length < 3
                }
              >
                Save username
              </button>
            </div>
          </label>
          <p className="hint">
            {locked
              ? 'You can change your username again on ' +
                new Date(nextChange).toLocaleDateString() +
                '.'
              : '3–20 letters, numbers, or underscores. Not case-sensitive. Changes are allowed once every 30 days.'}
          </p>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({ action: 'profile', lobbyName, avatar, deathEffect });
          }}
        >
          <label className="field">
            Default lobby name
            <input
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              maxLength={32}
              autoComplete="off"
              required
            />
          </label>
          <p className="hint">
            Your name at the table. Other players can use the same name.
          </p>
          <fieldset>
            <legend>Default avatar</legend>
            <div className="preset-grid">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={avatar === a.id ? 'selected' : ''}
                  aria-label={a.name}
                  title={a.name}
                  aria-pressed={avatar === a.id}
                  onClick={() => setAvatar(a.id)}
                >
                  <PlayerAvatar id={'preset-' + a.id} avatar={a.id} />
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
            <label className="secondary upload-button">
              <Upload size={17} />
              Upload a photo
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setError('');
                  try {
                    setAvatar(await portrait(file));
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'Could not upload.',
                    );
                  } finally {
                    setBusy(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <p className="hint">
              JPG, PNG, or WebP, up to 8 MB. Preset collisions get a temporary
              random icon for that lobby. Your saved default stays the same.
            </p>
          </fieldset>
          <fieldset>
            <legend>Death animation</legend>
            <DeathEffectPicker
              value={deathEffect}
              onChange={setDeathEffect}
              avatar={avatar}
              playerId="profile-preview"
              disabled={busy}
            />
          </fieldset>
          <button className="primary" disabled={busy || !lobbyName.trim()}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </details>
      {notice && <output className="success">{notice}</output>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
