import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/roboto';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Seafile-Facelift', template: '%s · Seafile-Facelift' },
  description: 'A modern, secure file workspace powered by Seafile.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.svg?v=2', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg?v=2',
  },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f14' },
  ],
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
