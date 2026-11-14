'use client';
/* These WebP sprites are pre-optimized and have explicit 1x/2x sources. */
/* eslint-disable nextjs/no-img-element */
import { RITE_ART } from '@/lib/rite/art-assets';

export type PaintedImage = {
  src: string;
  src2x?: string;
  srcSet?: string;
  width: number;
  height: number;
};
export function spriteAsset(name: string): PaintedImage | undefined {
  return (RITE_ART.sprites as Record<string, PaintedImage>)[name];
}
export function spriteSource(name: string) {
  const art = spriteAsset(name);
  return art?.src2x ?? art?.src;
}
export function PaintedArt({
  art,
  label = '',
  className = '',
}: {
  art: PaintedImage;
  label?: string;
  className?: string;
}) {
  return (
    <img
      className={`rite-art ${className}`}
      src={art.src}
      srcSet={art.srcSet}
      width={art.width}
      height={art.height}
      alt={label}
      aria-hidden={label ? undefined : true}
      draggable={false}
      decoding="async"
    />
  );
}
export function SpriteArt({
  name,
  label,
  className,
}: {
  name: string;
  label?: string;
  className?: string;
}) {
  const art = spriteAsset(name);
  return art ? (
    <PaintedArt art={art} label={label} className={className} />
  ) : null;
}
