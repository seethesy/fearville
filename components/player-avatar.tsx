'use client';
/* Portraits are already resized, bounded local JPEG data URLs. */
/* oxlint-disable next/no-img-element */
import { useState } from 'react';
import {
  Bird,
  Ghost,
  Moon,
  Cat,
  Skull,
  Flame,
  Flower2,
  Eye,
} from 'lucide-react';
import { AVATARS, defaultAvatar } from '@/lib/game/avatars';
import type { PortraitFrame, DeathEffectId } from '@/lib/game/cosmetics';
import { DeathEffect } from './death-effect';

const icons = {
  raven: Bird,
  ghost: Ghost,
  moon: Moon,
  cat: Cat,
  skull: Skull,
  flame: Flame,
  rose: Flower2,
  eye: Eye,
};

export function PlayerAvatar({
  avatar,
  id,
  dead = false,
  frame = 'simple',
  deathEffect = 'spirit',
  publicDead = false,
}: {
  avatar?: string;
  id: string;
  dead?: boolean;
  frame?: PortraitFrame;
  deathEffect?: DeathEffectId;
  publicDead?: boolean;
}) {
  const [failed, setFailed] = useState('');
  const [transition, setTransition] = useState({
    id,
    dead: publicDead,
    sequence: 0,
  });
  if (transition.id !== id || transition.dead !== publicDead) {
    setTransition({
      id,
      dead: publicDead,
      sequence:
        transition.id === id && publicDead ? transition.sequence + 1 : 0,
    });
  }
  const preset =
    AVATARS.find((a) => a.id === avatar) ??
    AVATARS.find((a) => a.id === defaultAvatar(id))!;
  const Icon = icons[preset.id];
  return (
    <span className="portrait-stage" aria-hidden="true">
      <span
        className={`player-avatar frame-${frame} ${dead ? 'is-dead' : ''}`}
        style={{ color: preset.color }}
        aria-hidden="true"
      >
        {avatar?.startsWith('data:image/jpeg;base64,') && failed !== avatar ? (
          <img
            src={avatar}
            alt=""
            draggable={false}
            onError={() => setFailed(avatar)}
          />
        ) : (
          <Icon strokeWidth={1.5} />
        )}
      </span>
      {publicDead && transition.sequence > 0 && (
        <DeathEffect key={transition.sequence} effect={deathEffect} />
      )}
    </span>
  );
}
