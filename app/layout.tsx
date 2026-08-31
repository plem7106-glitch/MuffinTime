import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import { GameSessionProvider } from '../lib/session';

const notoSansThai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'] });

export const metadata: Metadata = {
  title: 'Muffin Time',
  description: 'เกมการ์ด Muffin Time เล่นผ่านเว็บกับเพื่อน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={notoSansThai.className}>
        <GameSessionProvider>{children}</GameSessionProvider>
      </body>
    </html>
  );
}
