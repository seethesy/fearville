'use client';
import { lazy, Suspense } from 'react';
import { useAccount } from '@/components/hub/account-context';
const AdminShell = lazy(() => import('./shell'));
export function AccountBoundary({ children }: { children: React.ReactNode }) {
  const { state, error, refresh } = useAccount();
  if (!state)
    return (
      <main className="admin-shell">
        <output>{error || 'Loading account…'}</output>
        {error && <button onClick={() => void refresh()}>Retry</button>}
      </main>
    );
  if (state.account?.role === 'admin')
    return (
      <Suspense fallback={<p>Loading administration…</p>}>
        <AdminShell />
      </Suspense>
    );
  return children;
}
