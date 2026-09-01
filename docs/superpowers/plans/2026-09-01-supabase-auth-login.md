# Supabase Auth Login (Magic Link) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded local player id `'me'` with a real Supabase Auth identity (magic-link email login), so a friend who signs in once can log back in from any device as the same person — without touching the multiplayer sync itself yet.

**Architecture:** A new `AuthProvider` (Supabase Auth session, magic link) sits above the existing `GameSessionProvider` in `app/layout.tsx`. `GameSessionProvider`'s reducer keeps working exactly as it does today (local, in-memory, bots included) — the only change is that `myPlayerId`/player display name now come from the authenticated user instead of the literal string `'me'` and a typed-in name. This intentionally ships working, testable software before the much larger Supabase multiplayer-sync plan touches the same reducer.

**Tech Stack:** Next.js App Router, React, TypeScript, `@supabase/supabase-js`'s built-in `.auth` module (already installed, no new dependency).

## Global Constraints

- No new dependencies — `@supabase/supabase-js` already provides everything needed for magic-link auth and session persistence.
- `vitest.config.ts` already injects fake `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars for the test run — importing `lib/supabase.ts` (or anything that imports it, like the new `lib/auth.tsx`) in a unit test is safe and makes no network call.
- No component-test infrastructure exists (`vitest.config.ts` runs in a `node` environment, not `jsdom`) — verify browser/redirect flows by running `npm run dev`, per this project's existing convention.
- `useSearchParams()` requires the component calling it to be wrapped in a `<Suspense>` boundary, or the production build fails (confirmed in this exact Next.js version's docs: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`, "Missing Suspense boundary with useSearchParams").
- UI copy stays Thai-only; reuse existing Tailwind theme tokens and only icons already exported from `components/ui/Icons.tsx` (`ChevronLeftIcon`, `UserIcon`, `CheckIcon`, `InfoIcon`, `UsersIcon`, `EnterDoorIcon` are used below — all already exist, no new icon needed).
- `.env.local` (gitignored, not committed) already has a working `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` pair — `npm run verify-supabase` confirms the `rooms` table is reachable.
- Two things must be set in the **Supabase Dashboard** (cannot be done from this repo — no Supabase CLI/service-role key configured here): the Email auth provider must be enabled (on by default for new projects), and the app's URL (e.g. `http://localhost:3000/`, plus the real domain once deployed) must be added to **Authentication → URL Configuration → Redirect URLs**, or magic-link emails will fail to redirect back. Called out again in Task 2.

---

### Task 1: `lib/auth.tsx` — AuthProvider, `useAuth`, and the pure `toAuthUser` mapper

**Files:**
- Create: `lib/auth.tsx`
- Test: `lib/auth.test.ts`

**Interfaces:**
- Consumes: `supabase` client from `lib/supabase.ts` (already exists, exports `supabase: SupabaseClient`).
- Produces: `AuthUser { id: string; name: string; email: string }`, `AuthValue { user: AuthUser | null; loading: boolean; sendMagicLink: (email: string, name: string, redirectPath?: string) => Promise<void>; signOut: () => Promise<void> }`, `AuthProvider({ children }: { children: ReactNode })`, `useAuth(): AuthValue`, and the exported pure helper `toAuthUser(session: Session | null): AuthUser | null` — all of Task 2-4 depend on these exact names.

- [ ] **Step 1: Write the failing test for `toAuthUser`**

Create `lib/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { toAuthUser } from './auth';

function fakeSession(overrides: { id?: string; email?: string; name?: string }): Session {
  return {
    user: {
      id: overrides.id ?? 'user-1',
      email: overrides.email ?? 'friend@example.com',
      user_metadata: overrides.name ? { name: overrides.name } : {},
    },
  } as unknown as Session;
}

describe('toAuthUser', () => {
  it('returns null when there is no session', () => {
    expect(toAuthUser(null)).toBeNull();
  });

  it('maps id, email, and metadata name from the session', () => {
    const session = fakeSession({ id: 'abc-123', email: 'bank@example.com', name: 'Bank' });
    expect(toAuthUser(session)).toEqual({ id: 'abc-123', email: 'bank@example.com', name: 'Bank' });
  });

  it('falls back to the email when user_metadata has no name', () => {
    const session = fakeSession({ id: 'abc-123', email: 'bank@example.com' });
    expect(toAuthUser(session)).toEqual({ id: 'abc-123', email: 'bank@example.com', name: 'bank@example.com' });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/auth.test.ts`
Expected: FAIL — `lib/auth.tsx` does not exist yet (`Cannot find module './auth'` or similar).

- [ ] **Step 3: Create `lib/auth.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  sendMagicLink: (email: string, name: string, redirectPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function toAuthUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const { id, email, user_metadata } = session.user;
  const metaName = (user_metadata as Record<string, unknown> | undefined)?.name;
  return {
    id,
    email: email ?? '',
    name: (typeof metaName === 'string' && metaName) || email || 'ผู้เล่น',
  };
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(toAuthUser(session));
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser(session));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendMagicLink = async (email: string, name: string, redirectPath = '/') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}${redirectPath}`,
        data: { name },
      },
    });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, sendMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run lib/auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/auth.tsx lib/auth.test.ts
git commit -m "feat: add Supabase Auth provider with magic-link sign-in"
```

---

### Task 2: `/login` page — email + display name form, sends the magic link

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`sendMagicLink`, from Task 1).
- Produces: the `/login` route that Task 4's route guards redirect to, with a `?next=<path>` query param it reads to know where to send the magic-link redirect.

**Context:** `useSearchParams()` needs its own component wrapped in `<Suspense>` (see Global Constraints) — structured as an inner `LoginForm` component wrapped by the default-exported page.

- [ ] **Step 1: Create `app/login/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Check the Supabase Dashboard settings (manual, one-time)**

Open the Supabase project dashboard for the project referenced in `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` → **Authentication → Providers**: confirm Email is enabled. Then **Authentication → URL Configuration → Redirect URLs**: add `http://localhost:3000/` (and the production domain later). Without this, magic-link emails will send but the confirmation link will be rejected.

- [ ] **Step 3: Visually verify**

Run: `npm run dev`, open `http://localhost:3000/login`. Expected: the header back arrow works, the form requires both fields before the submit button enables, and submitting with a real email you can check shows the "ส่งลิงก์เข้าสู่ระบบแล้ว" confirmation screen (full end-to-end click-through-the-email verification happens naturally in Task 4's manual test, once route guards exist to redirect here).

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add magic-link login page"
```

---

### Task 3: Wire `AuthProvider` into the app root

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `AuthProvider` from `lib/auth.tsx` (Task 1).
- Produces: `useAuth()` becomes callable from anywhere under `<body>`, which Task 4 relies on.

- [ ] **Step 1: Wrap `GameSessionProvider` with `AuthProvider`**

Find in `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import { GameSessionProvider } from '../lib/session';
import { AudioProvider } from '../lib/audio';
```

and

```tsx
      <body className={notoSansThai.className}>
        <AudioProvider>
          <GameSessionProvider>{children}</GameSessionProvider>
        </AudioProvider>
      </body>
```

Replace with:

```tsx
import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../lib/auth';
import { GameSessionProvider } from '../lib/session';
import { AudioProvider } from '../lib/audio';
```

and

```tsx
      <body className={notoSansThai.className}>
        <AuthProvider>
          <AudioProvider>
            <GameSessionProvider>{children}</GameSessionProvider>
          </AudioProvider>
        </AuthProvider>
      </body>
```

`AuthProvider` goes outermost because Task 4 makes `GameSessionProvider` call `useAuth()` internally — it must render underneath the provider whose context it reads.

- [ ] **Step 2: Verify the app still boots**

Run: `npm run dev`, open `http://localhost:3000`. Expected: home page renders exactly as before (no visible change yet — `GameSessionProvider` doesn't call `useAuth()` until Task 4).

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: mount AuthProvider above GameSessionProvider"
```

---

### Task 4: Use the real authenticated identity everywhere `'me'` was hardcoded

**Files:**
- Modify: `lib/session.tsx:1-34, 64-86, 131-163, 378-423`
- Modify: `app/create/page.tsx`
- Modify: `app/join/[code]/page.tsx`
- Modify: `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`user: AuthUser | null`, `loading: boolean`) from Task 1/3.
- Produces: `GameSessionValue.createRoom` signature changes from `(hostName: string, maxPlayers: number) => string` to `(maxPlayers: number) => string`; `GameSessionValue.joinRoom` changes from `(code: string, name: string) => void` to `(code: string) => void`. Both now throw if called with no authenticated user (callers are guarded so this shouldn't happen in practice, but the reducer no longer silently falls back to `'me'`).

**Context:** Today `'me'` is hardcoded as the local player's id in two places in `lib/session.tsx` (`CREATE_ROOM` and `JOIN_ROOM` reducer cases), and `app/create/page.tsx`/`app/join/[code]/page.tsx` collect the display name via a text input. This task swaps both to come from the authenticated session and adds redirect-to-login guards on every room-entry page. The reducer stays local/in-memory (bots, seeded `rooms` list, everything else) — only *whose id is "me"* changes. The bigger Supabase-sync rewrite is a separate plan.

- [ ] **Step 1: Update `lib/session.tsx`'s action types and reducer**

In the `Action` union (lines 64-66), replace:

```ts
  | { type: 'CREATE_ROOM'; code: string; hostName: string; maxPlayers: number }
  | { type: 'JOIN_ROOM'; code: string; name: string }
```

with:

```ts
  | { type: 'CREATE_ROOM'; code: string; hostId: PlayerId; hostName: string; maxPlayers: number }
  | { type: 'JOIN_ROOM'; code: string; playerId: PlayerId; name: string }
```

In the reducer (lines 133-163), replace the `CREATE_ROOM` and `JOIN_ROOM` cases:

```ts
    case 'CREATE_ROOM': {
      const roomState = engineCreateRoom('me', action.hostName, action.maxPlayers);
      return {
        ...state,
        myPlayerId: 'me',
        activeRoom: { code: action.code, state: roomState, maxPlayers: roomState.maxPlayers ?? action.maxPlayers },
        pendingResponse: null,
      };
    }
    case 'JOIN_ROOM': {
      const summary = state.rooms.find((r) => r.code === action.code);
      const maxPlayers = summary?.maxPlayers ?? 15;
      const hostName = summary?.hostName ?? 'เจ้าของห้อง';
      const existingOthers = Math.max((summary?.currentPlayers ?? 1) - 1, 0);
      try {
        let roomState = engineCreateRoom('bot-0', hostName, maxPlayers);
        for (let i = 1; i <= existingOthers; i++) {
          roomState = addPlayer(roomState, `bot-${i}`, BOT_NAME_POOL[(i - 1) % BOT_NAME_POOL.length]);
        }
        roomState = addPlayer(roomState, 'me', action.name);
        return {
          ...state,
          myPlayerId: 'me',
          activeRoom: { code: action.code, state: roomState, maxPlayers },
          pendingResponse: null,
        };
      } catch (err) {
        console.warn('Cannot join room:', err);
        return state;
      }
    }
```

with:

```ts
    case 'CREATE_ROOM': {
      const roomState = engineCreateRoom(action.hostId, action.hostName, action.maxPlayers);
      return {
        ...state,
        myPlayerId: action.hostId,
        activeRoom: { code: action.code, state: roomState, maxPlayers: roomState.maxPlayers ?? action.maxPlayers },
        pendingResponse: null,
      };
    }
    case 'JOIN_ROOM': {
      const summary = state.rooms.find((r) => r.code === action.code);
      const maxPlayers = summary?.maxPlayers ?? 15;
      const hostName = summary?.hostName ?? 'เจ้าของห้อง';
      const existingOthers = Math.max((summary?.currentPlayers ?? 1) - 1, 0);
      try {
        let roomState = engineCreateRoom('bot-0', hostName, maxPlayers);
        for (let i = 1; i <= existingOthers; i++) {
          roomState = addPlayer(roomState, `bot-${i}`, BOT_NAME_POOL[(i - 1) % BOT_NAME_POOL.length]);
        }
        roomState = addPlayer(roomState, action.playerId, action.name);
        return {
          ...state,
          myPlayerId: action.playerId,
          activeRoom: { code: action.code, state: roomState, maxPlayers },
          pendingResponse: null,
        };
      } catch (err) {
        console.warn('Cannot join room:', err);
        return state;
      }
    }
```

- [ ] **Step 2: Update `GameSessionValue`, `GameSessionProvider`, and their exports**

In the `GameSessionValue` interface (lines 378-405), replace:

```ts
  createRoom: (hostName: string, maxPlayers: number) => string;
  joinRoom: (code: string, name: string) => void;
```

with:

```ts
  createRoom: (maxPlayers: number) => string;
  joinRoom: (code: string) => void;
```

At the top of the file, add the import (alongside the existing `../game/room` import block):

```ts
import { useAuth } from './auth';
```

Inside `GameSessionProvider` (around line 410-423), add `const { user } = useAuth();` right after the `useReducer` call, and replace:

```ts
  const createRoomFn = useCallback((hostName: string, maxPlayers: number) => {
    const code = makeRoomCode();
    dispatch({ type: 'CREATE_ROOM', code, hostName, maxPlayers });
    return code;
  }, []);
  const joinRoomFn = useCallback((code: string, name: string) => {
    dispatch({ type: 'JOIN_ROOM', code, name });
  }, []);
```

with:

```ts
  const createRoomFn = useCallback(
    (maxPlayers: number) => {
      if (!user) throw new Error('ต้องเข้าสู่ระบบก่อนสร้างห้อง');
      const code = makeRoomCode();
      dispatch({ type: 'CREATE_ROOM', code, hostId: user.id, hostName: user.name, maxPlayers });
      return code;
    },
    [user]
  );
  const joinRoomFn = useCallback(
    (code: string) => {
      if (!user) throw new Error('ต้องเข้าสู่ระบบก่อนเข้าร่วมห้อง');
      dispatch({ type: 'JOIN_ROOM', code, playerId: user.id, name: user.name });
    },
    [user]
  );
```

- [ ] **Step 3: Replace `app/create/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGameSession } from '../../lib/session';
import { useAuth } from '../../lib/auth';
import {
  ChevronLeftIcon,
  UsersIcon,
  InfoIcon,
  EnterDoorIcon,
} from '../../components/ui/Icons';

export default function CreateRoomPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { createRoom } = useGameSession();
  const [maxPlayers, setMaxPlayers] = useState(3);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!user) return;
    const code = createRoom(maxPlayers);
    router.push(`/room/${code}`);
  }

  if (loading || !user) return null;

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
        <h1 className="text-lg font-bold text-ink">สร้างห้อง</h1>
        <div className="w-10" aria-hidden="true" />
      </header>

      <section className="flex items-center justify-between gap-3 py-1">
        <div className="flex w-32 shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/create-room/white-muffin-card.jpg"
            alt="White Muffin holding Red Card"
            className="h-28 w-28 object-contain drop-shadow-xs"
          />
        </div>

        <div className="flex flex-col text-left flex-1 min-w-0">
          <h2 className="text-2xl font-black text-ink leading-tight">
            <span className="text-primary">สร้างห้อง</span>ของคุณ
          </h2>
          <p className="text-xs font-medium text-ink-secondary leading-snug mt-1.5">
            สวัสดี {user.name} — เลือกจำนวนผู้เล่น
            <br />
            แล้วเชิญเพื่อนมาเล่นด้วยกัน!
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 flex-1">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-primary">
            <UsersIcon className="h-4 w-4" />
            <span className="text-sm font-bold text-ink">จำนวนผู้เล่น</span>
          </div>
          <p className="text-xs text-ink-secondary">
            เลือกจำนวนผู้เล่นในห้อง (รองรับ 3 – 15 คน)
          </p>

          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] mt-1">
            <button
              type="button"
              onClick={() => setMaxPlayers((prev) => Math.max(3, prev - 1))}
              disabled={maxPlayers <= 3}
              aria-label="ลดจำนวนผู้เล่น"
              className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              −
            </button>

            <span className="text-2xl font-black text-ink">{maxPlayers} คน</span>

            <button
              type="button"
              onClick={() => setMaxPlayers((prev) => Math.min(15, prev + 1))}
              disabled={maxPlayers >= 15}
              aria-label="เพิ่มจำนวนผู้เล่น"
              className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              +
            </button>
          </div>

          <div className="flex justify-center mt-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF0F3] px-3.5 py-1 text-xs font-bold text-primary border border-primary/10">
              <span>⭐</span>
              <span>แนะนำ 3 – 8 คน</span>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-200 my-0.5" />

        <div className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-3.5 flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-primary mb-0.5">
              <InfoIcon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold text-ink">เกี่ยวกับจำนวนผู้เล่น</span>
            </div>

            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-extrabold text-primary shrink-0 w-16">3 – 8 คน</span>
              <span className="text-[11px] text-ink-secondary leading-tight">เกมสมดุลที่สุด เล่นสนุกและกระชับ</span>
            </div>

            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-extrabold text-primary shrink-0 w-16">9 – 15 คน</span>
              <span className="text-[11px] text-ink-secondary leading-tight">เหมาะกับปาร์ตี้ใหญ่ อาจมีเทิร์นรอนานขึ้น</span>
            </div>

            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-extrabold text-primary shrink-0 w-16">15 คน</span>
              <span className="text-[11px] text-ink-secondary leading-tight">รองรับสูงสุดของ Web Version</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/create-room/brown-muffin-info.jpg"
              alt="Muffin mascot"
              className="h-16 w-16 object-contain drop-shadow-xs"
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
          <span>สร้างห้อง</span>
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Replace `app/join/[code]/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useGameSession } from '../../../lib/session';
import { useAuth } from '../../../lib/auth';
import {
  ChevronLeftIcon,
  InfoIcon,
  EnterDoorIcon,
  UsersIcon,
} from '../../../components/ui/Icons';

export default function JoinRoomPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ code: string }>();
  const roomCode = params.code || '';
  const { user, loading } = useAuth();
  const { rooms, joinRoom } = useGameSession();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  const summary = rooms.find((r) => r.code === roomCode);
  const isFull = summary ? summary.currentPlayers >= summary.maxPlayers : false;

  function handleJoin() {
    if (!user || !summary || isFull) return;
    joinRoom(roomCode);
    router.push(`/room/${roomCode}`);
  }

  if (loading || !user) return null;

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
        <h1 className="text-lg font-bold text-ink">เข้าร่วมห้อง</h1>
        <div className="w-10" aria-hidden="true" />
      </header>

      <section className="flex items-center justify-between gap-3 py-1">
        <div className="flex flex-col text-left flex-1 min-w-0">
          <h2 className="text-2xl font-black text-ink leading-tight">
            <span className="text-primary font-black">เข้าห้อง</span>เพื่อน
            <br />
            เริ่มความป่วนกันเลย!
          </h2>
          <p className="text-xs font-medium text-ink-secondary leading-snug mt-1.5">
            สวัสดี {user.name} — กดเข้าร่วมได้เลย
          </p>
        </div>

        <div className="flex w-32 shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/join-room/white-muffin-phone.jpg"
            alt="Muffin holding smartphone"
            className="h-28 w-28 object-contain drop-shadow-xs"
          />
        </div>
      </section>

      {summary ? (
        <section className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-ink-secondary px-0.5">
            ห้องที่คุณกำลังจะเข้าร่วม
          </span>
          <div className="flex flex-col gap-2.5 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <p className="text-sm sm:text-base font-bold text-ink">
                ห้องของ {summary.hostName}
              </p>
              {isFull && (
                <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  ห้องเต็มแล้ว
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-xl bg-primary/5 p-2.5 border border-primary/10">
                <span className="text-[10px] font-bold text-ink-secondary">รหัสห้อง</span>
                <span className="font-mono text-base font-black text-primary">{roomCode}</span>
              </div>

              <div className="flex flex-col gap-0.5 rounded-xl bg-gray-50 p-2.5 border border-gray-100">
                <span className="text-[10px] font-bold text-ink-secondary flex items-center gap-1">
                  <UsersIcon className="h-3 w-3 text-ink-secondary" />
                  <span>ผู้เล่นในห้อง</span>
                </span>
                <span className="text-base font-black text-ink">
                  {summary.currentPlayers} / {summary.maxPlayers} คน
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-red-200 bg-red-50/50 p-6 text-center">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm font-bold text-red-600">ไม่พบห้องรหัส {roomCode}</p>
          <p className="text-xs text-ink-secondary">
            โปรดตรวจสอบรหัสห้องอีกครั้ง หรือกลับไปเลือกห้องในหน้าหลัก
          </p>
          <Link
            href="/"
            className="mt-1 rounded-xl bg-white px-4 py-2 text-xs font-bold text-primary border border-primary/20 shadow-xs"
          >
            กลับหน้าหลัก
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-3.5 flex items-center justify-between gap-2 mt-auto">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-primary mb-0.5">
            <InfoIcon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-bold text-ink">เคล็ดลับ</span>
          </div>

          <ul className="flex flex-col gap-1 text-[11px] text-ink-secondary leading-snug">
            <li className="flex items-start gap-1">
              <span className="text-primary font-bold">•</span>
              <span>ตรวจสอบรหัสห้องให้ถูกต้อง</span>
            </li>
            <li className="flex items-start gap-1">
              <span className="text-primary font-bold">•</span>
              <span>หากเข้าห้องไม่ได้ ลองให้เจ้าของห้องสร้างใหม่</span>
            </li>
            <li className="flex items-start gap-1">
              <span className="text-primary font-bold">•</span>
              <span>เชื่อมต่ออินเทอร์เน็ตที่เสถียรเพื่อประสบการณ์ที่ดีที่สุด</span>
            </li>
          </ul>
        </div>

        <div className="flex shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/join-room/tips-muffin.jpg"
            alt="Muffin tips mascot"
            className="h-16 w-16 object-contain drop-shadow-xs"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleJoin}
        disabled={!summary || isFull}
        className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
        <span>เข้าร่วมห้อง</span>
      </button>
    </main>
  );
}
```

- [ ] **Step 5: Add the auth guard to `app/room/[code]/page.tsx`**

Find:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { useAudio } from '../../../lib/audio';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { TurnOrderSetup } from '../../../components/room/TurnOrderSetup';
import { GameTable } from '../../../components/room/GameTable';
import { GameResult } from '../../../components/room/GameResult';

export default function RoomPage() {
  const router = useRouter();
  const { activeRoom } = useGameSession();
  const { audioPhase, setAudioPhase } = useAudio();

  useEffect(() => {
    if (!activeRoom) {
      setAudioPhase('pre-game');
      router.replace('/');
      return;
    }

    if ((activeRoom.state.status === 'playing' || activeRoom.state.status === 'finished' || (activeRoom.state.status as string) === 'ended') && audioPhase !== 'gameplay') {
      setAudioPhase('gameplay');
    } else if (activeRoom.state.status === 'lobby' && audioPhase !== 'pre-game') {
      setAudioPhase('pre-game');
    }
  }, [activeRoom, router, audioPhase, setAudioPhase]);

  if (!activeRoom) return null;
```

Replace with:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { useAuth } from '../../../lib/auth';
import { useAudio } from '../../../lib/audio';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { TurnOrderSetup } from '../../../components/room/TurnOrderSetup';
import { GameTable } from '../../../components/room/GameTable';
import { GameResult } from '../../../components/room/GameResult';

export default function RoomPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeRoom } = useGameSession();
  const { audioPhase, setAudioPhase } = useAudio();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!activeRoom) {
      setAudioPhase('pre-game');
      router.replace('/');
      return;
    }

    if ((activeRoom.state.status === 'playing' || activeRoom.state.status === 'finished' || (activeRoom.state.status as string) === 'ended') && audioPhase !== 'gameplay') {
      setAudioPhase('gameplay');
    } else if (activeRoom.state.status === 'lobby' && audioPhase !== 'pre-game') {
      setAudioPhase('pre-game');
    }
  }, [authLoading, user, pathname, router, activeRoom, audioPhase, setAudioPhase]);

  if (authLoading || !user || !activeRoom) return null;
```

(The `switch` statement below this block is unchanged.)

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: all existing tests still pass (this task doesn't change `game/*.ts` or `multiplayer/*.ts`, and Task 1's `lib/auth.test.ts` already passed in Task 1).

- [ ] **Step 7: Manually verify end to end**

Run: `npm run dev`. From a fresh browser profile (or incognito window, so there's no existing session): open `http://localhost:3000/create` directly → expect an immediate redirect to `/login?next=%2Fcreate`. Fill in name + a real email you can check, submit, click the magic-link email → expect to land back on `/create` (not `/`), already signed in, with "สวัสดี &lt;your name&gt;" showing. Create a room, confirm bots fill in and the game is playable exactly as before. Then open `/join/&lt;some-seeded-code&gt;` (e.g. `/join/4829`) in a separate incognito window → expect the same login redirect/round-trip, landing back on the join page afterward.

- [ ] **Step 8: Commit**

```bash
git add lib/session.tsx app/create/page.tsx "app/join/[code]/page.tsx" "app/room/[code]/page.tsx"
git commit -m "feat: use the authenticated user's identity instead of hardcoded 'me'"
```

---

### Task 5: Require authentication at the database level (RLS)

**Files:**
- Create: `supabase/migrations/0002_require_auth_for_rooms.sql`

**Interfaces:**
- Consumes: nothing from this codebase — this is a Postgres policy change applied directly in the Supabase dashboard.
- Produces: the `rooms` table (used later by the Supabase multiplayer-sync plan) now rejects reads/writes from anyone without a Supabase Auth session, instead of the fully-open `using (true)` policies from `0001_create_rooms.sql`.

**Context:** `0001_create_rooms.sql` made `rooms` readable/writable by anyone holding the public anon key (deliberately, since there was no auth system yet). Now that real accounts exist, tighten it to "must be logged in" — still not "must be a player in this specific room," since the room-code-as-invite model means anyone who knows the code should be able to join, per the design spec's explicit scope decision.

- [ ] **Step 1: Create the migration file**

```sql
drop policy if exists "anyone can read rooms" on rooms;
drop policy if exists "anyone can insert rooms" on rooms;
drop policy if exists "anyone can update rooms" on rooms;

create policy "authenticated can read rooms" on rooms for select using (auth.uid() is not null);
create policy "authenticated can insert rooms" on rooms for insert with check (auth.uid() is not null);
create policy "authenticated can update rooms" on rooms for update using (auth.uid() is not null) with check (auth.uid() is not null);
```

- [ ] **Step 2: Apply it (manual — no Supabase CLI/service-role key is configured in this repo)**

Open the Supabase project's dashboard → **SQL Editor** → paste the contents of `supabase/migrations/0002_require_auth_for_rooms.sql` → **Run**. This matches how `0001_create_rooms.sql` was applied (see `scripts/verify-supabase.mjs`'s own error message, which points at the SQL Editor for the same reason).

- [ ] **Step 3: Confirm it applied without breaking `verify-supabase`**

Run: `npm run verify-supabase`
Expected: still prints "Connected to Supabase successfully" — the anon key now gets zero rows back from `select` (since `auth.uid()` is null for an unauthenticated request), which PostgREST reports as an empty result, not an error, so this check still passes. This is expected and fine; it does *not* mean the policy failed to apply.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_require_auth_for_rooms.sql
git commit -m "feat: require Supabase Auth session to read/write the rooms table"
```

---

## Self-Review Notes

- **Spec coverage:** "ระบบ Login จริง — Supabase Auth (Magic Link)" → Tasks 1-3. "ผลกับ `lib/session.tsx`" (identity plumbing) → Task 4. "RLS ของตาราง `rooms`" → Task 5. The spec's "เชื่อม `lib/session.tsx` เข้ากับ Supabase จริง" section (the fetch/write/subscribe rewrite) is intentionally **not** covered here — that's the separate `2026-09-01-supabase-multiplayer-sync.md` plan, per the scope split identified during planning (auth is independently shippable and de-risks the bigger rewrite).
- **Placeholder scan:** none — every step has complete before/after code, including the full replacement file contents for the two page components that changed enough to warrant a full rewrite rather than a diff snippet.
- **Type consistency:** `AuthUser`/`AuthValue` (Task 1) are used identically in Tasks 2 and 4 (`user.id`, `user.name`, `user.email`, `loading`, `sendMagicLink(email, name, redirectPath)`). `GameSessionValue.createRoom`/`joinRoom`'s new signatures (Task 4, Step 2) match exactly how Task 4 Steps 3-4 call them (`createRoom(maxPlayers)`, `joinRoom(roomCode)`, no name argument).
