'use client';
import type { GameView } from '@/lib/game/view';
import { ALL_ROLES, type Team } from '@/lib/game/types';
export type Recap = GameView['recaps'][number];
export type RecapPlayer = Recap['players'][number];
export const colors: Record<Team, string> = {
  minion: '#F79D36',
  demon: '#900D09',
  townsfolk: '#0B6623',
  outsider: '#1E90FF',
  traveler: '#9673c4',
};
export function roleColor(p: RecapPlayer) {
  return colors[
    p.team ?? ALL_ROLES.find((r) => r.name === p.role)?.team ?? 'townsfolk'
  ];
}
export function gameDuration(recap: Recap) {
  if (recap.started === undefined) return 'Duration unavailable';
  const seconds = Math.max(0, Math.floor((recap.ended - recap.started) / 1000));
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return hours
    ? `${hours}h ${minutes}m ${seconds % 60}s`
    : `${minutes}m ${seconds % 60}s`;
}
