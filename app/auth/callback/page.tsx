'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { sanitizeRedirectPath } from '../../../lib/auth';
import { WarningIcon, RefreshIcon } from '../../../components/ui/Icons';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next');
  const safeNext = sanitizeRedirectPath(rawNext);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const [status, setStatus] = useState<'verifying' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    async function handleAuthCallback() {
      // 1. If Supabase returned an explicit error in searchParams (e.g. otp_expired, access_denied)
      if (errorParam) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AUTH] Callback received Supabase error param:', errorParam, errorDescription);
        }
        if (!isCancelled) {
          setStatus('error');
          if (errorParam === 'access_denied' || (errorDescription && errorDescription.toLowerCase().includes('expired'))) {
            setErrorMessage('ลิงก์เข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง');
          } else {
            setErrorMessage(errorDescription || 'เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองใหม่อีกครั้ง');
          }
        }
        return;
      }

      // 2. If an authorization code is present in the query parameters
      if (code) {
        try {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[AUTH] Exchanging auth code for session...');
          }
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }

          if (process.env.NODE_ENV !== 'production') {
            console.log('[AUTH] Code exchange successful. User authenticated:', data.user?.id);
            console.log('[AUTH] Redirecting to destination:', safeNext);
          }

          if (!isCancelled) {
            router.replace(safeNext);
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[AUTH] exchangeCodeForSession failed:', err);
          }
          if (!isCancelled) {
            setStatus('error');
            const msg = err instanceof Error ? err.message : '';
            if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('challenge') || msg.toLowerCase().includes('invalid')) {
              setErrorMessage('ลิงก์เข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง');
            } else {
              setErrorMessage('ไม่สามารถยืนยันตัวตนได้ กรุณากลับไปหน้าเข้าสู่ระบบแล้วลองใหม่');
            }
          }
        }
        return;
      }

      // 3. If neither error nor code in search params, check if user is already authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[AUTH] Existing session found. Redirecting to:', safeNext);
        }
        if (!isCancelled) {
          router.replace(safeNext);
        }
        return;
      }

      // 4. No code, no session, and no error — redirect to login
      if (!isCancelled) {
        router.replace(`/login?next=${encodeURIComponent(safeNext)}`);
      }
    }

    handleAuthCallback();

    return () => {
      isCancelled = true;
    };
  }, [code, errorParam, errorDescription, safeNext, router]);

  if (status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <WarningIcon className="h-7 w-7" />
        </div>
        <div className="flex flex-col gap-1.5 max-w-xs">
          <h2 className="text-lg font-black text-ink">เข้าสู่ระบบไม่สำเร็จ</h2>
          <p className="text-xs text-ink-secondary leading-relaxed">
            {errorMessage}
          </p>
        </div>
        <Link
          href={`/login?next=${encodeURIComponent(safeNext)}`}
          className="mt-2 flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-2xl bg-primary px-6 text-sm font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <RefreshIcon spinning className="h-7 w-7" />
      </div>
      <div className="flex flex-col gap-1.5 max-w-xs">
        <h2 className="text-base font-black text-ink">กำลังเข้าสู่ระบบ...</h2>
        <p className="text-xs text-ink-secondary">
          กรุณารอสักครู่ กำลังพาคุณเข้าสู่เกม Muffin Time
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white">
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <RefreshIcon spinning className="h-7 w-7" />
            </div>
            <p className="text-xs text-ink-secondary">กำลังโหลด...</p>
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </main>
  );
}
