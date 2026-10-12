'use client';
import { useEffect, useRef } from 'react';
import { onLifecycle, type LifecycleEvent } from '@/lib/native/bridge';

/** Run `handler` on app resume/pause and network changes (shell or browser). */
export function useLifecycle(handler: (event: LifecycleEvent) => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  }, [handler]);
  useEffect(() => onLifecycle((event) => latest.current(event)), []);
}
