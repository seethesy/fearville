'use client';
import { lazy, Suspense } from 'react';
import { useAccount } from '@/components/hub/account-context';
import { AdminViewBar } from './view-bar';
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
  // FEAR-158: the admin browsing the normal UI as another viewer.
  if (state.adminView)
    return (
      <>
        <AdminViewBar viewer={state.adminView.viewer} />
        {children}
      </>
    );
  if (state.account?.role === 'admin')
    return (
      <Suspense fallback={<p>Loading administration…</p>}>
        <AdminShell />
      </Suspense>
    );
  return children;
}
