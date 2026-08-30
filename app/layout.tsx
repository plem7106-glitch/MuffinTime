import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Muffin Time',
  description: 'เกมการ์ด Muffin Time เล่นผ่านเว็บกับเพื่อน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
