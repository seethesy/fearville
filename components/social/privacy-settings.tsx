'use client';
import { useEffect, useState } from 'react';
import { load, social } from './api';
import { defaultPrivacy, type Privacy } from '@/lib/social/privacy-options';

export function PrivacySettings() {
  const [settings, setSettings] = useState<Privacy>(defaultPrivacy);
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void load<{ privacy: Privacy }>('/api/social')
      .then((v) => {
        if (active) {
          setSettings(v.privacy);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await social({ action: 'privacy', privacy: settings });
      setMessage('Privacy settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save settings.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel privacy-settings">
      <p className="eyebrow">PROFILE PRIVACY</p>
      <h2>Choose what you share.</h2>
      <p className="muted">
        Public means any signed-in player. Friends means accepted friends.
        Private means only you. Blocking hides your record and history in both
        directions.
      </p>
      {(['stats', 'history'] as const).map((key) => (
        <label className="field" key={key}>
          {key === 'stats' ? 'Statistics, level & Elo' : 'Match history'}
          <select
            disabled={!loaded || busy}
            value={settings[key]}
            onChange={(e) => {
              setMessage('');
              setSettings({ ...settings, [key]: e.target.value });
            }}
          >
            <option value="public">Public</option>
            <option value="friends">Friends</option>
            <option value="private">Private</option>
          </select>
        </label>
      ))}
      <label className="field">
        Friend requests
        <select
          disabled={!loaded || busy}
          value={settings.requests}
          onChange={(e) =>
            setSettings({
              ...settings,
              requests: e.target.value as Privacy['requests'],
            })
          }
        >
          <option value="everyone">Everyone</option>
          <option value="nobody">Nobody</option>
        </select>
      </label>
      <label className="field">
        Game invitations
        <select
          disabled={!loaded || busy}
          value={settings.invites}
          onChange={(e) =>
            setSettings({
              ...settings,
              invites: e.target.value as Privacy['invites'],
            })
          }
        >
          <option value="friends">Friends</option>
          <option value="nobody">Nobody</option>
        </select>
      </label>
      <button
        className="primary"
        disabled={!loaded || busy}
        onClick={() => void save()}
      >
        {busy ? 'Saving…' : 'Save privacy settings'}
      </button>
      {message && <output>{message}</output>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
