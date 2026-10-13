'use client';
import { useEffect } from 'react';
import { installCapacitorBridge } from '@/lib/native/capacitor';

/** Wires the app shell's plugins into window.FearvilleNative (no-op in browsers). */
export function NativeShell() {
  useEffect(() => installCapacitorBridge(), []);
  return null;
}
