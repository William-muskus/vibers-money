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

export default async function RootLayout(props: {
  children: React.ReactNode;
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  // Consume async params/searchParams so they are not enumerated by dev tools (Next.js 15)
  await Promise.all([
    props.params?.then(() => {}),
    props.searchParams?.then(() => {}),
  ].filter(Boolean));

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
      <body className="min-h-screen font-sans antialiased" style={{ fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif' }} suppressHydrationWarning>
        {props.children}
        <RegisterSW />
      </body>
    </html>
  );
}
