# Group 1 Cluster E: Draw-Pile Deferred Trigger (A064)

## Context

Group 1 was decomposed into 7 clusters during brainstorming (see the handoff doc and
Cluster A's design spec for the full table). Clusters A, B, C, and G already shipped
(merged into `main` via PR #4 as of commit `43d0d40`). This spec covers **Cluster E**: a
single, standalone card, `A064` "เปลือกกล้วย" (Banana Peel) — "Put this card in the deck
face-up. Whoever draws it keeps it and discards 3 other cards."

The remaining 5 Group 1 cards (clusters F, D) are out of scope for this spec and this
implementation pass. Confirmed order for the rest of Group 1: E (this spec) → F → D.

## Why this looked harder than it is

The classification doc originally flagged this as needing "a hook inside `draw()`
(`game/pile.ts`), the most-called primitive in the game" and grouped it with the riskiest
Phase 2 batch. That's still true — the hook is real — but closer inspection shows it needs
**zero new `RoomState`/`PlayerState` fields**, because `data/cards.json`'s `action` array
lists each code exactly once and `buildCanonicalDeck()` builds the real 231-card deck from
it 1:1 — there is only ever **one physical copy of A064 in the whole game**. That removes
the need to track *which* card is "the planted one" anywhere: the check inside `draw()` can
just compare the literal card code `'A064'`, and the "where is it currently sitting"
question is already fully answered by wherever `drawPile`/`discardPile`/hands already put
it — no separate position-tracking state to add, update, or forget to reset.

**Update (post final-review fix wave):** "only one physical copy exists" answers card
*identity* (which card code to match on) but not whether that copy is currently *armed*
(planted) — a genuinely separate question the original pass conflated. The final review
caught that `draw()`'s hook fired on `card === 'A064'` alone, which also fires the very
first time A064 is drawn straight out of the initial shuffled deck, before anyone has ever
played it — contradicting the card's own text, which only penalizes drawing the *planted*
copy. The fix adds exactly one new field, `RoomState.bananaPeelArmed?: boolean`: set `true`
by A064's own `executeEffect` when it plants the card into `drawPile`, read (and cleared
back to `false`) by `draw()`'s hook when it pops the planted copy back out, and reset to
`false` in `startGame`, `resetForPlayAgain`, and `restartGame` alongside the other
per-game/per-match reset fields (next to `actionRedirect = null` in each). So the "zero new
fields" framing above was wrong in the way described here — one boolean field was in fact
necessary, for arming state rather than position tracking.

**Update (post final-review fix wave):** `executeEffect` originally located A064 by
assuming it sat exactly on top of `discardPile` (`discardPile[discardPile.length - 1]`) and
silently no-oped otherwise. That assumption is unsafe: an automatic-state trap (e.g.
T45/T46/T09) can push its own card onto `discardPile` between A064 being discarded and its
`executeEffect` actually resolving, leaving A064 buried rather than on top and causing the
plant to silently fail. The fix uses `discardPile.lastIndexOf('A064')` to find the single
physical copy anywhere in the pile and splice it out from there, rather than assuming
position.

## Rulings confirmed with the user (not resolved by card text alone)

- **Insertion position**: random, matching the existing precedent already in this codebase
  — A043 "เอากลับเข้าไปแล้ว" (`game/actionRules/definitions.ts`) already does an inline
  random-position insert into `drawPile` the same way. A064 reuses the same technique.
- **"หงายหน้า" (face-up)**: no new UI. Confirmed with the user as flavor text, not an
  engine or presentation requirement — this project has **no existing mechanism anywhere**
  that announces which card a player just drew (checked: no hits for any "you drew X"
  event/toast in `game/events.ts` or `lib/presentation/`), so building one here would be
  new UI work disproportionate to what the card needs, the same kind of scope call already
  made for A056's card-picker deferral. If a future card needs real draw-announcement UI,
  that's a separate scoping decision, not blocked or precluded by this one.
- **"discards 3 other cards" is a random selection, not player-chosen**: matches the broad
  existing convention across most "discard N cards" Action cards in this codebase that
  don't have a dedicated card-picker UI (e.g. the discard side of A057/A061/A151/A152/A162
  and others) — the drawer doesn't get to choose which 3 cards go.

## Approach

### A064's `executeEffect` (new entry, `game/actionRules/definitions.ts`)

By the time `executeEffect` runs, the played card is already sitting at the top of
`discardPile` (every Action play discards the card there before resolving — see
`game/turnFlow.ts`'s `applyActionRedirect`, unchanged by this cluster). A064's own effect
is just: pop it off `discardPile` and splice it into `drawPile` at a random position —
identical in shape to A043's existing inline splice, `Math.random()` called directly. This
is an already-established pattern in this file, not a purity violation to fix: `A007`
"ปุ่มปริศนา" (coin flip) already calls `Math.random()` directly inside its own
`executeEffect` for the same reason — genuine randomness cards in this codebase are not
required to thread an injectable `rng` through `executeEffect` (that requirement is
specific to the `needsX`/real-world-input flags, e.g. `needsTodayDate`, which stamp their
input from the UI *before* the frame is pushed — A064 has no such flag and needs none).

```ts
A064: {
  code: 'A064', name_en: 'Banana Peel', name_th: 'เปลือกกล้วย',
  description_th: 'ใส่ไพ่ใบนี้กลับเข้าไปในกองจั่วโดยหงายหน้า ผู้เล่นที่จั่วเจอจะเก็บไพ่ใบนี้ไว้และต้องทิ้งไพ่อื่น 3 ใบ',
  kind: 'auto',
  executeEffect: (state) => {
    const next = cloneState(state);
    if (next.discardPile[next.discardPile.length - 1] !== 'A064') return next;
    next.discardPile.pop();
    const pos = Math.floor(Math.random() * (next.drawPile.length + 1));
    next.drawPile.splice(pos, 0, 'A064');
    return next;
  },
},
```

The top-of-discard-pile check is defensive, matching the existing style of `if (!targetId)
return state;`-shaped guards elsewhere in this file. It does have one real (not just
theoretical) no-op path: if A040 "ฉันชอบมัน!" (Cluster A, `RoomState.actionRedirect`) is
active when A064 is played, the played card is redirected into A040's target's hand
instead of `discardPile` — A064's own "plant into the deck" effect then correctly no-ops
(the card just becomes a normal card in that player's hand, a legitimate outcome of A040
intercepting *any* Action's post-play destination, not specific to A064) rather than
planting the wrong card or throwing. Noted here as a checked cross-cluster interaction, not
a silently-unhandled gap.

### `draw()`'s new hook (`game/pile.ts`)

```ts
export function draw(state: RoomState, playerId: PlayerId, n: number, _rng?: Rng): RoomState {
  let next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.pop()!;
    next.players[playerId].hand.push(card);
    if (card === 'A064') {
      next = discardOthersAfterBananaPeel(next, playerId);
    }
  }
  return next;
}

/**
 * A064 "เปลือกกล้วย": whoever draws it keeps it (already true -- draw()'s own
 * push above puts it in their hand) and discards 3 other cards, chosen at
 * random, excluding A064 itself. Only one physical copy of A064 exists in
 * the whole 231-card deck, so excluding it by card code is exact -- no
 * index-tracking needed. Clamps to however many other cards they actually
 * have (0-3) rather than throwing if they hold fewer than 3 others.
 */
function discardOthersAfterBananaPeel(state: RoomState, playerId: PlayerId): RoomState {
  const hand = state.players[playerId].hand;
  const others = hand.filter((code) => code !== 'A064');
  const count = Math.min(3, others.length);
  const indices = pickRandomIndices(others.length, count, Math.random);
  const toDiscard = indices.map((i) => others[i]);
  return discard(state, playerId, count, toDiscard);
}
```

`draw()` already has an unused `_rng?: Rng` parameter (underscore-prefixed, never read) —
left untouched here rather than wired up, since `discardOthersAfterBananaPeel` calling
`Math.random()` directly matches the established convention above (A007/A043), and wiring
`_rng` through would be a second, unrelated change to a function called from dozens of call
sites for no behavior this card needs. `pickRandomIndices` and `discard` are both already
imported in `game/pile.ts` (`discard` is defined in the same file; `pickRandomIndices`
already imported from `./util`).

The hook fires **the same way regardless of what caused the draw** — a player's own manual
draw, another card's forced multi-draw (e.g. A052 "cause a player to draw N"), a bot's
draw, all funnel through this one function. This is the entire reason the hook belongs in
`draw()` itself rather than only in `lib/session.tsx`'s `drawCard` handler (which only
covers a player's own manual draw) — no separate ruling needed, it's a direct consequence
of where the classification doc already said the hook has to live.

### Interaction with `restartGame` (A092) — checked, not a gap

`game/room.ts`'s `restartGame` pools `drawPile` + `discardPile` + every hand + every trap
into one array and reshuffles it into a fresh `drawPile` (see its existing implementation).
Since A064 has no separate position-tracking field, a planted-but-undrawn A064 is just
wherever it happens to sit in one of those piles at the moment `restartGame` fires — it
gets swept into the pool and reshuffled like every other card, with zero special-casing
needed. Verified directly against the current `restartGame` body rather than assumed.

## Testing plan

- `game/pile.test.ts`: `draw()` — drawing a card that isn't `'A064'` behaves unchanged
  (regression, matches existing tests). Drawing `'A064'` specifically: card lands in the
  drawer's hand (kept), and exactly `min(3, otherCardsInHandBeforeDraw)` other cards are
  removed from their hand and land in `discardPile` — covering both the normal case (≥3
  other cards) and the clamp case (0-2 other cards, e.g. drawing A064 as literally your
  first card). A064 itself is never one of the 3 discarded (assert it's still in hand
  after). A multi-card `draw(state, id, 3)` call that happens to include A064 partway
  through still triggers the discard exactly once, using the hand as it stands *after*
  A064 was added (not stale).
- `game/actionRules/definitions.test.ts`: A064's `executeEffect` — moves the card from the
  top of `discardPile` into `drawPile` (assert `discardPile` no longer contains it and
  `drawPile`'s length grew by 1 and now contains it — not the exact position, matching the
  existing test convention for other `Math.random()`-based cards like A007's coin flip,
  which asserts the *set* of valid outcomes rather than the exact random result).
- `game/cardInvariant.test.ts`: a card-conservation check (using the existing
  `assertCardConservation` infrastructure, already used for exactly this kind of "did any
  card get lost/duplicated" verification) across a played-A064 → drawn-by-someone-else →
  discard-3-others sequence, and separately through `restartGame` with A064 sitting
  mid-`drawPile` at the time.

## Out of scope

- Clusters F, D (the remaining 5 Group 1 cards) — separate specs, separate implementation
  passes.
- Any draw-announcement/reveal UI — deliberately deferred per the ruling above; a future
  card that needs it is a new, separate scoping decision.
