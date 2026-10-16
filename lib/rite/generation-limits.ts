// Generation limits are operation counts, never wall-clock deadlines: the
// same seed and settings must produce the same puzzle on every device.
export function generationInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return n;
}
