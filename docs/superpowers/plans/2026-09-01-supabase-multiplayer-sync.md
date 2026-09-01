# Supabase Multiplayer Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lib/session.tsx`'s local in-memory reducer (fake seeded rooms, bots, everything client-only) with real Supabase-backed rooms — friends on different phones create/join a room by code and see the same live game state, using the already-built (but currently unused) `multiplayer/room.ts` and `multiplayer/realtime.ts`.

**Architecture:** `GameSessionProvider` keeps its current public shape (same context, mostly the same function names) so `WaitingRoom`, `TurnOrderSetup`, `GameTable`, `GameResult` don't need restructuring. Internally, every game action becomes an `updateRoomWithRetry` call whose updater is the same pure `game/*.ts` function the local reducer already called — the *only* thing that changes is where the resulting `RoomState` goes (a Postgres row instead of a `useReducer` state) and where it comes back from (a Realtime subscription instead of the same function call). `pendingResponse`/`lastResult` (the counter-response-window state) move from client-local state into `RoomState` itself, since other players now need to see them too — guarded by `responseId` as an idempotency token so two clients racing to resolve the same window can't double-apply an effect.

**Tech Stack:** Next.js App Router, React, TypeScript, `@supabase/supabase-js` (Postgres + Realtime, already installed).

## Global Constraints

- **Depends on `2026-09-01-supabase-auth-login.md` being done first** — this plan's `lib/session.tsx` rewrite calls `useAuth()`, and Tasks 6-8 diff against that plan's versions of `app/create/page.tsx`, `app/join/[code]/page.tsx`, `app/room/[code]/page.tsx`. Independent of `2026-09-01-card-table-visuals.md` (touches different files, no ordering requirement either way).
- No new dependencies — reuse `multiplayer/room.ts` (`fetchRoom`, `writeRoomState`, `updateRoomWithRetry`) and `multiplayer/realtime.ts` (`subscribeToRoom`, `unsubscribeFromRoom`), both already built and unit-tested. Don't reinvent room fetch/write/subscribe logic.
- `vitest.config.ts` already injects fake `NEXT_PUBLIC_SUPABASE_*` env vars — unit tests for `multiplayer/room.ts` use a mocked `SupabaseClient` object (see the existing `fakeClient` helper in `multiplayer/room.test.ts`), never a real network call.
- No component-test infrastructure exists (`node` env, not `jsdom`) — verify multiplayer flows by running `npm run dev` in **two separate browser sessions** (e.g. one normal window + one incognito window, each logged into a *different* email via the `/login` magic link, so they get distinct `user.id`s — a single Supabase account can't play against itself).
- `game/*.ts` engine functions throw on invalid transitions (`addPlayer` on a full/started room, `placeTrap` past 3, `startGame`/`startSetup` under 3 players). Don't re-implement that validation in `lib/session.tsx` — let the throw propagate out of the action function so the caller can catch and show it. Only keep guards in `lib/session.tsx` that the engine has no way to know about (authorization — "only the host may do X").
- `PendingResponse.responseId` is a required idempotency token (see `game/types.ts` changes in Task 1). Every updater that resolves a `pendingResponse` (`playCounter`, `skipCounter`) **must** check `state.pendingResponse?.responseId === responseId` before applying any effect, and no-op (`return state`) otherwise — this is what stops two clients racing to auto-skip the same counter window from both applying the underlying action's effect.
- No optimistic local state updates — every action writes to Supabase and waits for the Realtime echo to update the UI, per the approved spec. An `isWriting` ref (not exposed to consumers) blocks a second write from starting while one is in flight, to stop accidental double-taps (e.g. double-draw) during that round trip.

---

### Task 1: Move `pendingResponse`/`lastResult` into `RoomState`

**Files:**
- Modify: `game/types.ts`

**Interfaces:**
- Produces: `PendingResponse { responseId: string; kind: 'action' | 'trap'; code: CardCode; actorId: PlayerId; targetId?: PlayerId }`, `LastResult { responseId?: string; kind: 'action' | 'trap'; code: CardCode; actorId: PlayerId; targetId?: PlayerId; countered: boolean; counteredBy?: PlayerId; counterCode?: CardCode }`, and `RoomState.pendingResponse?: PendingResponse | null` / `RoomState.lastResult?: LastResult | null`. Task 3 imports both types from here instead of defining them locally (as `lib/session.tsx` did before).

- [ ] **Step 1: Add the two interfaces and the two `RoomState` fields**

Find in `game/types.ts`:

```ts
export interface PlayerState {
  name: string;
  hand: CardCode[];
  traps: CardCode[];
  connected: boolean;
  hasCalledMuffinTime: boolean;
  skipNextTurn: boolean;
}
```

Insert immediately before it:

```ts
export interface PendingResponse {
  responseId: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
}

export interface LastResult {
  responseId?: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
  countered: boolean;
  counteredBy?: PlayerId;
  counterCode?: CardCode;
}

```

Then find:

```ts
  isShufflingDrawPile?: boolean;
  shuffleSequence?: number;
  roundNumber?: number;
}
```

Replace with:

```ts
  isShufflingDrawPile?: boolean;
  shuffleSequence?: number;
  roundNumber?: number;
  pendingResponse?: PendingResponse | null;
  lastResult?: LastResult | null;
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests still pass — both new fields are optional, so no existing `RoomState`-producing test needs updating.

- [ ] **Step 3: Commit**

```bash
git add game/types.ts
git commit -m "feat: add pendingResponse/lastResult to RoomState for cross-device sync"
```

---

### Task 2: Room creation helpers in `multiplayer/room.ts`

**Files:**
- Modify: `multiplayer/room.ts`
- Modify: `multiplayer/room.test.ts`

**Interfaces:**
- Consumes: `createRoom` from `game/room.ts` (existing, `(hostId, hostName, maxPlayers) => RoomState`).
- Produces: `makeRoomCode(rng?: () => number): string`, `insertRoom(client, code, state): Promise<boolean>`, `createRoomWithRetry(client, hostId, hostName, maxPlayers, maxAttempts?, rng?): Promise<{ code: string; state: RoomState }>` — Task 3 calls `createRoomWithRetry` directly.

**Context:** There's currently no "create a room row" helper anywhere — the old `lib/session.tsx` never inserted into Supabase at all (`makeRoomCode` there just generated a code for a fake local room). This task adds a real 4-character room code generator (digits/letters, minus visually-confusable characters) plus insert-with-retry-on-collision, colocated with the rest of the Supabase room I/O in `multiplayer/room.ts`.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `multiplayer/room.test.ts` (keep the existing `fakeClient` helper and its imports — this just adds new `describe` blocks and extends the fake client to support `.insert(...)`):

```ts
import { makeRoomCode, insertRoom, createRoomWithRetry } from './room';

function fakeInsertClient({
  insertResults,
}: {
  insertResults: Array<{ error: { code?: string; message: string } | null }>;
}): SupabaseClient {
  let insertCall = 0;
  return {
    from: () => ({
      insert: async () => insertResults[insertCall++],
    }),
  } as unknown as SupabaseClient;
}

describe('makeRoomCode', () => {
  it('generates a 4-character code from the confusable-free charset', () => {
    const code = makeRoomCode(() => 0);
    expect(code).toHaveLength(4);
    expect(code).not.toMatch(/[01OI]/);
  });

  it('is deterministic for a fixed rng', () => {
    const code = makeRoomCode(() => 0.5);
    expect(makeRoomCode(() => 0.5)).toBe(code);
  });
});

describe('insertRoom', () => {
  it('returns true when the insert succeeds', async () => {
    const client = fakeInsertClient({ insertResults: [{ error: null }] });
    const ok = await insertRoom(client, 'ABCD', { status: 'lobby' } as unknown as RoomState);
    expect(ok).toBe(true);
  });

  it('returns false on a unique-violation (code already taken)', async () => {
    const client = fakeInsertClient({ insertResults: [{ error: { code: '23505', message: 'duplicate key' } }] });
    const ok = await insertRoom(client, 'ABCD', { status: 'lobby' } as unknown as RoomState);
    expect(ok).toBe(false);
  });

  it('throws on any other error', async () => {
    const client = fakeInsertClient({ insertResults: [{ error: { message: 'network down' } }] });
    await expect(insertRoom(client, 'ABCD', { status: 'lobby' } as unknown as RoomState)).rejects.toThrow(/network down/);
  });
});

describe('createRoomWithRetry', () => {
  it('returns the code and state on the first successful insert', async () => {
    const client = fakeInsertClient({ insertResults: [{ error: null }] });
    const { code, state } = await createRoomWithRetry(client, 'host-1', 'Bank', 4, 5, () => 0);
    expect(code).toHaveLength(4);
    expect(state.hostId).toBe('host-1');
    expect(state.players['host-1'].name).toBe('Bank');
  });

  it('retries with a new code after a collision', async () => {
    const client = fakeInsertClient({
      insertResults: [{ error: { code: '23505', message: 'duplicate key' } }, { error: null }],
    });
    const { state } = await createRoomWithRetry(client, 'host-1', 'Bank', 4, 5, () => 0);
    expect(state.hostId).toBe('host-1');
  });

  it('throws after exhausting maxAttempts', async () => {
    const client = fakeInsertClient({
      insertResults: Array(3).fill({ error: { code: '23505', message: 'duplicate key' } }),
    });
    await expect(createRoomWithRetry(client, 'host-1', 'Bank', 4, 3, () => 0)).rejects.toThrow(
      /failed to find an unused room code/
    );
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run multiplayer/room.test.ts`
Expected: FAIL — `makeRoomCode`, `insertRoom`, `createRoomWithRetry` are not exported from `./room` yet.

- [ ] **Step 3: Implement the three functions**

Add to `multiplayer/room.ts` (after the existing imports, before `RoomRow`):

```ts
import { createRoom as engineCreateRoom } from '../game/room';
import type { PlayerId } from '../game/types';
```

Add at the end of the file:

```ts
const ROOM_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I — avoids visual mixups
const ROOM_CODE_LENGTH = 4;

export function makeRoomCode(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_CHARSET[Math.floor(rng() * ROOM_CODE_CHARSET.length)];
  }
  return out;
}

export async function insertRoom(client: SupabaseClient, code: string, state: RoomState): Promise<boolean> {
  const { error } = await client.from('rooms').insert({ code, state, version: 0 });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(`insertRoom failed: ${error.message}`);
  }
  return true;
}

export async function createRoomWithRetry(
  client: SupabaseClient,
  hostId: PlayerId,
  hostName: string,
  maxPlayers: number,
  maxAttempts = 5,
  rng: () => number = Math.random
): Promise<{ code: string; state: RoomState }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = makeRoomCode(rng);
    const state = engineCreateRoom(hostId, hostName, maxPlayers);
    const inserted = await insertRoom(client, code, state);
    if (inserted) return { code, state };
  }
  throw new Error(`createRoomWithRetry: failed to find an unused room code after ${maxAttempts} attempts`);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run multiplayer/room.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Commit**

```bash
git add multiplayer/room.ts multiplayer/room.test.ts
git commit -m "feat: add room-code generation and insert-with-retry to multiplayer/room.ts"
```

---

### Task 3: Rewrite `lib/session.tsx` to run on real Supabase rooms

**Files:**
- Modify: `lib/session.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAuth()` (Plan A), `fetchRoom`/`updateRoomWithRetry`/`createRoomWithRetry` (`multiplayer/room.ts`), `subscribeToRoom`/`unsubscribeFromRoom` (`multiplayer/realtime.ts`), `PendingResponse`/`LastResult` (`game/types.ts`, Task 1), and all the same `game/*.ts` pure functions the old reducer used.
- Produces the new `GameSessionValue`:
  ```ts
  export interface ActiveRoom { code: string; state: RoomState; }
  export interface GameSessionValue {
    activeRoom: ActiveRoom | null;
    myPlayerId: PlayerId | null;
    pendingResponse: PendingResponse | null;
    lastResult: LastResult | null;
    error: string | null;
    clearLastResult: () => void;
    createRoom: (maxPlayers: number) => Promise<string>;
    joinRoom: (code: string) => Promise<void>;
    previewRoom: (code: string) => Promise<RoomState | null>;
    resumeRoom: (code: string) => Promise<void>;
    leaveRoom: () => void;
    startSetup: () => void;
    setSeatOrder: (seatOrder: PlayerId[]) => void;
    setPlayDirection: (direction: PlayDirection) => void;
    confirmTurnOrder: () => void;
    drawCard: () => void;
    playAction: (code: CardCode, targetId?: PlayerId) => void;
    placeTrapCard: (code: CardCode) => void;
    openTrapCard: (code: CardCode, targetId?: PlayerId) => void;
    playCounter: (code: CardCode, responseId: string) => void;
    skipCounter: (responseId: string) => void;
    declareMuffinTime: () => void;
    finishGame: (winnerId: PlayerId, reason?: 'normal' | 'manual') => void;
    playAgain: () => void;
    shuffleDrawPile: () => void;
    finishShuffleDrawPile: () => void;
  }
  ```
  This drops `rooms: RoomSummary[]` and `joinNextBot` (bots and the fake open-rooms list are gone) and changes `createRoom`/`joinRoom`/`playCounter`/`skipCounter` signatures — Tasks 4-9 update every call site that's affected.

- [ ] **Step 1: Replace the entire contents of `lib/session.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { fetchRoom, updateRoomWithRetry, createRoomWithRetry } from '../multiplayer/room';
import { subscribeToRoom, unsubscribeFromRoom } from '../multiplayer/realtime';
import {
  addPlayer,
  startSetup as engineStartSetup,
  updateSeatOrder as engineUpdateSeatOrder,
  updatePlayDirection as engineUpdatePlayDirection,
  startGame as engineStartGame,
  finishGame as engineFinishGame,
  resetForPlayAgain as engineResetForPlayAgain,
} from '../game/room';
import { draw, discard, balancedShuffleDrawPile } from '../game/pile';
import { placeTrap as enginePlaceTrap, removeTrap } from '../game/trap';
import { advanceTurn, checkWinnerAtTurnStart, declareMuffinTime as engineDeclareMuffinTime } from '../game/turn';
import type { RoomState, PlayerId, CardCode, PlayDirection, PendingResponse, LastResult } from '../game/types';
import { buildDemoDeck, resolveActionCard, resolveTrapCard, resolveCounterCard, getValidCounterCards } from './demoCards';

export interface ActiveRoom {
  code: string;
  state: RoomState;
}

export interface GameSessionValue {
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  pendingResponse: PendingResponse | null;
  lastResult: LastResult | null;
  error: string | null;
  clearLastResult: () => void;
  createRoom: (maxPlayers: number) => Promise<string>;
  joinRoom: (code: string) => Promise<void>;
  previewRoom: (code: string) => Promise<RoomState | null>;
  resumeRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  startSetup: () => void;
  setSeatOrder: (seatOrder: PlayerId[]) => void;
  setPlayDirection: (direction: PlayDirection) => void;
  confirmTurnOrder: () => void;
  drawCard: () => void;
  playAction: (code: CardCode, targetId?: PlayerId) => void;
  placeTrapCard: (code: CardCode) => void;
  openTrapCard: (code: CardCode, targetId?: PlayerId) => void;
  playCounter: (code: CardCode, responseId: string) => void;
  skipCounter: (responseId: string) => void;
  declareMuffinTime: () => void;
  finishGame: (winnerId: PlayerId, reason?: 'normal' | 'manual') => void;
  playAgain: () => void;
  shuffleDrawPile: () => void;
  finishShuffleDrawPile: () => void;
}

const GameSessionContext = createContext<GameSessionValue | null>(null);

function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  if (checkWinnerAtTurnStart(advanced, currentId)) {
    return { ...advanced, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return advanced;
}

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const myPlayerId = user?.id ?? null;

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedResponseId, setDismissedResponseId] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof subscribeToRoom> | null>(null);
  const isWritingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (channelRef.current) unsubscribeFromRoom(channelRef.current);
    };
  }, []);

  const enterRoom = useCallback(async (code: string) => {
    if (channelRef.current) {
      unsubscribeFromRoom(channelRef.current);
      channelRef.current = null;
    }
    const row = await fetchRoom(supabase, code);
    setRoomCode(code);
    setRoomState(row.state);
    channelRef.current = subscribeToRoom(supabase, code, setRoomState);
  }, []);

  const run = useCallback(
    async (updater: (state: RoomState) => RoomState) => {
      if (!roomCode || isWritingRef.current) return;
      isWritingRef.current = true;
      setError(null);
      try {
        await updateRoomWithRetry(supabase, roomCode, updater);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
      } finally {
        isWritingRef.current = false;
      }
    },
    [roomCode]
  );

  const createRoomFn = useCallback(
    async (maxPlayers: number) => {
      if (!user) throw new Error('ต้องเข้าสู่ระบบก่อนสร้างห้อง');
      const { code } = await createRoomWithRetry(supabase, user.id, user.name, maxPlayers);
      await enterRoom(code);
      return code;
    },
    [user, enterRoom]
  );

  const joinRoomFn = useCallback(
    async (code: string) => {
      if (!user) throw new Error('ต้องเข้าสู่ระบบก่อนเข้าร่วมห้อง');
      await updateRoomWithRetry(supabase, code, (state) => {
        if (state.players[user.id]) return state; // already a member — resume, don't re-add
        return addPlayer(state, user.id, user.name);
      });
      await enterRoom(code);
    },
    [user, enterRoom]
  );

  const previewRoom = useCallback(async (code: string): Promise<RoomState | null> => {
    try {
      const row = await fetchRoom(supabase, code);
      return row.state;
    } catch {
      return null;
    }
  }, []);

  const resumeRoom = useCallback(
    async (code: string) => {
      await enterRoom(code);
    },
    [enterRoom]
  );

  const leaveRoom = useCallback(() => {
    if (channelRef.current) {
      unsubscribeFromRoom(channelRef.current);
      channelRef.current = null;
    }
    setRoomCode(null);
    setRoomState(null);
    setError(null);
  }, []);

  const startSetupFn = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        return engineStartSetup(state);
      }),
    [run, myPlayerId]
  );

  const setSeatOrderFn = useCallback(
    (seatOrder: PlayerId[]) =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        const expectedCount = Object.keys(state.players).length;
        const validIds = seatOrder.filter((id) => state.players[id] !== undefined);
        if (validIds.length !== expectedCount || new Set(validIds).size !== expectedCount) return state;
        return engineUpdateSeatOrder(state, validIds);
      }),
    [run, myPlayerId]
  );

  const setPlayDirectionFn = useCallback(
    (direction: PlayDirection) =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        return engineUpdatePlayDirection(state, direction);
      }),
    [run, myPlayerId]
  );

  const confirmTurnOrderFn = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        return engineStartGame(state, buildDemoDeck());
      }),
    [run, myPlayerId]
  );

  const drawCard = useCallback(
    () =>
      run((state) => {
        if (state.pendingResponse) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        return advanceAndCheckWin(draw(state, myPlayerId!, 1));
      }),
    [run, myPlayerId]
  );

  const playAction = useCallback(
    (code: CardCode, targetId?: PlayerId) =>
      run((state) => {
        if (state.pendingResponse) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        const actorId = myPlayerId!;
        const afterDiscard = discard(state, actorId, 1, [code]);
        const responseId = `action-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          ...afterDiscard,
          pendingResponse: { responseId, kind: 'action', code, actorId, targetId },
        };
      }),
    [run, myPlayerId]
  );

  const placeTrapCard = useCallback(
    (code: CardCode) => run((state) => enginePlaceTrap(state, myPlayerId!, code)),
    [run, myPlayerId]
  );

  const openTrapCard = useCallback(
    (code: CardCode, targetId?: PlayerId) =>
      run((state) => {
        if (state.pendingResponse) return state;
        const ownerId = myPlayerId!;
        const afterRemove = removeTrap(state, ownerId, code);
        const responseId = `trap-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          ...afterRemove,
          pendingResponse: { responseId, kind: 'trap', code, actorId: ownerId, targetId },
        };
      }),
    [run, myPlayerId]
  );

  const playCounter = useCallback(
    (code: CardCode, responseId: string) =>
      run((state) => {
        if (!state.pendingResponse || state.pendingResponse.responseId !== responseId) return state;
        const counterActorId = myPlayerId!;
        const afterDiscard = discard(state, counterActorId, 1, [code]);
        const resolved = resolveCounterCard(afterDiscard, code, counterActorId);
        const finalState = state.pendingResponse.kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
        return {
          ...finalState,
          pendingResponse: null,
          lastResult: { ...state.pendingResponse, countered: true, counteredBy: counterActorId, counterCode: code },
        };
      }),
    [run, myPlayerId]
  );

  const skipCounter = useCallback(
    (responseId: string) =>
      run((state) => {
        if (!state.pendingResponse || state.pendingResponse.responseId !== responseId) return state;
        const { kind, code, actorId, targetId } = state.pendingResponse;
        const resolved =
          kind === 'action'
            ? resolveActionCard(state, code, actorId, targetId)
            : resolveTrapCard(state, code, actorId, targetId);
        const finalState = kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
        return {
          ...finalState,
          pendingResponse: null,
          lastResult: kind === 'trap' ? { responseId, kind, code, actorId, targetId, countered: false } : null,
        };
      }),
    [run]
  );

  const declareMuffinTimeFn = useCallback(
    () => run((state) => engineDeclareMuffinTime(state, myPlayerId!)),
    [run, myPlayerId]
  );

  const clearLastResult = useCallback(() => {
    if (roomState?.lastResult?.responseId) setDismissedResponseId(roomState.lastResult.responseId);
  }, [roomState]);

  const finishGameFn = useCallback(
    (winnerId: PlayerId, reason: 'normal' | 'manual' = 'normal') =>
      run((state) => {
        if (state.status !== 'playing') return state;
        if (myPlayerId !== state.hostId) return state;
        if (!state.players[winnerId]) return state;
        return { ...engineFinishGame(state, winnerId, reason), pendingResponse: null };
      }),
    [run, myPlayerId]
  );

  const playAgain = useCallback(
    () =>
      run((state) => {
        const currentStatus = state.status;
        if (currentStatus !== 'finished' && (currentStatus as string) !== 'ended') return state;
        if (myPlayerId !== state.hostId) return state;
        return { ...engineResetForPlayAgain(state), pendingResponse: null, lastResult: null };
      }),
    [run, myPlayerId]
  );

  const shuffleDrawPile = useCallback(
    () =>
      run((state) => {
        if (state.status !== 'playing') return state;
        if (myPlayerId !== state.hostId) return state;
        if (state.pendingResponse || state.isShufflingDrawPile) return state;
        if (state.drawPile.length <= 1) return state;
        const shuffled = balancedShuffleDrawPile(state);
        shuffled.isShufflingDrawPile = true;
        shuffled.shuffleSequence = (state.shuffleSequence ?? 0) + 1;
        return shuffled;
      }),
    [run, myPlayerId]
  );

  const finishShuffleDrawPile = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        if (!state.isShufflingDrawPile) return state;
        return { ...state, isShufflingDrawPile: false };
      }),
    [run, myPlayerId]
  );

  // Auto-skip the counter window when this player's hand has no valid counter to play.
  // Runs per-client (each player checks only their own hand) — safe to race across
  // clients because skipCounter/playCounter both check responseId before applying anything.
  useEffect(() => {
    const pendingResponse = roomState?.pendingResponse;
    if (!pendingResponse || !myPlayerId || !roomState) return;

    const isTrapTarget =
      pendingResponse.kind === 'trap' &&
      pendingResponse.actorId !== myPlayerId &&
      (!pendingResponse.targetId || pendingResponse.targetId === myPlayerId);
    if (isTrapTarget) return;

    const myHand = roomState.players[myPlayerId]?.hand ?? [];
    const validCounters = getValidCounterCards(myHand, pendingResponse);
    if (validCounters.length === 0) {
      const responseId = pendingResponse.responseId;
      const timer = setTimeout(() => skipCounter(responseId), 400);
      return () => clearTimeout(timer);
    }
  }, [roomState, myPlayerId, skipCounter]);

  const rawLastResult = roomState?.lastResult ?? null;
  const lastResult =
    rawLastResult && rawLastResult.responseId && rawLastResult.responseId === dismissedResponseId
      ? null
      : rawLastResult;

  const value: GameSessionValue = {
    activeRoom: roomCode && roomState ? { code: roomCode, state: roomState } : null,
    myPlayerId,
    pendingResponse: roomState?.pendingResponse ?? null,
    lastResult,
    error,
    clearLastResult,
    createRoom: createRoomFn,
    joinRoom: joinRoomFn,
    previewRoom,
    resumeRoom,
    leaveRoom,
    startSetup: startSetupFn,
    setSeatOrder: setSeatOrderFn,
    setPlayDirection: setPlayDirectionFn,
    confirmTurnOrder: confirmTurnOrderFn,
    drawCard,
    playAction,
    placeTrapCard,
    openTrapCard,
    playCounter,
    skipCounter,
    declareMuffinTime: declareMuffinTimeFn,
    finishGame: finishGameFn,
    playAgain,
    shuffleDrawPile,
    finishShuffleDrawPile,
  };

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession(): GameSessionValue {
  const ctx = useContext(GameSessionContext);
  if (!ctx) throw new Error('useGameSession must be used within GameSessionProvider');
  return ctx;
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: all `game/*.test.ts`, `multiplayer/*.test.ts`, `lib/*.test.ts` pass. This file itself has no dedicated test (matches the pre-existing convention — `lib/session.tsx` was untested before too, since it's a thin wiring layer over already-tested pure functions); Tasks 4-9 update every file that no longer compiles against the old signatures, and Task 10 is the real end-to-end check.

- [ ] **Step 3: Commit**

```bash
git add lib/session.tsx
git commit -m "feat: rewrite GameSessionProvider to sync rooms through Supabase"
```

---

### Task 4: `GameTable.tsx` — thread `responseId` through counter actions

**Files:**
- Modify: `components/room/GameTable.tsx`

**Interfaces:**
- Consumes: `pendingResponse.responseId` (already destructured from `useGameSession()` in this file) and the new `playCounter(code, responseId)` / `skipCounter(responseId)` signatures from Task 3.

- [ ] **Step 1: Update the two call sites**

Find:

```tsx
      <TrapAlertModal
        open={Boolean(isLocalTrapTarget && pendingResponse)}
        trapCode={pendingResponse?.kind === 'trap' ? pendingResponse.code : null}
        actorId={pendingResponse?.actorId}
        actorName={pendingResponse?.actorId ? state.players[pendingResponse.actorId]?.name : 'ฝ่ายตรงข้าม'}
        counterCards={validCounterCards}
        responseId={pendingResponse?.responseId}
        onPlayCounter={playCounter}
        onDecline={skipCounter}
      />

      {/* 14. Counter Card Response Window Modal (For Action responses) */}
      <CounterModal
        open={pendingResponse?.kind === 'action' && validCounterCards.length > 0}
        counterCards={validCounterCards}
        onPlay={playCounter}
        onSkip={skipCounter}
      />
```

Replace with:

```tsx
      <TrapAlertModal
        open={Boolean(isLocalTrapTarget && pendingResponse)}
        trapCode={pendingResponse?.kind === 'trap' ? pendingResponse.code : null}
        actorId={pendingResponse?.actorId}
        actorName={pendingResponse?.actorId ? state.players[pendingResponse.actorId]?.name : 'ฝ่ายตรงข้าม'}
        counterCards={validCounterCards}
        responseId={pendingResponse?.responseId}
        onPlayCounter={(code) => pendingResponse && playCounter(code, pendingResponse.responseId)}
        onDecline={() => pendingResponse && skipCounter(pendingResponse.responseId)}
      />

      {/* 14. Counter Card Response Window Modal (For Action responses) */}
      <CounterModal
        open={pendingResponse?.kind === 'action' && validCounterCards.length > 0}
        counterCards={validCounterCards}
        onPlay={(code) => pendingResponse && playCounter(code, pendingResponse.responseId)}
        onSkip={() => pendingResponse && skipCounter(pendingResponse.responseId)}
      />
```

(`TrapAlertModal`/`CounterModal`'s own prop types — `onPlayCounter: (code: CardCode) => void`, `onDecline: () => void`, `onPlay: (code: CardCode) => void`, `onSkip: () => void` — are unchanged; only this file's call sites need the `responseId` closure.)

- [ ] **Step 2: Commit**

```bash
git add components/room/GameTable.tsx
git commit -m "feat: pass responseId through counter/skip calls for idempotent resolution"
```

---

### Task 5: `WaitingRoom.tsx` — remove bot auto-fill, read `maxPlayers` from state

**Files:**
- Modify: `components/room/WaitingRoom.tsx`

**Interfaces:**
- Consumes: `useGameSession()` no longer exposes `joinNextBot` (Task 3) — this task removes the two effects that called it.

- [ ] **Step 1: Drop `joinNextBot` from the destructured hook**

Find:

```tsx
  const { activeRoom, myPlayerId, joinNextBot, leaveRoom, startSetup } = useGameSession();
```

Replace with:

```tsx
  const { activeRoom, myPlayerId, leaveRoom, startSetup } = useGameSession();
```

- [ ] **Step 2: Remove the two bot-related effects**

Find:

```tsx
  // Prototype bot auto-join timer
  useEffect(() => {
    if (!activeRoom) return;
    const currentCount = Object.keys(activeRoom.state.players).length;
    if (currentCount >= activeRoom.maxPlayers) return;
    const timer = setTimeout(() => joinNextBot(), 1200);
    return () => clearTimeout(timer);
  }, [activeRoom, joinNextBot]);

  // If host is a bot, auto-start when full
  useEffect(() => {
    if (!activeRoom) return;
    const currentCount = Object.keys(activeRoom.state.players).length;
    if (currentCount < activeRoom.maxPlayers) return;
    if (!activeRoom.state.hostId.startsWith('bot-')) return;
    if (isStartingTransition) return;
    const timer = setTimeout(() => {
      setIsStartingTransition(true);
      playGameStart();
      setTimeout(() => {
        startSetup();
      }, 2000);
    }, 1200);
    return () => clearTimeout(timer);
  }, [activeRoom, startSetup, playGameStart, isStartingTransition]);

  if (!activeRoom) return null;

  const { state, maxPlayers, code } = activeRoom;
```

Replace with:

```tsx
  if (!activeRoom) return null;

  const { state, code } = activeRoom;
  const maxPlayers = state.maxPlayers ?? 15;
```

- [ ] **Step 3: Visually verify**

Run: `npm run dev`, sign in, create a room. Expected: no bots appear anymore; "รอผู้เล่น..." placeholder slots stay empty until a real second browser session joins with the room code (full cross-device check happens in Task 10).

- [ ] **Step 4: Commit**

```bash
git add components/room/WaitingRoom.tsx
git commit -m "feat: remove bot auto-fill from the waiting room for real multiplayer"
```

---

### Task 6: `app/create/page.tsx` — await the now-async `createRoom`

**Files:**
- Modify: `app/create/page.tsx` (builds on the version from `2026-09-01-supabase-auth-login.md` Task 4)

**Interfaces:**
- Consumes: `createRoom(maxPlayers: number) => Promise<string>` (Task 3, was synchronous before).

- [ ] **Step 1: Make `handleSubmit` async and add a loading/error state**

Find:

```tsx
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
```

Replace with:

```tsx
  const { user, loading } = useAuth();
  const { createRoom } = useGameSession();
  const [maxPlayers, setMaxPlayers] = useState(3);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!user || isCreating) return;
    setIsCreating(true);
    setCreateError('');
    try {
      const code = await createRoom(maxPlayers);
      router.push(`/room/${code}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง');
      setIsCreating(false);
    }
  }

  if (loading || !user) return null;
```

- [ ] **Step 2: Show the error and disable the button while creating**

Find:

```tsx
        <button
          type="submit"
          className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
          <span>สร้างห้อง</span>
        </button>
      </form>
```

Replace with:

```tsx
        {createError && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-600">
            {createError}
          </div>
        )}

        <button
          type="submit"
          disabled={isCreating}
          className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
          <span>{isCreating ? 'กำลังสร้างห้อง...' : 'สร้างห้อง'}</span>
        </button>
      </form>
```

- [ ] **Step 3: Commit**

```bash
git add app/create/page.tsx
git commit -m "feat: create rooms against real Supabase, with loading/error state"
```

---

### Task 7: `app/join/[code]/page.tsx` — real room preview + join

**Files:**
- Modify: `app/join/[code]/page.tsx` (full rewrite, replacing the version from the auth-login plan)

**Interfaces:**
- Consumes: `previewRoom(code) => Promise<RoomState | null>`, `joinRoom(code) => Promise<void>` (Task 3).

- [ ] **Step 1: Replace the entire file**

```tsx
'use client';

import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGameSession } from '../../../lib/session';
import { useAuth } from '../../../lib/auth';
import type { RoomState } from '../../../game/types';
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
  const { user, loading: authLoading } = useAuth();
  const { previewRoom, joinRoom } = useGameSession();

  const [previewLoading, setPreviewLoading] = useState(true);
  const [preview, setPreview] = useState<RoomState | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, user, router, pathname]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setPreviewLoading(true);
    previewRoom(roomCode).then((state) => {
      if (cancelled) return;
      setPreview(state);
      setPreviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user, roomCode, previewRoom]);

  const currentPlayers = preview ? Object.keys(preview.players).length : 0;
  const maxPlayers = preview?.maxPlayers ?? 15;
  const alreadyMember = !!preview && !!user && !!preview.players[user.id];
  const isLobbyStatus = preview?.status === 'lobby';
  const isFull = !!preview && !alreadyMember && currentPlayers >= maxPlayers;
  const canJoin = !!preview && (alreadyMember || (isLobbyStatus && !isFull));
  const hostName = preview?.players[preview.hostId]?.name ?? 'เจ้าของห้อง';

  async function handleJoin() {
    if (!canJoin || joining) return;
    setJoining(true);
    setJoinError('');
    try {
      await joinRoom(roomCode);
      router.push(`/room/${roomCode}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'เข้าร่วมห้องไม่สำเร็จ ลองใหม่อีกครั้ง');
      setJoining(false);
    }
  }

  if (authLoading || !user) return null;

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

      {previewLoading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
          <p className="text-xs font-bold text-ink-secondary">กำลังตรวจสอบห้อง...</p>
        </div>
      ) : preview ? (
        <section className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-ink-secondary px-0.5">
            ห้องที่คุณกำลังจะเข้าร่วม
          </span>
          <div className="flex flex-col gap-2.5 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <p className="text-sm sm:text-base font-bold text-ink">ห้องของ {hostName}</p>
              {isFull && (
                <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  ห้องเต็มแล้ว
                </span>
              )}
              {!isLobbyStatus && !alreadyMember && (
                <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  เกมเริ่มไปแล้ว
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
                  {currentPlayers} / {maxPlayers} คน
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

      {joinError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-600">
          {joinError}
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
        disabled={!canJoin || joining}
        className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
        <span>{joining ? 'กำลังเข้าร่วม...' : 'เข้าร่วมห้อง'}</span>
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/join/[code]/page.tsx"
git commit -m "feat: fetch real room state for the join preview and join flow"
```

---

### Task 8: `app/room/[code]/page.tsx` — resume on direct navigation/refresh

**Files:**
- Modify: `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: `resumeRoom(code) => Promise<void>` (Task 3).

**Context:** Previously `activeRoom` was always populated synchronously by `createRoom`/`joinRoom` right before navigating here. Now those are async and `activeRoom` starts `null` — and a page refresh or a bookmarked `/room/XXXX` link needs its own fetch, since there's no in-memory state to fall back to. If the fetched room doesn't include this user as a player, send them to `/join/[code]` instead (which handles both "room doesn't exist" and "you're not in it yet").

- [ ] **Step 1: Replace the entire file**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { useAuth } from '../../../lib/auth';
import { useAudio } from '../../../lib/audio';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { TurnOrderSetup } from '../../../components/room/TurnOrderSetup';
import { GameTable } from '../../../components/room/GameTable';

export default function RoomPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ code: string }>();
  const roomCode = params.code || '';
  const { user, loading: authLoading } = useAuth();
  const { activeRoom, myPlayerId, resumeRoom } = useGameSession();
  const { audioPhase, setAudioPhase } = useAudio();
  const resumeAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, user, router, pathname]);

  // Direct navigation or a page refresh lands here with no activeRoom yet — fetch + subscribe.
  useEffect(() => {
    if (!user) return;
    if (activeRoom?.code === roomCode) return;
    if (resumeAttemptRef.current === roomCode) return;
    resumeAttemptRef.current = roomCode;
    resumeRoom(roomCode).catch(() => {
      router.replace(`/join/${roomCode}`);
    });
  }, [user, roomCode, activeRoom, resumeRoom, router]);

  useEffect(() => {
    if (!activeRoom || activeRoom.code !== roomCode) return;
    if (myPlayerId && !activeRoom.state.players[myPlayerId]) {
      router.replace(`/join/${roomCode}`);
      return;
    }

    const status = activeRoom.state.status;
    if (
      (status === 'playing' || status === 'finished' || (status as string) === 'ended') &&
      audioPhase !== 'gameplay'
    ) {
      setAudioPhase('gameplay');
    } else if (status === 'lobby' && audioPhase !== 'pre-game') {
      setAudioPhase('pre-game');
    }
  }, [activeRoom, roomCode, myPlayerId, router, audioPhase, setAudioPhase]);

  if (authLoading || !user) return null;
  if (!activeRoom || activeRoom.code !== roomCode) return null;

  switch (activeRoom.state.status) {
    case 'lobby':
      return <WaitingRoom />;
    case 'setup':
      return <TurnOrderSetup />;
    case 'playing':
    case 'finished':
    case 'ended':
      return <GameTable />;
  }
}
```

(Dropped the unused `GameResult` import that existed in the previous version of this file — `finished`/`ended` already render `GameTable`, which shows `WinnerCelebrationOverlay` itself.)

- [ ] **Step 2: Commit**

```bash
git add "app/room/[code]/page.tsx"
git commit -m "feat: resume real Supabase rooms on direct navigation and refresh"
```

---

### Task 9: Drop the fake "open rooms" list

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/lobby/JoinRoomModal.tsx`
- Delete: `components/lobby/RoomCard.tsx`

**Context:** The seeded `SEED_ROOMS`/`rooms: RoomSummary[]` browse-all-rooms feature is gone from `GameSessionValue` (Task 3) — it never matched the real product model (join by code shared with friends, not browsing every room on the server). `RoomCard.tsx` is only used by the section being removed (confirmed via repo-wide search before writing this plan) — safe to delete outright rather than leave orphaned.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GameBenefits } from '../components/lobby/GameBenefits';
import { JoinRoomModal } from '../components/lobby/JoinRoomModal';
import { useAudio } from '../lib/audio';
import {
  MenuIcon,
  PlusIcon,
  BookOpenIcon,
  ChevronRightIcon,
  CardsIcon,
  EnterDoorIcon,
  MusicIcon,
  MusicOffIcon,
  VolumeIcon,
  VolumeOffIcon,
} from '../components/ui/Icons';

export default function Home() {
  const { isMusicEnabled, isSfxEnabled, toggleMusic, toggleSfx } = useAudio();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-4 pb-8 bg-white">
      {/* Top Header */}
      <header className="flex items-center justify-between pt-1">
        <Link href="/" className="flex items-center gap-1.5">
          <span className="text-2xl font-black tracking-tight text-primary">
            Muffin Time
          </span>
        </Link>

        <div className="relative">
          <button
            type="button"
            aria-label="เมนูหลัก"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors hover:text-primary active:scale-95"
          >
            <MenuIcon className="h-6 w-6 stroke-[2.5]" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-11 z-50 flex w-52 flex-col gap-1 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
              <Link
                href="/create"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <PlusIcon className="h-4 w-4 text-primary" />
                <span>สร้างห้องใหม่</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsJoinModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors w-full text-left"
              >
                <EnterDoorIcon className="h-4 w-4 text-primary" />
                <span>เข้าร่วมห้อง</span>
              </button>
              <Link
                href="/how-to-play"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <BookOpenIcon className="h-4 w-4 text-primary" />
                <span>วิธีเล่นเกม</span>
              </Link>
              <Link
                href="/cards"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <CardsIcon className="h-4 w-4 text-primary" />
                <span>คลังการ์ด 231 ใบ</span>
              </Link>

              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={toggleMusic}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-gray-50 transition-colors w-full text-left"
              >
                <div className="flex items-center gap-2">
                  {isMusicEnabled ? (
                    <MusicIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <MusicOffIcon className="h-4 w-4 text-gray-400" />
                  )}
                  <span>เพลงประกอบ</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isMusicEnabled ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isMusicEnabled ? 'เปิด' : 'ปิด'}
                </span>
              </button>
              <button
                type="button"
                onClick={toggleSfx}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-gray-50 transition-colors w-full text-left"
              >
                <div className="flex items-center gap-2">
                  {isSfxEnabled ? (
                    <VolumeIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <VolumeOffIcon className="h-4 w-4 text-gray-400" />
                  )}
                  <span>เสียงเอฟเฟกต์</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isSfxEnabled ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isSfxEnabled ? 'เปิด' : 'ปิด'}
                </span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex items-center justify-between gap-3 py-1">
        <div className="flex w-[150px] shrink-0 flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/home/hero/muffin-time-logo.jpg"
            alt="Muffin Time Logo"
            className="w-36 max-w-none object-contain drop-shadow-xs"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/home/hero/white-muffin-hero.jpg"
            alt="White Muffin Mascot"
            className="w-28 h-28 object-contain -mt-5 drop-shadow-xs"
          />
        </div>

        <div className="flex flex-col text-left flex-1 min-w-0 pr-1">
          <h2 className="text-[22px] font-black leading-[1.2] text-ink tracking-tight">
            <span className="text-primary font-black">เกมไพ่</span>สุดป่วน
            <br />
            สำหรับทุกคน!
          </h2>
          <p className="text-xs font-medium leading-snug text-ink-secondary mt-1.5">
            สร้างห้อง หรือเข้าร่วมห้อง
            <br />
            แล้วมาเริ่มความป่วนกันเลย!
          </p>
        </div>
      </section>

      {/* Primary & Secondary Action Buttons */}
      <div className="flex flex-col gap-2">
        <Link
          href="/create"
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] px-6 text-base font-extrabold text-white shadow-[0_6px_16px_rgba(237,31,79,0.28)] transition-all hover:opacity-95 active:scale-[0.98]"
        >
          <PlusIcon className="h-5 w-5 stroke-[3]" />
          <span>สร้างห้องใหม่</span>
        </Link>

        <button
          type="button"
          onClick={() => setIsJoinModalOpen(true)}
          className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary/80 bg-white px-6 text-base font-extrabold text-primary shadow-[0_2px_8px_rgba(237,31,79,0.06)] transition-all hover:bg-primary/5 active:scale-[0.98]"
        >
          <span>เข้าร่วมห้อง</span>
        </button>
      </div>

      <GameBenefits />

      <Link
        href="/how-to-play"
        className="flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 text-xs font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-all hover:border-primary/30 active:scale-[0.99]"
      >
        <div className="flex items-center gap-2.5">
          <BookOpenIcon className="h-4 w-4 text-primary" />
          <span>วิธีเล่น / HOW TO PLAY</span>
        </div>
        <ChevronRightIcon className="h-3.5 w-3.5 text-ink-secondary" />
      </Link>

      <JoinRoomModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
      />
    </main>
  );
}
```

- [ ] **Step 2: Replace `components/lobby/JoinRoomModal.tsx`**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EnterDoorIcon } from '../ui/Icons';

export interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CODE_LENGTH = 4;

export function JoinRoomModal({ isOpen, onClose }: JoinRoomModalProps) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (index: number, val: string) => {
    const char = val.slice(-1).toUpperCase().trim();
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim().toUpperCase().replace(/\s+/g, '');
    if (!pasted) return;

    const chars = pasted.slice(0, CODE_LENGTH).split('');
    const newDigits = [...digits];
    for (let i = 0; i < CODE_LENGTH; i++) {
      newDigits[i] = chars[i] || '';
    }
    setDigits(newDigits);

    const nextIndex = Math.min(chars.length, CODE_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = digits.join('').trim();
    if (code.length < CODE_LENGTH) return;
    onClose();
    router.push(`/join/${code}`);
  };

  const isComplete = digits.every((d) => d.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleJoin} className="flex flex-col gap-3.5">
          <div className="flex flex-col items-center text-center gap-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-1">
              <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
            </div>
            <h3 className="text-lg font-black text-ink">เข้าร่วมห้อง</h3>
            <p className="text-xs text-ink-secondary">
              กรอกรหัสห้องที่ได้รับจากเพื่อน
            </p>
          </div>

          <div className="flex justify-center items-center gap-2.5 my-1">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                className={`h-14 w-13 text-center font-mono text-2xl font-black rounded-2xl border-2 transition-all focus:outline-none ${
                  digit
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 bg-gray-50/60 text-ink focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15'
                }`}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={!isComplete}
              className="flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] text-sm sm:text-base font-black text-white shadow-[0_4px_14px_rgba(237,31,79,0.3)] transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              เข้าร่วม
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-xs sm:text-sm font-bold text-ink-secondary transition-colors hover:bg-gray-50 active:scale-[0.98]"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

(Validation moved entirely to `/join/[code]` — the modal's only job now is turning a 4-character code into a navigation, since the real check needs a Supabase fetch that the join page already does.)

- [ ] **Step 3: Delete the now-unused `RoomCard.tsx`**

```bash
git rm components/lobby/RoomCard.tsx
```

- [ ] **Step 4: Visually verify**

Run: `npm run dev`. Expected: home page has no "ห้องที่เปิดอยู่" section anymore, just the two action buttons + benefits + how-to-play link; the join modal (from the hamburger menu or the "เข้าร่วมห้อง" button) takes a 4-character code and navigates straight to `/join/<code>` regardless of whether that room exists (the join page shows the real "ไม่พบห้อง" state if it doesn't).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/lobby/JoinRoomModal.tsx
git commit -m "feat: drop the fake open-rooms list in favor of code-only joining"
```

---

### Task 10: End-to-end real multiplayer verification

**Files:** none (manual verification only)

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Two-browser manual playtest**

Run: `npm run dev`. Open two separate browser sessions that don't share cookies/localStorage (e.g. a normal window + an incognito/private window, or two different browser profiles) — this matters because Supabase Auth sessions are per-browser-storage, and two players need two distinct `user.id`s to test real multiplayer.

1. In session A: go to `/login`, sign in with email A (check that inbox, click the link).
2. In session B: go to `/login`, sign in with a *different* email B.
3. In session A: create a room (`/create`), note the 4-character code.
4. In session B: go to `/join/<code>` (or paste the code into the join modal from `/`) — expect to see the real host name and "1 / N คน" before joining, then join successfully.
5. In session A: expect the waiting room's player list to update to show session B's player **without refreshing** (this is the Realtime subscription working).
6. Start the game from session A (host). Expect both sessions to transition to `TurnOrderSetup` then `GameTable` together.
7. On the current player's turn, draw a card or play an action targeting the other player. Expect the *other* session to see the hand-count/discard pile update live, and — for an Action/Trap that opens a counter window — expect the targeted session to see the `TrapAlertModal`/`CounterModal` prompt appear on its own screen (not just the actor's).
8. Skip/play a counter from one session; expect the `pendingResponse` to clear on **both** sessions and the turn to advance for both.
9. Refresh session B's browser tab mid-game. Expect it to land back in the same game state (via `resumeRoom`), not bounce to the lobby or an empty room.
10. As host in session A, use "สับไพ่กองจั่ว" (shuffle) if available; expect the shuffle animation to run once, not once per session, and the draw pile order to update identically on both.

- [ ] **Step 3: Note any findings**

If anything in Step 2 doesn't match, that's a bug to fix before considering this plan done — this manual pass is the only end-to-end check this plan has, since there's no automated multiplayer test harness in this repo.

---

## Self-Review Notes

- **Spec coverage:** "เชื่อม `lib/session.tsx` เข้ากับ Supabase จริง" → Tasks 2-3. "`pendingResponse`/`lastResult` ต้อง sync" (spec amendment) → Task 1, 3. "Gotcha" list (engine throws, in-flight guard, shuffle-overlay host gating, dropping the open-rooms list) → Tasks 3 (`run`'s catch + `isWritingRef`), 3 (`finishShuffleDrawPile` host check), 9. "ปิดบอทเติมอัตโนมัติในโหมดจริง" → Task 5. Login/auth itself is covered entirely by the companion `2026-09-01-supabase-auth-login.md` plan, not repeated here.
- **Placeholder scan:** none — every task has complete before/after code, including full-file replacements where the diff would otherwise be too tangled to express as a snippet (`lib/session.tsx`, `app/join/[code]/page.tsx`, `app/room/[code]/page.tsx`, `app/page.tsx`, `components/lobby/JoinRoomModal.tsx`).
- **Type consistency:** `GameSessionValue`'s new/changed members (Task 3) are used with matching signatures everywhere they're consumed: `createRoom(maxPlayers): Promise<string>` in Task 6, `previewRoom`/`joinRoom` in Task 7, `resumeRoom` in Task 8, `playCounter(code, responseId)`/`skipCounter(responseId)` in Task 4. `PendingResponse`/`LastResult` (Task 1, `game/types.ts`) are imported — not redefined — in Task 3's `lib/session.tsx`.
