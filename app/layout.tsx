import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Fearville',
  description:
    'An in-person Trouble Brewing companion for Storytellers and players.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
