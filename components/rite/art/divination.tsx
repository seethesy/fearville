'use client';
import type { ControlName } from '@/lib/rite/types';
import { controlLabel, SYMBOLS } from '@/lib/rite/ritual';
import { SpriteArt } from './painted';
export function SymbolArt({ symbol }: { symbol: number }) {
  return (
    <SpriteArt
      name={`divination/symbol-${symbol}`}
      label={SYMBOLS[symbol]}
      className="rite-symbol"
    />
  );
}
export function AltarArt({
  control,
  value,
}: {
  control: ControlName;
  value: number;
}) {
  return (
    <SpriteArt
      name={`divination/${control}-${value}`}
      label={controlLabel(control, value)}
      className="rite-altar-art"
    />
  );
}
