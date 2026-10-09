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
  Crown,
  Sword,
  Lamp,
  KeyRound,
  BookOpen,
  Hourglass,
  Gem,
  Drama,
  Dog,
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
  bat: BatPortrait,
  spider: SpiderPortrait,
  wolf: Dog,
  crown: Crown,
  dagger: Sword,
  lantern: Lamp,
  key: KeyRound,
  book: BookOpen,
  hourglass: Hourglass,
  gem: Gem,
  mushroom: MushroomPortrait,
  mask: Drama,
};

function BatPortrait({ strokeWidth }: { strokeWidth: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    >
      <path d="M10 10 9 5l3 2 3-2-1 5 7-5-1 10-4-1-4 6-4-6-4 1L3 5z" />
      <path d="m10 12 1 1m2 0 1-1" />
    </svg>
  );
}
function SpiderPortrait({ strokeWidth }: { strokeWidth: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    >
      <ellipse cx="12" cy="13" rx="3" ry="5" />
      <path d="m10 8-2-4m6 4 2-4M9 11 5 9 3 5m6 8-5-1-2-2m7 5-5 2-1 3m12-9 4-2 2-4m-6 8 5-1 2-2m-7 5 5 2 1 3" />
    </svg>
  );
}
function MushroomPortrait({ strokeWidth }: { strokeWidth: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    >
      <path d="M3 13a9 9 0 0 1 18 0zM10 13l-1 8h6l-1-8" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="15" cy="10" r="1.5" />
    </svg>
  );
}

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
