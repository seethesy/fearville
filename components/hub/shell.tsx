'use client';
/* oxlint-disable next/no-img-element -- Local supplied logo, shared with favicon. */
import AppLink from '@/components/app-link';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsPanel } from './settings';
import { Play, Globe2, BookOpen, UserRound, Settings } from 'lucide-react';
import { useAccount } from './account-context';
const navigation = [
  { href: '/', label: 'Play', Icon: Play },
  { href: '/friends', label: 'Social', Icon: Globe2 },
  { href: '/rules', label: 'Rules', Icon: BookOpen },
  { href: '/account', label: 'Account', Icon: UserRound },
];
export function Brand() {
  return (
    <AppLink className="hub-brand" href="/" aria-label="Fearville home">
      <img src="/fearville-logo.png" alt="" width="44" height="44" />
      <span>Fearville</span>
    </AppLink>
  );
}
export function HubShell({
  active,
  title,
  subtitle,
  children,
  settings = false,
}: {
  active: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  settings?: boolean;
}) {
  const { state } = useAccount();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="hub">
      <AppLink className="skip-link" href="#main-content">
        Skip to content
      </AppLink>
      <header className="hub-header">
        <Brand />
        <nav className="hub-nav" aria-label="Main navigation">
          {navigation.map(({ href, label, Icon }) => (
            <AppLink
              key={label}
              href={href}
              aria-label={label}
              title={label}
              aria-current={active === label ? 'page' : undefined}
            >
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
              {label === 'Social' &&
                !!state?.pending &&
                state.pending.invites + state.pending.requests > 0 && (
                  <i className="nav-dot" />
                )}
            </AppLink>
          ))}
        </nav>
        <span className="hub-user">
          {state?.account?.handle
            ? '@' + state.account.handle
            : state?.account?.name}
        </span>
      </header>
      <main id="main-content" className="hub-main">
        <div className="hub-title">
          <div>
            <p className="eyebrow">WELCOME TO FEARVILLE</p>
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {settings && (
            <button
              className="icon-button"
              aria-label="Settings"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </button>
          )}
        </div>
        {children}
      </main>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <SettingsPanel />
        </DialogContent>
      </Dialog>
      <footer className="hub-footer">
        <span>Keep your secrets. Find your people.</span>
        <AppLink href="/privacy">Privacy</AppLink>
        <AppLink href="/rules">Rulebook</AppLink>
      </footer>
    </div>
  );
}
