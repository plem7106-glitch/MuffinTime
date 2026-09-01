'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { ChevronLeftIcon, UserIcon, CheckIcon, InfoIcon } from '../../components/ui/Icons';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const { sendMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail || !trimmedName) return;
    setStatus('sending');
    try {
      await sendMagicLink(trimmedEmail, trimmedName, next);
      setStatus('sent');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckIcon className="h-7 w-7 stroke-[3]" />
        </div>
        <h2 className="text-base font-black text-ink">ส่งลิงก์เข้าสู่ระบบแล้ว</h2>
        <p className="text-xs text-ink-secondary leading-relaxed">
          เช็คอีเมล {email} แล้วกดลิงก์เพื่อเข้าสู่ระบบ
          <br />
          (เปิดอีเมลจากเครื่องเดียวกับที่จะเล่นเกม)
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 flex-1">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-primary">
          <UserIcon className="h-4 w-4" />
          <label htmlFor="displayName" className="text-sm font-bold text-ink">
            ชื่อที่จะโชว์ในเกม
          </label>
        </div>
        <input
          id="displayName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="กรอกชื่อของคุณ"
          maxLength={20}
          className="w-full min-h-[50px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink placeholder:text-gray-300 placeholder:font-normal shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-bold text-ink">
          อีเมล
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full min-h-[50px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink placeholder:text-gray-300 placeholder:font-normal shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors"
        />
      </div>

      <div className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-3.5 flex items-start gap-2">
        <InfoIcon className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p className="text-[11px] text-ink-secondary leading-snug">
          ไม่ต้องตั้งรหัสผ่าน — ระบบจะส่งลิงก์เข้าสู่ระบบไปที่อีเมลของคุณ
        </p>
      </div>

      {status === 'error' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-600">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!email.trim() || !name.trim() || status === 'sending'}
        className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <span>{status === 'sending' ? 'กำลังส่ง...' : 'ส่งลิงก์เข้าสู่ระบบ'}</span>
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3.5 p-4 pb-8 bg-white">
      <header className="flex items-center justify-between py-0.5">
        <Link
          href="/"
          aria-label="ย้อนกลับไปหน้าหลัก"
          className="flex h-10 w-10 items-center justify-center text-ink transition-colors hover:text-primary active:scale-95"
        >
          <ChevronLeftIcon className="h-6 w-6 stroke-[2.5]" />
        </Link>
        <h1 className="text-lg font-bold text-ink">เข้าสู่ระบบ</h1>
        <div className="w-10" aria-hidden="true" />
      </header>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
