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
import { SessionProvider } from '@/components/SessionProvider';
import { ClaimPendingOnSignIn } from '@/components/ClaimPendingOnSignIn';

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased bg-[#0c0c12]" style={{ fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif' }} suppressHydrationWarning>
        <SessionProvider>
          <ClaimPendingOnSignIn />
          {props.children}
          <RegisterSW />
        </SessionProvider>
      </body>
    </html>
  );
}
