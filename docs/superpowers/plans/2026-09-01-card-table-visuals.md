# Card Table Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hand tray and the opponent grid look like a real card table — your own hand overlaps like cards fanned in your hand (with artwork), and opponents show a small fanned stack of face-down card backs instead of a bare number.

**Architecture:** Pure CSS/JSX changes to three already-live components (`Card.tsx`, `HandTrayModal.tsx`, `PlayerDensityGrid.tsx`). No state, no new files, no backend involvement — this plan is fully independent of the auth and multiplayer-sync plans and can ship first.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4 (theme tokens via `@theme` in `app/globals.css`).

## Global Constraints

- No new dependencies — this repo deliberately avoids animation/UI libraries; use plain CSS transforms (see `docs/superpowers/specs/2026-08-31-mobile-game-ui-demo-design.md`).
- Reuse existing Tailwind theme tokens (`bg-action`, `border-trap`, `rounded-card`, `text-ink-secondary`, etc. from `app/globals.css`) — do not hardcode new hex colors.
- UI copy stays Thai-only.
- `vitest.config.ts` runs in a `node` environment, not `jsdom` — there is no component-test infrastructure in this repo. Verify every UI change by running `npm run dev` and checking the real screen, per this project's existing convention (see the "Testing" section of `docs/superpowers/specs/2026-08-31-mobile-game-ui-demo-design.md`). Do not invent fake component tests.
- Mobile-first: everything renders inside a `max-w-md` container.

---

### Task 1: Show real card artwork in the "hand" card variant

**Files:**
- Modify: `components/card/Card.tsx:104-124`

**Interfaces:**
- Consumes: `CardProps.image` (already passed by every caller of `<Card variant="hand" .../>`, unused today), the existing private `renderImageSlot(isCompact: boolean)` helper defined in the same file (already used by `'compact'` and `'full'` variants).
- Produces: nothing new — this only changes what the existing `'hand'` variant renders. No prop/signature changes, so no other file needs to change.

**Context:** `Card.tsx`'s `'hand'` variant (used by `HandTrayModal.tsx` for every card in your hand) currently renders only a text label + title + description — it never calls `renderImageSlot()`, even though real artwork already exists at `public/cards/{type}/{code}.jpg` and every other variant shows it. This is why hand cards look like plain text chips instead of cards.

- [ ] **Step 1: Replace the `'hand'` variant's JSX to include the image slot**

Find this block in `components/card/Card.tsx` (lines 104-124):

```tsx
  // Fixed-width horizontal player hand format (2:3 portrait)
  if (variant === 'hand') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-32 aspect-[2/3] shrink-0 flex-col justify-between rounded-card border-2 bg-card p-2 text-left shadow-sm transition-transform ${theme.border} ${
          selected ? '-translate-y-2 shadow-md ring-2 ring-primary' : ''
        } ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold ${theme.text}`}>{theme.label}</span>
          {id && <span className="text-[10px] font-mono text-ink-secondary">{id}</span>}
        </div>
        <div className="flex flex-col gap-0.5 my-auto">
          <span className="text-sm font-bold text-ink line-clamp-2">{displayTitle}</span>
          <span className="line-clamp-3 text-xs text-ink-secondary">{displayDesc}</span>
        </div>
      </button>
    );
  }
```

Replace it with:

```tsx
  // Fixed-width horizontal player hand format (2:3 portrait)
  if (variant === 'hand') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-32 aspect-[2/3] shrink-0 flex-col justify-between rounded-card border-2 bg-card p-2 text-left shadow-sm transition-transform ${theme.border} ${
          selected ? '-translate-y-2 shadow-md ring-2 ring-primary' : ''
        } ${className}`}
      >
        <div className="flex items-center justify-between shrink-0">
          <span className={`text-xs font-bold ${theme.text}`}>{theme.label}</span>
          {id && <span className="text-[10px] font-mono text-ink-secondary">{id}</span>}
        </div>
        {renderImageSlot(true)}
        <div className="flex flex-col gap-0.5 min-h-0">
          <span className="text-xs font-bold text-ink line-clamp-1">{displayTitle}</span>
          <span className="line-clamp-2 text-[10px] text-ink-secondary">{displayDesc}</span>
        </div>
      </button>
    );
  }
```

(Title/description were shrunk from `text-sm`/`text-xs line-clamp-3` to `text-xs`/`text-[10px] line-clamp-2` to make room for the image inside the same `w-32 aspect-[2/3]` card — the image slot is `aspect-[4/3]` per `renderImageSlot`, same as the other variants.)

- [ ] **Step 2: Visually verify**

Run: `npm run dev`, open `http://localhost:3000`, create a room (bots auto-fill after ~1.2s per `WaitingRoom.tsx`), start the game, tap "ดูไพ่ในมือ". Expected: each card in the tray now shows a small image (or the dashed placeholder box if that card code has no `image` in `data/cards.json` yet) above the title/description, and the card doesn't overflow its `w-32` box. If text is clipped oddly, that's cosmetic — confirm the image renders and move on.

- [ ] **Step 3: Commit**

```bash
git add components/card/Card.tsx
git commit -m "feat: show card artwork in the hand card variant"
```

---

### Task 2: Overlapping (fanned) layout for your own hand tray

**Files:**
- Modify: `components/room/HandTrayModal.tsx:126-170`

**Interfaces:**
- Consumes: nothing new — same `hand: CardCode[]`, `selectedCode` state, and `<Card variant="hand" selected .../>` already in this file.
- Produces: nothing new — purely visual, no prop or callback changes, so `GameTable.tsx` (the only caller of `HandTrayModal`) needs no changes.

**Context:** The card row currently uses `flex gap-2.5 overflow-x-auto` — cards sit side by side with even spacing. Change it to overlap like a fanned hand: each card after the first gets a negative left margin (~1/3 of the card's 128px width), later cards stack on top of earlier ones (z-index by index), and the selected card jumps to the very top (z-index above all) and lifts higher so it's unambiguous which card is selected even though it's now nested between two overlapping neighbors.

- [ ] **Step 1: Replace the card row's className and per-card wrapper**

Find this block in `components/room/HandTrayModal.tsx` (lines 125-170):

```tsx
        {/* 1. Horizontal Scrollable Hand Cards Track */}
        <div className="flex gap-2.5 overflow-x-auto py-2 px-1 pb-3 scrollbar-none shrink-0">
          {hand.length === 0 ? (
            <div className="flex h-36 w-full items-center justify-center rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400">
              ไม่มีไพ่ในมือ
            </div>
          ) : (
            hand.map((code, idx) => {
              const isSelected = selectedCode === code;
              const fullCard = getCardById(code);
              let demo: DemoCard | null = null;
              try {
                demo = getDemoCard(code);
              } catch {
                // Ignore
              }

              const cardType = fullCard?.type ?? demo?.type ?? 'action';
              const title = fullCard?.name_th ?? demo?.th ?? code;
              const desc = fullCard?.description_th ?? demo?.effect ?? '';
              const image = fullCard?.image;

              return (
                <div
                  key={`${code}-${idx}`}
                  className="shrink-0 transition-transform duration-150"
                  style={{
                    transform: isSelected ? 'translateY(-6px)' : undefined,
                  }}
                >
                  <Card
                    id={code}
                    type={cardType}
                    title={title}
                    description={desc}
                    image={image}
                    variant="hand"
                    selected={isSelected}
                    onClick={() => handleCardClick(code)}
                    className="cursor-pointer shadow-xs hover:shadow-md"
                  />
                </div>
              );
            })
          )}
        </div>
```

Replace it with:

```tsx
        {/* 1. Overlapping Hand Cards Track (fanned like real cards in hand) */}
        <div className="flex overflow-x-auto py-2 pl-1 pr-8 pb-3 scrollbar-none shrink-0">
          {hand.length === 0 ? (
            <div className="flex h-36 w-full items-center justify-center rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400">
              ไม่มีไพ่ในมือ
            </div>
          ) : (
            hand.map((code, idx) => {
              const isSelected = selectedCode === code;
              const fullCard = getCardById(code);
              let demo: DemoCard | null = null;
              try {
                demo = getDemoCard(code);
              } catch {
                // Ignore
              }

              const cardType = fullCard?.type ?? demo?.type ?? 'action';
              const title = fullCard?.name_th ?? demo?.th ?? code;
              const desc = fullCard?.description_th ?? demo?.effect ?? '';
              const image = fullCard?.image;

              return (
                <div
                  key={`${code}-${idx}`}
                  className="shrink-0 transition-transform duration-150"
                  style={{
                    marginLeft: idx === 0 ? 0 : -44,
                    zIndex: isSelected ? 100 : idx,
                    transform: isSelected ? 'translateY(-14px)' : undefined,
                  }}
                >
                  <Card
                    id={code}
                    type={cardType}
                    title={title}
                    description={desc}
                    image={image}
                    variant="hand"
                    selected={isSelected}
                    onClick={() => handleCardClick(code)}
                    className="cursor-pointer shadow-xs hover:shadow-md"
                  />
                </div>
              );
            })
          )}
        </div>
```

What changed: dropped `gap-2.5` (overlap replaces spacing), widened right padding to `pr-8` so the last card's lift/shadow isn't clipped by the scroll container, added inline `marginLeft: -44` (≈1/3 of the 128px card width) on every card but the first, `zIndex: idx` so later cards sit on top of earlier ones, and `zIndex: 100` + a taller `translateY(-14px)` lift when a card is selected so it's unmistakably on top of its neighbors.

- [ ] **Step 2: Visually verify**

Run: `npm run dev`, create a room, start the game, tap "ดูไพ่ในมือ". Expected: the 3 starting cards overlap left-to-right (later cards on top), tapping any card lifts it clearly above its neighbors regardless of position, and the row still scrolls horizontally once the hand grows past screen width (draw a few cards via "จั่วไพ่" and re-check with ~6-8 cards in hand).

- [ ] **Step 3: Commit**

```bash
git add components/room/HandTrayModal.tsx
git commit -m "feat: overlap the hand tray cards into a fanned layout"
```

---

### Task 3: Fanned face-down card backs for opponents

**Files:**
- Modify: `components/room/PlayerDensityGrid.tsx`

**Interfaces:**
- Consumes: `player.hand.length` (already computed as `cardCount` in this file's render loop) — no new data needed.
- Produces: a new unexported `CardBackFan` component used only inside this file. No other file needs to change.

**Context:** The "Hand & Trap Counters" row (lines 159-182) currently shows only a `CardsIcon` + numeric badge for hand size. Add a small fanned stack of face-down card-back rectangles above/beside that badge, capped at 5 visible backs with a "+N" suffix beyond that — keep the existing numeric badge too (per the design spec, players still need the exact count to judge who's close to Muffin Time).

- [ ] **Step 1: Add the `CardBackFan` helper component**

In `components/room/PlayerDensityGrid.tsx`, insert this new function right after the `MASCOT_AVATARS` array (after line 20, before `export function PlayerDensityGrid`):

```tsx
function CardBackFan({ count }: { count: number }) {
  const maxShown = 5;
  const shown = Math.min(count, maxShown);
  const extra = count - shown;
  if (shown === 0) return null;

  return (
    <div className="flex items-center h-3.5 shrink-0" aria-hidden="true">
      <div className="relative h-3.5" style={{ width: `${10 + (shown - 1) * 5}px` }}>
        {Array.from({ length: shown }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 h-3.5 w-2.5 rounded-[2px] border border-white bg-gradient-to-br from-primary/80 to-primary shadow-2xs"
            style={{ left: `${i * 5}px`, zIndex: i }}
          />
        ))}
      </div>
      {extra > 0 && (
        <span className="ml-1 text-[7px] font-black text-ink-secondary">+{extra}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it above the existing counter badges**

Find this block (lines 159-182):

```tsx
              {/* Hand & Trap Counters */}
              <div className="flex items-center justify-center gap-1 w-full shrink-0">
                {/* Hand Count */}
                <div
                  title={`ไพ่ในมือ: ${cardCount} ใบ`}
                  className="flex items-center gap-0.5 rounded-sm bg-gray-100 px-1 py-0.2 text-ink"
                >
                  <CardsIcon className="h-2.5 w-2.5 text-primary/80" />
                  <span className="font-mono text-[8px] sm:text-[9px] font-black">{cardCount}</span>
                </div>

                {/* Active Trap Count */}
                <div
                  title={`กับดักที่วางอยู่: ${trapCount} ใบ`}
                  className={`flex items-center gap-0.5 rounded-sm px-1 py-0.2 ${
                    trapCount > 0
                      ? 'bg-trap/15 text-trap border border-trap/30'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <TrapIcon className="h-2.5 w-2.5" />
                  <span className="font-mono text-[8px] sm:text-[9px] font-black">{trapCount}</span>
                </div>
              </div>
```

Replace it with (adds the fan as its own row above the existing counters, keeping the counters unchanged):

```tsx
              {/* Face-down Card Back Fan (visual hand size, capped at 5 + "+N") */}
              <CardBackFan count={cardCount} />

              {/* Hand & Trap Counters */}
              <div className="flex items-center justify-center gap-1 w-full shrink-0">
                {/* Hand Count */}
                <div
                  title={`ไพ่ในมือ: ${cardCount} ใบ`}
                  className="flex items-center gap-0.5 rounded-sm bg-gray-100 px-1 py-0.2 text-ink"
                >
                  <CardsIcon className="h-2.5 w-2.5 text-primary/80" />
                  <span className="font-mono text-[8px] sm:text-[9px] font-black">{cardCount}</span>
                </div>

                {/* Active Trap Count */}
                <div
                  title={`กับดักที่วางอยู่: ${trapCount} ใบ`}
                  className={`flex items-center gap-0.5 rounded-sm px-1 py-0.2 ${
                    trapCount > 0
                      ? 'bg-trap/15 text-trap border border-trap/30'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <TrapIcon className="h-2.5 w-2.5" />
                  <span className="font-mono text-[8px] sm:text-[9px] font-black">{trapCount}</span>
                </div>
              </div>
```

- [ ] **Step 3: Visually verify**

Run: `npm run dev`, create a room with at least 4 players (bots auto-fill), start the game. Expected: every opponent tile shows a tiny fanned stack of face-down card backs (starts at 3 backs each, since `startGame` deals 3 cards per player) above the existing numeric badges, and the fan never overflows the tile even in dense grids (test with `maxPlayers` set to 8+ to see the smaller grid cells). Draw a few cards as a bot's turn passes and confirm the fan grows, capping visually at 5 with a "+N" once a hand exceeds 5.

- [ ] **Step 4: Commit**

```bash
git add components/room/PlayerDensityGrid.tsx
git commit -m "feat: show fanned face-down card backs for opponents"
```

---

## Self-Review Notes

- **Spec coverage:** "มือไพ่ผู้เล่นเอง — ต่อยอด HandTrayModal ที่มีอยู่แล้ว" → Task 2 (+ Task 1 for artwork, a small in-scope improvement the spec's status table flagged as already-existing-elsewhere but missing here). "การ์ดของเพื่อนคนอื่น — พัดหลังไพ่" → Task 3. Auth and Supabase-sync sections of the spec are covered by the two companion plans (`2026-09-01-supabase-auth-login.md`, `2026-09-01-supabase-multiplayer-sync.md`), not this one — this plan intentionally covers only the "การ์ดในมือ"/"การ์ดของเพื่อน" sections, per the scope split recommended during planning (visuals are independent of the auth/sync work and should ship first).
- **Placeholder scan:** none — every step has complete before/after code.
- **Type consistency:** `CardBackFan`'s only prop (`count: number`) matches `cardCount` (`player.hand?.length ?? 0`, already a `number`) at the call site. `Card.tsx`'s `renderImageSlot` signature (`(isCompact = false) => JSX.Element`) is unchanged — Task 1 just calls it, doesn't modify it.
