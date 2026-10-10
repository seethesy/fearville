'use client';
import { useEffect, useState } from 'react';
import { useAccount, accountAction } from './account-context';
import { load, social } from '@/components/social/api';
import { defaultPrivacy, type Privacy } from '@/lib/social/privacy-options';
export function SettingsPanel() {
  const { preferences, preview, refresh } = useAccount();
  const [privacy, setPrivacy] = useState(defaultPrivacy),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void load<{ privacy: Privacy }>('/api/social')
      .then((v) => {
        if (live) {
          setPrivacy(v.privacy);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await accountAction({ action: 'preferences', settings: preferences });
      await social({ action: 'privacy', privacy });
      await refresh();
      setMessage('Settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel">
      <h2>Sound & comfort</h2>
      {(['music', 'sfx'] as const).map((key) => (
        <label className="mixer-field" key={key}>
          <span>
            {key === 'music' ? 'Music' : 'Sound effects'}
            <output>{preferences[key]}%</output>
          </span>
          <input
            type="range"
            aria-label={
              key === 'music' ? 'Music volume' : 'Sound effects volume'
            }
            min="0"
            max="100"
            value={preferences[key]}
            onChange={(e) =>
              preview({ ...preferences, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      {(
        [
          ['muteInBackground', 'Mute when the app is in the background'],
          ['reducedMotion', 'Reduce motion and death animations'],
          ['largerText', 'Larger text'],
          ['showOnline', 'Show online status to friends'],
        ] as const
      ).map(([key, label]) => (
        <label className="check-setting" key={key}>
          <input
            type="checkbox"
            checked={preferences[key]}
            onChange={(e) =>
              preview({ ...preferences, [key]: e.target.checked })
            }
          />
          <span>{label}</span>
        </label>
      ))}
      <h2>Privacy & social</h2>
      <label className="check-setting">
        <input
          type="checkbox"
          disabled={!loaded}
          checked={privacy.stats === 'public'}
          onChange={(e) =>
            setPrivacy({
              ...privacy,
              stats: e.target.checked ? 'public' : 'friends',
            })
          }
        />
        <span>
          Public profile statistics
          <small>
            Controls access to your statistics. Your username remains
            searchable.
          </small>
        </span>
      </label>
      <label className="check-setting">
        <input
          type="checkbox"
          disabled={!loaded}
          checked={privacy.requests === 'everyone'}
          onChange={(e) =>
            setPrivacy({
              ...privacy,
              requests: e.target.checked ? 'everyone' : 'nobody',
            })
          }
        />
        <span>Receive friend requests</span>
      </label>
      <label className="field">
        Record visibility
        <select
          disabled={!loaded}
          value={privacy.stats}
          onChange={(e) =>
            setPrivacy({
              ...privacy,
              stats: e.target.value as Privacy['stats'],
            })
          }
        >
          <option value="public">Public</option>
          <option value="friends">Friends</option>
          <option value="private">Only me</option>
        </select>
      </label>
      <label className="field">
        Game history visibility
        <select
          disabled={!loaded}
          value={privacy.history}
          onChange={(e) =>
            setPrivacy({
              ...privacy,
              history: e.target.value as Privacy['history'],
            })
          }
        >
          <option value="public">Public</option>
          <option value="friends">Friends</option>
          <option value="private">Only me</option>
        </select>
      </label>
      <label className="field">
        Game invitations
        <select
          disabled={!loaded}
          value={privacy.invites}
          onChange={(e) =>
            setPrivacy({
              ...privacy,
              invites: e.target.value as Privacy['invites'],
            })
          }
        >
          <option value="friends">Friends</option>
          <option value="nobody">Nobody</option>
        </select>
      </label>
      <p className="hint">
        Detailed recaps are only accessible to participants. Blocking hides your
        profile record and history in both directions.
      </p>
      <button
        className="primary"
        disabled={busy || !loaded}
        onClick={() => void save()}
      >
        {busy ? 'Saving…' : 'Save settings'}
      </button>
      {message && <output className="success">{message}</output>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
