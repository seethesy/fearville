'use client';
import { GlossaryText } from '@/components/glossary-text';
import { eligibleField } from '@/lib/game/choices';
import { Check, X } from 'lucide-react';
import { role } from '@/lib/game/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FieldInput } from './fields.tsx';
import { type TableContext } from './display.tsx';
export function TableActionDialog({
  selected,
  busy,
  setSelected,
  actionControl,
  submit,
  confirmation,
  socket,
  game,
  open,
  name,
  followChoice,
  setFollowChoice,
  effectiveValues,
  setValues,
  error,
  checkConfirmation,
}: Pick<
  TableContext,
  | 'selected'
  | 'busy'
  | 'setSelected'
  | 'actionControl'
  | 'submit'
  | 'confirmation'
  | 'socket'
  | 'game'
  | 'open'
  | 'name'
  | 'followChoice'
  | 'setFollowChoice'
  | 'effectiveValues'
  | 'setValues'
  | 'error'
  | 'checkConfirmation'
>) {
  return (
    <Dialog
      open={!!selected}
      onOpenChange={(v) => {
        if (!v && !busy) setSelected(null);
      }}
    >
      <DialogContent className="action-dialog">
        <DialogHeader>
          <DialogTitle>{actionControl?.title}</DialogTitle>
          <DialogDescription>
            {actionControl && <GlossaryText text={actionControl.description} />}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {confirmation && (
            <>
              {confirmation.ability && (
                <div className="ability-reminder">
                  <strong>
                    {confirmation.playerName || 'Night task'} ability
                  </strong>
                  <p>
                    <GlossaryText text={confirmation.ability} />
                  </p>
                </div>
              )}
              <div className="status-bubbles" aria-label="Player status">
                {confirmation.statuses.map((status) => (
                  <button
                    type="button"
                    key={status.key}
                    className={
                      status.active ? 'status-active' : 'status-inactive'
                    }
                    disabled={busy || !socket.connected}
                    aria-pressed={status.active}
                    aria-label={
                      status.locked
                        ? `Edit ${confirmation.playerName}'s character`
                        : `${status.active ? 'Remove' : 'Add'} ${status.name.toLowerCase()} for ${confirmation.playerName}`
                    }
                    onClick={() => {
                      if (status.locked) {
                        const edit = game.controls.find(
                          (control) =>
                            control.action === 'edit' &&
                            control.fields[0]?.value === confirmation.playerId,
                        );
                        if (edit) open(edit);
                        return;
                      }
                      if (status.key === 'redirected' && !status.active) {
                        open({
                          action: 'setPlayerStatus',
                          title: `Redirect ${confirmation.playerName}`,
                          description:
                            'Choose the player whose ability receives the redirect.',
                          fields: [
                            {
                              key: 'player',
                              label: '',
                              type: 'hidden',
                              value: confirmation.playerId,
                            },
                            {
                              key: 'status',
                              label: '',
                              type: 'hidden',
                              value: status.key,
                            },
                            {
                              key: 'active',
                              label: '',
                              type: 'hidden',
                              value: true,
                            },
                            {
                              key: 'night',
                              label: '',
                              type: 'hidden',
                              value: game.night,
                            },
                            {
                              key: 'target',
                              label: 'Redirect target',
                              type: 'select',
                              required: true,
                              options: game.players
                                .filter(
                                  (player) =>
                                    player.id !== confirmation.playerId,
                                )
                                .map((player) => ({
                                  value: player.id,
                                  label: player.name,
                                })),
                              value:
                                game.players.find(
                                  (player) =>
                                    player.id !== confirmation.playerId,
                                )?.id ?? '',
                            },
                          ],
                        });
                        return;
                      }
                      void submit(
                        {
                          action: 'setPlayerStatus',
                          title: 'Change player state',
                          description: '',
                          fields: [],
                        },
                        {
                          player: confirmation.playerId,
                          status: status.key,
                          active: !status.active,
                          night: game.night,
                        },
                      );
                    }}
                  >
                    {status.active
                      ? status.name
                      : `Not ${status.name.toLowerCase()}`}
                  </button>
                ))}
              </div>
            </>
          )}
          {confirmation?.choice && (
            <div className="ballot-callout">
              <p>
                {confirmation.choice.pass
                  ? 'The player passed.'
                  : [
                      [
                        confirmation.choice.target,
                        confirmation.choice.target2,
                        confirmation.choice.target3 ?? '',
                      ].filter(Boolean).length
                        ? 'Player selected: ' +
                          [
                            confirmation.choice.target,
                            confirmation.choice.target2,
                            confirmation.choice.target3 ?? '',
                          ]
                            .filter(Boolean)
                            .map(name)
                            .join(', ') +
                          '.'
                        : '',
                      confirmation.choice.text
                        ? `Question: “${confirmation.choice.text}”`
                        : '',
                      confirmation.choice.guesses?.length
                        ? 'Guesses: ' +
                          confirmation.choice.guesses
                            .map(
                              (g) =>
                                `${name(g.player)} as ${role(g.role)?.name ?? g.role}`,
                            )
                            .join(', ') +
                          '.'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
              </p>
              {!followChoice && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setFollowChoice(true)}
                >
                  Use player’s choice
                </button>
              )}
            </div>
          )}
          {actionControl?.fields.map((f) => (
            <FieldInput
              key={f.key}
              field={eligibleField(f, actionControl, effectiveValues, game)}
              value={effectiveValues[f.key]}
              onChange={(v) => {
                const next = { ...effectiveValues, [f.key]: v };
                if (['target', 'target2', 'target3'].includes(f.key))
                  setFollowChoice(false);
                for (const field of actionControl.fields) {
                  const options = eligibleField(
                    field,
                    actionControl,
                    next,
                    game,
                  ).options;
                  if (
                    options &&
                    next[field.key] &&
                    !options.some((o) => o.value === String(next[field.key]))
                  )
                    next[field.key] = '';
                }
                setValues(next);
              }}
            />
          ))}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {checkConfirmation ? (
            <div className="confirmation-actions">
              <button
                type="button"
                className="confirmation-no"
                aria-label="Cancel"
                disabled={busy || !socket.connected}
                onClick={() => setSelected(null)}
              >
                <X aria-hidden="true" />
              </button>
              <button
                className="confirmation-yes"
                aria-label="Confirm"
                disabled={busy || !socket.connected}
              >
                <Check aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              className="primary full"
              disabled={
                busy ||
                !socket.connected ||
                (selected?.action === 'night' && !confirmation)
              }
            >
              {busy ? 'Applying…' : selected?.title || 'Apply'}
            </button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
