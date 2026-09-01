'use client';

export function HostSkipConfirmModal({ isOpen, currentPlayerName, nextPlayerName, onClose, onConfirm }: {
  isOpen: boolean;
  currentPlayerName: string;
  nextPlayerName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-2xl">
        <h2 className="text-lg font-black text-ink">ข้ามเทิร์นของ {currentPlayerName}?</h2>
        <p className="mt-2 text-sm text-ink-secondary">เทิร์นถัดไป: <strong>{nextPlayerName}</strong></p>
        <p className="mt-1 text-xs text-amber-700">ใช้เมื่อเกมค้างหรือเกิดข้อผิดพลาดเท่านั้น</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-ink-secondary">ยกเลิก</button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-xl bg-amber-600 py-3 text-sm font-bold text-white">ยืนยันข้ามเทิร์น</button>
        </div>
      </div>
    </div>
  );
}
