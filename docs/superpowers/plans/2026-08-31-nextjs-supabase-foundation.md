# Next.js + Supabase Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js + Supabase foundation (per `docs/superpowers/specs/2026-08-31-nextjs-supabase-foundation-design.md`) and port the existing tested vanilla-JS engine and card-loading code to TypeScript under `game/`, with no behavior changes.

**Architecture:** Next.js (App Router) + React + TypeScript + Tailwind CSS v4, deployed to Vercel. Game state lives in one Supabase Postgres table (`rooms`, single JSONB `state` column + optimistic-concurrency `version` column), synced across clients via Supabase Realtime Postgres Changes. All game logic stays client-authoritative — no Edge Functions.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS v4, `@supabase/supabase-js`, Vitest (existing test runner, unchanged).

## Global Constraints

- Faithful 1:1 port: every ported function keeps its exact name, parameter order, and runtime behavior — only type annotations are added. No logic redesign in this plan.
- Vitest stays the test runner (already a project dependency). No switch to Jest or another runner.
- No Supabase Auth, no accounts. RLS is permissive: any client holding a room `code` can read/write that room's row.
- Game state is one JSONB blob per room (`rooms.state`), matching the shape the ported engine functions already operate on. Do not normalize into further tables.
- Writes to `rooms` use the optimistic-concurrency pattern: `update ... where code = $1 and version = $2`, retry on 0 rows affected.
- UI components, `app/lobby`/`app/game` screens, and `multiplayer/player.ts` (localStorage player identity) are OUT OF SCOPE — deferred to a follow-up spec, per the design doc's own scope section. Do not build them here.
- Thai-only UI applies to any user-facing copy this plan touches (the placeholder homepage text).

---

## File Structure

```
package.json                          # modify: add Next.js scripts + deps
tsconfig.json                         # create
next.config.ts                        # create
postcss.config.mjs                    # create
vitest.config.ts                      # create
.gitignore                            # modify: add .next/, .env.local
.env.local.example                    # create
app/globals.css                       # create
app/layout.tsx                        # create
app/page.tsx                          # create

game/types.ts                         # create: shared RoomState/PlayerState types
game/util.ts (+ .test.ts)             # port of src/engine/util.js
game/pile.ts (+ .test.ts)             # port of src/engine/pile.js
game/transfer.ts (+ .test.ts)         # port of src/engine/transfer.js
game/trap.ts (+ .test.ts)             # port of src/engine/trap.js
game/turn.ts (+ .test.ts)             # port of src/engine/turn.js
game/turnFlow.ts (+ .test.ts)         # port of src/engine/turnFlow.js
game/room.ts (+ .test.ts)             # port of src/engine/room.js
game/group.ts (+ .test.ts)            # port of src/engine/group.js
game/misc.ts (+ .test.ts)             # port of src/engine/misc.js
game/parseCsv.ts (+ .test.ts)         # port of src/cards/parseCsv.js
game/loadCards.ts (+ .test.ts)        # port of src/cards/loadCards.js

lib/supabase.ts (+ .test.ts)          # create: Supabase client + config guard
supabase/migrations/0001_create_rooms.sql   # create: schema + RLS + realtime

multiplayer/room.ts (+ .test.ts)      # create: read/write rooms with version retry
multiplayer/realtime.ts (+ .test.ts)  # create: subscribe/unsubscribe helpers

CLAUDE.md                             # modify: update stale "pre-implementation" status
```

Each `src/engine/X.js` / `src/cards/X.js` is moved with `git mv` into `game/X.ts` and edited in place (preserves git history / rename detection), rather than copy+delete.

---

### Task 1: Next.js + Tailwind scaffold

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.local.example`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a building Next.js app (`npm run build`), and `vitest.config.ts` that later tasks (Task 14) extend with env stubs.

- [ ] **Step 1: Update `package.json` scripts**

Edit `package.json` (keep `name`, `version`, `private`, `type`, existing `devDependencies.vitest` — npm will refresh it):

```json
{
  "name": "muffin-time",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "sync-cards": "node scripts/sync-cards.js"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Install runtime dependencies**

Run: `npm install next react react-dom @supabase/supabase-js`

- [ ] **Step 3: Install dev dependencies**

Run: `npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss vitest`

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 6: Create `postcss.config.mjs`**

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

- [ ] **Step 7: Create `app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 8: Create `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Muffin Time',
  description: 'เกมการ์ด Muffin Time เล่นผ่านเว็บกับเพื่อน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create `app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <p>Muffin Time — กำลังพัฒนา</p>
    </main>
  );
}
```

- [ ] **Step 10: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 11: Create `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 12: Update `.gitignore`**

```
node_modules/
.next/
.env.local
```

- [ ] **Step 13: Verify the app builds**

Run: `npm run build`
Expected: build succeeds, `next-env.d.ts` is generated in the project root.

- [ ] **Step 14: Verify existing tests still pass**

Run: `npm test`
Expected: all current `src/engine/*.test.js` and `src/cards/*.test.js` tests still PASS unchanged (they haven't been touched yet — this just confirms the new toolchain didn't break anything).

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts .env.local.example app/ .gitignore next-env.d.ts
git commit -m "feat: scaffold Next.js + Tailwind + Supabase client deps"
```

---

### Task 2: Shared game state types

**Files:**
- Create: `game/types.ts`

**Interfaces:**
- Produces: `PlayerId = string`, `CardCode = string`, `Rng = () => number`, `PlayerState`, `RoomState` — used by every task from Task 3 onward.

- [ ] **Step 1: Create `game/types.ts`**

```ts
export type PlayerId = string;
export type CardCode = string;
export type Rng = () => number;

export interface PlayerState {
  name: string;
  hand: CardCode[];
  traps: CardCode[];
  connected: boolean;
  hasCalledMuffinTime: boolean;
  skipNextTurn: boolean;
}

export interface RoomState {
  status: 'lobby' | 'playing' | 'ended';
  hostId: PlayerId;
  turnOrder: PlayerId[];
  currentTurnIndex: number;
  direction: 1 | -1;
  muffinTimeTarget: number;
  drawPile: CardCode[];
  discardPile: CardCode[];
  players: Record<PlayerId, PlayerState>;
}
```

`RoomState` intentionally does NOT include a `log` field: the original design doc's Firebase tree sketch mentions one, but no engine function reads or writes it today. Add it when a real producer exists (follow-up spec).

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors (this file has no logic to unit-test — it's pure type declarations, verified by every later task importing it).

- [ ] **Step 3: Commit**

```bash
git add game/types.ts
git commit -m "feat: add shared RoomState/PlayerState types for the engine port"
```

---

### Task 3: Port `util.js` → `game/util.ts`

**Files:**
- Create (via `git mv`): `game/util.ts`, `game/util.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `cloneState<T>(state: T): T`, `shuffle<T>(array: T[], rng?: Rng): T[]`, `pickRandomIndices(length: number, n: number, rng?: Rng): number[]` — used by Tasks 4-9.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/util.js game/util.ts
git mv src/engine/util.test.js game/util.test.ts
```

- [ ] **Step 2: Edit `game/util.ts` to add types**

```ts
import type { Rng } from './types';

export function cloneState<T>(state: T): T {
  return JSON.parse(JSON.stringify(state));
}

export function shuffle<T>(array: T[], rng: Rng = Math.random): T[] {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandomIndices(length: number, n: number, rng: Rng = Math.random): number[] {
  const indices = shuffle(
    Array.from({ length }, (_, i) => i),
    rng
  );
  return indices.slice(0, Math.min(n, length));
}
```

- [ ] **Step 3: Update `game/util.test.ts` import**

Change `from './util.js'` to `from './util'` (only the extension changes — assertions stay identical):

```ts
import { describe, it, expect } from 'vitest';
import { cloneState, shuffle, pickRandomIndices } from './util';

describe('cloneState', () => {
  it('returns a deep copy that does not share references', () => {
    const state = { players: { p1: { hand: ['A01'] } } };
    const clone = cloneState(state);
    clone.players.p1.hand.push('A02');
    expect(state.players.p1.hand).toEqual(['A01']);
  });
});

describe('shuffle', () => {
  it('is deterministic given a fixed rng and does not mutate the input', () => {
    const input = [1, 2, 3, 4];
    const result = shuffle(input, () => 0);
    expect(result).toEqual([2, 3, 4, 1]);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it('uses an inclusive upper bound so every position can stay in place', () => {
    const result = shuffle([1, 2, 3, 4], () => 0.999999);
    expect(result).toEqual([1, 2, 3, 4]);
  });
});

describe('pickRandomIndices', () => {
  it('returns n distinct indices in [0, length) using the given rng', () => {
    const result = pickRandomIndices(4, 2, () => 0);
    expect(result).toEqual([1, 2]);
  });

  it('caps at length when n exceeds length', () => {
    const result = pickRandomIndices(2, 5, () => 0);
    expect(result.sort()).toEqual([0, 1]);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/util.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add game/util.ts game/util.test.ts
git commit -m "refactor: port util.js to TypeScript"
```

---

### Task 4: Port `pile.js` → `game/pile.ts`

**Files:**
- Create (via `git mv`): `game/pile.ts`, `game/pile.test.ts`

**Interfaces:**
- Consumes: `cloneState`, `shuffle`, `pickRandomIndices` from `./util`; `RoomState`, `PlayerId`, `CardCode`, `Rng` from `./types`
- Produces: `reshuffleDiscardIntoDraw(state, rng?)`, `draw(state, playerId, n, rng?)`, `drawFromBottom(state, playerId, n)`, `discard(state, playerId, n, cardCodes?, rng?)` — all `(state: RoomState, ...) => RoomState`. Used by Tasks 8, 9.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/pile.js game/pile.ts
git mv src/engine/pile.test.js game/pile.test.ts
```

- [ ] **Step 2: Edit `game/pile.ts` to add types**

```ts
import { cloneState, shuffle, pickRandomIndices } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function reshuffleDiscardIntoDraw(state: RoomState, rng: Rng = Math.random): RoomState {
  const next = cloneState(state);
  if (next.discardPile.length <= 1) return next;
  const top = next.discardPile[next.discardPile.length - 1];
  const rest = next.discardPile.slice(0, -1);
  next.drawPile = [...next.drawPile, ...shuffle(rest, rng)];
  next.discardPile = [top];
  return next;
}

export function draw(state: RoomState, playerId: PlayerId, n: number, rng: Rng = Math.random): RoomState {
  let next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) {
      next = reshuffleDiscardIntoDraw(next, rng);
      if (next.drawPile.length === 0) break;
    }
    const card = next.drawPile.pop()!;
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function drawFromBottom(state: RoomState, playerId: PlayerId, n: number): RoomState {
  const next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.shift()!;
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function discard(
  state: RoomState,
  playerId: PlayerId,
  n: number,
  cardCodes: CardCode[] | null = null,
  rng: Rng = Math.random
): RoomState {
  if (n <= 0) return cloneState(state);
  const next = cloneState(state);
  const hand = next.players[playerId].hand;
  let toDiscard: CardCode[];
  if (cardCodes) {
    if (cardCodes.length !== n) {
      throw new Error(`discard: cardCodes length (${cardCodes.length}) does not match n (${n})`);
    }
    toDiscard = cardCodes;
  } else {
    const indices = pickRandomIndices(hand.length, Math.min(n, hand.length), rng);
    toDiscard = indices.map((i) => hand[i]);
  }
  for (const code of toDiscard) {
    const pos = hand.indexOf(code);
    if (pos === -1) {
      throw new Error(`discard: card ${code} not found in hand`);
    }
    hand.splice(pos, 1);
    next.discardPile.push(code);
  }
  return next;
}
```

The `!` after `.pop()`/`.shift()` doesn't change behavior — it only tells TypeScript what the surrounding `length === 0` checks already guarantee at runtime (identical to the original JS, which had no such check either).

- [ ] **Step 3: Update `game/pile.test.ts` import and add `RoomState` casts on partial fixtures**

The original test fixtures are partial state objects (only the fields each test needs). Cast them with `as unknown as RoomState` so TypeScript accepts the deliberately-partial shape without changing any assertions:

```ts
import { describe, it, expect } from 'vitest';
import { draw, drawFromBottom, discard, reshuffleDiscardIntoDraw } from './pile';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    drawPile: ['A01', 'A02', 'A03'],
    discardPile: ['A10'],
    players: { p1: { hand: [] } },
  } as unknown as RoomState;
}

describe('draw', () => {
  it('moves n cards from the top of the draw pile into the hand', () => {
    const next = draw(baseState(), 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A03', 'A02']);
    expect(next.drawPile).toEqual(['A01']);
  });

  it('reshuffles the discard pile into the draw pile when it runs out', () => {
    const state = {
      drawPile: ['A01'],
      discardPile: ['A10', 'A11', 'A12'],
      players: { p1: { hand: [] } },
    } as unknown as RoomState;
    const next = draw(state, 'p1', 3, () => 0);
    expect(next.players.p1.hand.length).toBe(3);
    expect(next.discardPile).toEqual(['A12']);
  });

  it('stops drawing early if both piles are exhausted', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: [] } } } as unknown as RoomState;
    const next = draw(state, 'p1', 3);
    expect(next.players.p1.hand).toEqual([]);
  });
});

describe('drawFromBottom', () => {
  it('moves n cards from the start of the draw pile into the hand', () => {
    const next = drawFromBottom(baseState(), 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A01', 'A02']);
    expect(next.drawPile).toEqual(['A03']);
  });
});

describe('discard', () => {
  it('discards specific chosen cards from the hand', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03'] } },
    } as unknown as RoomState;
    const next = discard(state, 'p1', 2, ['A01', 'A03']);
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.discardPile).toEqual(['A01', 'A03']);
  });

  it('discards n random cards when no cards are specified', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03'] } },
    } as unknown as RoomState;
    const next = discard(state, 'p1', 2, null, () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.discardPile.length).toBe(2);
  });

  it('does nothing when n is negative or zero', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03', 'A04'] } },
    } as unknown as RoomState;
    const next = discard(state, 'p1', -1, null, () => 0);
    expect(next.players.p1.hand).toEqual(['A01', 'A02', 'A03', 'A04']);
  });

  it('throws when cardCodes length does not match n', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03'] } },
    } as unknown as RoomState;
    expect(() => discard(state, 'p1', 3, ['A01'])).toThrow();
  });

  it('throws when a card in cardCodes is not actually in the hand (e.g. a duplicate)', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02'] } } } as unknown as RoomState;
    expect(() => discard(state, 'p1', 2, ['A01', 'A01'])).toThrow();
  });
});

describe('reshuffleDiscardIntoDraw', () => {
  it('keeps the top discard card in place and shuffles the rest into the draw pile', () => {
    const state = { drawPile: [], discardPile: ['A10', 'A11', 'A12'] } as unknown as RoomState;
    const next = reshuffleDiscardIntoDraw(state, () => 0);
    expect(next.discardPile).toEqual(['A12']);
    expect(next.drawPile.sort()).toEqual(['A10', 'A11']);
  });

  it('does nothing when the discard pile has 0 or 1 cards', () => {
    const state = { drawPile: [], discardPile: ['A10'] } as unknown as RoomState;
    const next = reshuffleDiscardIntoDraw(state);
    expect(next).toEqual(state);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/pile.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add game/pile.ts game/pile.test.ts
git commit -m "refactor: port pile.js to TypeScript"
```

---

### Task 5: Port `transfer.js` → `game/transfer.ts`

**Files:**
- Create (via `git mv`): `game/transfer.ts`, `game/transfer.test.ts`

**Interfaces:**
- Consumes: `cloneState`, `pickRandomIndices` from `./util`; `RoomState`, `PlayerId`, `CardCode`, `Rng` from `./types`
- Produces: `stealRandom`, `stealChosen`, `giveCard`, `swapHands` — all `(state: RoomState, ...) => RoomState`.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/transfer.js game/transfer.ts
git mv src/engine/transfer.test.js game/transfer.test.ts
```

- [ ] **Step 2: Edit `game/transfer.ts` to add types**

```ts
import { cloneState, pickRandomIndices } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function stealRandom(
  state: RoomState,
  fromId: PlayerId,
  toId: PlayerId,
  n: number,
  rng: Rng = Math.random
): RoomState {
  if (n <= 0) return cloneState(state);
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const count = Math.min(n, fromHand.length);
  const indices = pickRandomIndices(fromHand.length, count, rng).sort((a, b) => b - a);
  const stolenCards: CardCode[] = [];
  for (const i of indices) {
    stolenCards.push(fromHand.splice(i, 1)[0]);
  }
  next.players[toId].hand.push(...stolenCards);
  return next;
}

export function stealChosen(state: RoomState, fromId: PlayerId, toId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const pos = fromHand.indexOf(cardCode);
  if (pos === -1) return next;
  fromHand.splice(pos, 1);
  next.players[toId].hand.push(cardCode);
  return next;
}

export function giveCard(state: RoomState, fromId: PlayerId, toId: PlayerId, cardCode: CardCode): RoomState {
  return stealChosen(state, fromId, toId, cardCode);
}

export function swapHands(state: RoomState, aId: PlayerId, bId: PlayerId): RoomState {
  const next = cloneState(state);
  const aHand = next.players[aId].hand;
  const bHand = next.players[bId].hand;
  next.players[aId].hand = bHand;
  next.players[bId].hand = aHand;
  return next;
}
```

- [ ] **Step 3: Update `game/transfer.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { stealRandom, stealChosen, giveCard, swapHands } from './transfer';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    players: {
      p1: { hand: ['A01', 'A02', 'A03'] },
      p2: { hand: ['B01'] },
    },
  } as unknown as RoomState;
}

describe('stealRandom', () => {
  it('moves n random cards from one hand to another', () => {
    const next = stealRandom(baseState(), 'p1', 'p2', 2, () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(3);
  });

  it('caps at the number of cards actually available', () => {
    const next = stealRandom(baseState(), 'p2', 'p1', 5, () => 0);
    expect(next.players.p2.hand).toEqual([]);
    expect(next.players.p1.hand.length).toBe(4);
  });

  it('does nothing when n is negative or zero', () => {
    const next = stealRandom(baseState(), 'p1', 'p2', -1, () => 0);
    expect(next.players.p1.hand).toEqual(['A01', 'A02', 'A03']);
    expect(next.players.p2.hand).toEqual(['B01']);
  });
});

describe('stealChosen', () => {
  it('moves a specific card from one hand to another', () => {
    const next = stealChosen(baseState(), 'p1', 'p2', 'A02');
    expect(next.players.p1.hand).toEqual(['A01', 'A03']);
    expect(next.players.p2.hand).toEqual(['B01', 'A02']);
  });

  it('does nothing if the card is not in the source hand', () => {
    const state = baseState();
    const next = stealChosen(state, 'p1', 'p2', 'ZZZ');
    expect(next).toEqual(state);
  });
});

describe('giveCard', () => {
  it('moves the given card from giver to receiver', () => {
    const next = giveCard(baseState(), 'p1', 'p2', 'A01');
    expect(next.players.p1.hand).toEqual(['A02', 'A03']);
    expect(next.players.p2.hand).toEqual(['B01', 'A01']);
  });
});

describe('swapHands', () => {
  it('swaps the entire hands of two players', () => {
    const next = swapHands(baseState(), 'p1', 'p2');
    expect(next.players.p1.hand).toEqual(['B01']);
    expect(next.players.p2.hand).toEqual(['A01', 'A02', 'A03']);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/transfer.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add game/transfer.ts game/transfer.test.ts
git commit -m "refactor: port transfer.js to TypeScript"
```

---

### Task 6: Port `trap.js` → `game/trap.ts`

**Files:**
- Create (via `git mv`): `game/trap.ts`, `game/trap.test.ts`

**Interfaces:**
- Consumes: `cloneState` from `./util`; `RoomState`, `PlayerId`, `CardCode` from `./types`
- Produces: `placeTrap(state, playerId, cardCode)`, `removeTrap(state, playerId, cardCode)` — both `(state: RoomState, ...) => RoomState`.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/trap.js game/trap.ts
git mv src/engine/trap.test.js game/trap.test.ts
```

- [ ] **Step 2: Edit `game/trap.ts` to add types**

```ts
import { cloneState } from './util';
import type { RoomState, PlayerId, CardCode } from './types';

export function placeTrap(state: RoomState, playerId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  if (player.traps.length >= 3) {
    throw new Error('trap limit reached: discard an existing trap first');
  }
  const pos = player.hand.indexOf(cardCode);
  if (pos === -1) {
    throw new Error('card not in hand');
  }
  player.hand.splice(pos, 1);
  player.traps.push(cardCode);
  return next;
}

export function removeTrap(state: RoomState, playerId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  const pos = player.traps.indexOf(cardCode);
  if (pos === -1) {
    throw new Error('trap not found');
  }
  player.traps.splice(pos, 1);
  next.discardPile.push(cardCode);
  return next;
}
```

- [ ] **Step 3: Update `game/trap.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { placeTrap, removeTrap } from './trap';
import type { RoomState } from './types';

describe('placeTrap', () => {
  it('moves a card from hand to face-down traps', () => {
    const state = { players: { p1: { hand: ['A01', 'A02'], traps: [] } } } as unknown as RoomState;
    const next = placeTrap(state, 'p1', 'A01');
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.players.p1.traps).toEqual(['A01']);
  });

  it('throws if the player already has 3 traps', () => {
    const state = { players: { p1: { hand: ['A01'], traps: ['T01', 'T02', 'T03'] } } } as unknown as RoomState;
    expect(() => placeTrap(state, 'p1', 'A01')).toThrow();
  });

  it('throws if the card is not in hand', () => {
    const state = { players: { p1: { hand: [], traps: [] } } } as unknown as RoomState;
    expect(() => placeTrap(state, 'p1', 'A01')).toThrow();
  });
});

describe('removeTrap', () => {
  it('moves a trap card to the discard pile', () => {
    const state = { discardPile: [], players: { p1: { traps: ['T01', 'T02'] } } } as unknown as RoomState;
    const next = removeTrap(state, 'p1', 'T01');
    expect(next.players.p1.traps).toEqual(['T02']);
    expect(next.discardPile).toEqual(['T01']);
  });

  it('throws if the trap is not found', () => {
    const state = { discardPile: [], players: { p1: { traps: [] } } } as unknown as RoomState;
    expect(() => removeTrap(state, 'p1', 'T01')).toThrow();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/trap.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add game/trap.ts game/trap.test.ts
git commit -m "refactor: port trap.js to TypeScript"
```

---

### Task 7: Port `turn.js` → `game/turn.ts`

**Files:**
- Create (via `git mv`): `game/turn.ts`, `game/turn.test.ts`

**Interfaces:**
- Consumes: `cloneState` from `./util`; `RoomState`, `PlayerId` from `./types`
- Produces: `advanceTurn(state)`, `isMuffinTimeEligible(state, playerId)`, `declareMuffinTime(state, playerId)`, `checkWinnerAtTurnStart(state, playerId)`, `clearMuffinTimeDeclaration(state, playerId)`.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/turn.js game/turn.ts
git mv src/engine/turn.test.js game/turn.test.ts
```

- [ ] **Step 2: Edit `game/turn.ts` to add types**

```ts
import { cloneState } from './util';
import type { RoomState, PlayerId } from './types';

export function advanceTurn(state: RoomState): RoomState {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  let index = next.currentTurnIndex;
  let attempts = 0;
  // attempts <= count is a defensive backstop; in practice the loop always exits via the
  // inner `break` once it revisits a player whose flag it already cleared this call.
  do {
    index = (((index + next.direction) % count) + count) % count;
    attempts++;
    const playerId = order[index];
    if (next.players[playerId].skipNextTurn) {
      next.players[playerId].skipNextTurn = false;
      continue;
    }
    break;
  } while (attempts <= count);
  next.currentTurnIndex = index;
  return next;
}

export function isMuffinTimeEligible(state: RoomState, playerId: PlayerId): boolean {
  return state.players[playerId].hand.length === state.muffinTimeTarget;
}

export function declareMuffinTime(state: RoomState, playerId: PlayerId): RoomState {
  if (!isMuffinTimeEligible(state, playerId)) {
    throw new Error('player does not have the target hand count');
  }
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = true;
  return next;
}

export function checkWinnerAtTurnStart(state: RoomState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return player.hasCalledMuffinTime && player.hand.length === state.muffinTimeTarget;
}

export function clearMuffinTimeDeclaration(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = false;
  return next;
}
```

- [ ] **Step 3: Update `game/turn.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  advanceTurn,
  isMuffinTimeEligible,
  declareMuffinTime,
  checkWinnerAtTurnStart,
  clearMuffinTimeDeclaration,
} from './turn';
import type { RoomState } from './types';

describe('advanceTurn', () => {
  it('moves to the next player in turn order', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(1);
  });

  it('wraps around at the end of turn order', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 2,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(0);
  });

  it('moves backward when direction is -1', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: -1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(2);
  });

  it('skips a player whose skipNextTurn flag is set and clears the flag', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: true }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(2);
    expect(next.players.p2.skipNextTurn).toBe(false);
  });

  it('terminates and clears every flag when all players are skipped', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: true }, p2: { skipNextTurn: true }, p3: { skipNextTurn: true } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(1);
    expect(next.players.p1.skipNextTurn).toBe(false);
    expect(next.players.p2.skipNextTurn).toBe(false);
    expect(next.players.p3.skipNextTurn).toBe(false);
  });
});

describe('isMuffinTimeEligible', () => {
  it('is true when the hand size exactly matches the target', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01') } } } as unknown as RoomState;
    expect(isMuffinTimeEligible(state, 'p1')).toBe(true);
  });

  it('is false otherwise', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(9).fill('A01') } } } as unknown as RoomState;
    expect(isMuffinTimeEligible(state, 'p1')).toBe(false);
  });
});

describe('declareMuffinTime', () => {
  it('sets hasCalledMuffinTime when eligible', () => {
    const state = {
      muffinTimeTarget: 10,
      players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: false } },
    } as unknown as RoomState;
    const next = declareMuffinTime(state, 'p1');
    expect(next.players.p1.hasCalledMuffinTime).toBe(true);
  });

  it('throws when not eligible', () => {
    const state = {
      muffinTimeTarget: 10,
      players: { p1: { hand: [], hasCalledMuffinTime: false } },
    } as unknown as RoomState;
    expect(() => declareMuffinTime(state, 'p1')).toThrow();
  });
});

describe('checkWinnerAtTurnStart', () => {
  it('is true when the player declared previously and still has the target count', () => {
    const state = {
      muffinTimeTarget: 10,
      players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: true } },
    } as unknown as RoomState;
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(true);
  });

  it('is false if the player never declared', () => {
    const state = {
      muffinTimeTarget: 10,
      players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: false } },
    } as unknown as RoomState;
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(false);
  });

  it('is false if the hand count changed since declaring', () => {
    const state = {
      muffinTimeTarget: 10,
      players: { p1: { hand: Array(9).fill('A01'), hasCalledMuffinTime: true } },
    } as unknown as RoomState;
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(false);
  });
});

describe('clearMuffinTimeDeclaration', () => {
  it('resets hasCalledMuffinTime to false', () => {
    const state = { players: { p1: { hasCalledMuffinTime: true } } } as unknown as RoomState;
    const next = clearMuffinTimeDeclaration(state, 'p1');
    expect(next.players.p1.hasCalledMuffinTime).toBe(false);
  });

  it('does not mutate the original state', () => {
    const state = { players: { p1: { hasCalledMuffinTime: true } } } as unknown as RoomState;
    clearMuffinTimeDeclaration(state, 'p1');
    expect(state.players.p1.hasCalledMuffinTime).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/turn.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add game/turn.ts game/turn.test.ts
git commit -m "refactor: port turn.js to TypeScript"
```

---

### Task 8: Port `turnFlow.js` → `game/turnFlow.ts`

**Files:**
- Create (via `git mv`): `game/turnFlow.ts`, `game/turnFlow.test.ts`

**Interfaces:**
- Consumes: `cloneState` from `./util`; `RoomState`, `PlayerId` from `./types`
- Produces: `skipTurn(state, playerId)`, `reverseDirection(state)`, `changeMuffinTarget(state, n)`.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/turnFlow.js game/turnFlow.ts
git mv src/engine/turnFlow.test.js game/turnFlow.test.ts
```

- [ ] **Step 2: Edit `game/turnFlow.ts` to add types**

```ts
import { cloneState } from './util';
import type { RoomState, PlayerId } from './types';

export function skipTurn(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  next.players[playerId].skipNextTurn = true;
  return next;
}

export function reverseDirection(state: RoomState): RoomState {
  const next = cloneState(state);
  next.direction = (next.direction * -1) as 1 | -1;
  return next;
}

export function changeMuffinTarget(state: RoomState, n: number): RoomState {
  const next = cloneState(state);
  next.muffinTimeTarget = n;
  return next;
}
```

`next.direction * -1` is typed `number` by TypeScript even though `direction` is `1 | -1`, so the `as 1 | -1` cast is needed — it's always true at runtime since the only two possible inputs are `1` and `-1`.

- [ ] **Step 3: Update `game/turnFlow.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { skipTurn, reverseDirection, changeMuffinTarget } from './turnFlow';
import type { RoomState } from './types';

describe('skipTurn', () => {
  it('marks the player to skip their next turn', () => {
    const state = { players: { p1: { skipNextTurn: false } } } as unknown as RoomState;
    const next = skipTurn(state, 'p1');
    expect(next.players.p1.skipNextTurn).toBe(true);
  });
});

describe('reverseDirection', () => {
  it('flips the play direction', () => {
    expect(reverseDirection({ direction: 1 } as unknown as RoomState).direction).toBe(-1);
    expect(reverseDirection({ direction: -1 } as unknown as RoomState).direction).toBe(1);
  });
});

describe('changeMuffinTarget', () => {
  it('sets a new muffin time target hand size', () => {
    const next = changeMuffinTarget({ muffinTimeTarget: 10 } as unknown as RoomState, 7);
    expect(next.muffinTimeTarget).toBe(7);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/turnFlow.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add game/turnFlow.ts game/turnFlow.test.ts
git commit -m "refactor: port turnFlow.js to TypeScript"
```

---

### Task 9: Port `room.js` → `game/room.ts`

**Files:**
- Create (via `git mv`): `game/room.ts`, `game/room.test.ts`

**Interfaces:**
- Consumes: `cloneState`, `shuffle` from `./util`; `RoomState`, `PlayerId`, `CardCode`, `Rng` from `./types`
- Produces: `createRoom(hostId, hostName): RoomState`, `addPlayer(state, playerId, name): RoomState`, `startGame(state, allCardCodes, rng?): RoomState`.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/room.js game/room.ts
git mv src/engine/room.test.js game/room.test.ts
```

- [ ] **Step 2: Edit `game/room.ts` to add types**

```ts
import { cloneState, shuffle } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function createRoom(hostId: PlayerId, hostName: string): RoomState {
  return {
    status: 'lobby',
    hostId,
    turnOrder: [],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      [hostId]: {
        name: hostName,
        hand: [],
        traps: [],
        connected: true,
        hasCalledMuffinTime: false,
        skipNextTurn: false,
      },
    },
  };
}

export function addPlayer(state: RoomState, playerId: PlayerId, name: string): RoomState {
  if (state.status !== 'lobby') {
    throw new Error('cannot join a room that has already started');
  }
  if (Object.keys(state.players).length >= 8) {
    throw new Error('room is full');
  }
  if (state.players[playerId]) {
    throw new Error('player already in room');
  }
  const next = cloneState(state);
  next.players[playerId] = {
    name,
    hand: [],
    traps: [],
    connected: true,
    hasCalledMuffinTime: false,
    skipNextTurn: false,
  };
  return next;
}

export function startGame(state: RoomState, allCardCodes: CardCode[], rng: Rng = Math.random): RoomState {
  if (state.status !== 'lobby') {
    throw new Error('game already started');
  }
  const playerIds = Object.keys(state.players);
  if (playerIds.length < 3) {
    throw new Error('need at least 3 players to start');
  }
  const next = cloneState(state);
  next.turnOrder = shuffle(playerIds, rng);
  next.drawPile = shuffle(allCardCodes, rng);
  for (const playerId of next.turnOrder) {
    for (let i = 0; i < 3; i++) {
      next.players[playerId].hand.push(next.drawPile.pop()!);
    }
  }
  next.status = 'playing';
  next.currentTurnIndex = 0;
  return next;
}
```

- [ ] **Step 3: Update `game/room.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';

describe('createRoom', () => {
  it('creates a lobby room with the host as the first player', () => {
    const room = createRoom('host1', 'Ploy');
    expect(room.status).toBe('lobby');
    expect(room.hostId).toBe('host1');
    expect(room.players.host1).toEqual({
      name: 'Ploy',
      hand: [],
      traps: [],
      connected: true,
      hasCalledMuffinTime: false,
      skipNextTurn: false,
    });
  });
});

describe('addPlayer', () => {
  it('adds a new player to a lobby room', () => {
    const room = createRoom('host1', 'Ploy');
    const next = addPlayer(room, 'p2', 'Nam');
    expect(next.players.p2.name).toBe('Nam');
    expect(Object.keys(next.players).length).toBe(2);
  });

  it('throws if the room already started', () => {
    const room = { ...createRoom('host1', 'Ploy'), status: 'playing' as const };
    expect(() => addPlayer(room, 'p2', 'Nam')).toThrow();
  });

  it('throws if the room already has 8 players', () => {
    let room = createRoom('host1', 'P1');
    for (let i = 2; i <= 8; i++) {
      room = addPlayer(room, `p${i}`, `P${i}`);
    }
    expect(() => addPlayer(room, 'p9', 'P9')).toThrow();
  });

  it('throws if the player id is already in the room', () => {
    const room = createRoom('host1', 'Ploy');
    expect(() => addPlayer(room, 'host1', 'Someone Else')).toThrow();
  });
});

describe('startGame', () => {
  it('deals 3 cards to each player and moves the room to playing', () => {
    let room = createRoom('host1', 'P1');
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.status).toBe('playing');
    expect(next.turnOrder.length).toBe(3);
    expect(next.players.host1.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3);
    expect(next.drawPile.length).toBe(20 - 9);
  });

  it('throws if fewer than 3 players are in the room', () => {
    let room = createRoom('host1', 'P1');
    room = addPlayer(room, 'p2', 'P2');
    expect(() => startGame(room, ['A1'])).toThrow();
  });

  it('throws if the room has already started', () => {
    let room = createRoom('host1', 'P1');
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const started = startGame(room, allCodes, () => 0);
    expect(() => startGame(started, allCodes, () => 0)).toThrow();
  });
});
```

Note the one real change from the original: `{ ...createRoom('host1', 'Ploy'), status: 'playing' as const }` — the `as const` is needed so TypeScript narrows the literal to `'playing'` instead of widening it to `string` (which wouldn't satisfy `RoomState['status']`). This changes zero runtime behavior.

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/room.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add game/room.ts game/room.test.ts
git commit -m "refactor: port room.js to TypeScript"
```

---

### Task 10: Port `group.js` → `game/group.ts`

**Files:**
- Create (via `git mv`): `game/group.ts`, `game/group.test.ts`

**Interfaces:**
- Consumes: `cloneState` from `./util`; `draw`, `discard` from `./pile`; `RoomState`, `PlayerId`, `Rng` from `./types`
- Produces: `everyoneDraws(state, n, excludeIds?, rng?)`, `everyoneDiscards(state, n, excludeIds?, rng?)`, `passHands(state, steps)`.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/group.js game/group.ts
git mv src/engine/group.test.js game/group.test.ts
```

- [ ] **Step 2: Edit `game/group.ts` to add types**

```ts
import { cloneState } from './util';
import { draw, discard } from './pile';
import type { RoomState, PlayerId, Rng } from './types';

export function everyoneDraws(
  state: RoomState,
  n: number,
  excludeIds: PlayerId[] = [],
  rng: Rng = Math.random
): RoomState {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = draw(next, playerId, n, rng);
  }
  return next;
}

export function everyoneDiscards(
  state: RoomState,
  n: number,
  excludeIds: PlayerId[] = [],
  rng: Rng = Math.random
): RoomState {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = discard(next, playerId, n, null, rng);
  }
  return next;
}

export function passHands(state: RoomState, steps: number): RoomState {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  const hands = order.map((id) => next.players[id].hand);
  for (let i = 0; i < count; i++) {
    const targetIndex = ((i + steps) % count + count) % count;
    next.players[order[targetIndex]].hand = hands[i];
  }
  return next;
}
```

- [ ] **Step 3: Update `game/group.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { everyoneDraws, everyoneDiscards, passHands } from './group';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    turnOrder: ['p1', 'p2', 'p3'],
    drawPile: ['A01', 'A02', 'A03', 'A04', 'A05', 'A06'],
    discardPile: [],
    players: {
      p1: { hand: [] },
      p2: { hand: [] },
      p3: { hand: [] },
    },
  } as unknown as RoomState;
}

describe('everyoneDraws', () => {
  it('every player draws n cards', () => {
    const next = everyoneDraws(baseState(), 2);
    expect(next.players.p1.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('skips excluded player ids', () => {
    const next = everyoneDraws(baseState(), 2, ['p2']);
    expect(next.players.p1.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(2);
  });
});

describe('everyoneDiscards', () => {
  it('every player discards up to n cards', () => {
    const state = baseState();
    state.players.p1.hand = ['A01', 'A02'];
    state.players.p2.hand = ['A03'];
    state.players.p3.hand = ['A04', 'A05'];
    const next = everyoneDiscards(state, 1, [], () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(1);
  });
});

describe('passHands', () => {
  it('rotates every hand forward by one seat when steps is +1', () => {
    const state = baseState();
    state.players.p1.hand = ['A01'];
    state.players.p2.hand = ['A02'];
    state.players.p3.hand = ['A03'];
    const next = passHands(state, 1);
    expect(next.players.p2.hand).toEqual(['A01']);
    expect(next.players.p3.hand).toEqual(['A02']);
    expect(next.players.p1.hand).toEqual(['A03']);
  });

  it('rotates every hand backward by one seat when steps is -1', () => {
    const state = baseState();
    state.players.p1.hand = ['A01'];
    state.players.p2.hand = ['A02'];
    state.players.p3.hand = ['A03'];
    const next = passHands(state, -1);
    expect(next.players.p3.hand).toEqual(['A01']);
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.players.p2.hand).toEqual(['A03']);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/group.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add game/group.ts game/group.test.ts
git commit -m "refactor: port group.js to TypeScript"
```

---

### Task 11: Port `misc.js` → `game/misc.ts`

**Files:**
- Create (via `git mv`): `game/misc.ts`, `game/misc.test.ts`

**Interfaces:**
- Consumes: `cloneState` from `./util`; `draw`, `discard` from `./pile`; `RoomState`, `PlayerId`, `CardCode`, `Rng` from `./types`
- Produces: `removeCardFromDiscard(state, cardCode)`, `returnCardToHand(state, cardCode, toPlayerId)`, `drawUntilCount(state, playerId, targetCount, rng?)`.

- [ ] **Step 1: Move the files**

```bash
git mv src/engine/misc.js game/misc.ts
git mv src/engine/misc.test.js game/misc.test.ts
```

- [ ] **Step 2: Edit `game/misc.ts` to add types**

```ts
import { cloneState } from './util';
import { draw, discard } from './pile';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function removeCardFromDiscard(state: RoomState, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos !== -1) next.discardPile.splice(pos, 1);
  return next;
}

export function returnCardToHand(state: RoomState, cardCode: CardCode, toPlayerId: PlayerId): RoomState {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos === -1) return next;
  next.discardPile.splice(pos, 1);
  next.players[toPlayerId].hand.push(cardCode);
  return next;
}

export function drawUntilCount(
  state: RoomState,
  playerId: PlayerId,
  targetCount: number,
  rng: Rng = Math.random
): RoomState {
  const hand = state.players[playerId].hand;
  if (hand.length < targetCount) {
    return draw(state, playerId, targetCount - hand.length, rng);
  }
  if (hand.length > targetCount) {
    return discard(state, playerId, hand.length - targetCount, null, rng);
  }
  return cloneState(state);
}
```

- [ ] **Step 3: Update `game/misc.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { removeCardFromDiscard, returnCardToHand, drawUntilCount } from './misc';
import type { RoomState } from './types';

describe('removeCardFromDiscard', () => {
  it('permanently removes a card from the discard pile', () => {
    const state = { discardPile: ['A01', 'A02'] } as unknown as RoomState;
    const next = removeCardFromDiscard(state, 'A01');
    expect(next.discardPile).toEqual(['A02']);
  });
});

describe('returnCardToHand', () => {
  it('moves a card from the discard pile back into a hand', () => {
    const state = { discardPile: ['A01', 'A02'], players: { p1: { hand: [] } } } as unknown as RoomState;
    const next = returnCardToHand(state, 'A02', 'p1');
    expect(next.discardPile).toEqual(['A01']);
    expect(next.players.p1.hand).toEqual(['A02']);
  });
});

describe('drawUntilCount', () => {
  it('draws up to the target count when the hand is smaller', () => {
    const state = {
      drawPile: ['A01', 'A02'],
      discardPile: [],
      players: { p1: { hand: ['A03'] } },
    } as unknown as RoomState;
    const next = drawUntilCount(state, 'p1', 3);
    expect(next.players.p1.hand.length).toBe(3);
  });

  it('discards down to the target count when the hand is larger', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03', 'A04'] } },
    } as unknown as RoomState;
    const next = drawUntilCount(state, 'p1', 2, () => 0);
    expect(next.players.p1.hand.length).toBe(2);
  });

  it('does nothing when the hand already matches the target', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02'] } } } as unknown as RoomState;
    const next = drawUntilCount(state, 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A01', 'A02']);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/misc.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add game/misc.ts game/misc.test.ts
git commit -m "refactor: port misc.js to TypeScript"
```

---

### Task 12: Port `parseCsv.js` → `game/parseCsv.ts`

**Files:**
- Create (via `git mv`): `game/parseCsv.ts`, `game/parseCsv.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `parseCsv(text: string): string[][]` — used by Task 13.

- [ ] **Step 1: Move the files**

```bash
git mv src/cards/parseCsv.js game/parseCsv.ts
git mv src/cards/parseCsv.test.js game/parseCsv.test.ts
```

- [ ] **Step 2: Edit `game/parseCsv.ts` to add types**

```ts
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignore; '\n' handles row breaks
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
```

- [ ] **Step 3: Update `game/parseCsv.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseCsv } from './parseCsv';

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    const text = 'a,b,c\n1,2,3\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    const text = 'name,note\n"Hey, Are You An Angel?",steal a card\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Hey, Are You An Angel?', 'steal a card'],
    ]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const text = 'name,note\n"Big Bee","has ""b"" in name"\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Big Bee', 'has "b" in name'],
    ]);
  });

  it('ignores trailing blank lines', () => {
    const text = 'a,b\n1,2\n\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/parseCsv.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add game/parseCsv.ts game/parseCsv.test.ts
git commit -m "refactor: port parseCsv.js to TypeScript"
```

---

### Task 13: Port `loadCards.js` → `game/loadCards.ts`

**Files:**
- Create (via `git mv`): `game/loadCards.ts`, `game/loadCards.test.ts`

**Interfaces:**
- Consumes: `parseCsv` from `./parseCsv`
- Produces: `Card` type, `LoadCardsOptions`, `LoadCardsResult`, `DEFAULT_SHEET_CSV_URL`, `DEFAULT_FALLBACK_URL`, `loadCards(options?): Promise<LoadCardsResult>`, `indexCardsByCode<T extends { code: string }>(cards: T[]): Map<string, T>`.

- [ ] **Step 1: Move the files**

```bash
git mv src/cards/loadCards.js game/loadCards.ts
git mv src/cards/loadCards.test.js game/loadCards.test.ts
```

- [ ] **Step 2: Edit `game/loadCards.ts` to add types**

```ts
import { parseCsv } from './parseCsv';

export const DEFAULT_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoB5uoPb0NOmZAr7G9t2CVzOgJI26OYMgA4ugyqwtaC5fXSaRu-32W7gPqyIAkgZp1r-04sJTj9FC4/pub?output=csv';
export const DEFAULT_FALLBACK_URL = '/data/cards.json';

const EXPECTED_HEADER = ['type', 'name_en', 'name_th', 'effect_th', 'code'];

export interface Card {
  type: string;
  en: string;
  th: string;
  effect: string;
  code: string;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<FetchLikeResponse>;

export interface LoadCardsOptions {
  sheetUrl?: string;
  fallbackUrl?: string;
  fetchImpl?: FetchLike;
}

export interface LoadCardsResult {
  cards: Card[];
  source: 'sheet' | 'fallback';
}

interface FallbackCardEntry {
  en: string;
  th: string;
  effect: string;
  code: string;
}

interface FallbackJson {
  action?: FallbackCardEntry[];
  counter?: FallbackCardEntry[];
  trap?: FallbackCardEntry[];
}

function rowsToCards(rows: string[][]): Card[] {
  const [header, ...dataRows] = rows;
  if (!header || EXPECTED_HEADER.some((col, i) => header[i] !== col)) {
    throw new Error('unexpected CSV header shape');
  }
  return dataRows
    .filter((row) => row.length >= 5 && row[4])
    .map((row) => ({ type: row[0], en: row[1], th: row[2], effect: row[3], code: row[4] }));
}

function fallbackJsonToCards(json: FallbackJson): Card[] {
  const cards: Card[] = [];
  for (const type of ['action', 'counter', 'trap'] as const) {
    for (const c of json[type] || []) {
      cards.push({ type, en: c.en, th: c.th, effect: c.effect, code: c.code });
    }
  }
  return cards;
}

export async function loadCards({
  sheetUrl = DEFAULT_SHEET_CSV_URL,
  fallbackUrl = DEFAULT_FALLBACK_URL,
  fetchImpl = (url: string) => fetch(url),
}: LoadCardsOptions = {}): Promise<LoadCardsResult> {
  let sheetError: Error | undefined;
  try {
    const res = await fetchImpl(sheetUrl);
    if (!res.ok) throw new Error(`sheet fetch failed with status ${res.status}`);
    const text = await res.text!();
    const cards = rowsToCards(parseCsv(text));
    if (cards.length === 0) throw new Error('sheet returned no cards');
    return { cards, source: 'sheet' };
  } catch (err) {
    sheetError = err as Error;
  }
  try {
    const res = await fetchImpl(fallbackUrl);
    if (!res.ok) throw new Error(`fallback fetch failed with status ${res.status}`);
    const json = (await res.json!()) as FallbackJson;
    return { cards: fallbackJsonToCards(json), source: 'fallback' };
  } catch (fallbackError) {
    throw new Error(
      `failed to load cards from sheet (${sheetError?.message}) and fallback (${(fallbackError as Error).message})`,
      { cause: fallbackError }
    );
  }
}

export function indexCardsByCode<T extends { code: string }>(cards: T[]): Map<string, T> {
  return new Map(cards.map((c) => [c.code, c]));
}
```

- [ ] **Step 3: Update `game/loadCards.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { loadCards, indexCardsByCode, DEFAULT_SHEET_CSV_URL, DEFAULT_FALLBACK_URL } from './loadCards';
import type { FetchLikeResponse, FetchLike } from './loadCards';

const CSV_TEXT = 'type,name_en,name_th,effect_th,code\naction,Alien Invasion,เอเลี่ยนบุก,มอบการ์ดทั้งหมด,A02\n';

function fakeFetch(responses: Array<(url: string) => Promise<FetchLikeResponse>>): FetchLike {
  let call = 0;
  return async (url: string) => {
    const r = responses[call];
    call++;
    return r(url);
  };
}

describe('loadCards', () => {
  it('loads and parses cards from the sheet when the fetch succeeds', async () => {
    const fetchImpl = fakeFetch([
      async () => ({ ok: true, status: 200, text: async () => CSV_TEXT }),
    ]);
    const { cards, source } = await loadCards({ fetchImpl });
    expect(source).toBe('sheet');
    expect(cards).toEqual([
      { type: 'action', en: 'Alien Invasion', th: 'เอเลี่ยนบุก', effect: 'มอบการ์ดทั้งหมด', code: 'A02' },
    ]);
  });

  it('falls back to the bundled JSON when the sheet fetch fails', async () => {
    const fallbackJson = {
      action: [{ en: 'Alien Invasion', th: 'เอเลี่ยนบุก', effect: 'มอบการ์ดทั้งหมด', code: 'A02' }],
      counter: [],
      trap: [],
    };
    const fetchImpl = fakeFetch([
      async () => ({ ok: false, status: 500 }),
      async () => ({ ok: true, status: 200, json: async () => fallbackJson }),
    ]);
    const { cards, source } = await loadCards({ fetchImpl });
    expect(source).toBe('fallback');
    expect(cards).toEqual([
      { type: 'action', en: 'Alien Invasion', th: 'เอเลี่ยนบุก', effect: 'มอบการ์ดทั้งหมด', code: 'A02' },
    ]);
  });

  it('falls back when the sheet CSV header does not match the expected shape', async () => {
    const fallbackJson = { action: [], counter: [], trap: [] };
    const fetchImpl = fakeFetch([
      async () => ({ ok: true, status: 200, text: async () => 'wrong,header\n1,2\n' }),
      async () => ({ ok: true, status: 200, json: async () => fallbackJson }),
    ]);
    const { source } = await loadCards({ fetchImpl });
    expect(source).toBe('fallback');
  });

  it('falls back when the sheet CSV has a valid header but zero data rows', async () => {
    const fallbackJson = {
      action: [{ en: 'Alien Invasion', th: 'เอเลี่ยนบุก', effect: 'มอบการ์ดทั้งหมด', code: 'A02' }],
      counter: [],
      trap: [],
    };
    const fetchImpl = fakeFetch([
      async () => ({ ok: true, status: 200, text: async () => 'type,name_en,name_th,effect_th,code\n' }),
      async () => ({ ok: true, status: 200, json: async () => fallbackJson }),
    ]);
    const { source } = await loadCards({ fetchImpl });
    expect(source).toBe('fallback');
  });

  it('throws an error mentioning both failures when the sheet and the fallback both fail', async () => {
    const makeFetchImpl = () =>
      fakeFetch([
        async () => ({ ok: false, status: 503 }),
        async () => ({ ok: false, status: 404 }),
      ]);
    await expect(loadCards({ fetchImpl: makeFetchImpl() })).rejects.toThrow(/503/);
    await expect(loadCards({ fetchImpl: makeFetchImpl() })).rejects.toThrow(/404/);
  });

  it('uses the real published sheet URL and local fallback URL by default', async () => {
    const seenUrls: string[] = [];
    const fetchImpl: FetchLike = async (url: string) => {
      seenUrls.push(url);
      return { ok: true, status: 200, text: async () => CSV_TEXT };
    };
    await loadCards({ fetchImpl });
    expect(seenUrls).toEqual([DEFAULT_SHEET_CSV_URL]);
    expect(DEFAULT_FALLBACK_URL).toBe('/data/cards.json');
  });

  it('indexCardsByCode builds a lookup map keyed by card code', () => {
    const cards = [{ code: 'A02', en: 'Alien Invasion' }];
    const index = indexCardsByCode(cards);
    expect(index.get('A02')).toEqual({ code: 'A02', en: 'Alien Invasion' });
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run game/loadCards.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Confirm the old `src/` tree is now empty and run the full suite**

Run: `git status --short src/`
Expected: no output (every file under `src/engine/` and `src/cards/` has been moved). Then run the whole suite once to confirm the port didn't break cross-file imports:

Run: `npm test`
Expected: all tests in `game/*.test.ts` PASS, nothing left under `src/`.

- [ ] **Step 6: Commit**

```bash
git add game/loadCards.ts game/loadCards.test.ts
git commit -m "refactor: port loadCards.js to TypeScript"
```

---

### Task 14: Supabase client (`lib/supabase.ts`)

**Files:**
- Create: `lib/supabase.ts`, `lib/supabase.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js`'s `createClient`
- Produces: `getSupabaseConfig(env?): { url: string; anonKey: string }`, `supabase: SupabaseClient` — `supabase` is consumed directly by app code later (follow-up spec); Tasks 15-16 take a `SupabaseClient` as a parameter instead of importing this singleton, so they stay testable without real env vars.

- [ ] **Step 1: Write the failing test**

Create `lib/supabase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSupabaseConfig } from './supabase';

describe('getSupabaseConfig', () => {
  it('returns the url and anon key from the given env', () => {
    const config = getSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(config).toEqual({ url: 'https://example.supabase.co', anonKey: 'anon-key' });
  });

  it('throws when the URL is missing', () => {
    expect(() => getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' })).toThrow(/Missing/);
  });

  it('throws when the anon key is missing', () => {
    expect(() => getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })).toThrow(/Missing/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/supabase.test.ts`
Expected: FAIL (`lib/supabase.ts` does not exist yet)

- [ ] **Step 3: Create `lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseConfig(
  env: Record<string, string | undefined> = process.env
): { url: string; anonKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars');
  }
  return { url, anonKey };
}

const { url, anonKey } = getSupabaseConfig();
export const supabase = createClient(url, anonKey);
```

`supabase` is created eagerly at module load, which means importing this file requires the env vars to be present — including during tests. Step 4 stubs safe dummy values in `vitest.config.ts` so any test file that transitively imports `lib/supabase.ts` doesn't crash on import, while `getSupabaseConfig`'s own tests (above) pass explicit env objects and don't depend on the stub.

- [ ] **Step 4: Add env stubs to `vitest.config.ts`**

Edit `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run lib/supabase.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/supabase.ts lib/supabase.test.ts vitest.config.ts
git commit -m "feat: add Supabase client with env config guard"
```

---

### Task 15: `rooms` table schema and RLS

**Files:**
- Create: `supabase/migrations/0001_create_rooms.sql`

**Interfaces:**
- Produces: the `rooms` table (`code text primary key, state jsonb, version integer, created_at timestamptz`) that Tasks 16-17 read/write.

- [ ] **Step 1: Create `supabase/migrations/0001_create_rooms.sql`**

```sql
create table if not exists rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

-- Permissive by design: no Supabase Auth, no accounts. Anyone holding a room
-- code can read/write that room's row, matching the "trusted friends" trade-off
-- from docs/superpowers/specs/2026-08-31-muffin-time-web-design.md.
create policy "anyone can read rooms"
  on rooms for select
  using (true);

create policy "anyone can insert rooms"
  on rooms for insert
  with check (true);

create policy "anyone can update rooms"
  on rooms for update
  using (true)
  with check (true);

alter publication supabase_realtime add table rooms;
```

- [ ] **Step 2: Verify (if the Supabase CLI is installed locally)**

Run: `supabase start` then `supabase db push` (or run the file directly: `psql "$(supabase status -o json | jq -r .DB_URL)" -f supabase/migrations/0001_create_rooms.sql`)
Expected: table created with no errors.

If the Supabase CLI isn't set up yet, this step can't run locally — instead, once a real Supabase project exists, paste this file's contents into that project's SQL Editor and confirm it runs without error. Either way, this task's code is correct and reviewable independent of having live infrastructure.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_create_rooms.sql
git commit -m "feat: add rooms table schema, RLS policies, and realtime publication"
```

---

### Task 16: `multiplayer/room.ts` — read/write with version retry

**Files:**
- Create: `multiplayer/room.ts`, `multiplayer/room.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` type from `@supabase/supabase-js`; `RoomState` from `../game/types`
- Produces: `RoomRow { code: string; state: RoomState; version: number }`, `fetchRoom(client, code): Promise<RoomRow>`, `writeRoomState(client, code, nextState, expectedVersion): Promise<boolean>`, `updateRoomWithRetry(client, code, updater, maxAttempts?): Promise<RoomState>` — `updateRoomWithRetry` is what the (future, out-of-scope) UI layer calls; it applies a pure `game/*` engine function as `updater`.

- [ ] **Step 1: Write the failing tests**

Create `multiplayer/room.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRoom, writeRoomState, updateRoomWithRetry } from './room';
import type { RoomState } from '../game/types';

function fakeClient({
  selects,
  updates,
}: {
  selects: Array<{ data: { state: RoomState; version: number } | null; error: { message: string } | null }>;
  updates: Array<{ data: Array<{ version: number }> | null; error: { message: string } | null }>;
}): SupabaseClient {
  let selectCall = 0;
  let updateCall = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => selects[selectCall++],
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: async () => updates[updateCall++],
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const baseState = { status: 'lobby' } as unknown as RoomState;

describe('fetchRoom', () => {
  it('returns the row on success', async () => {
    const client = fakeClient({
      selects: [{ data: { state: baseState, version: 3 }, error: null }],
      updates: [],
    });
    const row = await fetchRoom(client, 'ABCD');
    expect(row).toEqual({ state: baseState, version: 3 });
  });

  it('throws when the query errors', async () => {
    const client = fakeClient({
      selects: [{ data: null, error: { message: 'not found' } }],
      updates: [],
    });
    await expect(fetchRoom(client, 'ABCD')).rejects.toThrow(/not found/);
  });
});

describe('writeRoomState', () => {
  it('returns true when the versioned update affected a row', async () => {
    const client = fakeClient({ selects: [], updates: [{ data: [{ version: 4 }], error: null }] });
    const ok = await writeRoomState(client, 'ABCD', baseState, 3);
    expect(ok).toBe(true);
  });

  it('returns false when no row matched the expected version', async () => {
    const client = fakeClient({ selects: [], updates: [{ data: [], error: null }] });
    const ok = await writeRoomState(client, 'ABCD', baseState, 3);
    expect(ok).toBe(false);
  });

  it('throws when the update errors', async () => {
    const client = fakeClient({ selects: [], updates: [{ data: null, error: { message: 'boom' } }] });
    await expect(writeRoomState(client, 'ABCD', baseState, 3)).rejects.toThrow(/boom/);
  });
});

describe('updateRoomWithRetry', () => {
  it('applies the updater and writes on the first attempt when there is no conflict', async () => {
    const client = fakeClient({
      selects: [{ data: { state: { status: 'lobby' } as unknown as RoomState, version: 1 }, error: null }],
      updates: [{ data: [{ version: 2 }], error: null }],
    });
    const result = await updateRoomWithRetry(client, 'ABCD', (s) => ({ ...s, status: 'playing' }) as RoomState);
    expect(result.status).toBe('playing');
  });

  it('retries after a version conflict and succeeds on the second attempt', async () => {
    const client = fakeClient({
      selects: [
        { data: { state: { status: 'lobby' } as unknown as RoomState, version: 1 }, error: null },
        { data: { state: { status: 'lobby' } as unknown as RoomState, version: 2 }, error: null },
      ],
      updates: [
        { data: [], error: null }, // lost the race, 0 rows affected
        { data: [{ version: 3 }], error: null },
      ],
    });
    const result = await updateRoomWithRetry(client, 'ABCD', (s) => ({ ...s, status: 'playing' }) as RoomState);
    expect(result.status).toBe('playing');
  });

  it('throws after exhausting maxAttempts', async () => {
    const client = fakeClient({
      selects: Array(3).fill({ data: { state: { status: 'lobby' } as unknown as RoomState, version: 1 }, error: null }),
      updates: Array(3).fill({ data: [], error: null }),
    });
    await expect(
      updateRoomWithRetry(client, 'ABCD', (s) => s, 3)
    ).rejects.toThrow(/failed to write after 3 attempts/);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run multiplayer/room.test.ts`
Expected: FAIL (`multiplayer/room.ts` does not exist yet)

- [ ] **Step 3: Create `multiplayer/room.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomState } from '../game/types';

export interface RoomRow {
  state: RoomState;
  version: number;
}

export async function fetchRoom(client: SupabaseClient, code: string): Promise<RoomRow> {
  const { data, error } = await client.from('rooms').select('code, state, version').eq('code', code).single();
  if (error) throw new Error(`fetchRoom failed: ${error.message}`);
  return data as RoomRow;
}

export async function writeRoomState(
  client: SupabaseClient,
  code: string,
  nextState: RoomState,
  expectedVersion: number
): Promise<boolean> {
  const { data, error } = await client
    .from('rooms')
    .update({ state: nextState, version: expectedVersion + 1 })
    .eq('code', code)
    .eq('version', expectedVersion)
    .select('version');
  if (error) throw new Error(`writeRoomState failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function updateRoomWithRetry(
  client: SupabaseClient,
  code: string,
  updater: (state: RoomState) => RoomState,
  maxAttempts = 5
): Promise<RoomState> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = await fetchRoom(client, code);
    const nextState = updater(row.state);
    const wrote = await writeRoomState(client, code, nextState, row.version);
    if (wrote) return nextState;
  }
  throw new Error(`updateRoomWithRetry: failed to write after ${maxAttempts} attempts (code=${code})`);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run multiplayer/room.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add multiplayer/room.ts multiplayer/room.test.ts
git commit -m "feat: add multiplayer room read/write with optimistic-concurrency retry"
```

---

### Task 17: `multiplayer/realtime.ts` — subscribe/unsubscribe

**Files:**
- Create: `multiplayer/realtime.ts`, `multiplayer/realtime.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`, `RealtimeChannel` types from `@supabase/supabase-js`; `RoomState` from `../game/types`
- Produces: `subscribeToRoom(client, code, onStateChange): RealtimeChannel`, `unsubscribeFromRoom(channel): Promise<'ok' | 'timed out' | 'error'>`.

- [ ] **Step 1: Write the failing tests**

Create `multiplayer/realtime.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeToRoom, unsubscribeFromRoom } from './realtime';
import type { RoomState } from '../game/types';

function fakeClient() {
  const calls: { channelName?: string; event?: string; config?: unknown; handler?: (payload: unknown) => void } = {};
  const channelObj = {
    on: (event: string, config: unknown, handler: (payload: unknown) => void) => {
      calls.event = event;
      calls.config = config;
      calls.handler = handler;
      return channelObj;
    },
    subscribe: () => channelObj,
    unsubscribe: async () => 'ok' as const,
  };
  const client = {
    channel: (name: string) => {
      calls.channelName = name;
      return channelObj;
    },
  } as unknown as SupabaseClient;
  return { client, calls, channelObj };
}

describe('subscribeToRoom', () => {
  it('subscribes to a channel named after the room code with the right filter', () => {
    const { client, calls } = fakeClient();
    subscribeToRoom(client, 'ABCD', () => {});
    expect(calls.channelName).toBe('room:ABCD');
    expect(calls.event).toBe('postgres_changes');
    expect(calls.config).toEqual({ event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'code=eq.ABCD' });
  });

  it('forwards the new state to onStateChange when an update event fires', () => {
    const { client, calls } = fakeClient();
    const onStateChange = vi.fn();
    subscribeToRoom(client, 'ABCD', onStateChange);
    const fakeState = { status: 'playing' } as unknown as RoomState;
    calls.handler!({ new: { state: fakeState } });
    expect(onStateChange).toHaveBeenCalledWith(fakeState);
  });
});

describe('unsubscribeFromRoom', () => {
  it('calls unsubscribe on the channel', async () => {
    const { client } = fakeClient();
    const channel = subscribeToRoom(client, 'ABCD', () => {});
    await expect(unsubscribeFromRoom(channel)).resolves.toBe('ok');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run multiplayer/realtime.test.ts`
Expected: FAIL (`multiplayer/realtime.ts` does not exist yet)

- [ ] **Step 3: Create `multiplayer/realtime.ts`**

```ts
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { RoomState } from '../game/types';

export function subscribeToRoom(
  client: SupabaseClient,
  code: string,
  onStateChange: (state: RoomState) => void
): RealtimeChannel {
  return client
    .channel(`room:${code}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
      (payload: { new: { state: RoomState } }) => {
        onStateChange(payload.new.state);
      }
    )
    .subscribe();
}

export function unsubscribeFromRoom(channel: RealtimeChannel): Promise<'ok' | 'timed out' | 'error'> {
  return channel.unsubscribe();
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run multiplayer/realtime.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add multiplayer/realtime.ts multiplayer/realtime.test.ts
git commit -m "feat: add Supabase realtime subscribe/unsubscribe helpers for rooms"
```

---

### Task 18: Update `CLAUDE.md` and final verification

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- None — documentation and whole-project verification only.

- [ ] **Step 1: Update the "Project status" section of `CLAUDE.md`**

Replace the current "Project status" paragraph (which says "pre-implementation... no source directory exists") with:

```markdown
## Project status

The stack is Next.js (App Router) + React + TypeScript + Tailwind CSS v4, with Supabase (Postgres + Realtime) replacing the originally-planned Firebase backend — see
`docs/superpowers/specs/2026-08-31-nextjs-supabase-foundation-design.md` for why and how.

The game engine (`game/*.ts`) and card-loading pipeline are ported and tested (Vitest). The Supabase schema
(`supabase/migrations/0001_create_rooms.sql`) and the multiplayer read/write/realtime layer (`multiplayer/`) exist.
UI components, the lobby/room-flow screens, and `multiplayer/player.ts` (localStorage player identity) are NOT built
yet — they're deferred to a follow-up design spec, per the foundation spec's own scope section.
```

- [ ] **Step 2: Full project verification**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests across `game/*.test.ts`, `lib/supabase.test.ts`, `multiplayer/*.test.ts` PASS, nothing under `src/` remains.

Run: `npm run build`
Expected: Next.js build succeeds.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md project status for the Next.js + Supabase foundation"
```

---

## Self-Review Notes

- **Spec coverage:** architecture/hosting (Task 1), Supabase schema + RLS (Task 15), realtime sync (Task 17), folder scaffold (Tasks 1-17 collectively), faithful engine port (Tasks 2-13), out-of-scope items (UI, lobby flow, `multiplayer/player.ts`) explicitly excluded and called out in Global Constraints and Task 18.
- **Placeholder scan:** none found — every task has full code, not descriptions.
- **Type consistency:** `RoomState`/`PlayerState`/`PlayerId`/`CardCode`/`Rng` (Task 2) are the only shared types, used identically by name across Tasks 3-13; `RoomRow`/`fetchRoom`/`writeRoomState`/`updateRoomWithRetry` (Task 16) match what Task 17/the follow-up UI spec will consume.
