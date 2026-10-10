'use client';
import { GlossaryText } from '@/components/glossary-text';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { role, scriptRoles } from '@/lib/game/types';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { GameView } from '@/lib/game/view';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function TableNightChoice({
  prompt,
  refresh,
  game,
  now,
}: {
  game: GameView;
  now: number;
  prompt: NonNullable<GameView['nightChoice']>;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(!prompt.choice);
  const [guesses, setGuesses] = useState<
    Record<string, { role: string; confidence: string }>
  >({});
  const seconds =
    prompt.deadline === null
      ? null
      : Math.max(0, Math.ceil((prompt.deadline - now) / 1000));
  const expired = seconds === 0;
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(
          localStorage.getItem(`fearville-notes:${game.code}:${game.me}`) ??
            '{}',
        );
        setGuesses(saved.players ?? {});
      } catch {
        setGuesses({});
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, game.code, game.me]);
  const initial = () =>
    [prompt.choice?.target, prompt.choice?.target2, prompt.choice?.target3]
      .filter((s): s is string => !!s)
      .slice(0, prompt.count);
  const [picked, setPicked] = useState<string[]>(initial);
  const [fearTarget, setFearTarget] = useState(prompt.choice?.fearTarget ?? '');
  const fearChoices =
    prompt.fearOptions?.find((entry) => entry.target === picked[0])
      ?.neighbors ?? [];
  const [question, setQuestion] = useState(prompt.choice?.text ?? '');
  const [flag, setFlag] = useState(!!prompt.choice?.flag);
  const [guessRows, setGuessRows] = useState<
    { player: string; role: string }[]
  >(() =>
    prompt.guesses === 'members'
      ? prompt.members.map((m) => ({
          player: m.id,
          role:
            prompt.choice?.guesses?.find((g) => g.player === m.id)?.role ?? '',
        }))
      : (prompt.choice?.guesses ?? [{ player: '', role: '' }]),
  );
  const roleChoices = scriptRoles(game.script);
  const filledGuesses = guessRows.filter((g) => g.player && g.role);
  const ready =
    picked.length === prompt.count &&
    (!prompt.fearOptions ||
      !fearChoices.length ||
      fearChoices.includes(fearTarget)) &&
    (!prompt.text || question.trim().length > 0) &&
    (!prompt.guesses ||
      (prompt.guesses === 'members'
        ? filledGuesses.length === prompt.members.length
        : filledGuesses.length > 0 &&
          new Set(filledGuesses.map((g) => g.player)).size ===
            filledGuesses.length));
  const what =
    prompt.label ||
    `Choose ${prompt.count === 2 ? 'two different players' : 'a player'}.`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(ids: string[], pass = false) {
    if (expired) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'nightChoice',
          ...(game.sandboxHost ? { pov: game.me } : {}),
          task: prompt.task,
          round: prompt.round,
          ...(pass
            ? { pass: true }
            : {
                target: ids[0],
                target2: ids[1],
                target3: ids[2],
                ...(prompt.fearOptions ? { fearTarget } : {}),
                ...(prompt.text ? { text: question.trim() } : {}),
                ...(prompt.flag ? { flag } : {}),
                ...(prompt.guesses ? { guesses: filledGuesses } : {}),
              }),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Unable to send. Try again.');
      await refresh();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const sent =
    !!prompt.choice &&
    !prompt.choice.pass &&
    picked[0] === (prompt.choice.target || undefined) &&
    (picked[1] ?? '') === prompt.choice.target2 &&
    (picked[2] ?? '') === (prompt.choice.target3 ?? '') &&
    (!prompt.fearOptions || fearTarget === (prompt.choice.fearTarget ?? '')) &&
    (!prompt.text || question.trim() === prompt.choice.text) &&
    (!prompt.flag || flag === !!prompt.choice.flag) &&
    (!prompt.guesses ||
      JSON.stringify(filledGuesses) === JSON.stringify(prompt.choice.guesses));
  if (expired) return null;
  return (
    <section className="panel night-choice-panel">
      <h2>Your night choice</h2>
      <p>
        {prompt.choice?.pass ? (
          'You passed. You can change this until the timer ends.'
        ) : prompt.choice ? (
          'Choice sent. The Storyteller will confirm your action.'
        ) : (
          <GlossaryText text={what} />
        )}
      </p>
      <button className="primary" onClick={() => setOpen(true)}>
        {prompt.choice ? 'View or change choice' : 'Make your choice'}
      </button>
      <Dialog open={open && !expired} onOpenChange={setOpen}>
        <DialogContent className="action-dialog">
          <DialogHeader>
            <DialogTitle>Your night choice</DialogTitle>
            <DialogDescription>
              <GlossaryText text={what} /> Your choice is sent privately to the
              Storyteller, who confirms the action.
            </DialogDescription>
          </DialogHeader>
          {seconds !== null && (
            <p
              className={seconds <= 20 ? 'countdown timer-urgent' : 'countdown'}
              role="timer"
              aria-label="Night choice time remaining"
            >
              {seconds}s remaining
            </p>
          )}
          {prompt.conditional && (
            <p>This choice is used only if your ability activates tonight.</p>
          )}
          {prompt.text && (
            <label className="field">
              Your question
              <textarea
                rows={3}
                maxLength={500}
                value={question}
                disabled={busy}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setError('');
                }}
              />
            </label>
          )}
          {prompt.guesses && (
            <div className="night-guesses">
              {guessRows.map((row, i) => (
                <div className="night-guess-row" key={i}>
                  {prompt.guesses === 'members' ? (
                    <strong>
                      {prompt.members.find((m) => m.id === row.player)?.name}
                    </strong>
                  ) : (
                    <NativeSelect
                      aria-label={`Guess ${i + 1}: player`}
                      value={row.player}
                      disabled={busy}
                      onChange={(e) =>
                        setGuessRows(
                          guessRows.map((r, j) =>
                            j === i ? { ...r, player: e.target.value } : r,
                          ),
                        )
                      }
                    >
                      <NativeSelectOption value="">Player…</NativeSelectOption>
                      {prompt.options
                        .filter((p) => p.eligible)
                        .map((p) => (
                          <NativeSelectOption key={p.id} value={p.id}>
                            {p.seat}. {p.name}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                  )}
                  <NativeSelect
                    aria-label={`Guess ${i + 1}: character`}
                    value={row.role}
                    disabled={busy}
                    onChange={(e) =>
                      setGuessRows(
                        guessRows.map((r, j) =>
                          j === i ? { ...r, role: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    <NativeSelectOption value="">Character…</NativeSelectOption>
                    {roleChoices.map((r) => (
                      <NativeSelectOption key={r.id} value={r.id}>
                        {r.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {prompt.guesses === 'free' && guessRows.length > 1 && (
                    <button
                      type="button"
                      className="text-action"
                      disabled={busy}
                      onClick={() =>
                        setGuessRows(guessRows.filter((_, j) => j !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {prompt.guesses === 'free' && guessRows.length < 15 && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    setGuessRows([...guessRows, { player: '', role: '' }])
                  }
                >
                  Add a guess
                </button>
              )}
            </div>
          )}
          {prompt.count > 0 && (
            <div className="night-player-choices">
              {prompt.options.map((p) => (
                <button
                  key={p.id}
                  className={picked.includes(p.id) ? 'primary' : 'secondary'}
                  aria-pressed={picked.includes(p.id)}
                  disabled={busy || !p.eligible}
                  onClick={() => {
                    const next =
                      prompt.count === 1
                        ? [p.id]
                        : picked.includes(p.id)
                          ? picked.filter((id) => id !== p.id)
                          : picked.length < prompt.count
                            ? [...picked, p.id]
                            : [p.id];
                    setPicked(next);
                    if (prompt.fearOptions && next[0] !== picked[0])
                      setFearTarget('');
                    setError('');
                  }}
                >
                  <span>
                    {p.seat}. {p.name}
                    {!p.eligible
                      ? p.id === game.me
                        ? ' (cannot choose yourself)'
                        : ' (not eligible)'
                      : ''}
                  </span>
                  {(p.knownRole || guesses[p.id]?.role) && (
                    <small
                      className={
                        p.knownRole || guesses[p.id]?.confidence === 'confirmed'
                          ? 'guess-confirmed'
                          : guesses[p.id]?.confidence === 'suspected'
                            ? 'guess-suspected'
                            : ''
                      }
                    >
                      {p.knownRole ?? role(guesses[p.id]?.role ?? '')?.name} ·{' '}
                      {p.knownRole
                        ? 'Known Haunt'
                        : guesses[p.id]?.confidence === 'confirmed'
                          ? 'Confirmed'
                          : guesses[p.id]?.confidence === 'suspected'
                            ? 'Suspected'
                            : 'Unmarked'}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
          {prompt.fearOptions && picked[0] && fearChoices.length > 0 && (
            <label className="field">
              If this player dies, choose a living neighbor to fear next night
              <NativeSelect
                value={fearTarget}
                disabled={busy}
                onChange={(e) => setFearTarget(e.target.value)}
              >
                <NativeSelectOption value="">
                  Choose a neighbor…
                </NativeSelectOption>
                {prompt.options
                  .filter((p) => fearChoices.includes(p.id))
                  .map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.seat}. {p.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </label>
          )}
          {prompt.flag && (
            <label className="check-field">
              <Checkbox
                checked={flag}
                disabled={busy}
                onCheckedChange={(v) => {
                  setFlag(v === true);
                  setError('');
                }}
              />
              {prompt.flag}
            </label>
          )}
          <output>
            {busy
              ? 'Sending…'
              : sent
                ? 'Sent. Waiting for Storyteller confirmation.'
                : ready
                  ? 'Ready. Confirm your choice below.'
                  : picked.length < prompt.count
                    ? `Select ${prompt.count - picked.length} more player${prompt.count - picked.length === 1 ? '' : 's'}.`
                    : prompt.text && !question.trim()
                      ? 'Write your question.'
                      : 'Complete your guesses.'}
          </output>
          {error && (
            <>
              <p className="error" role="alert">
                {error}
              </p>
              <button
                className="secondary"
                disabled={busy || !ready}
                onClick={() => void send(picked)}
              >
                Retry sending
              </button>
            </>
          )}
          <div className="vote-choices">
            <button
              type="button"
              className="vote-choice vote-true"
              disabled={busy || !ready}
              onClick={() => void send(picked)}
            >
              <Check aria-hidden="true" />
              Confirm
            </button>
            {prompt.optional && (
              <button
                type="button"
                className="vote-choice"
                disabled={busy}
                onClick={() => void send([], true)}
              >
                Pass
              </button>
            )}
            <button
              type="button"
              className="vote-choice vote-false"
              disabled={busy}
              onClick={() => {
                setPicked(initial());
                setOpen(false);
              }}
            >
              <X aria-hidden="true" />
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
