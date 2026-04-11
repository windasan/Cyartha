// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
<link href='https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css' rel='stylesheet'></link>
export const metadata: Metadata = {
  title: 'Cyartha — Manajemen Keuangan KKN',
  description: 'Aplikasi pencatatan keuangan untuk program KKN',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Cyartha',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#001E36',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
