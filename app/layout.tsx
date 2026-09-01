import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../lib/auth';
import { GameSessionProvider } from '../lib/session';
import { AudioProvider } from '../lib/audio';

const notoSansThai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'] });

export const metadata: Metadata = {
  title: 'MUFFIN TIME',
  description: 'เกมไพ่สุดป่วนสำหรับเล่นกับเพื่อน',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={notoSansThai.className}>
        <AuthProvider>
          <AudioProvider>
            <GameSessionProvider>{children}</GameSessionProvider>
          </AudioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
