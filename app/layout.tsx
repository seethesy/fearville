import type { Metadata, Viewport } from 'next';
import './globals.css';
import './hub.css';
import './rite.css';
import './admin.css';
import { TextProvider } from '@/components/ui-text';
import { AccountBoundary } from '@/components/admin/boundary';
import { AccountProvider } from '@/components/hub/account-context';
import { TutorialProvider } from '@/components/tutorials/provider';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};
export const metadata: Metadata = {
  title: 'Fearville',
  icons: { icon: '/fearville-logo.png', apple: '/fearville-logo.png' },
  description:
    'An in-person Horrors of Fearville companion for Storytellers and players.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <AccountProvider>
          <TextProvider><AccountBoundary><TutorialProvider>{children}</TutorialProvider></AccountBoundary></TextProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
