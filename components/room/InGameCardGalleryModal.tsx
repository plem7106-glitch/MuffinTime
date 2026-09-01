'use client';

import { useState, useMemo } from 'react';
import {
  allCards,
  actionCards,
  trapCards,
  counterCards,
  type Card as CardModel,
  type CardType,
} from '../../data/cards/index';
import { Card } from '../card/Card';
import { CardDetailModal } from '../card/CardDetailModal';
import { CloseIcon, CardsIcon } from '../ui/Icons';


export function InGameCardGalleryModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedType, setSelectedType] = useState<'all' | CardType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCardDetail, setActiveCardDetail] = useState<CardModel | null>(null);

  const baseCards = useMemo(() => {
    switch (selectedType) {
      case 'action':
        return Array.isArray(actionCards) ? actionCards : [];
      case 'trap':
        return Array.isArray(trapCards) ? trapCards : [];
      case 'counter':
        return Array.isArray(counterCards) ? counterCards : [];
      default:
        return Array.isArray(allCards)
          ? allCards
          : [
              ...(Array.isArray(actionCards) ? actionCards : []),
              ...(Array.isArray(trapCards) ? trapCards : []),
              ...(Array.isArray(counterCards) ? counterCards : []),
            ];
    }
  }, [selectedType]);

  const filteredCards = useMemo(() => {
    const cards = Array.isArray(baseCards) ? baseCards : [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((card) => {
      if (!card) return false;
      const matchId = (card.id || '').toLowerCase().includes(q);
      const matchNameTh = (card.name_th || '').toLowerCase().includes(q);
      const matchNameEn = (card.name_en || '').toLowerCase().includes(q);
      const matchDescTh = (card.description_th || '').toLowerCase().includes(q);
      const matchDescEn = (card.description_en || '').toLowerCase().includes(q);
      return matchId || matchNameTh || matchNameEn || matchDescTh || matchDescEn;
    });
  }, [baseCards, searchQuery]);

  if (!isOpen) return null;

  const totalCount = Array.isArray(allCards) ? allCards.length : (actionCards?.length ?? 0) + (trapCards?.length ?? 0) + (counterCards?.length ?? 0) || 231;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 animate-in fade-in duration-200">
      <div className="flex h-[88vh] w-full max-w-md flex-col rounded-3xl border border-gray-100 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CardsIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-ink">คลังข้อมูลไพ่</h2>
              <p className="text-[10px] text-ink-secondary">ไพ่ทั้งหมด {totalCount} ใบ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดคลังข้อมูลไพ่"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Filter Tabs & Search */}
        <div className="flex flex-col gap-2 p-3 bg-gray-50/70 border-b border-gray-100 shrink-0">
          {/* Search Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อไพ่ หรือ รหัส (เช่น A001)..."
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-ink placeholder:text-gray-400 focus:border-primary focus:outline-none shadow-2xs"
          />

          {/* Type Filters */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { key: 'all', label: 'ทั้งหมด' },
              { key: 'action', label: 'แอ็กชัน' },
              { key: 'trap', label: 'กับดัก' },
              { key: 'counter', label: 'ตอบโต้' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedType(tab.key as any)}
                className={`rounded-lg py-1 text-[11px] font-black transition-all ${
                  selectedType === tab.key
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white text-ink-secondary hover:bg-gray-100 border border-gray-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Card Grid View */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredCards.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center text-xs font-bold text-gray-400">
              ไม่พบไพ่ที่ค้นหา
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {filteredCards.map((card) => (
                <div key={card.id} className="cursor-pointer">
                  <Card
                    card={card}
                    variant="compact"
                    onClick={() => setActiveCardDetail(card)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Card Zoom Modal if clicked */}
        <CardDetailModal
          card={activeCardDetail}
          onClose={() => setActiveCardDetail(null)}
        />
      </div>
    </div>
  );

}
