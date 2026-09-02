'use client';

import { Card } from '../card/Card';
import { getCardDisplay } from '../../data/cards/display';
import type { PresentationEvent } from '../../lib/presentation/presentationTypes';

export function IncomingCardPresentation({ event, onContinue }: { event: PresentationEvent; onContinue: () => void }) {
  if (!event.cardCode || !event.targetId) return null;
  const card = getCardDisplay(event.cardCode);
  const isCounter = event.type === 'COUNTER_PLAYED';
  if (event.type !== 'ACTION_PLAYED' && event.type !== 'COUNTER_PLAYED') return null;
  const accent = isCounter ? 'border-counter bg-counter/10' : 'border-action bg-action/10';
  const heading = isCounter ? 'มี Counter ถูกใช้กับคุณ' : 'มี Action ถูกใช้ใส่คุณ';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <section className={`my-auto flex w-full max-w-sm flex-col gap-3 rounded-3xl border-2 p-4 shadow-2xl ${accent}`} role="dialog" aria-modal="true">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-ink-secondary">Incoming card</p>
          <h2 className="text-xl font-black text-ink">{heading}</h2>
          <p className="mt-1 text-sm text-ink-secondary">{event.actorName ?? 'ผู้เล่น'} เป็นผู้ใช้การ์ดนี้</p>
        </div>
        <div className="mx-auto w-40">
          <Card type={card.type} id={card.code} title={card.th} description={card.effect} image={card.image} variant="compact" />
        </div>
        <div className="rounded-2xl bg-white/80 p-3 text-sm text-ink">
          <p className="font-bold">{card.th}</p>
          <p className="mt-1 whitespace-pre-line">{event.effectText ?? card.effect}</p>
          {event.contextLabel && <p className="mt-2 font-semibold text-ink-secondary">{event.contextLabel}</p>}
        </div>
        <button type="button" onClick={onContinue} className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-black text-white">ดำเนินการต่อ</button>
      </section>
    </div>
  );
}
