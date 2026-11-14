'use client';
import { SpriteArt } from './painted';
export function CharacterArt({ character }: { character: number }) {
  return (
    <SpriteArt
      name={`sphinx/character-${character}`}
      className="rite-character-art"
    />
  );
}
export function ActivityArt({ activity }: { activity: number }) {
  return (
    <SpriteArt
      name={`sphinx/activity-${activity}`}
      className="rite-activity-art"
    />
  );
}
export function PlaceArt({ place }: { place: number }) {
  return (
    <SpriteArt name={`sphinx/location-${place}`} className="rite-place-art" />
  );
}
