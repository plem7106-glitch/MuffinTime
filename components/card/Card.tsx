'use client';

import { useState } from 'react';
import type { Card as CardModel, CardType } from '../../types/card';

export interface CardThemeConfig {
  label: string;
  labelTh: string;
  border: string;
  text: string;
  bgBadge: string;
  bgLight: string;
}

export const CARD_TYPE_THEMES: Record<CardType, CardThemeConfig> = {
  action: {
    label: 'ACTION',
    labelTh: 'แอ็กชัน',
    border: 'border-action',
    text: 'text-action',
    bgBadge: 'bg-action/10',
    bgLight: 'bg-action/5',
  },
  trap: {
    label: 'TRAP',
    labelTh: 'กับดัก',
    border: 'border-trap',
    text: 'text-trap',
    bgBadge: 'bg-trap/10',
    bgLight: 'bg-trap/5',
  },
  counter: {
    label: 'COUNTER',
    labelTh: 'ตอบโต้',
    border: 'border-counter',
    text: 'text-counter',
    bgBadge: 'bg-counter/10',
    bgLight: 'bg-counter/5',
  },
};

export interface CardProps {
  card?: CardModel;
  type?: CardType;
  id?: string;
  title?: string;
  description?: string;
  image?: string;
  language?: 'th' | 'en';
  variant?: 'full' | 'compact' | 'hand';
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Card({
  card,
  type = card?.type ?? 'action',
  id = card?.id,
  title,
  description,
  image = card?.image,
  language = 'th',
  variant = card ? 'full' : 'hand',
  selected = false,
  onClick,
  className = '',
}: CardProps) {
  const [imageError, setImageError] = useState(false);

  const theme = CARD_TYPE_THEMES[type] ?? CARD_TYPE_THEMES.action;
  const displayTitle = title ?? (card ? (language === 'en' ? card.name_en : card.name_th) : '');
  const displayDesc =
    description ?? (card ? (language === 'en' ? card.description_en : card.description_th) : '');

  const renderImageSlot = (isCompact = false) => {
    if (image && !imageError) {
      return (
        <div
          className={`w-full overflow-hidden rounded border border-ink/10 bg-ink/[0.02] ${
            isCompact ? 'aspect-[4/3] shrink-0' : 'aspect-[4/3] shrink-0'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={displayTitle}
            onError={() => setImageError(true)}
            className="h-full w-full object-contain"
          />
        </div>
      );
    }
    return (
      <div
        aria-hidden="true"
        className={`w-full rounded border border-dashed border-ink/10 bg-ink/[0.02] transition-colors ${
          isCompact ? 'aspect-[4/3] shrink-0' : 'aspect-[4/3] shrink-0'
        }`}
      />
    );
  };

  // Fixed-width horizontal player hand format (2:3 portrait)
  if (variant === 'hand') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-32 aspect-[2/3] shrink-0 flex-col justify-between rounded-card border-2 bg-card p-2 text-left shadow-sm transition-transform ${theme.border} ${
          selected ? '-translate-y-2 shadow-md ring-2 ring-primary' : ''
        } ${className}`}
      >
        <div className="flex items-center justify-between shrink-0">
          <span className={`text-xs font-bold ${theme.text}`}>{theme.label}</span>
          {id && <span className="text-[10px] font-mono text-ink-secondary">{id}</span>}
        </div>
        {renderImageSlot(true)}
        <div className="flex flex-col gap-0.5 min-h-0">
          <span className="text-xs font-bold text-ink line-clamp-1">{displayTitle}</span>
          <span className="line-clamp-2 text-[10px] text-ink-secondary">{displayDesc}</span>
        </div>
      </button>
    );
  }

  // 2-Column Responsive Card Library Grid Format (2:3 portrait)
  if (variant === 'compact') {
    const Component = onClick ? 'button' : 'div';
    return (
      <Component
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`group flex aspect-[2/3] w-full flex-col justify-between overflow-hidden rounded-card border-2 bg-card p-2.5 text-left shadow-sm transition-all hover:shadow-md ${theme.border} ${
          selected ? '-translate-y-1 shadow-md ring-2 ring-primary' : ''
        } ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <span className={`text-[11px] font-bold tracking-wider ${theme.text}`}>{theme.label}</span>
          {id && <span className="font-mono text-[11px] font-bold text-ink-secondary">{id}</span>}
        </div>

        {/* Empty / Reserved Image Slot */}
        {renderImageSlot(true)}

        {/* Title & Description */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <h4 className="text-xs sm:text-sm font-bold text-ink line-clamp-1 group-hover:text-primary transition-colors">
            {displayTitle}
          </h4>
          <p className="text-[11px] text-ink-secondary line-clamp-2 leading-tight">
            {displayDesc}
          </p>
        </div>
      </Component>
    );
  }

  // Full Card Format (2:3 portrait)
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex aspect-[2/3] w-full flex-col justify-between overflow-hidden rounded-card border-2 bg-card p-4 sm:p-5 shadow-sm text-left transition-all ${theme.border} ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } ${selected ? 'ring-2 ring-primary shadow-md' : ''} ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-ink/5 pb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${theme.text} ${theme.bgBadge}`}>
            {theme.label}
          </span>
          <span className="text-xs font-medium text-ink-secondary">{theme.labelTh}</span>
        </div>
        {id && <span className="font-mono text-xs font-bold text-ink-secondary">{id}</span>}
      </div>

      {/* Reserved Image Slot */}
      {renderImageSlot(false)}

      {/* Title & Description */}
      <div className="flex flex-col gap-1.5 pt-0.5 shrink-0 overflow-y-auto max-h-[38%]">
        <h3 className="text-base sm:text-lg font-bold text-ink leading-snug">{displayTitle}</h3>
        <p className="text-xs sm:text-sm leading-relaxed text-ink-secondary whitespace-pre-line break-words">
          {displayDesc}
        </p>
      </div>
    </Component>
  );
}
