'use client';
import { useState } from 'react';
import { Eclipse, Flame, Flower2, Ghost, Minus } from 'lucide-react';
import { DEATH_EFFECTS, type DeathEffectId } from '@/lib/game/cosmetics';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { DeathEffect } from './death-effect';
import { PlayerAvatar } from './player-avatar';

const artwork = {
  spirit: Ghost,
  embers: Flame,
  petals: Flower2,
  mist: Eclipse,
  none: Minus,
};

export function DeathEffectPicker({
  value,
  onChange,
  avatar,
  playerId,
  disabled = false,
}: {
  value: DeathEffectId;
  onChange: (effect: DeathEffectId) => void;
  avatar: string;
  playerId: string;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<{
    effect: DeathEffectId;
    key: number;
  } | null>(null);
  return (
    <>
      <div className="effect-options" aria-label="Death animation">
        {DEATH_EFFECTS.map((effect) => {
          const Art = artwork[effect.id];
          return (
            <button
              type="button"
              key={effect.id}
              className={`effect-option effect-option-${effect.id}${value === effect.id ? ' selected' : ''}`}
              aria-pressed={value === effect.id}
              disabled={disabled}
              onClick={() => {
                onChange(effect.id);
                setPreview({ effect: effect.id, key: Date.now() });
              }}
            >
              <Art aria-hidden="true" strokeWidth={1.4} />
              <strong>{effect.name}</strong>
            </button>
          );
        })}
      </div>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="death-preview-dialog">
          <DialogHeader>
            <DialogTitle>
              {
                DEATH_EFFECTS.find((effect) => effect.id === preview?.effect)
                  ?.name
              }
            </DialogTitle>
          </DialogHeader>
          <div className="death-preview-stage">
            <PlayerAvatar avatar={avatar} id={playerId} />
            {preview && (
              <DeathEffect key={preview.key} effect={preview.effect} />
            )}
          </div>
          {preview?.effect === 'none' && (
            <p className="muted">No death animation.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
