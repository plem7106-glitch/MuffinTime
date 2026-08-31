'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CARD_TYPE_THEMES } from '../../../components/card/Card';
import { getCardById, getAdjacentCards } from '../../../data/cards/index';

export default function CardDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [language, setLanguage] = useState<'th' | 'en'>('th');

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const cardId = params.id ? params.id.toUpperCase() : '';
  const card = useMemo(() => getCardById(cardId), [cardId]);

  // Find previous and next cards in the same type category
  const siblings = useMemo(() => {
    return getAdjacentCards(cardId);
  }, [cardId]);

  // Keyboard navigation support (ArrowLeft -> prev, ArrowRight -> next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && siblings.prev) {
        router.push(`/cards/${siblings.prev.id}`);
      } else if (e.key === 'ArrowRight' && siblings.next) {
        router.push(`/cards/${siblings.next.id}`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [siblings.prev, siblings.next, router]);

  // Touch swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const MIN_SWIPE_DISTANCE = 50; // pixels

    // Verify horizontal movement dominates vertical movement to avoid triggering during page scroll
    if (Math.abs(deltaX) >= MIN_SWIPE_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && siblings.next) {
        // Swiped Left -> Next Card
        router.push(`/cards/${siblings.next.id}`);
      } else if (deltaX > 0 && siblings.prev) {
        // Swiped Right -> Previous Card
        router.push(`/cards/${siblings.prev.id}`);
      }
    }
  };

  if (!card) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
        <span className="text-4xl">⚠️</span>
        <h1 className="text-lg font-bold text-ink">ไม่พบข้อมูลการ์ดรหัส &quot;{cardId}&quot;</h1>
        <p className="text-xs text-ink-secondary">กรุณาตรวจสอบรหัสการ์ดอีกครั้ง หรือกลับไปยังคลังการ์ด</p>
        <Link
          href="/cards"
          className="min-h-[44px] rounded-card bg-primary px-6 font-bold text-white flex items-center justify-center shadow-sm"
        >
          กลับสู่คลังการ์ด
        </Link>
      </main>
    );
  }

  const theme = CARD_TYPE_THEMES[card.type];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4 pb-12">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 py-1">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="ย้อนกลับ"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-card text-xl font-bold text-ink hover:bg-ink/5"
        >
          ←
        </button>

        <div className="flex flex-col items-center text-center">
          <span className={`text-xs font-bold uppercase tracking-wider ${theme.text}`}>
            {theme.label} ({card.id})
          </span>
          <span className="text-[11px] text-ink-secondary">
            ใบที่ {siblings.index} จาก {siblings.total} ใบ
          </span>
        </div>

        {/* Language Toggle */}
        <button
          type="button"
          onClick={() => setLanguage((prev) => (prev === 'th' ? 'en' : 'th'))}
          className="flex h-8 items-center gap-1 rounded-full border border-ink/15 bg-card px-2.5 text-xs font-semibold text-ink shadow-sm hover:border-primary"
        >
          <span>🌐</span>
          <span>{language.toUpperCase()}</span>
        </button>
      </header>

      {/* Main Full Card Presentation with Swipe Interaction */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
        className="flex flex-col gap-2 select-none"
      >
        <Card card={card} language={language} variant="full" />
      </div>

      {/* Card Metadata Details Box */}
      <section className="flex flex-col gap-2 rounded-card border border-ink/10 bg-card p-4 shadow-sm text-xs">
        <h2 className="font-bold text-ink text-sm border-b border-ink/5 pb-2">
          ข้อมูลการ์ด / Card Metadata
        </h2>
        <div className="grid grid-cols-2 gap-y-2 text-ink">
          <span className="text-ink-secondary">รหัสการ์ด (ID):</span>
          <span className="font-mono font-bold">{card.id}</span>

          <span className="text-ink-secondary">หมายเลขในหมวด (Number):</span>
          <span className="font-bold">{card.number}</span>

          <span className="text-ink-secondary">ประเภท (Type):</span>
          <span className={`font-bold uppercase ${theme.text}`}>
            {theme.label} ({theme.labelTh})
          </span>

          <span className="text-ink-secondary">ชื่อภาษาอังกฤษ:</span>
          <span className="font-semibold">{card.name_en}</span>

          <span className="text-ink-secondary">ชื่อภาษาไทย:</span>
          <span className="font-semibold">{card.name_th}</span>
        </div>

        {/* Detailed English Description */}
        <div className="mt-2 flex flex-col gap-1 border-t border-ink/5 pt-2">
          <span className="font-semibold text-ink-secondary">คำอธิบายภาษาอังกฤษ (English Text):</span>
          <p className="rounded bg-app-bg p-2.5 text-[11px] leading-relaxed text-ink-secondary">
            {card.description_en}
          </p>
        </div>
      </section>

      {/* Prev / Next Category Navigation */}
      <div className="flex items-center justify-between gap-3">
        {siblings.prev ? (
          <Link
            href={`/cards/${siblings.prev.id}`}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-card border border-ink/15 bg-card px-3 text-xs font-semibold text-ink shadow-sm hover:border-primary"
          >
            <span>←</span>
            <span className="truncate">{siblings.prev.id} {siblings.prev.name_th}</span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {siblings.next ? (
          <Link
            href={`/cards/${siblings.next.id}`}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-card border border-ink/15 bg-card px-3 text-xs font-semibold text-ink shadow-sm hover:border-primary"
          >
            <span className="truncate">{siblings.next.id} {siblings.next.name_th}</span>
            <span>→</span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {/* Category Link */}
      <Link
        href={`/cards/${card.type}`}
        className="flex min-h-[44px] items-center justify-center rounded-card border border-ink/15 bg-card text-xs font-bold text-ink-secondary hover:text-ink shadow-sm"
      >
        ดูการ์ด {theme.label} ทั้งหมด ({siblings.total} ใบ)
      </Link>
    </main>
  );
}
