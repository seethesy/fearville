import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TutorialProvider } from '@/components/tutorials/provider';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};
export const metadata: Metadata = {
  title: 'Fearville',
  description:
    'An in-person Horrors of Fearville companion for Storytellers and players.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <TutorialProvider>{children}</TutorialProvider>
      </body>
    </html>
  );
}
