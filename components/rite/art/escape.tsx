'use client';
import type { Block } from '@/lib/rite/types';
import { SpriteArt } from './painted';
export function Wreckage({ block }: { block: Block }) {
  const kind = block.key ? 'carriage' : block.kind;
  const length = ['tree', 'brick', 'coach'].includes(kind) ? 3 : 2;
  return (
    <SpriteArt
      name={`escape/${kind}-${kind === 'carriage' || block.horiz ? 'h' : 'v'}${length}`}
      className="rite-wreckage"
    />
  );
}
