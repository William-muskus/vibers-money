export const metadata = {
  title: 'vibers.money',
  description: 'AI agent swarm for your business',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1a1a2e',
};

import './globals.css';
import RegisterSW from '@/components/RegisterSW';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
