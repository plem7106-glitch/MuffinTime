'use client';

import { useRef, useState, type ReactNode, type PointerEvent } from 'react';

export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  if (!open) return null;

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    startY.current = e.clientY;
  }
  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    const delta = e.clientY - startY.current;
    if (delta > 0) setDragY(delta);
  }
  function handlePointerUp() {
    if (dragY > 80) onClose();
    setDragY(0);
    startY.current = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{ transform: `translateY(${dragY}px)`, maxHeight: '70vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/20" />
        {children}
      </div>
    </div>
  );
}
