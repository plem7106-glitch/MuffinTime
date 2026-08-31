# Mobile Game UI Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clickable mobile-first UI demo of the Muffin Time card game (Lobby → Create Room → Waiting Room → Game Table → play a card → select target → Trap → Counter → Game Over), wired to the real `game/*.ts` engine with a curated 13-card subset, no backend.

**Architecture:** Next.js App Router pages driven by `RoomState.status`, a single React Context (`lib/session.tsx`, `useReducer`-based) holding all game state client-side, calling `game/*.ts` primitives directly. Bots take their turns via a pure decision function and a `useEffect`-driven loop. No new dependencies — Tailwind v4 CSS tokens, native scroll-snap, plain CSS transforms for the bottom sheet.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS v4, Vitest.

## Global Constraints

- Do NOT modify any file under `game/` — the engine is already tested and ported; this plan only consumes it.
- Curated deck only: 5 Action (A001, A004, A008, A014, A016), 3 Counter (C09, C16, C17), 5 Trap (T13, T14, T16, T27, T45) — exact primitive mappings are fixed by the design spec and given verbatim in Task 2.
- No new npm dependencies for animation/modals/gestures — plain CSS transforms, native `overflow-x-auto` + `scroll-snap-type`, native pointer events.
- Player id convention: the human player is always `'me'`; bot players are `'bot-1'`, `'bot-2'`, etc. `lib/botTurn.ts`'s target-selection logic depends on this convention to prefer targeting `'me'`.
- Thai-only UI copy for anything user-facing (buttons, labels, card text) — English is fine in code/identifiers.
- Colors (Tailwind `@theme` tokens): primary `#ED1F4F`, action `#1769C2`, trap `#E52B35`, counter `#2FA35A`, background `#F7F7F5`, card `#FFFFFF`, text `#171717`, secondary text `#6B6B6B`. Border radius 10–16px. Touch targets ≥ 44×44px.
- Testing: Vitest unit tests only for new pure logic (`lib/demoCards.ts`, `lib/botTurn.ts`). UI is verified by manual click-through with `npm run dev`, matching this project's existing convention (no component/e2e tests).
- No card artwork — text placeholders for all cards (type / title / description), per spec.

---

## File Structure

```
app/
  globals.css              modify: add @theme design tokens
  layout.tsx               modify: Noto Sans Thai font, wrap children in GameSessionProvider
  page.tsx                 modify: replace placeholder with real Lobby
  create/page.tsx          create: Create Room form
  join/[code]/page.tsx     create: Join Room form
  room/[code]/page.tsx     create: routes to WaitingRoom / GameTable / GameResult by RoomState.status

lib/
  demoCards.ts (+.test.ts) create: curated card data + primitive resolvers
  botTurn.ts (+.test.ts)   create: decideBotTurn() pure function
  session.tsx              create: GameSessionProvider + useGameSession() + reducer

components/
  ui/
    PrimaryButton.tsx, SecondaryButton.tsx    create
    BottomSheet.tsx                            create: shared modal shell
  lobby/
    RoomCard.tsx                               create
  room/
    GameHeader.tsx, PlayerAvatar.tsx, PlayerList.tsx, RoomCode.tsx   create
    WaitingRoom.tsx, GameTable.tsx, GameResult.tsx, BottomActionBar.tsx   create
  card/
    Card.tsx, CardHand.tsx, Deck.tsx, DiscardPile.tsx   create
  modals/
    ActionModal.tsx, TargetSelector.tsx, TrapModal.tsx   create
    CounterModal.tsx, TrapResultModal.tsx, CounterResultModal.tsx   create
```

---

### Task 1: Design tokens and font

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: Tailwind utility classes usable everywhere (`bg-primary`, `text-action`, `border-trap`, `bg-counter`, `bg-app-bg`, `bg-card`, `text-ink`, `text-ink-secondary`, `rounded-card`), and the `font-thai` class applied at the body level.

- [ ] **Step 1: Add design tokens to `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-primary: #ED1F4F;
  --color-action: #1769C2;
  --color-trap: #E52B35;
  --color-counter: #2FA35A;
  --color-app-bg: #F7F7F5;
  --color-card: #FFFFFF;
  --color-ink: #171717;
  --color-ink-secondary: #6B6B6B;
  --radius-card: 14px;
}

body {
  background-color: var(--color-app-bg);
  color: var(--color-ink);
}
```

- [ ] **Step 2: Add Noto Sans Thai font in `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import { GameSessionProvider } from '../lib/session';

const notoSansThai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'] });

export const metadata: Metadata = {
  title: 'Muffin Time',
  description: 'เกมการ์ด Muffin Time เล่นผ่านเว็บกับเพื่อน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={notoSansThai.className}>
        <GameSessionProvider>{children}</GameSessionProvider>
      </body>
    </html>
  );
}
```

This imports `GameSessionProvider` from `lib/session.tsx`, which does not exist yet (Task 5 creates it) — the build will fail until Task 5 lands. That's expected; this step only stages the layout wiring. Do not run `npm run build` as a pass/fail gate for this task.

- [ ] **Step 3: Verify the CSS compiles**

Run: `npx tsc --noEmit` — expect no new errors from these two files alone (the `GameSessionProvider` import will show as a module-not-found error; that's expected until Task 5 — note it in your report, don't try to fix it here).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add design tokens and Noto Sans Thai font"
```

---

### Task 2: Curated card data and primitive resolvers (`lib/demoCards.ts`)

**Files:**
- Create: `lib/demoCards.ts`, `lib/demoCards.test.ts`

**Interfaces:**
- Consumes: `everyoneDraws`, `everyoneDiscards` from `../game/group`; `draw`, `discard` from `../game/pile`; `stealRandom` from `../game/transfer`; `RoomState`, `PlayerId`, `CardCode` from `../game/types`
- Produces: `DemoCardType`, `DemoCard`, `DEMO_CARDS: DemoCard[]`, `getDemoCard(code): DemoCard`, `demoCardsOfType(type): DemoCard[]`, `buildDemoDeck(copiesPerCard?): CardCode[]`, `resolveActionCard(state, code, actorId, targetId?): RoomState`, `resolveTrapCard(state, code, ownerId, targetId?): RoomState`, `resolveCounterCard(state, code, actorId): RoomState` — used by Task 5 (`lib/session.tsx`) and Task 3 (`lib/botTurn.ts`).

- [ ] **Step 1: Write the failing tests**

Create `lib/demoCards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getDemoCard,
  demoCardsOfType,
  buildDemoDeck,
  resolveActionCard,
  resolveTrapCard,
  resolveCounterCard,
} from './demoCards';
import type { RoomState } from '../game/types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'bot-1'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['A001', 'A002', 'A003', 'A004', 'A005'],
    discardPile: [],
    players: {
      me: { name: 'Tee', hand: ['A014', 'A016'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bank', hand: ['C09', 'C16'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('getDemoCard', () => {
  it('returns the card metadata for a known code', () => {
    expect(getDemoCard('A001').th).toBe('ผิดบ้านแล้ว!');
  });

  it('throws for an unknown code', () => {
    expect(() => getDemoCard('Z999')).toThrow();
  });
});

describe('demoCardsOfType', () => {
  it('filters by type and returns the expected counts', () => {
    expect(demoCardsOfType('action').length).toBe(5);
    expect(demoCardsOfType('counter').length).toBe(3);
    expect(demoCardsOfType('trap').length).toBe(5);
    expect(demoCardsOfType('trap').every((c) => c.type === 'trap')).toBe(true);
  });
});

describe('buildDemoDeck', () => {
  it('repeats each of the 13 codes the given number of times', () => {
    const deck = buildDemoDeck(2);
    expect(deck.length).toBe(26);
    expect(deck.filter((c) => c === 'A001').length).toBe(2);
  });

  it('defaults to 10 copies per card', () => {
    expect(buildDemoDeck().length).toBe(130);
  });
});

describe('resolveActionCard', () => {
  it('A001 makes everyone except the actor draw 2', () => {
    const next = resolveActionCard(baseState(), 'A001', 'me');
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players['bot-1'].hand.length).toBe(4);
  });

  it('A004 draws the actor a number of cards equal to their current hand size', () => {
    const next = resolveActionCard(baseState(), 'A004', 'me');
    expect(next.players.me.hand.length).toBe(4);
  });

  it('A008 makes everyone except the actor discard 1', () => {
    const next = resolveActionCard(baseState(), 'A008', 'me');
    expect(next.players['bot-1'].hand.length).toBe(1);
  });

  it('A014 requires a target and steals 1 card from them to the actor', () => {
    const next = resolveActionCard(baseState(), 'A014', 'me', 'bot-1');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players['bot-1'].hand.length).toBe(1);
  });

  it('A014 throws without a target', () => {
    expect(() => resolveActionCard(baseState(), 'A014', 'me')).toThrow();
  });

  it('A016 requires a target and discards their whole hand', () => {
    const next = resolveActionCard(baseState(), 'A016', 'me', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(0);
  });

  it('throws for a non-action code', () => {
    expect(() => resolveActionCard(baseState(), 'C09', 'me')).toThrow();
  });
});

describe('resolveTrapCard', () => {
  it('T13 steals up to 3 cards from the target to the owner', () => {
    const next = resolveTrapCard(baseState(), 'T13', 'me', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(0);
    expect(next.players.me.hand.length).toBe(4);
  });

  it('T16 makes the target discard 3', () => {
    const next = resolveTrapCard(baseState(), 'T16', 'me', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(0);
  });

  it('T45 draws the owner 10 cards regardless of target', () => {
    const next = resolveTrapCard(baseState(), 'T45', 'me');
    expect(next.players.me.hand.length).toBe(12);
  });

  it('T13 throws without a target', () => {
    expect(() => resolveTrapCard(baseState(), 'T13', 'me')).toThrow();
  });
});

describe('resolveCounterCard', () => {
  it('C16 draws the actor 3 cards', () => {
    const next = resolveCounterCard(baseState(), 'C16', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(5);
  });

  it('C17 draws the actor 1 card', () => {
    const next = resolveCounterCard(baseState(), 'C17', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(3);
  });

  it('C09 is a pure cancel with no state change', () => {
    const state = baseState();
    const next = resolveCounterCard(state, 'C09', 'bot-1');
    expect(next).toEqual(state);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run lib/demoCards.test.ts`
Expected: FAIL (`lib/demoCards.ts` does not exist yet)

- [ ] **Step 3: Create `lib/demoCards.ts`**

```ts
import { everyoneDraws, everyoneDiscards } from '../game/group';
import { draw, discard } from '../game/pile';
import { stealRandom } from '../game/transfer';
import type { RoomState, PlayerId, CardCode } from '../game/types';

export type DemoCardType = 'action' | 'counter' | 'trap';

export interface DemoCard {
  code: CardCode;
  type: DemoCardType;
  th: string;
  effect: string;
  needsTarget: boolean;
}

export const DEMO_CARDS: DemoCard[] = [
  { code: 'A001', type: 'action', th: 'ผิดบ้านแล้ว!', effect: 'ผู้เล่นทุกคนที่ไม่ได้อาศัยอยู่ที่นี่ จั่วไพ่คนละ 2 ใบ', needsTarget: false },
  { code: 'A004', type: 'action', th: 'จักรวาลคู่ขนาน', effect: 'จั่วไพ่เพิ่มเท่ากับจำนวนไพ่ที่คุณมีอยู่ในมือตอนนี้', needsTarget: false },
  { code: 'A008', type: 'action', th: 'ปาชีส!', effect: 'ผู้เล่นคนอื่นทั้งหมดทิ้งไพ่คนละ 1 ใบ', needsTarget: false },
  { code: 'A014', type: 'action', th: 'ดึงนิ้วฉันสิ', effect: 'เลือกผู้เล่น 1 คนให้ขโมยไพ่จากมือคุณ 1 ใบ', needsTarget: true },
  { code: 'A016', type: 'action', th: "จัดการมัน!", effect: 'เลือกผู้เล่นอีก 1 คนให้ทิ้งไพ่ทั้งหมดในมือ', needsTarget: true },
  { code: 'C09', type: 'counter', th: 'หมาถือมีด', effect: 'หยุดไพ่ Trap ที่กำลังทำงานอยู่', needsTarget: false },
  { code: 'C16', type: 'counter', th: 'หน่วยกู้ระเบิด', effect: 'หยุดไพ่การ์ดที่กำลังทำงานอยู่ และจั่วไพ่ให้ตัวเอง 3 ใบ', needsTarget: false },
  { code: 'C17', type: 'counter', th: 'สั่งฉันไม่ได้หรอก', effect: 'หยุดไพ่ Action ที่กำลังทำงานอยู่ และจั่วไพ่ใหม่ให้ตัวเอง 1 ใบ', needsTarget: false },
  { code: 'T13', type: 'trap', th: 'จับได้แล้ว!', effect: 'หากผู้เล่นคนอื่นยอมรับว่าคุณโกหก ขโมยไพ่เขา 3 ใบ', needsTarget: true },
  { code: 'T14', type: 'trap', th: 'กี่โมงแล้ว?', effect: 'หากผู้เล่นคนอื่นถามเวลา ขโมยไพ่เขา 4 ใบ', needsTarget: true },
  { code: 'T16', type: 'trap', th: 'เปิดตำราหน่อย', effect: 'หากผู้เล่นคนอื่นเปิดกฎมาเช็ค ให้เขาทิ้งไพ่ 3 ใบ', needsTarget: true },
  { code: 'T27', type: 'trap', th: 'อย่าคิดถึงแมว', effect: 'หากผู้เล่นคนอื่นพูดถึงแมว ให้เขาทิ้งไพ่ 3 ใบ', needsTarget: true },
  { code: 'T45', type: 'trap', th: 'หักมุมซะงั้น!', effect: 'หากคุณมีไพ่ในมือ 0 ใบ จั่วไพ่ 10 ใบ (เปิดได้เฉพาะตอนมือว่าง)', needsTarget: false },
];

export function getDemoCard(code: CardCode): DemoCard {
  const card = DEMO_CARDS.find((c) => c.code === code);
  if (!card) throw new Error(`getDemoCard: unknown demo card code ${code}`);
  return card;
}

export function demoCardsOfType(type: DemoCardType): DemoCard[] {
  return DEMO_CARDS.filter((c) => c.type === type);
}

export function buildDemoDeck(copiesPerCard = 10): CardCode[] {
  const deck: CardCode[] = [];
  for (const card of DEMO_CARDS) {
    for (let i = 0; i < copiesPerCard; i++) deck.push(card.code);
  }
  return deck;
}

export function resolveActionCard(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  targetId?: PlayerId
): RoomState {
  switch (code) {
    case 'A001':
      return everyoneDraws(state, 2, [actorId]);
    case 'A004':
      return draw(state, actorId, state.players[actorId].hand.length);
    case 'A008':
      return everyoneDiscards(state, 1, [actorId]);
    case 'A014':
      if (!targetId) throw new Error('A014 requires a target');
      return stealRandom(state, actorId, targetId, 1);
    case 'A016':
      if (!targetId) throw new Error('A016 requires a target');
      return discard(state, targetId, state.players[targetId].hand.length);
    default:
      throw new Error(`resolveActionCard: ${code} is not a playable demo action`);
  }
}

export function resolveTrapCard(
  state: RoomState,
  code: CardCode,
  ownerId: PlayerId,
  targetId?: PlayerId
): RoomState {
  switch (code) {
    case 'T13':
      if (!targetId) throw new Error('T13 requires a target');
      return stealRandom(state, targetId, ownerId, 3);
    case 'T14':
      if (!targetId) throw new Error('T14 requires a target');
      return stealRandom(state, targetId, ownerId, 4);
    case 'T16':
      if (!targetId) throw new Error('T16 requires a target');
      return discard(state, targetId, 3);
    case 'T27':
      if (!targetId) throw new Error('T27 requires a target');
      return discard(state, targetId, 3);
    case 'T45':
      return draw(state, ownerId, 10);
    default:
      throw new Error(`resolveTrapCard: ${code} is not a playable demo trap`);
  }
}

export function resolveCounterCard(state: RoomState, code: CardCode, actorId: PlayerId): RoomState {
  switch (code) {
    case 'C16':
      return draw(state, actorId, 3);
    case 'C17':
      return draw(state, actorId, 1);
    case 'C09':
      return state;
    default:
      throw new Error(`resolveCounterCard: ${code} is not a playable demo counter`);
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run lib/demoCards.test.ts`
Expected: PASS (19 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/demoCards.ts lib/demoCards.test.ts
git commit -m "feat: add curated demo card data and primitive resolvers"
```

---

### Task 3: Bot turn decision logic (`lib/botTurn.ts`)

**Files:**
- Create: `lib/botTurn.ts`, `lib/botTurn.test.ts`

**Interfaces:**
- Consumes: `demoCardsOfType` from `./demoCards`; `RoomState`, `PlayerId`, `CardCode`, `Rng` from `../game/types`
- Produces: `BotDecision = { action: 'draw' } | { action: 'play'; code: CardCode; targetId?: PlayerId }`, `decideBotTurn(state, botId, rng?): BotDecision` — used by Task 11 (`lib/session.tsx`'s bot-turn loop).

- [ ] **Step 1: Write the failing tests**

Create `lib/botTurn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideBotTurn } from './botTurn';
import type { RoomState } from '../game/types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'bot-1'],
    currentTurnIndex: 1,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Tee', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bank', hand: ['A014', 'C09'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('decideBotTurn', () => {
  it('draws when the rng rolls above the play threshold', () => {
    const decision = decideBotTurn(baseState(), 'bot-1', () => 0.9);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('draws when the bot has no playable action cards in hand', () => {
    const state = baseState();
    state.players['bot-1'].hand = ['C09'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('plays a targeted action against the human when the rng rolls below the threshold', () => {
    const decision = decideBotTurn(baseState(), 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'play', code: 'A014', targetId: 'me' });
  });

  it('plays a no-target action without picking a targetId', () => {
    const state = baseState();
    state.players['bot-1'].hand = ['A001'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'play', code: 'A001' });
  });

  it('falls back to draw when there is nobody eligible to target', () => {
    const state = baseState();
    state.turnOrder = ['bot-1'];
    state.players = { 'bot-1': state.players['bot-1'] };
    state.players['bot-1'].hand = ['A014'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'draw' });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run lib/botTurn.test.ts`
Expected: FAIL (`lib/botTurn.ts` does not exist yet)

- [ ] **Step 3: Create `lib/botTurn.ts`**

```ts
import type { RoomState, PlayerId, CardCode, Rng } from '../game/types';
import { demoCardsOfType } from './demoCards';

export type BotDecision = { action: 'draw' } | { action: 'play'; code: CardCode; targetId?: PlayerId };

const PLAY_PROBABILITY = 0.4;

export function decideBotTurn(state: RoomState, botId: PlayerId, rng: Rng = Math.random): BotDecision {
  const hand = state.players[botId].hand;
  const actionCards = demoCardsOfType('action');
  const actionCodes = new Set(actionCards.map((c) => c.code));
  const playableActions = hand.filter((code) => actionCodes.has(code));

  if (playableActions.length === 0 || rng() >= PLAY_PROBABILITY) {
    return { action: 'draw' };
  }

  const code = playableActions[Math.floor(rng() * playableActions.length)];
  const card = actionCards.find((c) => c.code === code)!;
  if (!card.needsTarget) {
    return { action: 'play', code };
  }

  const otherIds = Object.keys(state.players).filter((id) => id !== botId);
  const humanIds = otherIds.filter((id) => !id.startsWith('bot-'));
  const candidates = humanIds.length > 0 ? humanIds : otherIds;
  if (candidates.length === 0) {
    return { action: 'draw' };
  }
  const targetId = candidates[Math.floor(rng() * candidates.length)];
  return { action: 'play', code, targetId };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run lib/botTurn.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/botTurn.ts lib/botTurn.test.ts
git commit -m "feat: add bot turn decision logic"
```

---

### Task 4: Shared UI primitives

**Files:**
- Create: `components/ui/PrimaryButton.tsx`, `components/ui/SecondaryButton.tsx`, `components/ui/BottomSheet.tsx`

**Interfaces:**
- Produces: `PrimaryButton`, `SecondaryButton` (both accept all native `<button>` props), `BottomSheet({ open, onClose, children })` — used by every later component/page task that needs a button or a modal.

- [ ] **Step 1: Create `components/ui/PrimaryButton.tsx`**

`tone` picks the background color (pink primary, action blue, trap red, counter green) — later modal tasks (13, 14) use `tone="trap"` / `tone="counter"` to match the design brief's per-card-type button colors, instead of trying to override the Tailwind background via `className` (which is unreliable: two utility classes setting the same property don't resolve by JSX string order, only by their position in Tailwind's generated stylesheet).

```tsx
import type { ButtonHTMLAttributes } from 'react';

const TONE_CLASS = {
  primary: 'bg-primary',
  action: 'bg-action',
  trap: 'bg-trap',
  counter: 'bg-counter',
} as const;

export function PrimaryButton({
  className = '',
  tone = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof TONE_CLASS }) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-card px-4 font-bold text-white disabled:opacity-40 ${TONE_CLASS[tone]} ${className}`}
    />
  );
}
```

- [ ] **Step 2: Create `components/ui/SecondaryButton.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';

export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-card border border-ink/20 bg-card px-4 font-bold text-ink disabled:opacity-40 ${className}`}
    />
  );
}
```

- [ ] **Step 3: Create `components/ui/BottomSheet.tsx`**

Shared modal shell for every screen in section 10-16 of the design brief (Action/Trap/Counter modals, results, target selector). Height caps at 70vh, swipe-down (pointer drag past 80px) closes it, backdrop click closes it, respects safe-area-inset-bottom.

```tsx
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
```

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors from these three files (the pre-existing `lib/session.tsx` module-not-found error from Task 1 is still expected until Task 5).

- [ ] **Step 5: Commit**

```bash
git add components/ui/PrimaryButton.tsx components/ui/SecondaryButton.tsx components/ui/BottomSheet.tsx
git commit -m "feat: add shared button and bottom sheet primitives"
```

---

### Task 5: Game session — room lifecycle (`lib/session.tsx`, part 1)

**Files:**
- Create: `lib/session.tsx`

**Interfaces:**
- Consumes: `createRoom`, `addPlayer`, `startGame` from `../game/room`; `RoomState`, `PlayerId`, `CardCode` from `../game/types`; `buildDemoDeck` from `./demoCards`
- Produces: `RoomSummary`, `GameSessionProvider`, `useGameSession()` returning `{ rooms, activeRoom, myPlayerId, createRoom, joinRoom, joinNextBot, leaveRoom, startGame }` — this task covers ONLY room lifecycle (no gameplay actions yet; Task 11 extends this same file with `pendingResponse`, `drawCard`, `playAction`, `placeTrapCard`, `openTrapCard`, `playCounter`, `skipCounter`, `declareMuffinTime`, and the bot-turn loop). Later tasks (6-10) only need the lifecycle subset produced here.

This task has no new pure logic to TDD (it's React state wiring around already-tested engine functions) — verification is `npx tsc --noEmit` plus a manual check once Task 6 (Lobby) exists to click through create/join.

- [ ] **Step 1: Create `lib/session.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useReducer, type ReactNode } from 'react';
import { createRoom as engineCreateRoom, addPlayer, startGame as engineStartGame } from '../game/room';
import type { RoomState, PlayerId } from '../game/types';
import { buildDemoDeck } from './demoCards';

export interface RoomSummary {
  code: string;
  hostName: string;
  currentPlayers: number;
  maxPlayers: number;
}

export interface ActiveRoom {
  code: string;
  state: RoomState;
  maxPlayers: number;
}

interface SessionState {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
}

type Action =
  | { type: 'CREATE_ROOM'; code: string; hostName: string; maxPlayers: number }
  | { type: 'JOIN_ROOM'; code: string; name: string }
  | { type: 'JOIN_BOT' }
  | { type: 'LEAVE_ROOM' }
  | { type: 'START_GAME' };

export const BOT_NAME_POOL = ['Bank', 'Joe', 'Guy', 'Nam', 'Ploy', 'Golf', 'Mint'];

const SEED_ROOMS: RoomSummary[] = [
  { code: '4829', hostName: 'Tee', currentPlayers: 3, maxPlayers: 4 },
  { code: '7712', hostName: 'Bank', currentPlayers: 2, maxPlayers: 6 },
  { code: '8890', hostName: 'Joe', currentPlayers: 1, maxPlayers: 5 },
];

export function makeRoomCode(rng: () => number = Math.random): string {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += digits[Math.floor(rng() * digits.length)];
  return out;
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'CREATE_ROOM': {
      const roomState = engineCreateRoom('me', action.hostName);
      return {
        ...state,
        myPlayerId: 'me',
        activeRoom: { code: action.code, state: roomState, maxPlayers: action.maxPlayers },
      };
    }
    case 'JOIN_ROOM': {
      const summary = state.rooms.find((r) => r.code === action.code);
      const maxPlayers = summary?.maxPlayers ?? 4;
      const hostName = summary?.hostName ?? 'Host';
      const existingOthers = Math.max((summary?.currentPlayers ?? 1) - 1, 0);
      let roomState = engineCreateRoom('bot-0', hostName);
      for (let i = 1; i <= existingOthers; i++) {
        roomState = addPlayer(roomState, `bot-${i}`, BOT_NAME_POOL[(i - 1) % BOT_NAME_POOL.length]);
      }
      roomState = addPlayer(roomState, 'me', action.name);
      return { ...state, myPlayerId: 'me', activeRoom: { code: action.code, state: roomState, maxPlayers } };
    }
    case 'JOIN_BOT': {
      if (!state.activeRoom) return state;
      const current = state.activeRoom.state;
      const currentCount = Object.keys(current.players).length;
      if (currentCount >= state.activeRoom.maxPlayers) return state;
      const botId = `bot-${currentCount}`;
      const botName = BOT_NAME_POOL[(currentCount - 1) % BOT_NAME_POOL.length];
      const next = addPlayer(current, botId, botName);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'LEAVE_ROOM':
      return { ...state, activeRoom: null, myPlayerId: null };
    case 'START_GAME': {
      if (!state.activeRoom) return state;
      const next = engineStartGame(state.activeRoom.state, buildDemoDeck());
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    default:
      return state;
  }
}

interface GameSessionValue {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  createRoom: (hostName: string, maxPlayers: number) => string;
  joinRoom: (code: string, name: string) => void;
  joinNextBot: () => void;
  leaveRoom: () => void;
  startGame: () => void;
}

const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { rooms: SEED_ROOMS, activeRoom: null, myPlayerId: null });

  const createRoomFn = useCallback((hostName: string, maxPlayers: number) => {
    const code = makeRoomCode();
    dispatch({ type: 'CREATE_ROOM', code, hostName, maxPlayers });
    return code;
  }, []);
  const joinRoomFn = useCallback((code: string, name: string) => {
    dispatch({ type: 'JOIN_ROOM', code, name });
  }, []);
  const joinNextBot = useCallback(() => dispatch({ type: 'JOIN_BOT' }), []);
  const leaveRoom = useCallback(() => dispatch({ type: 'LEAVE_ROOM' }), []);
  const startGameFn = useCallback(() => dispatch({ type: 'START_GAME' }), []);

  const value: GameSessionValue = {
    rooms: state.rooms,
    activeRoom: state.activeRoom,
    myPlayerId: state.myPlayerId,
    createRoom: createRoomFn,
    joinRoom: joinRoomFn,
    joinNextBot,
    leaveRoom,
    startGame: startGameFn,
  };

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession(): GameSessionValue {
  const ctx = useContext(GameSessionContext);
  if (!ctx) throw new Error('useGameSession must be used within GameSessionProvider');
  return ctx;
}
```

Room codes: there is only ever one `activeRoom` in context (no multi-room registry) — `code` exists on `ActiveRoom` purely for display (`RoomCode` component) and for the URL segment in `/room/[code]`. `createRoom()` returns the freshly-generated code so `app/create/page.tsx` (Task 7) can `router.push(`/room/${code}`)`. `app/room/[code]/page.tsx` (Task 9) reads `activeRoom` from context directly — it does not look anything up by the `code` param, it just renders whatever the single active room currently is (if `activeRoom` is `null`, e.g. a hard refresh, the page redirects to `/`).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: the `GameSessionProvider` import in `app/layout.tsx` (Task 1) now resolves — no module-not-found error. Any remaining errors should only be from pages/components not yet created (Tasks 6+).

- [ ] **Step 3: Commit**

```bash
git add lib/session.tsx
git commit -m "feat: add game session context with room lifecycle actions"
```

---

### Task 6: Lobby screen

**Files:**
- Create: `components/lobby/RoomCard.tsx`
- Modify: `app/page.tsx` (replace the Task-1-era placeholder — actually still the original placeholder from before this plan started; replace entirely)

**Interfaces:**
- Consumes: `useGameSession()`, `RoomSummary` from `../lib/session` (Task 5); `BottomSheet` from `../components/ui/BottomSheet` (Task 4)
- Produces: the Lobby screen at `/`. No new exports consumed by later tasks beyond the `RoomCard` component itself (not reused elsewhere).

- [ ] **Step 1: Create `components/lobby/RoomCard.tsx`**

```tsx
import Link from 'next/link';
import type { RoomSummary } from '../../lib/session';

export function RoomCard({ room }: { room: RoomSummary }) {
  return (
    <div className="flex items-center justify-between rounded-card border border-ink/10 bg-card p-3 shadow-sm">
      <div>
        <p className="font-bold text-ink">ห้องของ {room.hostName}</p>
        <p className="text-sm text-ink-secondary">{room.code}</p>
        <p className="text-sm text-ink-secondary">
          {room.currentPlayers} / {room.maxPlayers} คน
        </p>
      </div>
      <Link
        href={`/join/${room.code}`}
        className="flex min-h-[44px] items-center rounded-card bg-primary px-4 font-bold text-white"
      >
        JOIN
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useGameSession } from '../lib/session';
import { RoomCard } from '../components/lobby/RoomCard';
import { BottomSheet } from '../components/ui/BottomSheet';

export default function Home() {
  const { rooms } = useGameSession();
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between py-2">
        <h1 className="text-xl font-bold text-primary">Muffin Time</h1>
        <button aria-label="เมนู" className="text-2xl text-ink">
          ☰
        </button>
      </header>

      <Link
        href="/create"
        className="flex min-h-[48px] items-center justify-center rounded-card bg-primary font-bold text-white"
      >
        + สร้างห้อง
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink-secondary">ห้องที่เปิดอยู่</h2>
        <div className="flex flex-col gap-2 overflow-y-auto">
          {rooms.map((room) => (
            <RoomCard key={room.code} room={room} />
          ))}
        </div>
      </section>

      <button
        onClick={() => setShowHowToPlay(true)}
        className="mt-auto min-h-[44px] text-sm font-semibold text-ink-secondary underline"
      >
        HOW TO PLAY
      </button>

      <BottomSheet open={showHowToPlay} onClose={() => setShowHowToPlay(false)}>
        <h2 className="mb-2 text-lg font-bold text-ink">วิธีเล่น</h2>
        <p className="text-sm text-ink-secondary">
          จั่ว ทิ้ง หรือขโมยไพ่ผ่านการ์ด Action, Trap และ Counter ผู้เล่นที่มีไพ่ในมือครบ 10 ใบพอดี
          ตอนเริ่มเทิร์นของตัวเอง (และเคยประกาศไว้ก่อนหน้า) เป็นผู้ชนะ
        </p>
      </BottomSheet>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/`
Expected: see the "Muffin Time" header, "+ สร้างห้อง" button, 3 seed rooms (ห้องของ Tee/Bank/Joe) each with a JOIN link, and a "HOW TO PLAY" button at the bottom that opens a bottom sheet with swipe-down-to-close. Clicking "+ สร้างห้อง" or a JOIN link will 404 — expected, those routes don't exist until Tasks 7-8.

- [ ] **Step 4: Commit**

```bash
git add components/lobby/RoomCard.tsx app/page.tsx
git commit -m "feat: build Lobby screen"
```

---

### Task 7: Create Room screen

**Files:**
- Create: `app/create/page.tsx`

**Interfaces:**
- Consumes: `useGameSession()` (Task 5)
- Produces: the `/create` route, calling `createRoom(hostName, maxPlayers)` and navigating to `/room/[code]` on submit.

- [ ] **Step 1: Create `app/create/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8];

export default function CreateRoomPage() {
  const router = useRouter();
  const { createRoom } = useGameSession();
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);

  function handleSubmit() {
    if (!name.trim()) return;
    const code = createRoom(name.trim(), maxPlayers);
    router.push(`/room/${code}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" aria-label="ย้อนกลับ" className="text-xl text-ink">
          ←
        </Link>
        <h1 className="text-lg font-bold text-ink">สร้างห้อง</h1>
      </header>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink-secondary">ชื่อของคุณ</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tee"
          className="min-h-[48px] rounded-card border border-ink/20 px-3 text-ink"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink-secondary">จำนวนผู้เล่น</span>
        <div className="grid grid-cols-3 gap-2">
          {PLAYER_COUNTS.map((count) => {
            const selected = count === maxPlayers;
            return (
              <button
                key={count}
                onClick={() => setMaxPlayers(count)}
                className={`min-h-[48px] rounded-card border text-ink ${
                  selected ? 'border-primary bg-primary/10 text-primary' : 'border-ink/20'
                }`}
              >
                {count} คน
              </button>
            );
          })}
        </div>
      </div>

      <PrimaryButton
        className="mt-auto"
        disabled={!name.trim()}
        onClick={handleSubmit}
      >
        สร้างห้อง
      </PrimaryButton>
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/create`
Expected: name input, a 3-column grid of player-count options (2-8 คน) with a clear selected state (pink border/background), and a "สร้างห้อง" button disabled until a name is entered. Submitting navigates to `/room/<code>` (404 until Task 9, expected).

- [ ] **Step 3: Commit**

```bash
git add app/create/page.tsx
git commit -m "feat: build Create Room screen"
```

---

### Task 8: Join Room screen

**Files:**
- Create: `app/join/[code]/page.tsx`

**Interfaces:**
- Consumes: `useGameSession()` (Task 5)
- Produces: the `/join/[code]` route, calling `joinRoom(code, name)` and navigating to `/room/[code]` on submit.

- [ ] **Step 1: Create `app/join/[code]/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGameSession } from '../../../lib/session';
import { PrimaryButton } from '../../../components/ui/PrimaryButton';

export default function JoinRoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const { rooms, joinRoom } = useGameSession();
  const [name, setName] = useState('');

  const summary = rooms.find((r) => r.code === params.code);

  function handleSubmit() {
    if (!name.trim()) return;
    joinRoom(params.code, name.trim());
    router.push(`/room/${params.code}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" aria-label="ย้อนกลับ" className="text-xl text-ink">
          ←
        </Link>
        <h1 className="text-lg font-bold text-ink">JOIN ห้อง</h1>
      </header>

      <div className="rounded-card border border-ink/10 bg-card p-3">
        <p className="font-bold text-ink">ห้องของ {summary?.hostName ?? '—'}</p>
        <p className="text-sm text-ink-secondary">
          {summary?.currentPlayers ?? 0} / {summary?.maxPlayers ?? 0} คน
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink-secondary">ชื่อของคุณ</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bank"
          className="min-h-[48px] rounded-card border border-ink/20 px-3 text-ink"
        />
      </label>

      <PrimaryButton className="mt-auto" disabled={!name.trim()} onClick={handleSubmit}>
        JOIN ROOM
      </PrimaryButton>
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, from `/` click JOIN on any seed room
Expected: lands on `/join/<code>` showing that room's host name and player count, a name input, and a JOIN ROOM button disabled until a name is entered. Submitting navigates to `/room/<code>` (404 until Task 9, expected).

- [ ] **Step 3: Commit**

```bash
git add app/join/[code]/page.tsx
git commit -m "feat: build Join Room screen"
```

---

### Task 9: Room shell — header, player list, Waiting Room, and routing

**Files:**
- Create: `components/room/RoomCode.tsx`, `components/room/GameHeader.tsx`, `components/room/PlayerAvatar.tsx`, `components/room/PlayerList.tsx`, `components/room/WaitingRoom.tsx`
- Create: `components/room/GameTable.tsx` (placeholder only — Task 12 replaces the body)
- Create: `components/room/GameResult.tsx` (placeholder only — Task 15 replaces the body)
- Create: `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: `useGameSession()`, `ActiveRoom` (Task 5); `PlayerId`, `PlayerState` from `../../game/types`; `PrimaryButton`, `SecondaryButton` (Task 4)
- Produces: `RoomCode`, `GameHeader`, `PlayerAvatar`, `PlayerList` (all reused by Task 12's `GameTable`); the `/room/[code]` route, dispatching to `WaitingRoom` / `GameTable` / `GameResult` by `activeRoom.state.status`.

- [ ] **Step 1: Create `components/room/RoomCode.tsx`**

```tsx
'use client';

import { useState } from 'react';

export function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the code is already visible on screen
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-secondary">รหัสห้อง: {code}</span>
      <button onClick={handleCopy} className="text-sm font-semibold text-primary">
        {copied ? 'คัดลอกแล้ว' : 'Copy'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/room/GameHeader.tsx`**

```tsx
import { RoomCode } from './RoomCode';

export function GameHeader({ hostName, code }: { hostName: string; code: string }) {
  return (
    <header className="flex items-center justify-between py-2">
      <div>
        <h1 className="text-lg font-bold text-ink">ห้องของ {hostName}</h1>
        <RoomCode code={code} />
      </div>
      <button aria-label="ตั้งค่า" className="text-2xl text-ink">
        ⚙️
      </button>
    </header>
  );
}
```

- [ ] **Step 3: Create `components/room/PlayerAvatar.tsx`**

```tsx
export function PlayerAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/room/PlayerList.tsx`**

```tsx
import { PlayerAvatar } from './PlayerAvatar';
import type { PlayerId, PlayerState } from '../../game/types';

export function PlayerList({
  players,
  hostId,
  maxPlayers,
}: {
  players: Record<PlayerId, PlayerState>;
  hostId: PlayerId;
  maxPlayers: number;
}) {
  const playerIds = Object.keys(players);
  const emptySlots = Math.max(maxPlayers - playerIds.length, 0);

  return (
    <div className="flex flex-col gap-2">
      {playerIds.map((id) => (
        <div key={id} className="flex items-center gap-2 rounded-card border border-ink/10 bg-card p-2">
          <PlayerAvatar name={players[id].name} size={32} />
          <span className="font-semibold text-ink">{players[id].name}</span>
          {id === hostId && <span title="Host">👑</span>}
        </div>
      ))}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex items-center gap-2 rounded-card border border-dashed border-ink/20 p-2 text-ink-secondary"
        >
          <div className="h-8 w-8 rounded-full bg-ink/5" />
          <span>กำลังรอ...</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/room/WaitingRoom.tsx`**

Auto-fills bot seats one at a time (900ms apart) up to `maxPlayers` so the room visibly fills while waiting — matches the brief's Waiting Room screen. Host sees "เริ่มเกม" (enabled once full); non-host sees "รอ Host เริ่มเกม...".

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { GameHeader } from './GameHeader';
import { PlayerList } from './PlayerList';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

export function WaitingRoom() {
  const router = useRouter();
  const { activeRoom, myPlayerId, joinNextBot, leaveRoom, startGame } = useGameSession();

  useEffect(() => {
    if (!activeRoom) return;
    const currentCount = Object.keys(activeRoom.state.players).length;
    if (currentCount >= activeRoom.maxPlayers) return;
    const timer = setTimeout(() => joinNextBot(), 900);
    return () => clearTimeout(timer);
  }, [activeRoom, joinNextBot]);

  if (!activeRoom) return null;
  const { state, maxPlayers, code } = activeRoom;
  const isHost = myPlayerId === state.hostId;
  const playerCount = Object.keys(state.players).length;
  const canStart = isHost && playerCount >= 3 && playerCount === maxPlayers;

  function handleLeave() {
    leaveRoom();
    router.push('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <GameHeader hostName={state.players[state.hostId].name} code={code} />
      <p className="text-sm text-ink-secondary">
        {playerCount} / {maxPlayers} คน
      </p>
      <PlayerList players={state.players} hostId={state.hostId} maxPlayers={maxPlayers} />

      <div className="mt-auto flex flex-col gap-2">
        {isHost ? (
          <PrimaryButton disabled={!canStart} onClick={startGame}>
            เริ่มเกม
          </PrimaryButton>
        ) : (
          <p className="text-center text-sm text-ink-secondary">รอ Host เริ่มเกม...</p>
        )}
        <SecondaryButton onClick={handleLeave}>ออกจากห้อง</SecondaryButton>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Create placeholder `components/room/GameTable.tsx`**

Task 12 replaces the body of this component. Placeholder keeps routing compiling and testable in the meantime.

```tsx
export function GameTable() {
  return <main className="p-4 text-ink">Game Table — กำลังพัฒนา (Task 12)</main>;
}
```

- [ ] **Step 7: Create placeholder `components/room/GameResult.tsx`**

Task 15 replaces the body of this component.

```tsx
export function GameResult() {
  return <main className="p-4 text-ink">Game Result — กำลังพัฒนา (Task 15)</main>;
}
```

- [ ] **Step 8: Create `app/room/[code]/page.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { GameTable } from '../../../components/room/GameTable';
import { GameResult } from '../../../components/room/GameResult';

export default function RoomPage() {
  const router = useRouter();
  const { activeRoom } = useGameSession();

  useEffect(() => {
    if (!activeRoom) router.replace('/');
  }, [activeRoom, router]);

  if (!activeRoom) return null;

  switch (activeRoom.state.status) {
    case 'lobby':
      return <WaitingRoom />;
    case 'playing':
      return <GameTable />;
    case 'ended':
      return <GameResult />;
  }
}
```

- [ ] **Step 9: Manual verification**

Run: `npm run dev`, from `/create` submit a room with 3 players
Expected: lands on `/room/<code>` showing the Waiting Room, host name + room code + copy button, your own name in the player list, and bots ("Bank", "Joe", ...) joining one at a time every ~900ms until full, at which point "เริ่มเกม" becomes enabled (you are the host in this flow). Clicking it flips `status` to `'playing'` and shows the Task-12 placeholder text. Also verify the Join flow (`/join/<code>` on a seed room) lands in the same Waiting Room as a non-host, showing "รอ Host เริ่มเกม..." instead of a start button.

- [ ] **Step 10: Commit**

```bash
git add components/room/RoomCode.tsx components/room/GameHeader.tsx components/room/PlayerAvatar.tsx components/room/PlayerList.tsx components/room/WaitingRoom.tsx components/room/GameTable.tsx components/room/GameResult.tsx app/room/[code]/page.tsx
git commit -m "feat: build Waiting Room and room routing shell"
```

---

### Task 10: Card components

**Files:**
- Create: `components/card/Card.tsx`, `components/card/CardHand.tsx`, `components/card/Deck.tsx`, `components/card/DiscardPile.tsx`

**Interfaces:**
- Consumes: `DemoCardType`, `getDemoCard` from `../../lib/demoCards` (Task 2); `CardCode` from `../../game/types`
- Produces: `Card({ type, title, description, selected?, onClick? })`, `CardHand({ hand, selectedCode?, onSelect })`, `Deck({ count })`, `DiscardPile({ count })` — used by Task 12 (`GameTable`) and Tasks 13-14 (modals reuse `Card` to preview the chosen card).

- [ ] **Step 1: Create `components/card/Card.tsx`**

Text-only card placeholder (type badge / title / description), colored per type. Selected state lifts the card and adds a stronger shadow, per the brief.

```tsx
import type { DemoCardType } from '../../lib/demoCards';

const TYPE_LABEL: Record<DemoCardType, string> = {
  action: 'ACTION',
  trap: 'TRAP',
  counter: 'COUNTER',
};

const TYPE_COLOR: Record<DemoCardType, string> = {
  action: 'border-action text-action',
  trap: 'border-trap text-trap',
  counter: 'border-counter text-counter',
};

export function Card({
  type,
  title,
  description,
  selected = false,
  onClick,
}: {
  type: DemoCardType;
  title: string;
  description: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-32 shrink-0 flex-col gap-1 rounded-card border-2 bg-card p-2 text-left shadow-sm transition-transform ${TYPE_COLOR[type]} ${
        selected ? '-translate-y-2 shadow-md' : ''
      }`}
    >
      <span className={`text-xs font-bold ${TYPE_COLOR[type]}`}>{TYPE_LABEL[type]}</span>
      <span className="text-sm font-bold text-ink">{title}</span>
      <span className="line-clamp-3 text-xs text-ink-secondary">{description}</span>
    </button>
  );
}
```

- [ ] **Step 2: Create `components/card/CardHand.tsx`**

Native horizontal scroll with snap, scrollbar hidden — no library.

```tsx
import { Card } from './Card';
import { getDemoCard } from '../../lib/demoCards';
import type { CardCode } from '../../game/types';

export function CardHand({
  hand,
  selectedCode,
  onSelect,
}: {
  hand: CardCode[];
  selectedCode?: CardCode | null;
  onSelect: (code: CardCode) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollSnapType: 'x proximity' }}
    >
      {hand.map((code, i) => {
        const card = getDemoCard(code);
        return (
          <div key={`${code}-${i}`} style={{ scrollSnapAlign: 'start' }}>
            <Card
              type={card.type}
              title={card.th}
              description={card.effect}
              selected={selectedCode === code}
              onClick={() => onSelect(code)}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/card/Deck.tsx`**

```tsx
export function Deck({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-16 w-12 items-center justify-center rounded-card border-2 border-ink/20 bg-card text-sm font-bold text-ink-secondary">
        {count}
      </div>
      <span className="text-xs text-ink-secondary">กองจั่ว</span>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/card/DiscardPile.tsx`**

```tsx
export function DiscardPile({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-16 w-12 items-center justify-center rounded-card border-2 border-dashed border-ink/20 bg-card text-sm font-bold text-ink-secondary">
        {count}
      </div>
      <span className="text-xs text-ink-secondary">กองทิ้ง</span>
    </div>
  );
}
```

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors from these four files.

- [ ] **Step 6: Commit**

```bash
git add components/card/Card.tsx components/card/CardHand.tsx components/card/Deck.tsx components/card/DiscardPile.tsx
git commit -m "feat: add card, card hand, deck, and discard pile components"
```

---

### Task 11: Game session — gameplay actions and bot loop (`lib/session.tsx`, part 2)

**Files:**
- Modify: `lib/session.tsx` (replace the entire file with the version below — it's the same file from Task 5 plus gameplay actions)

**Interfaces:**
- Consumes: `draw`, `discard` from `../game/pile`; `placeTrap`, `removeTrap` from `../game/trap`; `advanceTurn`, `checkWinnerAtTurnStart`, `declareMuffinTime` from `../game/turn`; `demoCardsOfType`, `resolveActionCard`, `resolveTrapCard`, `resolveCounterCard` from `./demoCards` (Task 2); `decideBotTurn` from `./botTurn` (Task 3)
- Produces: adds `PendingResponse { kind: 'action' | 'trap'; code: CardCode; actorId: PlayerId; targetId?: PlayerId }` and these to `useGameSession()`'s return value: `pendingResponse`, `drawCard()`, `playAction(code, targetId?)`, `placeTrapCard(code)`, `openTrapCard(code, targetId?)`, `playCounter(code)`, `skipCounter()`, `declareMuffinTime()` — consumed by Task 12 (`GameTable`), Task 13 (`ActionModal`/`TargetSelector`/`TrapModal`), Task 14 (`CounterModal` and results), Task 15 (`GameResult`'s muffin-time declare button).

Sequencing rule this task implements (from the design spec's Response Window section): playing an Action or opening a Trap does NOT immediately apply its effect — it discards/removes the card and sets `pendingResponse`, pausing the turn. The human is then always asked (via the auto-skip effect below) whether to counter, regardless of who the actor or target was. Only after `playCounter`/`skipCounter` resolves does the effect actually apply and (for actions only) the turn advance. Bots never place traps and never play counters.

- [ ] **Step 1: Replace `lib/session.tsx` with the full updated file**

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { createRoom as engineCreateRoom, addPlayer, startGame as engineStartGame } from '../game/room';
import { draw, discard } from '../game/pile';
import { placeTrap as enginePlaceTrap, removeTrap } from '../game/trap';
import { advanceTurn, checkWinnerAtTurnStart, declareMuffinTime as engineDeclareMuffinTime } from '../game/turn';
import type { RoomState, PlayerId, CardCode } from '../game/types';
import { buildDemoDeck, demoCardsOfType, resolveActionCard, resolveTrapCard, resolveCounterCard } from './demoCards';
import { decideBotTurn } from './botTurn';

export interface RoomSummary {
  code: string;
  hostName: string;
  currentPlayers: number;
  maxPlayers: number;
}

export interface ActiveRoom {
  code: string;
  state: RoomState;
  maxPlayers: number;
}

export interface PendingResponse {
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
}

interface SessionState {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  pendingResponse: PendingResponse | null;
}

type Action =
  | { type: 'CREATE_ROOM'; code: string; hostName: string; maxPlayers: number }
  | { type: 'JOIN_ROOM'; code: string; name: string }
  | { type: 'JOIN_BOT' }
  | { type: 'LEAVE_ROOM' }
  | { type: 'START_GAME' }
  | { type: 'DRAW_CARD' }
  | { type: 'PLAY_ACTION'; code: CardCode; targetId?: PlayerId }
  | { type: 'PLACE_TRAP'; code: CardCode }
  | { type: 'OPEN_TRAP'; code: CardCode; targetId?: PlayerId }
  | { type: 'PLAY_COUNTER'; code: CardCode }
  | { type: 'SKIP_COUNTER' }
  | { type: 'DECLARE_MUFFIN_TIME' }
  | { type: 'BOT_TURN' };

export const BOT_NAME_POOL = ['Bank', 'Joe', 'Guy', 'Nam', 'Ploy', 'Golf', 'Mint'];

const SEED_ROOMS: RoomSummary[] = [
  { code: '4829', hostName: 'Tee', currentPlayers: 3, maxPlayers: 4 },
  { code: '7712', hostName: 'Bank', currentPlayers: 2, maxPlayers: 6 },
  { code: '8890', hostName: 'Joe', currentPlayers: 1, maxPlayers: 5 },
];

export function makeRoomCode(rng: () => number = Math.random): string {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += digits[Math.floor(rng() * digits.length)];
  return out;
}

function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  if (checkWinnerAtTurnStart(advanced, currentId)) {
    return { ...advanced, status: 'ended' };
  }
  return advanced;
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'CREATE_ROOM': {
      const roomState = engineCreateRoom('me', action.hostName);
      return {
        ...state,
        myPlayerId: 'me',
        activeRoom: { code: action.code, state: roomState, maxPlayers: action.maxPlayers },
        pendingResponse: null,
      };
    }
    case 'JOIN_ROOM': {
      const summary = state.rooms.find((r) => r.code === action.code);
      const maxPlayers = summary?.maxPlayers ?? 4;
      const hostName = summary?.hostName ?? 'Host';
      const existingOthers = Math.max((summary?.currentPlayers ?? 1) - 1, 0);
      let roomState = engineCreateRoom('bot-0', hostName);
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
    }
    case 'JOIN_BOT': {
      if (!state.activeRoom) return state;
      const current = state.activeRoom.state;
      const currentCount = Object.keys(current.players).length;
      if (currentCount >= state.activeRoom.maxPlayers) return state;
      const botId = `bot-${currentCount}`;
      const botName = BOT_NAME_POOL[(currentCount - 1) % BOT_NAME_POOL.length];
      const next = addPlayer(current, botId, botName);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'LEAVE_ROOM':
      return { ...state, activeRoom: null, myPlayerId: null, pendingResponse: null };
    case 'START_GAME': {
      if (!state.activeRoom) return state;
      const next = engineStartGame(state.activeRoom.state, buildDemoDeck());
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'DRAW_CARD': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const room = state.activeRoom.state;
      if (room.turnOrder[room.currentTurnIndex] !== state.myPlayerId) return state;
      const drawn = draw(room, state.myPlayerId!, 1);
      return { ...state, activeRoom: { ...state.activeRoom, state: advanceAndCheckWin(drawn) } };
    }
    case 'PLAY_ACTION': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const room = state.activeRoom.state;
      if (room.turnOrder[room.currentTurnIndex] !== state.myPlayerId) return state;
      const actorId = state.myPlayerId!;
      const afterDiscard = discard(room, actorId, 1, [action.code]);
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: afterDiscard },
        pendingResponse: { kind: 'action', code: action.code, actorId, targetId: action.targetId },
      };
    }
    case 'PLACE_TRAP': {
      if (!state.activeRoom) return state;
      const next = enginePlaceTrap(state.activeRoom.state, state.myPlayerId!, action.code);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'OPEN_TRAP': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const ownerId = state.myPlayerId!;
      const afterRemove = removeTrap(state.activeRoom.state, ownerId, action.code);
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: afterRemove },
        pendingResponse: { kind: 'trap', code: action.code, actorId: ownerId, targetId: action.targetId },
      };
    }
    case 'PLAY_COUNTER': {
      if (!state.activeRoom || !state.pendingResponse) return state;
      const counterActorId = state.myPlayerId!;
      const afterDiscard = discard(state.activeRoom.state, counterActorId, 1, [action.code]);
      const resolved = resolveCounterCard(afterDiscard, action.code, counterActorId);
      const finalState = state.pendingResponse.kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
      return { ...state, activeRoom: { ...state.activeRoom, state: finalState }, pendingResponse: null };
    }
    case 'SKIP_COUNTER': {
      if (!state.activeRoom || !state.pendingResponse) return state;
      const { kind, code, actorId, targetId } = state.pendingResponse;
      const resolved =
        kind === 'action'
          ? resolveActionCard(state.activeRoom.state, code, actorId, targetId)
          : resolveTrapCard(state.activeRoom.state, code, actorId, targetId);
      const finalState = kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
      return { ...state, activeRoom: { ...state.activeRoom, state: finalState }, pendingResponse: null };
    }
    case 'DECLARE_MUFFIN_TIME': {
      if (!state.activeRoom) return state;
      const next = engineDeclareMuffinTime(state.activeRoom.state, state.myPlayerId!);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'BOT_TURN': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const room = state.activeRoom.state;
      const botId = room.turnOrder[room.currentTurnIndex];
      const decision = decideBotTurn(room, botId);
      if (decision.action === 'draw') {
        const drawn = draw(room, botId, 1);
        return { ...state, activeRoom: { ...state.activeRoom, state: advanceAndCheckWin(drawn) } };
      }
      const afterDiscard = discard(room, botId, 1, [decision.code]);
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: afterDiscard },
        pendingResponse: { kind: 'action', code: decision.code, actorId: botId, targetId: decision.targetId },
      };
    }
    default:
      return state;
  }
}

interface GameSessionValue {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  pendingResponse: PendingResponse | null;
  createRoom: (hostName: string, maxPlayers: number) => string;
  joinRoom: (code: string, name: string) => void;
  joinNextBot: () => void;
  leaveRoom: () => void;
  startGame: () => void;
  drawCard: () => void;
  playAction: (code: CardCode, targetId?: PlayerId) => void;
  placeTrapCard: (code: CardCode) => void;
  openTrapCard: (code: CardCode, targetId?: PlayerId) => void;
  playCounter: (code: CardCode) => void;
  skipCounter: () => void;
  declareMuffinTime: () => void;
}

const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    rooms: SEED_ROOMS,
    activeRoom: null,
    myPlayerId: null,
    pendingResponse: null,
  });

  const createRoomFn = useCallback((hostName: string, maxPlayers: number) => {
    const code = makeRoomCode();
    dispatch({ type: 'CREATE_ROOM', code, hostName, maxPlayers });
    return code;
  }, []);
  const joinRoomFn = useCallback((code: string, name: string) => {
    dispatch({ type: 'JOIN_ROOM', code, name });
  }, []);
  const joinNextBot = useCallback(() => dispatch({ type: 'JOIN_BOT' }), []);
  const leaveRoom = useCallback(() => dispatch({ type: 'LEAVE_ROOM' }), []);
  const startGameFn = useCallback(() => dispatch({ type: 'START_GAME' }), []);
  const drawCard = useCallback(() => dispatch({ type: 'DRAW_CARD' }), []);
  const playAction = useCallback(
    (code: CardCode, targetId?: PlayerId) => dispatch({ type: 'PLAY_ACTION', code, targetId }),
    []
  );
  const placeTrapCard = useCallback((code: CardCode) => dispatch({ type: 'PLACE_TRAP', code }), []);
  const openTrapCard = useCallback(
    (code: CardCode, targetId?: PlayerId) => dispatch({ type: 'OPEN_TRAP', code, targetId }),
    []
  );
  const playCounter = useCallback((code: CardCode) => dispatch({ type: 'PLAY_COUNTER', code }), []);
  const skipCounter = useCallback(() => dispatch({ type: 'SKIP_COUNTER' }), []);
  const declareMuffinTimeFn = useCallback(() => dispatch({ type: 'DECLARE_MUFFIN_TIME' }), []);

  // Auto-skip the counter window when the human has no counter card to play —
  // don't show an empty prompt.
  useEffect(() => {
    if (!state.pendingResponse || !state.activeRoom || !state.myPlayerId) return;
    const myHand = state.activeRoom.state.players[state.myPlayerId]?.hand ?? [];
    const counterCodes = new Set(demoCardsOfType('counter').map((c) => c.code));
    const hasCounter = myHand.some((code) => counterCodes.has(code));
    if (!hasCounter) {
      const timer = setTimeout(() => dispatch({ type: 'SKIP_COUNTER' }), 400);
      return () => clearTimeout(timer);
    }
  }, [state.pendingResponse, state.activeRoom, state.myPlayerId]);

  // Auto-play bot turns when it's a bot's turn and no response window is open.
  useEffect(() => {
    if (!state.activeRoom || state.pendingResponse) return;
    if (state.activeRoom.state.status !== 'playing') return;
    const room = state.activeRoom.state;
    const currentId = room.turnOrder[room.currentTurnIndex];
    if (!currentId || !currentId.startsWith('bot-')) return;
    const timer = setTimeout(() => dispatch({ type: 'BOT_TURN' }), 700);
    return () => clearTimeout(timer);
  }, [state.activeRoom, state.pendingResponse]);

  const value: GameSessionValue = {
    rooms: state.rooms,
    activeRoom: state.activeRoom,
    myPlayerId: state.myPlayerId,
    pendingResponse: state.pendingResponse,
    createRoom: createRoomFn,
    joinRoom: joinRoomFn,
    joinNextBot,
    leaveRoom,
    startGame: startGameFn,
    drawCard,
    playAction,
    placeTrapCard,
    openTrapCard,
    playCounter,
    skipCounter,
    declareMuffinTime: declareMuffinTimeFn,
  };

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession(): GameSessionValue {
  const ctx = useContext(GameSessionContext);
  if (!ctx) throw new Error('useGameSession must be used within GameSessionProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors from `lib/session.tsx` itself (errors from components not yet built, e.g. `GameTable`'s placeholder not using the new fields, are fine — the placeholder from Task 9 doesn't reference any session gameplay fields, so there should be none).

- [ ] **Step 3: Commit**

```bash
git add lib/session.tsx
git commit -m "feat: add gameplay actions and bot turn loop to game session"
```

---

### Task 12: Game Table — view, draw, and turn status

**Files:**
- Create: `components/room/PlayerCard.tsx`, `components/room/BottomActionBar.tsx`
- Modify: `components/room/GameTable.tsx` (replace the Task-9 placeholder body)

**Interfaces:**
- Consumes: `useGameSession()`, `ActiveRoom` (Task 11); `isMuffinTimeEligible` from `../../game/turn`; `GameHeader` (Task 9); `Deck`, `DiscardPile`, `CardHand` (Task 10); `PlayerAvatar` (Task 9); `PlayerState`, `CardCode` from `../../game/types`
- Produces: `PlayerCard({ player, isCurrentTurn })` (also reused nowhere else in this plan, but kept as its own file per the component list), `BottomActionBar({ isMyTurn, onDraw, canDeclare, onDeclare })`, and the real `GameTable` — this task covers view + draw + turn status only. Task 13 wires actually playing a card (currently tapping a card in hand only highlights it locally, per `CardHand`'s existing `selectedCode`/`onSelect` props from Task 10).

This is the fixed-viewport layout from the design brief: TOP 15% (header), CENTER 45% (opponents + deck/discard), BOTTOM 40% (your info + hand + action bar) — no vertical scroll of the table itself during play; only the hand scrolls horizontally.

- [ ] **Step 1: Create `components/room/PlayerCard.tsx`**

```tsx
import { PlayerAvatar } from './PlayerAvatar';
import type { PlayerState } from '../../game/types';

export function PlayerCard({ player, isCurrentTurn }: { player: PlayerState; isCurrentTurn: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-card p-1 ${isCurrentTurn ? 'ring-2 ring-primary' : ''}`}>
      <PlayerAvatar name={player.name} size={40} />
      <span className="text-xs font-semibold text-ink">{player.name}</span>
      <span className="text-[10px] text-ink-secondary">
        {player.hand.length} ใบ | กับดัก {player.traps.length} ใบ
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/room/BottomActionBar.tsx`**

```tsx
import { PrimaryButton } from '../ui/PrimaryButton';

export function BottomActionBar({
  isMyTurn,
  onDraw,
  canDeclare,
  onDeclare,
}: {
  isMyTurn: boolean;
  onDraw: () => void;
  canDeclare: boolean;
  onDeclare: () => void;
}) {
  return (
    <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-ink/10 bg-app-bg p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <p className="text-sm font-semibold text-ink">{isMyTurn ? 'ตาของคุณ' : 'รอผู้เล่นอื่น...'}</p>
      <div className="flex gap-2">
        {canDeclare && (
          <PrimaryButton tone="counter" onClick={onDeclare}>
            Muffin Time!
          </PrimaryButton>
        )}
        <PrimaryButton onClick={onDraw} disabled={!isMyTurn}>
          จั่วไพ่
        </PrimaryButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `components/room/GameTable.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import { isMuffinTimeEligible } from '../../game/turn';
import { GameHeader } from './GameHeader';
import { PlayerCard } from './PlayerCard';
import { BottomActionBar } from './BottomActionBar';
import { Deck } from '../card/Deck';
import { DiscardPile } from '../card/DiscardPile';
import { CardHand } from '../card/CardHand';
import type { CardCode } from '../../game/types';

export function GameTable() {
  const { activeRoom, myPlayerId, drawCard, declareMuffinTime } = useGameSession();
  const [selectedCode, setSelectedCode] = useState<CardCode | null>(null);

  if (!activeRoom || !myPlayerId) return null;
  const { state, code } = activeRoom;
  const me = state.players[myPlayerId];
  const isMyTurn = state.turnOrder[state.currentTurnIndex] === myPlayerId;
  const canDeclare = isMyTurn && isMuffinTimeEligible(state, myPlayerId) && !me.hasCalledMuffinTime;
  const opponentIds = state.turnOrder.filter((id) => id !== myPlayerId);

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col overflow-hidden">
      <div className="shrink-0 p-3" style={{ flexBasis: '15%' }}>
        <GameHeader hostName={state.players[state.hostId].name} code={code} />
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3" style={{ flexBasis: '45%' }}>
        <div className="flex flex-wrap justify-center gap-3">
          {opponentIds.map((id) => (
            <PlayerCard
              key={id}
              player={state.players[id]}
              isCurrentTurn={state.turnOrder[state.currentTurnIndex] === id}
            />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center gap-6">
          <Deck count={state.drawPile.length} />
          <DiscardPile count={state.discardPile.length} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-ink/10 p-3" style={{ flexBasis: '40%' }}>
        <PlayerCard player={me} isCurrentTurn={isMyTurn} />
        <CardHand hand={me.hand} selectedCode={selectedCode} onSelect={setSelectedCode} />
        <BottomActionBar isMyTurn={isMyTurn} onDraw={drawCard} canDeclare={canDeclare} onDeclare={declareMuffinTime} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, create a room, wait for bots to fill, start the game
Expected: fixed-viewport Game Table with your opponents' avatars/names/card+trap counts at the top-center (highlighted when it's their turn), deck/discard counts in the middle, your own info + horizontally-scrollable hand + bottom action bar at the bottom. Tapping "จั่วไพ่" on your turn draws a card and advances the turn; after a ~700ms delay you should see bot turns auto-resolve (their card counts change) until it's your turn again. Tapping a card in your hand highlights it (lifts + border) but doesn't play it yet — that's Task 13.

- [ ] **Step 5: Commit**

```bash
git add components/room/PlayerCard.tsx components/room/BottomActionBar.tsx components/room/GameTable.tsx
git commit -m "feat: build Game Table view, draw, and turn status"
```

---

### Task 13: Play an Action card / place a Trap

**Files:**
- Create: `components/modals/ActionModal.tsx`, `components/modals/TrapModal.tsx`, `components/modals/TargetSelector.tsx`
- Modify: `components/room/GameTable.tsx` (wire tapping a hand card to these modals)

**Interfaces:**
- Consumes: `BottomSheet`, `PrimaryButton` (with `tone`), `SecondaryButton` (Task 4); `DemoCard`, `getDemoCard` (Task 2); `useGameSession()`'s `playAction`, `placeTrapCard` (Task 11); `PlayerId`, `PlayerState`, `CardCode` from `../../game/types`
- Produces: `ActionModal({ card, onConfirm, onCancel })`, `TrapModal({ card, onConfirm, onCancel })`, `TargetSelector({ open, candidates, selectedId, onSelect, onConfirm, onCancel, prompt })`. Tapping a Counter-type card in hand still does nothing yet (Task 14 adds that).

- [ ] **Step 1: Create `components/modals/ActionModal.tsx`**

```tsx
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { DemoCard } from '../../lib/demoCards';

export function ActionModal({
  card,
  onConfirm,
  onCancel,
}: {
  card: DemoCard | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet open={card !== null} onClose={onCancel}>
      {card && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-action">ACTION</span>
          <h2 className="text-lg font-bold text-ink">{card.th}</h2>
          <p className="text-sm text-ink-secondary">{card.effect}</p>
          <PrimaryButton tone="action" onClick={onConfirm}>
            เล่นการ์ดนี้
          </PrimaryButton>
          <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Create `components/modals/TrapModal.tsx`**

```tsx
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { DemoCard } from '../../lib/demoCards';

export function TrapModal({
  card,
  onConfirm,
  onCancel,
}: {
  card: DemoCard | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet open={card !== null} onClose={onCancel}>
      {card && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-trap">TRAP</span>
          <h2 className="text-lg font-bold text-ink">{card.th}</h2>
          <p className="text-sm text-ink-secondary">{card.effect}</p>
          <PrimaryButton tone="trap" onClick={onConfirm}>
            วางกับดักนี้
          </PrimaryButton>
          <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Create `components/modals/TargetSelector.tsx`**

```tsx
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { PlayerId, PlayerState } from '../../game/types';

export function TargetSelector({
  open,
  candidates,
  selectedId,
  onSelect,
  onConfirm,
  onCancel,
  prompt,
}: {
  open: boolean;
  candidates: Array<{ id: PlayerId; player: PlayerState }>;
  selectedId: PlayerId | null;
  onSelect: (id: PlayerId) => void;
  onConfirm: () => void;
  onCancel: () => void;
  prompt: string;
}) {
  return (
    <BottomSheet open={open} onClose={onCancel}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">เลือกผู้เล่นเป้าหมาย</h2>
        <p className="text-sm text-ink-secondary">{prompt}</p>
        <div className="flex flex-col gap-2">
          {candidates.map(({ id, player }) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-2 rounded-card border p-2 text-left ${
                selectedId === id ? 'border-primary bg-primary/10' : 'border-ink/20'
              }`}
            >
              <span className={selectedId === id ? 'text-primary' : 'text-ink-secondary'}>
                {selectedId === id ? '●' : '○'}
              </span>
              <span className="font-semibold text-ink">{player.name}</span>
            </button>
          ))}
        </div>
        <PrimaryButton disabled={!selectedId} onClick={onConfirm}>
          ยืนยัน
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Replace `components/room/GameTable.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import { isMuffinTimeEligible } from '../../game/turn';
import { getDemoCard, type DemoCard } from '../../lib/demoCards';
import { GameHeader } from './GameHeader';
import { PlayerCard } from './PlayerCard';
import { BottomActionBar } from './BottomActionBar';
import { Deck } from '../card/Deck';
import { DiscardPile } from '../card/DiscardPile';
import { CardHand } from '../card/CardHand';
import { ActionModal } from '../modals/ActionModal';
import { TrapModal } from '../modals/TrapModal';
import { TargetSelector } from '../modals/TargetSelector';
import type { CardCode, PlayerId } from '../../game/types';

export function GameTable() {
  const { activeRoom, myPlayerId, drawCard, declareMuffinTime, playAction, placeTrapCard } = useGameSession();
  const [pendingCard, setPendingCard] = useState<DemoCard | null>(null);
  const [awaitingTarget, setAwaitingTarget] = useState(false);
  const [chosenTarget, setChosenTarget] = useState<PlayerId | null>(null);

  if (!activeRoom || !myPlayerId) return null;
  const { state, code } = activeRoom;
  const me = state.players[myPlayerId];
  const isMyTurn = state.turnOrder[state.currentTurnIndex] === myPlayerId;
  const canDeclare = isMyTurn && isMuffinTimeEligible(state, myPlayerId) && !me.hasCalledMuffinTime;
  const opponentIds = state.turnOrder.filter((id) => id !== myPlayerId);

  function handleSelectCard(cardCode: CardCode) {
    if (!isMyTurn) return;
    const card = getDemoCard(cardCode);
    if (card.type === 'action' || card.type === 'trap') {
      setPendingCard(card);
    }
  }

  function closeModals() {
    setPendingCard(null);
    setAwaitingTarget(false);
    setChosenTarget(null);
  }

  function handleConfirmCard() {
    if (!pendingCard) return;
    if (pendingCard.type === 'trap') {
      placeTrapCard(pendingCard.code);
      closeModals();
      return;
    }
    if (pendingCard.needsTarget) {
      setAwaitingTarget(true);
      return;
    }
    playAction(pendingCard.code);
    closeModals();
  }

  function handleConfirmTarget() {
    if (!pendingCard || !chosenTarget) return;
    playAction(pendingCard.code, chosenTarget);
    closeModals();
  }

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col overflow-hidden">
      <div className="shrink-0 p-3" style={{ flexBasis: '15%' }}>
        <GameHeader hostName={state.players[state.hostId].name} code={code} />
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3" style={{ flexBasis: '45%' }}>
        <div className="flex flex-wrap justify-center gap-3">
          {opponentIds.map((id) => (
            <PlayerCard
              key={id}
              player={state.players[id]}
              isCurrentTurn={state.turnOrder[state.currentTurnIndex] === id}
            />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center gap-6">
          <Deck count={state.drawPile.length} />
          <DiscardPile count={state.discardPile.length} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-ink/10 p-3" style={{ flexBasis: '40%' }}>
        <PlayerCard player={me} isCurrentTurn={isMyTurn} />
        <CardHand hand={me.hand} selectedCode={pendingCard?.code ?? null} onSelect={handleSelectCard} />
        <BottomActionBar isMyTurn={isMyTurn} onDraw={drawCard} canDeclare={canDeclare} onDeclare={declareMuffinTime} />
      </div>

      {pendingCard?.type === 'action' && (
        <ActionModal card={awaitingTarget ? null : pendingCard} onConfirm={handleConfirmCard} onCancel={closeModals} />
      )}
      {pendingCard?.type === 'trap' && (
        <TrapModal card={pendingCard} onConfirm={handleConfirmCard} onCancel={closeModals} />
      )}
      <TargetSelector
        open={awaitingTarget}
        candidates={opponentIds.map((id) => ({ id, player: state.players[id] }))}
        selectedId={chosenTarget}
        onSelect={setChosenTarget}
        onConfirm={handleConfirmTarget}
        onCancel={closeModals}
        prompt={pendingCard ? pendingCard.effect : ''}
      />
    </main>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, start a game, on your turn tap a no-target Action card (e.g. "ปาชีส!" A008) in your hand
Expected: ActionModal opens with the card's type/title/description; "เล่นการ์ดนี้" plays it (card leaves your hand into discard, opponents' hand counts drop by 1, then — since no counter card in your hand yet — the turn advances after a brief pause per Task 11's auto-skip effect). Tap a targeted Action card (e.g. "ดึงนิ้วฉันสิ" A014): confirming opens TargetSelector; picking an opponent and confirming applies the steal. Tap a Trap card (e.g. "จับได้แล้ว!" T13): TrapModal opens; confirming places it face-down (visible via your `PlayerCard`'s "กับดัก N ใบ" count increasing).

- [ ] **Step 6: Commit**

```bash
git add components/modals/ActionModal.tsx components/modals/TrapModal.tsx components/modals/TargetSelector.tsx components/room/GameTable.tsx
git commit -m "feat: wire playing Action cards and placing Traps"
```

---

### Task 14: Counter response window, Trap/Counter results, and opening your own traps

**Files:**
- Modify: `lib/session.tsx` (add `lastResult` tracking to `PLAY_COUNTER`/`SKIP_COUNTER`, add `CLEAR_RESULT`)
- Modify: `components/modals/TrapModal.tsx` (add a `mode: 'place' | 'open'` prop)
- Create: `components/modals/CounterModal.tsx`, `components/modals/TrapResultModal.tsx`, `components/modals/CounterResultModal.tsx`
- Modify: `components/room/GameTable.tsx` (add a trap zone with an "เปิด" action per placed trap, and wire the Counter/result modals)

**Interfaces:**
- Produces: `LastResult { kind: 'action' | 'trap'; code: CardCode; actorId: PlayerId; targetId?: PlayerId; countered: boolean; counteredBy?: PlayerId; counterCode?: CardCode }` and `useGameSession()`'s `lastResult`, `clearLastResult()`; `CounterModal({ open, counterCards, onPlay, onSkip })`; `TrapResultModal({ result, ownerName, targetName?, onClose })`; `CounterResultModal({ result, counterActorName, onClose })`.

- [ ] **Step 1: Add `lastResult` to `lib/session.tsx`**

Add this interface near `PendingResponse`:

```ts
export interface LastResult {
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
  countered: boolean;
  counteredBy?: PlayerId;
  counterCode?: CardCode;
}
```

Add `lastResult: LastResult | null;` to `SessionState`, initialize it to `null` in `GameSessionProvider`'s `useReducer` call, and add `{ type: 'CLEAR_RESULT' }` to the `Action` union.

Replace the `PLAY_COUNTER` and `SKIP_COUNTER` cases in the reducer with:

```ts
case 'PLAY_COUNTER': {
  if (!state.activeRoom || !state.pendingResponse) return state;
  const counterActorId = state.myPlayerId!;
  const afterDiscard = discard(state.activeRoom.state, counterActorId, 1, [action.code]);
  const resolved = resolveCounterCard(afterDiscard, action.code, counterActorId);
  const finalState = state.pendingResponse.kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
  return {
    ...state,
    activeRoom: { ...state.activeRoom, state: finalState },
    pendingResponse: null,
    lastResult: { ...state.pendingResponse, countered: true, counteredBy: counterActorId, counterCode: action.code },
  };
}
case 'SKIP_COUNTER': {
  if (!state.activeRoom || !state.pendingResponse) return state;
  const { kind, code, actorId, targetId } = state.pendingResponse;
  const resolved =
    kind === 'action'
      ? resolveActionCard(state.activeRoom.state, code, actorId, targetId)
      : resolveTrapCard(state.activeRoom.state, code, actorId, targetId);
  const finalState = kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
  return {
    ...state,
    activeRoom: { ...state.activeRoom, state: finalState },
    pendingResponse: null,
    lastResult: { kind, code, actorId, targetId, countered: false },
  };
}
```

Add a new case:

```ts
case 'CLEAR_RESULT':
  return { ...state, lastResult: null };
```

Add `lastResult: LastResult | null;` and `clearLastResult: () => void;` to `GameSessionValue`, wire a `clearLastResult` callback (`useCallback(() => dispatch({ type: 'CLEAR_RESULT' }), [])`) in the provider, and include both in the returned `value` object alongside the existing fields.

- [ ] **Step 2: Add a `mode` prop to `components/modals/TrapModal.tsx`**

Replace the whole file:

```tsx
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { DemoCard } from '../../lib/demoCards';

export function TrapModal({
  card,
  mode,
  onConfirm,
  onCancel,
}: {
  card: DemoCard | null;
  mode: 'place' | 'open';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet open={card !== null} onClose={onCancel}>
      {card && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-trap">TRAP</span>
          <h2 className="text-lg font-bold text-ink">{card.th}</h2>
          <p className="text-sm text-ink-secondary">{card.effect}</p>
          <PrimaryButton tone="trap" onClick={onConfirm}>
            {mode === 'place' ? 'วางกับดักนี้' : 'เปิดกับดักนี้'}
          </PrimaryButton>
          <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Create `components/modals/CounterModal.tsx`**

```tsx
import { BottomSheet } from '../ui/BottomSheet';
import { Card } from '../card/Card';
import { SecondaryButton } from '../ui/SecondaryButton';
import { getDemoCard } from '../../lib/demoCards';
import type { CardCode } from '../../game/types';

export function CounterModal({
  open,
  counterCards,
  onPlay,
  onSkip,
}: {
  open: boolean;
  counterCards: CardCode[];
  onPlay: (code: CardCode) => void;
  onSkip: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onSkip}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">เล่น Counter ไหม?</h2>
        <div className="flex gap-2 overflow-x-auto">
          {counterCards.map((code) => {
            const card = getDemoCard(code);
            return (
              <Card key={code} type="counter" title={card.th} description={card.effect} onClick={() => onPlay(code)} />
            );
          })}
        </div>
        <SecondaryButton onClick={onSkip}>ข้าม</SecondaryButton>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Create `components/modals/TrapResultModal.tsx`**

```tsx
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { getDemoCard } from '../../lib/demoCards';
import type { LastResult } from '../../lib/session';

export function TrapResultModal({
  result,
  ownerName,
  targetName,
  onClose,
}: {
  result: LastResult | null;
  ownerName: string;
  targetName?: string;
  onClose: () => void;
}) {
  const show = result !== null && result.kind === 'trap' && !result.countered;
  const card = result ? getDemoCard(result.code) : null;

  return (
    <BottomSheet open={show} onClose={onClose}>
      {card && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-trap">TRAP!</span>
          <h2 className="text-lg font-bold text-ink">
            {card.th} ของ {ownerName} ถูกเปิดแล้ว!
          </h2>
          {targetName && <p className="text-sm text-ink">{targetName} ทำเงื่อนไขจริง</p>}
          <p className="text-sm text-ink-secondary">{card.effect}</p>
          <PrimaryButton tone="trap" onClick={onClose}>
            ปิด
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 5: Create `components/modals/CounterResultModal.tsx`**

```tsx
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { getDemoCard } from '../../lib/demoCards';
import type { LastResult } from '../../lib/session';

export function CounterResultModal({
  result,
  counterActorName,
  onClose,
}: {
  result: LastResult | null;
  counterActorName: string;
  onClose: () => void;
}) {
  const show = result !== null && result.countered;
  const counterCard = result?.counterCode ? getDemoCard(result.counterCode) : null;

  return (
    <BottomSheet open={show} onClose={onClose}>
      {counterCard && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-counter">โดน COUNTER!</span>
          <h2 className="text-lg font-bold text-ink">
            {counterActorName} เล่นการ์ด &quot;{counterCard.th}&quot;
          </h2>
          <p className="text-sm text-ink-secondary">ผลของการ์ด/กับดักถูกยกเลิก</p>
          <PrimaryButton tone="counter" onClick={onClose}>
            ตกลง
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 6: Replace `components/room/GameTable.tsx`**

Adds a trap zone (your placed traps, each with an "เปิด" button — T45 opens directly since it needs no target, the rest go through `TargetSelector`), the `CounterModal` driven by `pendingResponse` (only rendered once the auto-skip effect from Task 11 has already ruled out "no counter card" — so by the time this modal would show, the human does have at least one counter card), and the two result modals driven by `lastResult`.

```tsx
'use client';

import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import { isMuffinTimeEligible } from '../../game/turn';
import { getDemoCard, demoCardsOfType, type DemoCard } from '../../lib/demoCards';
import { GameHeader } from './GameHeader';
import { PlayerCard } from './PlayerCard';
import { BottomActionBar } from './BottomActionBar';
import { Deck } from '../card/Deck';
import { DiscardPile } from '../card/DiscardPile';
import { CardHand } from '../card/CardHand';
import { ActionModal } from '../modals/ActionModal';
import { TrapModal } from '../modals/TrapModal';
import { TargetSelector } from '../modals/TargetSelector';
import { CounterModal } from '../modals/CounterModal';
import { TrapResultModal } from '../modals/TrapResultModal';
import { CounterResultModal } from '../modals/CounterResultModal';
import type { CardCode, PlayerId } from '../../game/types';

export function GameTable() {
  const {
    activeRoom,
    myPlayerId,
    drawCard,
    declareMuffinTime,
    playAction,
    placeTrapCard,
    openTrapCard,
    pendingResponse,
    playCounter,
    skipCounter,
    lastResult,
    clearLastResult,
  } = useGameSession();

  const [pendingCard, setPendingCard] = useState<DemoCard | null>(null);
  const [awaitingTarget, setAwaitingTarget] = useState(false);
  const [chosenTarget, setChosenTarget] = useState<PlayerId | null>(null);

  const [pendingTrapOpen, setPendingTrapOpen] = useState<DemoCard | null>(null);
  const [awaitingTrapTarget, setAwaitingTrapTarget] = useState(false);
  const [chosenTrapTarget, setChosenTrapTarget] = useState<PlayerId | null>(null);

  if (!activeRoom || !myPlayerId) return null;
  const { state, code } = activeRoom;
  const me = state.players[myPlayerId];
  const isMyTurn = state.turnOrder[state.currentTurnIndex] === myPlayerId;
  const canDeclare = isMyTurn && isMuffinTimeEligible(state, myPlayerId) && !me.hasCalledMuffinTime;
  const opponentIds = state.turnOrder.filter((id) => id !== myPlayerId);

  function handleSelectCard(cardCode: CardCode) {
    if (!isMyTurn) return;
    const card = getDemoCard(cardCode);
    if (card.type === 'action' || card.type === 'trap') {
      setPendingCard(card);
    }
  }

  function closeHandFlow() {
    setPendingCard(null);
    setAwaitingTarget(false);
    setChosenTarget(null);
  }

  function handleConfirmCard() {
    if (!pendingCard) return;
    if (pendingCard.type === 'trap') {
      placeTrapCard(pendingCard.code);
      closeHandFlow();
      return;
    }
    if (pendingCard.needsTarget) {
      setAwaitingTarget(true);
      return;
    }
    playAction(pendingCard.code);
    closeHandFlow();
  }

  function handleConfirmTarget() {
    if (!pendingCard || !chosenTarget) return;
    playAction(pendingCard.code, chosenTarget);
    closeHandFlow();
  }

  function closeTrapOpenFlow() {
    setPendingTrapOpen(null);
    setAwaitingTrapTarget(false);
    setChosenTrapTarget(null);
  }

  function handleOpenTrapTap(trapCode: CardCode) {
    setPendingTrapOpen(getDemoCard(trapCode));
  }

  function handleConfirmOpenTrap() {
    if (!pendingTrapOpen) return;
    if (pendingTrapOpen.needsTarget) {
      setAwaitingTrapTarget(true);
      return;
    }
    openTrapCard(pendingTrapOpen.code);
    closeTrapOpenFlow();
  }

  function handleConfirmTrapTarget() {
    if (!pendingTrapOpen || !chosenTrapTarget) return;
    openTrapCard(pendingTrapOpen.code, chosenTrapTarget);
    closeTrapOpenFlow();
  }

  const counterCards = pendingResponse
    ? me.hand.filter((c) => demoCardsOfType('counter').some((counter) => counter.code === c))
    : [];

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col overflow-hidden">
      <div className="shrink-0 p-3" style={{ flexBasis: '15%' }}>
        <GameHeader hostName={state.players[state.hostId].name} code={code} />
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3" style={{ flexBasis: '45%' }}>
        <div className="flex flex-wrap justify-center gap-3">
          {opponentIds.map((id) => (
            <PlayerCard
              key={id}
              player={state.players[id]}
              isCurrentTurn={state.turnOrder[state.currentTurnIndex] === id}
            />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center gap-6">
          <Deck count={state.drawPile.length} />
          <DiscardPile count={state.discardPile.length} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-ink/10 p-3" style={{ flexBasis: '40%' }}>
        <PlayerCard player={me} isCurrentTurn={isMyTurn} />
        {me.traps.length > 0 && (
          <div className="flex gap-2">
            {me.traps.map((trapCode, i) => (
              <button
                key={`${trapCode}-${i}`}
                onClick={() => handleOpenTrapTap(trapCode)}
                className="min-h-[36px] rounded-card border border-trap px-2 text-xs font-semibold text-trap"
              >
                เปิดกับดัก
              </button>
            ))}
          </div>
        )}
        <CardHand hand={me.hand} selectedCode={pendingCard?.code ?? null} onSelect={handleSelectCard} />
        <BottomActionBar isMyTurn={isMyTurn} onDraw={drawCard} canDeclare={canDeclare} onDeclare={declareMuffinTime} />
      </div>

      {pendingCard?.type === 'action' && (
        <ActionModal card={awaitingTarget ? null : pendingCard} onConfirm={handleConfirmCard} onCancel={closeHandFlow} />
      )}
      {pendingCard?.type === 'trap' && (
        <TrapModal card={pendingCard} mode="place" onConfirm={handleConfirmCard} onCancel={closeHandFlow} />
      )}
      <TargetSelector
        open={awaitingTarget}
        candidates={opponentIds.map((id) => ({ id, player: state.players[id] }))}
        selectedId={chosenTarget}
        onSelect={setChosenTarget}
        onConfirm={handleConfirmTarget}
        onCancel={closeHandFlow}
        prompt={pendingCard ? pendingCard.effect : ''}
      />

      <TrapModal
        card={awaitingTrapTarget ? null : pendingTrapOpen}
        mode="open"
        onConfirm={handleConfirmOpenTrap}
        onCancel={closeTrapOpenFlow}
      />
      <TargetSelector
        open={awaitingTrapTarget}
        candidates={Object.keys(state.players)
          .filter((id) => id !== myPlayerId)
          .map((id) => ({ id, player: state.players[id] }))}
        selectedId={chosenTrapTarget}
        onSelect={setChosenTrapTarget}
        onConfirm={handleConfirmTrapTarget}
        onCancel={closeTrapOpenFlow}
        prompt={pendingTrapOpen ? pendingTrapOpen.effect : ''}
      />

      <CounterModal
        open={pendingResponse !== null && counterCards.length > 0}
        counterCards={counterCards}
        onPlay={playCounter}
        onSkip={skipCounter}
      />
      <TrapResultModal
        result={lastResult}
        ownerName={lastResult ? state.players[lastResult.actorId]?.name ?? '' : ''}
        targetName={lastResult?.targetId ? state.players[lastResult.targetId]?.name : undefined}
        onClose={clearLastResult}
      />
      <CounterResultModal
        result={lastResult}
        counterActorName={lastResult?.counteredBy ? state.players[lastResult.counteredBy]?.name ?? '' : ''}
        onClose={clearLastResult}
      />
    </main>
  );
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, start a game with the default probability (~40% chance per bot turn) and let a few bot turns pass
Expected: eventually a bot plays an Action targeting you — since your starting hand may or may not include a Counter card, either the effect applies immediately after a brief pause (no counter in hand) or a "เล่น Counter ไหม?" bottom sheet appears letting you pick a Counter card or skip. Play a Counter card and confirm you see "โดน COUNTER!" with the counter card's name, then the counter's own bonus (e.g. +3/+1 draw) reflected in your hand count. Separately: place a Trap from your hand (Task 13), then tap "เปิดกับดัก" on it from the trap zone — confirm the TrapModal now says "เปิดกับดักนี้", pick a target if required, and see the "TRAP!" result modal with the correct owner/target names before the effect (steal/discard) is visible in the hand counts.

- [ ] **Step 8: Commit**

```bash
git add lib/session.tsx components/modals/TrapModal.tsx components/modals/CounterModal.tsx components/modals/TrapResultModal.tsx components/modals/CounterResultModal.tsx components/room/GameTable.tsx
git commit -m "feat: add Counter response window, trap/counter results, and trap opening"
```

---

### Task 15: Game Over screen

**Files:**
- Modify: `lib/session.tsx` (add a `PLAY_AGAIN` action that resets the room to a fresh lobby with the same players)
- Modify: `components/room/GameResult.tsx` (replace the Task-9 placeholder body)

**Interfaces:**
- Consumes: `checkWinnerAtTurnStart` from `../../game/turn`; `useGameSession()`'s `activeRoom`, `leaveRoom` (Task 5/11); `PrimaryButton`, `SecondaryButton` (Task 4)
- Produces: adds `playAgain: () => void` to `useGameSession()`.

- [ ] **Step 1: Add `PLAY_AGAIN` to `lib/session.tsx`**

Add `{ type: 'PLAY_AGAIN' }` to the `Action` union, and this case to the reducer:

```ts
case 'PLAY_AGAIN': {
  if (!state.activeRoom) return state;
  const room = state.activeRoom.state;
  const resetPlayers = Object.fromEntries(
    Object.entries(room.players).map(([id, p]) => [
      id,
      { ...p, hand: [], traps: [], hasCalledMuffinTime: false, skipNextTurn: false },
    ])
  );
  const resetRoom: RoomState = {
    ...room,
    status: 'lobby',
    turnOrder: [],
    currentTurnIndex: 0,
    direction: 1,
    drawPile: [],
    discardPile: [],
    players: resetPlayers,
  };
  return {
    ...state,
    activeRoom: { ...state.activeRoom, state: resetRoom },
    pendingResponse: null,
    lastResult: null,
  };
}
```

Add `playAgain: () => void;` to `GameSessionValue`, wire `const playAgain = useCallback(() => dispatch({ type: 'PLAY_AGAIN' }), []);` in the provider, and include it in the returned `value` object. Since this flips `status` back to `'lobby'`, `app/room/[code]/page.tsx`'s existing switch (Task 9) automatically re-renders `WaitingRoom` with no navigation needed — the same players are already present, so `WaitingRoom`'s bot-filling effect sees the room already full and the host can press "เริ่มเกม" immediately.

- [ ] **Step 2: Replace `components/room/GameResult.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { checkWinnerAtTurnStart } from '../../game/turn';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

export function GameResult() {
  const router = useRouter();
  const { activeRoom, playAgain, leaveRoom } = useGameSession();

  if (!activeRoom) return null;
  const { state } = activeRoom;
  const winnerId = Object.keys(state.players).find((id) => checkWinnerAtTurnStart(state, id));
  const winnerName = winnerId ? state.players[winnerId].name : '—';

  function handleLeave() {
    leaveRoom();
    router.push('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold text-primary">IT&apos;S MUFFIN TIME!</h1>
      <p className="text-lg font-bold text-ink">{winnerName} ชนะแล้ว!</p>
      <p className="text-sm text-ink-secondary">เริ่มเกมนี้ด้วยไพ่ {state.muffinTimeTarget} ใบพอดี</p>

      <div className="mt-4 flex w-full flex-col gap-2">
        <PrimaryButton onClick={playAgain}>เล่นอีกครั้ง</PrimaryButton>
        <SecondaryButton onClick={handleLeave}>กลับไปหน้า Lobby</SecondaryButton>
        <SecondaryButton onClick={handleLeave}>ออกจากห้อง</SecondaryButton>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, play until either you or a bot reaches exactly `muffinTimeTarget` (10) cards, declare Muffin Time (the button appears in `BottomActionBar` once eligible), then take one more full turn cycle back to that player
Expected: `status` flips to `'ended'` and the Game Over screen shows "IT'S MUFFIN TIME!", the correct winner's name, and three buttons. "เล่นอีกครั้ง" returns you to a fresh Waiting Room with the same players already present; the other two buttons return to the Lobby.

- [ ] **Step 4: Commit**

```bash
git add lib/session.tsx components/room/GameResult.tsx
git commit -m "feat: build Game Over screen and play-again flow"
```

---

### Task 16: Full flow verification

**Files:**
- None (verification only — no code changes expected; if this step finds a bug, fix it in the file it belongs to and note the fix in the report)

**Interfaces:**
- None.

- [ ] **Step 1: Run the full automated check**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: `tsc` clean, all `game/*.test.ts` / `lib/*.test.ts` tests passing (the existing 88 engine/multiplayer tests plus the 19 `demoCards` + 5 `botTurn` tests added in Tasks 2-3 = 112 total), and the Next.js build succeeding.

- [ ] **Step 2: Manual click-through of the whole flow on a mobile viewport**

Run: `npm run dev`, open the app in a browser at a 375px-wide viewport (or an actual phone)

Walk the entire flow once, end to end, confirming each screen matches its section of the design brief and nothing 404s or crashes:

1. Lobby (`/`) → seed rooms visible, "+ สร้างห้อง" works
2. Create Room (`/create`) → pick 3 players, submit
3. Waiting Room (`/room/<code>`) → bots join one at a time, "เริ่มเกม" enables once full, tap it
4. Game Table → deck/discard counts visible, opponents shown, your hand scrolls horizontally with no visible scrollbar
5. Play a no-target Action card → effect applies, turn advances
6. Play a targeted Action card → TargetSelector appears, pick someone, effect applies to them specifically
7. Place a Trap card from hand → trap count on your `PlayerCard` increases
8. Open that trap from the trap zone → TrapModal in "open" mode, target selection if needed, `TrapResultModal` shows
9. Let a bot's turn resolve where it plays an Action against you → if you hold a Counter card, `CounterModal` appears; play one and confirm `CounterResultModal` shows and the counter's own bonus applied; on a separate run, skip and confirm the original effect applied instead
10. Reach exactly 10 cards in hand on your turn → "Muffin Time!" button appears in `BottomActionBar`; declare it, survive one more full round back to your turn with the same count → Game Over screen appears with the correct winner
11. From Game Over, try "เล่นอีกครั้ก" (back to a fresh Waiting Room, same players) and separately "กลับไปหน้า Lobby" (back to `/`)
12. Resize the browser to a desktop width and confirm nothing visibly breaks (not a design target, just "must not break" per the spec's scope)

Note any deviation from the design brief you find; fix it in the relevant task's file rather than leaving it.

- [ ] **Step 3: Final commit (only if Step 2 required fixes)**

```bash
git add -A
git commit -m "fix: address issues found in full flow verification"
```

If Step 2 found no issues, skip this step — there's nothing to commit.

---

## Self-Review Notes

- **Spec coverage:** design tokens + font (Task 1); engine wiring with zero `game/*.ts` changes (all tasks); curated 13-card set with exact primitive mappings (Task 2); bot behavior playing Actions against the human (Task 3, wired in Task 11); Lobby/Create/Join/Waiting Room/Game Table/Game Over screens (Tasks 6-9, 12, 15); Action/Target/Trap/Counter modals and results (Tasks 13-14); Counter response window firing regardless of actor, auto-skipped when the human has no counter card (Task 11); no new dependencies anywhere (native CSS transforms, scroll-snap, pointer events throughout); Vitest coverage for the two new pure-logic modules only, UI verified by click-through (Task 16). Out-of-scope items (full 231-card classification, mini-games, Supabase wiring, artwork, desktop-first layout) are not touched by any task.
- **Placeholder scan:** none found — every task has complete, real code. The only intentional stand-ins are the Task-9 `GameTable`/`GameResult` placeholders, which are explicitly named as such and replaced by Tasks 12 and 15 respectively (not left as TODOs).
- **Type consistency:** `RoomSummary`, `ActiveRoom`, `PendingResponse`, `LastResult` are defined once in `lib/session.tsx` (Tasks 5, 11, 14, 15 respectively) and referenced by identical name/shape in every consuming component; `DemoCard`/`DemoCardType` (Task 2) are used identically across `botTurn.ts`, `Card.tsx`, `CardHand.tsx`, and every modal; the `PrimaryButton` `tone` prop (Task 4, used by Tasks 12-14) is the one addition made after the fact to an earlier task's file, and is called out explicitly in Task 4 with the reasoning.
