'use client';
import { useState } from 'react';
import { AVATARS, defaultAvatar } from '@/lib/game/avatars';
import type { GameView } from '@/lib/game/view';
import { PlayerAvatar } from './player-avatar';
import { DEATH_EFFECTS, type DeathEffectId } from '@/lib/game/cosmetics';
import { DeathEffect } from './death-effect';

export async function portrait(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('Choose a JPG, PNG, or WebP photo.');
  if (file.size > 8 * 1024 * 1024)
    throw Error('Choose a photo smaller than 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Your browser could not prepare this photo.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = '#202b34';
    context.fillRect(0, 0, 128, 128);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      128,
      128,
    );
    for (const quality of [0.85, 0.7, 0.5, 0.3]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 16000) return data;
    }
    throw Error('This photo is too detailed. Try a simpler image.');
  } finally {
    bitmap.close();
  }
}

export function AvatarPicker({
  game,
  refresh,
}: {
  game: GameView;
  refresh: () => Promise<void>;
}) {
  const me = game.players.find((p) => p.id === game.me);
  const [choice, setChoice] = useState<string | null>(null);
  const [effect, setEffect] = useState<DeathEffectId | null>(null);
  const [preview, setPreview] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (!me) return null;
  if (game.phase !== 'lobby')
    return (
      <section className="panel avatar-picker">
        <h2>Your appearance</h2>
        <div className="avatar-preview">
          <PlayerAvatar avatar={me.avatar} id={me.id} />
          <strong>{me.name}</strong>
        </div>
        <p className="muted">
          Appearance is locked during the game. Change your avatar and death
          effect when you return to the pregame lobby.
        </p>
      </section>
    );
  const selected = choice ?? me.avatar ?? defaultAvatar(me.id);
  const ownerOf = (avatar: string) =>
    AVATARS.some((a) => a.id === avatar)
      ? game.players.find((p) => p.id !== me.id && p.avatar === avatar)
      : undefined;
  const selectedEffect = effect ?? me.deathEffect;
  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setAvatar',
          avatar: selected,
          deathEffect: selectedEffect,
          version: game.version,
          ...(game.sandboxHost ? { pov: game.me } : {}),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw Error(result.error || 'Unable to save your avatar.');
      await refresh();
      setChoice(null);
      setEffect(null);
      setNotice('Appearance saved for this table.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save your avatar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel avatar-picker">
      <h2>Your appearance</h2>
      <p className="muted">
        Choose a face for the town. Each preset belongs to one seat. Appearance
        locks when the game starts.
      </p>
      <div className="avatar-preview">
        <div className="cosmetic-preview-stage">
          <PlayerAvatar avatar={selected} id={me.id} />
        </div>
        <strong>{me.name}</strong>
      </div>
      <fieldset className="avatar-options" aria-label="Preset avatars">
        {AVATARS.map((a) => (
          <button
            type="button"
            className="secondary"
            key={a.id}
            aria-pressed={selected === a.id}
            disabled={busy || !!ownerOf(a.id)}
            title={ownerOf(a.id) ? `Taken by ${ownerOf(a.id)!.name}` : a.name}
            onClick={() => {
              setChoice(a.id);
              setNotice('');
              setError('');
            }}
          >
            <PlayerAvatar avatar={a.id} id={me.id} />
            <span>{a.name}</span>
            {ownerOf(a.id) && <small>Taken by {ownerOf(a.id)!.name}</small>}
          </button>
        ))}
      </fieldset>
      <label className="field">
        Upload a photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setBusy(true);
            setError('');
            setNotice('');
            try {
              setChoice(await portrait(file));
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Unable to read this photo.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="hint">
        JPG, PNG, or WebP, up to 8 MB. Photos are center-cropped; only the small
        portrait is saved. Pick a preset to replace your photo.
      </p>
      <label className="field">
        Death effect
        <select
          value={selectedEffect}
          disabled={busy}
          onChange={(event) => {
            setEffect(event.target.value as DeathEffectId);
            setPreview(0);
            setNotice('');
          }}
        >
          {DEATH_EFFECTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        {DEATH_EFFECTS.find((item) => item.id === selectedEffect)?.description}{' '}
        Plays when your death becomes public.
      </p>
      <div className="farewell-preview">
        <div className="cosmetic-preview-stage">
          <PlayerAvatar avatar={selected} id={me.id} />
          {preview > 0 && <DeathEffect key={preview} effect={selectedEffect} />}
        </div>
        <div>
          <button
            type="button"
            className="secondary"
            disabled={busy || selectedEffect === 'none'}
            onClick={() => setPreview(preview + 1)}
          >
            Preview death effect
          </button>
          <p className="hint">
            Motion follows your device’s reduced-motion setting and the table’s
            visual effects switch.
          </p>
        </div>
      </div>
      <button
        className="primary"
        disabled={
          busy ||
          !!ownerOf(selected) ||
          (selected === (me.avatar ?? defaultAvatar(me.id)) &&
            selectedEffect === me.deathEffect)
        }
        onClick={() => void save()}
      >
        {busy ? 'Preparing…' : 'Save appearance'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <output>{notice}</output>}
    </section>
  );
}
