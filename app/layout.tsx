import type { Metadata, Viewport } from 'next';
import './globals.css';
import './hub.css';
import './rite.css';
import './admin.css';
import { TextProvider } from '@/components/ui-text';
import { AccountBoundary } from '@/components/admin/boundary';
import { AccountProvider } from '@/components/hub/account-context';
import { TutorialProvider } from '@/components/tutorials/provider';
import { NativeShell } from '@/components/native-shell';
import { AudioProvider } from '@/components/hub/audio-provider';
import { MaintenanceBanner } from '@/components/remote-switches';
import { UpdateGate } from '@/components/update-required';
import { StaleReload } from '@/components/stale-reload';
import { currentEnvironment } from '@/lib/runtime/environment';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};
const baseMetadata: Metadata = {
  title: 'Fearville',
  icons: { icon: '/fearville-logo.png', apple: '/fearville-logo.png' },
  description:
    'An in-person Horrors of Fearville companion for Storytellers and players.',
};
export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    ...(currentEnvironment() === 'staging'
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <NativeShell />
        <MaintenanceBanner />
        <UpdateGate />
        <StaleReload />
        {currentEnvironment() === 'staging' && (
          <div className="staging-banner" role="note">
            STAGING · TEST DATA
          </div>
        )}
        <AccountProvider>
          <AudioProvider />
          <TextProvider>
            <AccountBoundary>
              <TutorialProvider>{children}</TutorialProvider>
            </AccountBoundary>
          </TextProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
