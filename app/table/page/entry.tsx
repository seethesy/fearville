'use client';
import AppLink from '@/components/app-link';
import type { TableState } from './state';

export function TableEntry({
  authError,
  error,
  connectionError,
}: Pick<TableState, 'authError' | 'error' | 'connectionError'>) {
  return (
    <main className="entry">
      <header className="brand">
        <span className="brand-mark">F</span>FEARVILLE
      </header>
      <section className="panel entry-panel">
        <h1>
          {authError ? 'Return to your seat' : 'Connecting to your table…'}
        </h1>
        {(error || connectionError) && (
          <p className="error" role="alert">
            {error || connectionError}
          </p>
        )}
        <AppLink className="quiet-link" href="/">
          Create or join a session →
        </AppLink>
      </section>
    </main>
  );
}
