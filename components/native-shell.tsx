'use client';
import { useEffect } from 'react';
import { installCapacitorBridge } from '@/lib/native/capacitor';
import { installClientHeader } from '@/lib/compat/client';

/** Wires the app shell's plugins into the native bridge (no-op in browsers). */
export function NativeShell() {
  useEffect(() => {
    installCapacitorBridge();
    installClientHeader();
  }, []);
  return null;
}
