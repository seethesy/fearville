'use client';
import { useEffect, useState } from 'react';
import { PATTERNS, type Pattern } from '@/lib/rite/types';
import {
  DEFAULT_GENERATION,
  DIFFICULTIES,
  TUNING_FIELDS,
  generationSettings,
  type GenerationSettings,
  type PuzzleDifficulty,
} from '@/lib/rite/generation-settings';
import type { StandalonePuzzle } from '@/lib/rite/puzzle';
import { PuzzlePlayer } from '@/components/puzzles/player';
type TuningResponse = {
  error?: string;
  settings: GenerationSettings;
  revision: number;
  puzzle?: StandalonePuzzle;
};

export function PuzzleTuning() {
  const [settings, setSettings] = useState<GenerationSettings>(),
    [revision, setRevision] = useState(0),
    [difficulty, setDifficulty] = useState<PuzzleDifficulty>('standard'),
    [pattern, setPattern] = useState<Pattern>('board'),
    [seed, setSeed] = useState('workshop-1'),
    [preview, setPreview] = useState<StandalonePuzzle>(),
    [previewKey, setPreviewKey] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/puzzles', { cache: 'no-store' });
      const data = (await response.json()) as TuningResponse;
      if (!response.ok)
        throw Error(data.error || 'Could not load puzzle settings.');
      setSettings(data.settings);
      setRevision(data.revision);
      setPreview(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function submit(action: 'save' | 'preview') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const validated = generationSettings(settings);
      const response = await fetch('/api/admin/puzzles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          settings: validated,
          revision,
          pattern,
          difficulty,
          seed,
        }),
      });
      const data = (await response.json()) as TuningResponse;
      if (!response.ok)
        throw Error(data.error || 'Could not update puzzle settings.');
      if (action === 'preview') {
        setPreview(data.puzzle);
        setPreviewKey((key) => key + 1);
      } else {
        setSettings(data.settings);
        setRevision(data.revision);
        setNotice(
          `Published revision ${data.revision}. New practice puzzles and newly configured Night Rites use these settings.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update settings.');
    } finally {
      setBusy(false);
    }
  }
  if (!settings)
    return (
      <section className="panel">
        <h2>Puzzle workshop</h2>
        <output>{error || 'Loading tuning settings…'}</output>
        {error && (
          <button onClick={() => void load()} disabled={busy}>
            Retry
          </button>
        )}
      </section>
    );
  function updateField(key: string, value: number) {
    setSettings((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      (next.profiles[difficulty][pattern] as Record<string, number>)[key] =
        value;
      return next;
    });
    setPreview(undefined);
    setNotice('');
  }
  return (
    <section className="panel puzzle-workshop">
      <h2>Puzzle workshop</h2>
      <p>
        Revision {revision}. Preview unpublished settings, then publish a
        version for future puzzles. Existing puzzles keep their settings.
        Resetting defaults creates a new revision when published.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <output>{notice}</output>}
      <fieldset disabled={busy}>
        <legend>Generation settings</legend>
        <div className="admin-filters">
          <label className="field">
            Night Rite difficulty
            <select
              value={settings.nightDifficulty}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  nightDifficulty: e.target.value as PuzzleDifficulty,
                })
              }
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Edit difficulty
            <select
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value as PuzzleDifficulty);
                setPreview(undefined);
              }}
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Puzzle
            <select
              value={pattern}
              onChange={(e) => {
                setPattern(e.target.value as Pattern);
                setPreview(undefined);
              }}
            >
              {Object.entries(PATTERNS).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-filters">
          {TUNING_FIELDS[pattern].map((field) => (
            <label className="field" key={field.key}>
              {field.label}
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={
                  (
                    settings.profiles[difficulty][pattern] as Record<
                      string,
                      number
                    >
                  )[field.key]
                }
                onChange={(e) => updateField(field.key, e.target.valueAsNumber)}
              />
            </label>
          ))}
        </div>
        <p className="hint">
          Move ranges are exact optimal solution lengths and must increase
          across levels. Laboratory supports 4 colors up to 9 pours, 7 up to 20,
          and 10 up to 32. Sphinx rounds are a selection target; every result
          has one solution. Ritual rules are shown to players in execution
          order.
        </p>
        <label className="field">
          Preview seed
          <input
            value={seed}
            maxLength={80}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
        <div className="admin-actions">
          <button
            className="secondary"
            disabled={!seed.trim()}
            onClick={() => void submit('preview')}
          >
            {busy ? 'Working…' : 'Preview puzzle'}
          </button>
          <button className="primary" onClick={() => void submit('save')}>
            Publish settings
          </button>
          <button
            className="secondary"
            onClick={() => {
              setSettings(structuredClone(DEFAULT_GENERATION));
              setPreview(undefined);
              setNotice('Defaults loaded into the draft. Publish to apply.');
            }}
          >
            Load defaults
          </button>
          <button className="secondary" onClick={() => void load()}>
            Reload published settings
          </button>
        </div>
      </fieldset>
      {preview && (
        <div className="puzzle-arcade">
          <h3>
            Unpublished preview · {PATTERNS[preview.pattern]} ·{' '}
            {preview.difficulty}
          </h3>
          <PuzzlePlayer key={previewKey} puzzle={preview} />
        </div>
      )}
    </section>
  );
}
