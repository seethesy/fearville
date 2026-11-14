import type { ControlName } from './types.ts';

/** Reading sizes stay fixed. The page grows and scrolls instead of shrinking. */
export function grimoireLayout(
  width: number,
  control: ControlName,
  entries: number,
) {
  const spread = width >= 1000;
  const wide = width >= 520;
  const rowHeight = wide
    ? 152
    : control === 'chalice' || control === 'incense'
      ? 196
      : 232;
  const top = spread ? 72 : 56;
  const bottom = spread ? 160 : 56;
  const side = spread ? 0 : width < 252 ? 24 : 36;
  return {
    spread,
    wide,
    rowHeight,
    top,
    bottom,
    side,
    header: 64,
    height: top + 64 + entries * rowHeight + bottom,
    symbolSize: 48,
    controlWidth: 180,
    controlHeight: 80,
    labelSize: 14,
  };
}

export function grimoireLabels(control: ControlName, value: string) {
  return control === 'candles'
    ? value.split(', ')
    : control === 'offerings'
      ? value.split(' · ')
      : [value];
}
