'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card } from './Card';
import type { Card as CardModel, CardType } from '../../types/card';
import {
  allCards,
  actionCards,
  trapCards,
  counterCards,
} from '../../data/cards/index';

export interface CardGalleryViewProps {
  initialType?: 'all' | CardType;
  fixedType?: CardType;
  title?: string;
  subtitle?: string;
  backHref?: string;
}

export function CardGalleryView({
  initialType = 'all',
  fixedType,
  title,
  subtitle,
  backHref = '/how-to-play',
}: CardGalleryViewProps) {
  const [selectedType, setSelectedType] = useState<'all' | CardType>(fixedType ?? initialType);
  const [searchQuery, setSearchQuery] = useState('');
  const [language, setLanguage] = useState<'th' | 'en'>('th');

  const baseCards = useMemo(() => {
    if (fixedType) {
      switch (fixedType) {
        case 'action':
          return actionCards;
        case 'trap':
          return trapCards;
        case 'counter':
          return counterCards;
      }
    }
    switch (selectedType) {
      case 'action':
        return actionCards;
      case 'trap':
        return trapCards;
      case 'counter':
        return counterCards;
      default:
        return allCards;
    }
  }, [fixedType, selectedType]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return baseCards;
    return baseCards.filter((card) => {
      const matchId = card.id.toLowerCase().includes(q);
      const matchNameTh = card.name_th.toLowerCase().includes(q);
      const matchNameEn = card.name_en.toLowerCase().includes(q);
      const matchDescTh = card.description_th.toLowerCase().includes(q);
      const matchDescEn = card.description_en.toLowerCase().includes(q);
      return matchId || matchNameTh || matchNameEn || matchDescTh || matchDescEn;
    });
  }, [baseCards, searchQuery]);

  const pageTitle = title ?? (fixedType ? `${fixedType.toUpperCase()} CARDS` : 'คลังการ์ดทั้งหมด');
  const pageSubtitle = subtitle ?? `รวมการ์ดทั้งหมด ${baseCards.length} ใบ`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4 pb-12">
      {/* Top Header */}
      <header className="flex items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            aria-label="ย้อนกลับ"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-card text-xl font-bold text-ink hover:bg-ink/5"
          >
            ←
          </Link>
          <div>
            <h1 className="text-base font-bold text-ink">{pageTitle}</h1>
            <p className="text-xs text-ink-secondary">{pageSubtitle}</p>
          </div>
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

      {/* Category Navigation Tabs (only if not a fixed single-type page) */}
      {!fixedType && (
        <div className="grid grid-cols-4 gap-1.5 rounded-card border border-ink/10 bg-card p-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedType('all')}
            className={`min-h-[36px] rounded-lg font-bold transition-colors ${
              selectedType === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            ทั้งหมด ({allCards.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('action')}
            className={`min-h-[36px] rounded-lg font-bold transition-colors ${
              selectedType === 'action'
                ? 'bg-action text-white shadow-sm'
                : 'text-ink-secondary hover:text-action'
            }`}
          >
            Action ({actionCards.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('trap')}
            className={`min-h-[36px] rounded-lg font-bold transition-colors ${
              selectedType === 'trap'
                ? 'bg-trap text-white shadow-sm'
                : 'text-ink-secondary hover:text-trap'
            }`}
          >
            Trap ({trapCards.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('counter')}
            className={`min-h-[36px] rounded-lg font-bold transition-colors ${
              selectedType === 'counter'
                ? 'bg-counter text-white shadow-sm'
                : 'text-ink-secondary hover:text-counter'
            }`}
          >
            Counter ({counterCards.length})
          </button>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <span className="absolute left-3.5 text-sm text-ink-secondary pointer-events-none">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ค้นหาด้วยรหัสการ์ด (เช่น A001, T01) หรือชื่อ..."
          className="min-h-[44px] w-full rounded-card border border-ink/15 bg-card pl-9 pr-8 text-xs sm:text-sm text-ink placeholder:text-ink-secondary/60 focus:border-primary focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 text-xs font-bold text-ink-secondary hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between px-1 text-xs text-ink-secondary">
        <span>
          แสดงผล {filteredCards.length} จาก {baseCards.length} ใบ
        </span>
        {searchQuery && <span className="font-semibold text-primary">กำลังค้นหา: &quot;{searchQuery}&quot;</span>}
      </div>

      {/* Cards 2-Column Responsive Grid */}
      {filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-ink/20 p-8 text-center">
          <span className="text-3xl">🔍</span>
          <p className="text-sm font-bold text-ink">ไม่พบการ์ดที่ค้นหา</p>
          <p className="text-xs text-ink-secondary">ลองค้นหาด้วยรหัสการ์ดอื่น เช่น A001, T01 หรือคำค้นอื่น</p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="mt-2 text-xs font-semibold text-primary underline"
          >
            ล้างคำค้นหา
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {filteredCards.map((card) => (
            <Link key={card.id} href={`/cards/${card.id}`} className="block h-full">
              <Card
                card={card}
                language={language}
                variant="compact"
                className="h-full cursor-pointer hover:border-primary/60"
              />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
