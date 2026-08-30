# Foundation (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and fully unit-test the pure game-logic layer for Muffin Time — card data loading (Google Sheets + fallback), the ~20 engine primitives, turn/win-condition logic, and room lifecycle — with zero UI and zero live Firebase wiring, so every rule can be verified with `npm test` alone.

**Architecture:** All game state is one plain JS object (matches the Firebase Realtime Database shape from the design spec) manipulated only through pure functions that take a state object and return a new state object (deep-cloned via `structuredClone`-equivalent JSON round-trip). No function reads global state, does I/O, or depends on `Date.now()`/timers. Randomness (`shuffle`, `pickRandomIndices`) is injected via an `rng` parameter defaulting to `Math.random`, so tests can pass deterministic fakes. Card content loading is the one async/I/O piece, isolated in `src/cards/`, with dependency-injected `fetch` for testability. Firebase project creation and actual read/write wiring are deliberately deferred to Plan 3 (Gameplay UI) — this plan produces code that Plan 3 will call, but never talks to Firebase itself.

**Tech Stack:** Plain ES modules (no bundler — files run directly in a browser via `<script type="module">` later, and directly in Node under Vitest now), Node.js + npm for tooling only, Vitest for unit tests.

**Reference:** `docs/superpowers/specs/2026-08-31-muffin-time-web-design.md` (design spec — read before starting)

---

## File Structure

```
muffinTime/
  package.json
  scripts/
    sync-cards.js          # copies data/cards.json -> public/data/cards.json
  data/
    cards.json              # existing — canonical card content (231 cards)
    cards.csv                # existing — for re-importing into Google Sheets
  public/
    data/
      cards.json             # deployed copy, created by sync-cards.js (Task 13)
  src/
    engine/
      util.js                # cloneState, shuffle, pickRandomIndices
      util.test.js
      pile.js                 # draw, drawFromBottom, discard, reshuffleDiscardIntoDraw
      pile.test.js
      transfer.js              # stealRandom, stealChosen, giveCard, swapHands
      transfer.test.js
      group.js                 # everyoneDraws, everyoneDiscards, passHands
      group.test.js
      turnFlow.js               # skipTurn, reverseDirection, changeMuffinTarget
      turnFlow.test.js
      trap.js                    # placeTrap, removeTrap
      trap.test.js
      misc.js                     # removeCardFromDiscard, returnCardToHand, drawUntilCount
      misc.test.js
      turn.js                      # advanceTurn, isMuffinTimeEligible, declareMuffinTime, checkWinnerAtTurnStart
      turn.test.js
      room.js                       # createRoom, addPlayer, startGame
      room.test.js
    cards/
      parseCsv.js                    # generic CSV parser (handles quoted fields, embedded commas/newlines)
      parseCsv.test.js
      loadCards.js                    # fetch published Sheet CSV, fall back to bundled JSON
      loadCards.test.js
```

Each `src/engine/*.js` file has one responsibility (one card-effect category), so a future task never needs to load more than ~40 lines of context to change one primitive.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/engine/` (empty dir, populated in later tasks)
- Create: `src/cards/` (empty dir, populated in later tasks)
- Create: `scripts/` (empty dir, populated in Task 13)
- Create: `public/` (empty dir, populated in Task 13)

- [ ] **Step 1: Initialize git**

This repository has no version control yet. Initialize it:

```bash
git init
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "muffin-time",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "sync-cards": "node scripts/sync-cards.js"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 5: Create empty source directories**

```bash
mkdir -p src/engine src/cards scripts public/data
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore src data scripts public
git commit -m "chore: scaffold project with vitest"
```

---

## Task 2: CSV Parser

**Files:**
- Create: `src/cards/parseCsv.js`
- Test: `src/cards/parseCsv.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/cards/parseCsv.test.js
import { describe, it, expect } from 'vitest';
import { parseCsv } from './parseCsv.js';

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cards/parseCsv.test.js`
Expected: FAIL with "Failed to resolve import" or "parseCsv is not a function" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```javascript
// src/cards/parseCsv.js
export function parseCsv(text) {
  const rows = [];
  let row = [];
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cards/parseCsv.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cards/parseCsv.js src/cards/parseCsv.test.js
git commit -m "feat: add CSV parser for card content"
```

---

## Task 3: Card Loader (Google Sheets + fallback)

**Files:**
- Create: `src/cards/loadCards.js`
- Test: `src/cards/loadCards.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/cards/loadCards.test.js
import { describe, it, expect } from 'vitest';
import { loadCards, indexCardsByCode, DEFAULT_SHEET_CSV_URL, DEFAULT_FALLBACK_URL } from './loadCards.js';

const CSV_TEXT = 'type,name_en,name_th,effect_th,code\naction,Alien Invasion,เอเลี่ยนบุก,มอบการ์ดทั้งหมด,A02\n';

function fakeFetch(responses) {
  let call = 0;
  return async (url) => {
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

  it('uses the real published sheet URL and local fallback URL by default', async () => {
    const seenUrls = [];
    const fetchImpl = async (url) => {
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cards/loadCards.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/cards/loadCards.js
import { parseCsv } from './parseCsv.js';

export const DEFAULT_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoB5uoPb0NOmZAr7G9t2CVzOgJI26OYMgA4ugyqwtaC5fXSaRu-32W7gPqyIAkgZp1r-04sJTj9FC4/pub?output=csv';
export const DEFAULT_FALLBACK_URL = '/data/cards.json';

const EXPECTED_HEADER = ['type', 'name_en', 'name_th', 'effect_th', 'code'];

function rowsToCards(rows) {
  const [header, ...dataRows] = rows;
  if (!header || EXPECTED_HEADER.some((col, i) => header[i] !== col)) {
    throw new Error('unexpected CSV header shape');
  }
  return dataRows
    .filter((row) => row.length >= 5 && row[4])
    .map((row) => ({ type: row[0], en: row[1], th: row[2], effect: row[3], code: row[4] }));
}

function fallbackJsonToCards(json) {
  const cards = [];
  for (const type of ['action', 'counter', 'trap']) {
    for (const c of json[type] || []) {
      cards.push({ type, en: c.en, th: c.th, effect: c.effect, code: c.code });
    }
  }
  return cards;
}

export async function loadCards({
  sheetUrl = DEFAULT_SHEET_CSV_URL,
  fallbackUrl = DEFAULT_FALLBACK_URL,
  fetchImpl = fetch,
} = {}) {
  try {
    const res = await fetchImpl(sheetUrl);
    if (!res.ok) throw new Error(`sheet fetch failed with status ${res.status}`);
    const text = await res.text();
    const cards = rowsToCards(parseCsv(text));
    if (cards.length === 0) throw new Error('sheet returned no cards');
    return { cards, source: 'sheet' };
  } catch {
    const res = await fetchImpl(fallbackUrl);
    if (!res.ok) throw new Error(`fallback fetch failed with status ${res.status}`);
    const json = await res.json();
    return { cards: fallbackJsonToCards(json), source: 'fallback' };
  }
}

export function indexCardsByCode(cards) {
  return new Map(cards.map((c) => [c.code, c]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cards/loadCards.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cards/loadCards.js src/cards/loadCards.test.js
git commit -m "feat: load card content from Google Sheets with local fallback"
```

**Post-implementation amendment (commit `889cdc2`):** code review found the `fetchImpl = fetch` default unsafe in real browsers (unbound WebIDL receiver can throw `Illegal invocation`), and found that a double-failure (sheet AND fallback both fail) silently dropped the sheet-side error. Fixed: default is now `fetchImpl = (...args) => fetch(...args)`, and on double-failure the thrown error's message mentions both failures with the fallback error attached as `cause`. Two tests were added: zero-data-rows fallback trigger, and double-failure error message. Final test count for this file is **7, not 5** — this adds 2 to every downstream running total in this plan (Task 13's expected full-suite count is updated accordingly).

---

## Task 4: Engine State Utilities

**Files:**
- Create: `src/engine/util.js`
- Test: `src/engine/util.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/util.test.js
import { describe, it, expect } from 'vitest';
import { cloneState, shuffle, pickRandomIndices } from './util.js';

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/util.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/util.js
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandomIndices(length, n, rng = Math.random) {
  const indices = shuffle(
    Array.from({ length }, (_, i) => i),
    rng
  );
  return indices.slice(0, Math.min(n, length));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/util.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/util.js src/engine/util.test.js
git commit -m "feat: add state clone and seeded-shuffle utilities"
```

**Post-implementation amendment (commit `56c2293`):** code review found the shuffle test used a degenerate `rng = () => 0`, which produces the same output under both the correct Fisher-Yates inclusive bound (`j = Math.floor(rng() * (i + 1))`) and the classic off-by-one bug (`j = Math.floor(rng() * i)`) — so it couldn't actually catch a regression to the buggy bound. The implementation itself was already correct (verified by hand-trace and by running both variants). Added one test that distinguishes them:

```javascript
  it('uses an inclusive upper bound so every position can stay in place', () => {
    const result = shuffle([1, 2, 3, 4], () => 0.999999);
    expect(result).toEqual([1, 2, 3, 4]);
  });
```

Final test count for this file is **5, not 4** — this adds 1 to every downstream running total in this plan.

---

## Task 5: Pile Primitives (draw, discard, reshuffle)

**Files:**
- Create: `src/engine/pile.js`
- Test: `src/engine/pile.test.js`

Convention: `drawPile` is drawn from the **end** of the array (`pop()`); `discardPile` is appended at the **end** (`push()`), so the most recent discard is the last element.

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/pile.test.js
import { describe, it, expect } from 'vitest';
import { draw, drawFromBottom, discard, reshuffleDiscardIntoDraw } from './pile.js';

function baseState() {
  return {
    drawPile: ['A01', 'A02', 'A03'],
    discardPile: ['A10'],
    players: { p1: { hand: [] } },
  };
}

describe('draw', () => {
  it('moves n cards from the top of the draw pile into the hand', () => {
    const next = draw(baseState(), 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A03', 'A02']);
    expect(next.drawPile).toEqual(['A01']);
  });

  it('reshuffles the discard pile into the draw pile when it runs out', () => {
    const state = { drawPile: ['A01'], discardPile: ['A10', 'A11', 'A12'], players: { p1: { hand: [] } } };
    const next = draw(state, 'p1', 3, () => 0);
    expect(next.players.p1.hand.length).toBe(3);
    expect(next.discardPile).toEqual(['A12']);
  });

  it('stops drawing early if both piles are exhausted', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: [] } } };
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
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02', 'A03'] } } };
    const next = discard(state, 'p1', 2, ['A01', 'A03']);
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.discardPile).toEqual(['A01', 'A03']);
  });

  it('discards n random cards when no cards are specified', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02', 'A03'] } } };
    const next = discard(state, 'p1', 2, null, () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.discardPile.length).toBe(2);
  });
});

describe('reshuffleDiscardIntoDraw', () => {
  it('keeps the top discard card in place and shuffles the rest into the draw pile', () => {
    const state = { drawPile: [], discardPile: ['A10', 'A11', 'A12'] };
    const next = reshuffleDiscardIntoDraw(state, () => 0);
    expect(next.discardPile).toEqual(['A12']);
    expect(next.drawPile.sort()).toEqual(['A10', 'A11']);
  });

  it('does nothing when the discard pile has 0 or 1 cards', () => {
    const state = { drawPile: [], discardPile: ['A10'] };
    const next = reshuffleDiscardIntoDraw(state);
    expect(next).toEqual(state);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/pile.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/pile.js
import { cloneState, shuffle, pickRandomIndices } from './util.js';

export function reshuffleDiscardIntoDraw(state, rng = Math.random) {
  const next = cloneState(state);
  if (next.discardPile.length <= 1) return next;
  const top = next.discardPile[next.discardPile.length - 1];
  const rest = next.discardPile.slice(0, -1);
  next.drawPile = [...next.drawPile, ...shuffle(rest, rng)];
  next.discardPile = [top];
  return next;
}

export function draw(state, playerId, n, rng = Math.random) {
  let next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) {
      next = reshuffleDiscardIntoDraw(next, rng);
      if (next.drawPile.length === 0) break;
    }
    const card = next.drawPile.pop();
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function drawFromBottom(state, playerId, n) {
  const next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.shift();
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function discard(state, playerId, n, cardCodes = null, rng = Math.random) {
  const next = cloneState(state);
  const hand = next.players[playerId].hand;
  let toDiscard;
  if (cardCodes) {
    toDiscard = cardCodes.slice(0, n);
  } else {
    const indices = pickRandomIndices(hand.length, Math.min(n, hand.length), rng);
    toDiscard = indices.map((i) => hand[i]);
  }
  for (const code of toDiscard) {
    const pos = hand.indexOf(code);
    if (pos !== -1) {
      hand.splice(pos, 1);
      next.discardPile.push(code);
    }
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/pile.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/pile.js src/engine/pile.test.js
git commit -m "feat: add draw/discard/reshuffle pile primitives"
```

**Post-implementation amendment (commit `9508e45`):** code review found `discard` had two silent-failure-mode bugs: negative `n` caused catastrophic over-discarding (an `Array.prototype.slice`/`Math.min` footgun with negative numbers), and mismatched/invalid explicit `cardCodes` (wrong length, or a code not actually in hand — e.g. a duplicate) silently under-discarded instead of failing loudly. Fixed: `discard` now returns an unchanged clone for `n <= 0`, and throws if `cardCodes.length !== n` or if any code in `cardCodes` isn't found in the hand at the time it's processed. No other code in this plan calls `discard` with explicit `cardCodes` (confirmed by grep across all 13 tasks), so this is a pure bug fix with no ripple effects. Three tests were added. Final test count for this file is **11, not 8** — this adds 3 to every downstream running total in this plan (Task 13's expected full-suite count is updated accordingly).

---

## Task 6: Player-to-Player Primitives

**Files:**
- Create: `src/engine/transfer.js`
- Test: `src/engine/transfer.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/transfer.test.js
import { describe, it, expect } from 'vitest';
import { stealRandom, stealChosen, giveCard, swapHands } from './transfer.js';

function baseState() {
  return {
    players: {
      p1: { hand: ['A01', 'A02', 'A03'] },
      p2: { hand: ['B01'] },
    },
  };
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/transfer.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/transfer.js
import { cloneState, pickRandomIndices } from './util.js';

export function stealRandom(state, fromId, toId, n, rng = Math.random) {
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const count = Math.min(n, fromHand.length);
  const indices = pickRandomIndices(fromHand.length, count, rng).sort((a, b) => b - a);
  const stolenCards = [];
  for (const i of indices) {
    stolenCards.push(fromHand.splice(i, 1)[0]);
  }
  next.players[toId].hand.push(...stolenCards);
  return next;
}

export function stealChosen(state, fromId, toId, cardCode) {
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const pos = fromHand.indexOf(cardCode);
  if (pos === -1) return next;
  fromHand.splice(pos, 1);
  next.players[toId].hand.push(cardCode);
  return next;
}

export function giveCard(state, fromId, toId, cardCode) {
  return stealChosen(state, fromId, toId, cardCode);
}

export function swapHands(state, aId, bId) {
  const next = cloneState(state);
  const aHand = next.players[aId].hand;
  const bHand = next.players[bId].hand;
  next.players[aId].hand = bHand;
  next.players[bId].hand = aHand;
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/transfer.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/transfer.js src/engine/transfer.test.js
git commit -m "feat: add steal/give/swap player-to-player primitives"
```

**Post-implementation amendment (commit `202e77c`):** code review found `stealRandom` had the same negative-`n` over-action bug already fixed once in `pile.js`'s `discard` (see Task 5's amendment) — `Math.min(n, fromHand.length)` stays negative when `n` is negative, and `pickRandomIndices`'s internal `slice(0, negativeNumber)` then selects extra elements instead of zero. Fixed with the same guard pattern: `if (n <= 0) return cloneState(state);` as the first line. `stealChosen`, `giveCard`, `swapHands` are unaffected and unchanged — the review found their behavior (including `stealChosen`/`giveCard` silently no-op-ing on a missing card, unlike `discard`'s throw) to be the plan's intentional design, not a bug, so it was left as-is. One test was added. Final test count for this file is **7, not 6** — this adds 1 to every downstream running total in this plan.

---

## Task 7: Group Primitives

**Files:**
- Create: `src/engine/group.js`
- Test: `src/engine/group.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/group.test.js
import { describe, it, expect } from 'vitest';
import { everyoneDraws, everyoneDiscards, passHands } from './group.js';

function baseState() {
  return {
    turnOrder: ['p1', 'p2', 'p3'],
    drawPile: ['A01', 'A02', 'A03', 'A04', 'A05', 'A06'],
    discardPile: [],
    players: {
      p1: { hand: [] },
      p2: { hand: [] },
      p3: { hand: [] },
    },
  };
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/group.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/group.js
import { cloneState } from './util.js';
import { draw, discard } from './pile.js';

export function everyoneDraws(state, n, excludeIds = [], rng = Math.random) {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = draw(next, playerId, n, rng);
  }
  return next;
}

export function everyoneDiscards(state, n, excludeIds = [], rng = Math.random) {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = discard(next, playerId, n, null, rng);
  }
  return next;
}

export function passHands(state, steps) {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  const hands = order.map((id) => next.players[id].hand);
  for (let i = 0; i < count; i++) {
    const targetIndex = (((i + steps) % count) + count) % count;
    next.players[order[targetIndex]].hand = hands[i];
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/group.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/group.js src/engine/group.test.js
git commit -m "feat: add everyone-draws/discards and pass-hands group primitives"
```

---

## Task 8: Turn-Flow Primitives

**Files:**
- Create: `src/engine/turnFlow.js`
- Test: `src/engine/turnFlow.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/turnFlow.test.js
import { describe, it, expect } from 'vitest';
import { skipTurn, reverseDirection, changeMuffinTarget } from './turnFlow.js';

describe('skipTurn', () => {
  it('marks the player to skip their next turn', () => {
    const state = { players: { p1: { skipNextTurn: false } } };
    const next = skipTurn(state, 'p1');
    expect(next.players.p1.skipNextTurn).toBe(true);
  });
});

describe('reverseDirection', () => {
  it('flips the play direction', () => {
    expect(reverseDirection({ direction: 1 }).direction).toBe(-1);
    expect(reverseDirection({ direction: -1 }).direction).toBe(1);
  });
});

describe('changeMuffinTarget', () => {
  it('sets a new muffin time target hand size', () => {
    const next = changeMuffinTarget({ muffinTimeTarget: 10 }, 7);
    expect(next.muffinTimeTarget).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/turnFlow.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/turnFlow.js
import { cloneState } from './util.js';

export function skipTurn(state, playerId) {
  const next = cloneState(state);
  next.players[playerId].skipNextTurn = true;
  return next;
}

export function reverseDirection(state) {
  const next = cloneState(state);
  next.direction = next.direction * -1;
  return next;
}

export function changeMuffinTarget(state, n) {
  const next = cloneState(state);
  next.muffinTimeTarget = n;
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/turnFlow.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/turnFlow.js src/engine/turnFlow.test.js
git commit -m "feat: add skip-turn/reverse-direction/change-target primitives"
```

---

## Task 9: Trap Primitives

**Files:**
- Create: `src/engine/trap.js`
- Test: `src/engine/trap.test.js`

Note: "revealing" a trap (triggering its effect) and "discarding" a trap (forced removal with no effect) are mechanically identical at the state level — both move the card from `traps` to `discardPile`. Callers in Plan 2/3 decide whether to additionally apply the card's effect after calling `removeTrap`.

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/trap.test.js
import { describe, it, expect } from 'vitest';
import { placeTrap, removeTrap } from './trap.js';

describe('placeTrap', () => {
  it('moves a card from hand to face-down traps', () => {
    const state = { players: { p1: { hand: ['A01', 'A02'], traps: [] } } };
    const next = placeTrap(state, 'p1', 'A01');
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.players.p1.traps).toEqual(['A01']);
  });

  it('throws if the player already has 3 traps', () => {
    const state = { players: { p1: { hand: ['A01'], traps: ['T01', 'T02', 'T03'] } } };
    expect(() => placeTrap(state, 'p1', 'A01')).toThrow();
  });

  it('throws if the card is not in hand', () => {
    const state = { players: { p1: { hand: [], traps: [] } } };
    expect(() => placeTrap(state, 'p1', 'A01')).toThrow();
  });
});

describe('removeTrap', () => {
  it('moves a trap card to the discard pile', () => {
    const state = { discardPile: [], players: { p1: { traps: ['T01', 'T02'] } } };
    const next = removeTrap(state, 'p1', 'T01');
    expect(next.players.p1.traps).toEqual(['T02']);
    expect(next.discardPile).toEqual(['T01']);
  });

  it('throws if the trap is not found', () => {
    const state = { discardPile: [], players: { p1: { traps: [] } } };
    expect(() => removeTrap(state, 'p1', 'T01')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/trap.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/trap.js
import { cloneState } from './util.js';

export function placeTrap(state, playerId, cardCode) {
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

export function removeTrap(state, playerId, cardCode) {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/trap.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/trap.js src/engine/trap.test.js
git commit -m "feat: add place/remove trap primitives"
```

---

## Task 10: Misc Primitives

**Files:**
- Create: `src/engine/misc.js`
- Test: `src/engine/misc.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/misc.test.js
import { describe, it, expect } from 'vitest';
import { removeCardFromDiscard, returnCardToHand, drawUntilCount } from './misc.js';

describe('removeCardFromDiscard', () => {
  it('permanently removes a card from the discard pile', () => {
    const state = { discardPile: ['A01', 'A02'] };
    const next = removeCardFromDiscard(state, 'A01');
    expect(next.discardPile).toEqual(['A02']);
  });
});

describe('returnCardToHand', () => {
  it('moves a card from the discard pile back into a hand', () => {
    const state = { discardPile: ['A01', 'A02'], players: { p1: { hand: [] } } };
    const next = returnCardToHand(state, 'A02', 'p1');
    expect(next.discardPile).toEqual(['A01']);
    expect(next.players.p1.hand).toEqual(['A02']);
  });
});

describe('drawUntilCount', () => {
  it('draws up to the target count when the hand is smaller', () => {
    const state = { drawPile: ['A01', 'A02'], discardPile: [], players: { p1: { hand: ['A03'] } } };
    const next = drawUntilCount(state, 'p1', 3);
    expect(next.players.p1.hand.length).toBe(3);
  });

  it('discards down to the target count when the hand is larger', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03', 'A04'] } },
    };
    const next = drawUntilCount(state, 'p1', 2, () => 0);
    expect(next.players.p1.hand.length).toBe(2);
  });

  it('does nothing when the hand already matches the target', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02'] } } };
    const next = drawUntilCount(state, 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A01', 'A02']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/misc.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/misc.js
import { cloneState } from './util.js';
import { draw, discard } from './pile.js';

export function removeCardFromDiscard(state, cardCode) {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos !== -1) next.discardPile.splice(pos, 1);
  return next;
}

export function returnCardToHand(state, cardCode, toPlayerId) {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos === -1) return next;
  next.discardPile.splice(pos, 1);
  next.players[toPlayerId].hand.push(cardCode);
  return next;
}

export function drawUntilCount(state, playerId, targetCount, rng = Math.random) {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/misc.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/misc.js src/engine/misc.test.js
git commit -m "feat: add remove-from-discard/return-to-hand/draw-until-count primitives"
```

---

## Task 11: Turn Order & Win Condition

**Files:**
- Create: `src/engine/turn.js`
- Test: `src/engine/turn.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/turn.test.js
import { describe, it, expect } from 'vitest';
import { advanceTurn, isMuffinTimeEligible, declareMuffinTime, checkWinnerAtTurnStart } from './turn.js';

describe('advanceTurn', () => {
  it('moves to the next player in turn order', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    };
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(1);
  });

  it('wraps around at the end of turn order', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 2,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    };
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(0);
  });

  it('moves backward when direction is -1', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: -1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    };
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(2);
  });

  it('skips a player whose skipNextTurn flag is set and clears the flag', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: true }, p3: { skipNextTurn: false } },
    };
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(2);
    expect(next.players.p2.skipNextTurn).toBe(false);
  });
});

describe('isMuffinTimeEligible', () => {
  it('is true when the hand size exactly matches the target', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01') } } };
    expect(isMuffinTimeEligible(state, 'p1')).toBe(true);
  });

  it('is false otherwise', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(9).fill('A01') } } };
    expect(isMuffinTimeEligible(state, 'p1')).toBe(false);
  });
});

describe('declareMuffinTime', () => {
  it('sets hasCalledMuffinTime when eligible', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: false } } };
    const next = declareMuffinTime(state, 'p1');
    expect(next.players.p1.hasCalledMuffinTime).toBe(true);
  });

  it('throws when not eligible', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: [], hasCalledMuffinTime: false } } };
    expect(() => declareMuffinTime(state, 'p1')).toThrow();
  });
});

describe('checkWinnerAtTurnStart', () => {
  it('is true when the player declared previously and still has the target count', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: true } } };
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(true);
  });

  it('is false if the player never declared', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: false } } };
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(false);
  });

  it('is false if the hand count changed since declaring', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(9).fill('A01'), hasCalledMuffinTime: true } } };
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/turn.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/turn.js
import { cloneState } from './util.js';

export function advanceTurn(state) {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  let index = next.currentTurnIndex;
  let attempts = 0;
  do {
    index = ((index + next.direction) % count + count) % count;
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

export function isMuffinTimeEligible(state, playerId) {
  return state.players[playerId].hand.length === state.muffinTimeTarget;
}

export function declareMuffinTime(state, playerId) {
  if (!isMuffinTimeEligible(state, playerId)) {
    throw new Error('player does not have the target hand count');
  }
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = true;
  return next;
}

export function checkWinnerAtTurnStart(state, playerId) {
  const player = state.players[playerId];
  return player.hasCalledMuffinTime && player.hand.length === state.muffinTimeTarget;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/turn.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/turn.js src/engine/turn.test.js
git commit -m "feat: add turn advancement and muffin-time win condition"
```

**Post-implementation amendment (commit `e3c9268`):** code review found a real design gap — `hasCalledMuffinTime` is set by `declareMuffinTime` but nothing anywhere resets it back to `false`. Per the design spec's win rule ("declared on the previous turn AND still has the target count at the start of the next turn"), a failed check at turn-start should require re-declaring; without a reset, `checkWinnerAtTurnStart` would return `true` on ANY future turn where the count coincidentally matches again, not just the immediately following one — a standing-bid bug once this gets wired into a real turn loop in a later plan. Fixed by adding `clearMuffinTimeDeclaration(state, playerId)`, which the orchestration layer (not built in this plan) must call whenever `checkWinnerAtTurnStart` returns `false` for a player who had declared. `advanceTurn`/`isMuffinTimeEligible`/`declareMuffinTime`/`checkWinnerAtTurnStart` are unchanged (only a clarifying comment was added to `advanceTurn`). Also added a regression test locking in `advanceTurn`'s all-players-skipped behavior (lands one seat past the start, clears every flag) — traced as correct and plausibly reachable via cards like "I Used To Be A Cow" that can skip most/all players in one shot. Final test count for this file is **14, not 11** — this adds 3 to every downstream running total in this plan.

---

## Task 12: Room Lifecycle

**Files:**
- Create: `src/engine/room.js`
- Test: `src/engine/room.test.js`

Assumption (no better data available — see design spec's card content section): the starting deck is built from one copy of each of the 231 unique cards. If real print quantities are found later, duplicate the relevant entries in `data/cards.json`/`cards.csv` and this code needs no changes — `startGame` just takes whatever code list it's given.

- [ ] **Step 1: Write the failing tests**

```javascript
// src/engine/room.test.js
import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room.js';

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
    const room = { ...createRoom('host1', 'Ploy'), status: 'playing' };
    expect(() => addPlayer(room, 'p2', 'Nam')).toThrow();
  });

  it('throws if the room already has 8 players', () => {
    let room = createRoom('host1', 'P1');
    for (let i = 2; i <= 8; i++) {
      room = addPlayer(room, `p${i}`, `P${i}`);
    }
    expect(() => addPlayer(room, 'p9', 'P9')).toThrow();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/room.test.js`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/engine/room.js
import { cloneState, shuffle } from './util.js';

export function createRoom(hostId, hostName) {
  return {
    status: 'lobby',
    hostId,
    turnOrder: [],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    log: [],
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

export function addPlayer(state, playerId, name) {
  if (state.status !== 'lobby') {
    throw new Error('cannot join a room that has already started');
  }
  if (Object.keys(state.players).length >= 8) {
    throw new Error('room is full');
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

export function startGame(state, allCardCodes, rng = Math.random) {
  const playerIds = Object.keys(state.players);
  if (playerIds.length < 3) {
    throw new Error('need at least 3 players to start');
  }
  const next = cloneState(state);
  next.turnOrder = shuffle(playerIds, rng);
  next.drawPile = shuffle(allCardCodes, rng);
  for (const playerId of next.turnOrder) {
    for (let i = 0; i < 3; i++) {
      next.players[playerId].hand.push(next.drawPile.pop());
    }
  }
  next.status = 'playing';
  next.currentTurnIndex = 0;
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/room.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/room.js src/engine/room.test.js
git commit -m "feat: add room create/join/start lifecycle"
```

**Post-implementation amendment (commit `b338fb7`):** code review found two real, verified bugs, both confirmed by actually running the code. (1) Critical: `startGame` had no guard against a second call on an already-`'playing'` room — it re-shuffled the full card list and pushed extra cards onto existing (non-empty) hands without resetting them, so cards already held by a player got dealt again from the rebuilt draw pile, breaking the "each card exists exactly once" invariant. A double-fired "start game" button (plausible on mobile/flaky connections, which is exactly this project's target environment) would trigger it. (2) Important: `addPlayer` had no guard against a `playerId` already present in `state.players` — it silently overwrote that player's entire entry (hand, traps, flags all reset to empty/false), which would cause silent data loss if a reconnect flow naively called `addPlayer` again instead of separate reconnect logic. Fixed with one guard clause each: `startGame` now throws `'game already started'` if `state.status !== 'lobby'`; `addPlayer` now throws `'player already in room'` if the id already exists. `createRoom` is unchanged. Two tests were added. Final test count for this file is **8, not 6** — this adds 2 to every downstream running total in this plan. Note for whoever builds the Firebase-wiring plan: reconnection (same playerId, `connected: true`, existing state preserved) needs its own function — `addPlayer` now explicitly refuses that case rather than silently mishandling it.

---

## Task 13: Card Sync Script + Full Test Suite

**Files:**
- Create: `scripts/sync-cards.js`

- [ ] **Step 1: Write the sync script**

```javascript
// scripts/sync-cards.js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'data', 'cards.json');
const destDir = join(root, 'public', 'data');
const dest = join(destDir, 'cards.json');

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}
const content = readFileSync(src, 'utf8');
writeFileSync(dest, content, 'utf8');
console.log(`Synced ${src} -> ${dest}`);
```

- [ ] **Step 2: Run it**

Run: `npm run sync-cards`
Expected: prints `Synced .../data/cards.json -> .../public/data/cards.json`, and `public/data/cards.json` now exists with the same content as `data/cards.json`.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all test files from Tasks 2–12 pass (74 tests total: 4 (parseCsv) + 7 (loadCards, amended) + 5 (util, amended) + 11 (pile, amended) + 7 (transfer, amended) + 5 (group) + 3 (turnFlow) + 5 (trap) + 5 (misc) + 14 (turn, amended) + 8 (room, amended) — see each task's post-implementation amendment note for why its count differs from the number stated when that task was originally written. Recount against actual output and treat any mismatch as a real failure to investigate, not a typo.).

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-cards.js public/data/cards.json
git commit -m "chore: add card data sync script for deployment"
```

---

## Plan Self-Review Notes

- **Spec coverage:** card data pipeline (fetch + fallback) ✓, ~20 engine primitives ✓ (19 implemented across pile/transfer/group/turnFlow/trap/misc, plus `clearMuffinTimeDeclaration` in turn.js added during Task 11's amendment), turn order + muffin-time win condition ✓, room lobby/start lifecycle (3–8 players) ✓. Firebase project creation and the actual Realtime Database read/write wiring are **intentionally out of scope** for this plan — every function here is pure and Firebase-free; Plan 3 (Gameplay UI) is where a thin adapter calls these functions and pushes the result to Firebase.
- **Not in this plan:** card → tier/primitive classification data (all 231 cards) is Plan 2. The actual game screens are Plan 3.
