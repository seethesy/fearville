import Link from 'next/link';
import type { Metadata } from 'next';
import { RulesReference } from '@/components/rules-reference';

export const metadata: Metadata = {
  title: 'Rules & roles · Fearville',
  description:
    'Learn how to play, look up key terms, and browse every role in Horrors of Fearville, Holy Moon and Stars, and Horrors of Fearville. No account or lobby required.',
};

export default function Rules() {
  return (
    <main className="entry reference-page">
      <header className="brand">
        <Link href="/">FEARVILLE</Link>
      </header>
      <nav className="reference-nav" aria-label="Return navigation">
        <Link href="/">Home / join a game</Link>
        <Link href="/table">Return to your lobby or game</Link>
      </nav>
      <section className="panel">
        <p className="eyebrow">READ BEFORE YOU PLAY · REVISIT ANYTIME</p>
        <h1>Rules & roles</h1>
        <p className="lead">
          Your guide to every Fearville script and playing at a Fearville table.
          No sign-in or session required.
        </p>
        <RulesReference />
      </section>
      <footer>
        <Link href="/">Home</Link>
        <Link href="/table">Return to your lobby or game</Link>
      </footer>
    </main>
  );
}
