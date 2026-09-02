# Group 1 Cluster G: Mid-Game Full Reset (A092)

## Context

Group 1 was decomposed into 7 clusters during brainstorming (see the handoff doc and
Cluster A's design spec for the full table). Clusters A (persistent per-player/table
flags) and B (turn-order mutation, A119) already shipped. This spec covers **Cluster G**:
a single, standalone card, `A092` "ฉันบ้าไปแล้ว!" (I'm Crazy!) — a full mid-game restart.

- **A092** "ฉันบ้าไปแล้ว!": "นำไพ่ทั้งหมดกลับเข้ากอง สับไพ่ แล้วเริ่มเกมใหม่ทั้งหมด" — put
  all cards back into the deck, shuffle, then restart the entire game.

The remaining 8 Group 1 cards (clusters C, D, E, F) are out of scope for this spec and
this implementation pass.

## Why this is a different shape from `resetForPlayAgain`

`game/room.ts` already has `resetForPlayAgain`, but it requires `status === 'finished' |
'ended'` — it's for starting a brand-new match after one has concluded, transitioning back
to `'lobby'` so the host can adjust seating before a fresh `startGame`. A092 fires **mid-
game** (`status === 'playing'`), as an immediate card effect, and the game should stay
`'playing'` throughout — no detour through `lobby`/`setup`. It's structurally closer to
`startGame`, except `startGame` fetches a **fresh canonical deck** via
`buildCanonicalDeck()`, while A092's text is explicit that it's the game's own
**currently-in-play cards** — every hand, every placed trap, the discard pile, whatever's
left in the draw pile — that get pooled and reshuffled. No external card-list parameter is
needed; the function is a pure transformation of the state it's given.

## Rulings confirmed with the user (not resolved by card text alone)

- **Turn order after restart**: goes back to `seatOrder[0]` (matching `startGame`'s own
  convention) — not the actor who played A092. Confirmed over the alternative (actor goes
  first).
- **`muffinTimeTarget`**: resets to the default `10`, even if A135 "Time of Death" had
  changed it earlier in the game. Confirmed over preserving the changed value — "restart
  the entire game" reads as resetting the win condition too, not just the deck.
- **`gameSuggesterId`** (A118's target, host-picked during setup): **preserved**, not
  cleared. Confirmed as a real-world fact ("who suggested playing this physical game
  session") rather than in-game state — a mid-game card shouldn't change who actually
  suggested playing.

## Approach

### A justified refactor: `resetPlayerPerTurnFlags`

The 5-field per-turn `PlayerState` reset checklist (`placedTrapThisTurn`,
`hasDrawnThisTurn`, `hasPlayedActionThisTurn`, `bonusActionPlaysRemaining`,
`mustPlayActionThisTurn`) is currently duplicated three times: `beginTurn` (single
player), `startGame`'s all-players loop, and `resetForPlayAgain`'s per-player spread.
A092 needs this exact reset for every player a fourth time. Rather than write a fourth
copy — exactly the kind of drift Cluster A's final review flagged as a standing risk —
extract `resetPlayerPerTurnFlags(player: PlayerState): void` in `game/turn.ts`, and have
`beginTurn`, `startGame`, `resetForPlayAgain`, and the new `restartGame` all call it.

### `restartGame` (new, `game/room.ts`)

```ts
export function restartGame(state: RoomState, rng: Rng = Math.random): RoomState {
  if (state.status !== 'playing') return cloneState(state);
  const next = cloneState(state);
  const playerIds = Object.keys(next.players);

  // "นำไพ่ทั้งหมดกลับเข้ากอง" -- pool every card currently anywhere in the
  // game (not a fresh canonical deck).
  const pool: CardCode[] = [...next.drawPile, ...next.discardPile];
  for (const pid of playerIds) {
    pool.push(...next.players[pid].hand, ...next.players[pid].traps);
  }
  next.drawPile = shuffle(pool, rng);
  next.discardPile = [];

  const seatOrder =
    next.seatOrder && next.seatOrder.length === playerIds.length && next.seatOrder.every((id) => next.players[id])
      ? next.seatOrder
      : playerIds;
  next.seatOrder = [...seatOrder];
  next.turnOrder = [...seatOrder];
  next.direction = next.playDirection === 'counterclockwise' ? -1 : 1;

  for (const pid of playerIds) {
    next.players[pid].hand = [];
    next.players[pid].traps = [];
    next.players[pid].hasCalledMuffinTime = false;
    next.players[pid].skipNextTurn = false;
    resetPlayerPerTurnFlags(next.players[pid]);
  }
  for (const pid of next.turnOrder) {
    for (let i = 0; i < 3; i++) {
      next.players[pid].hand.push(next.drawPile.pop()!);
    }
  }

  next.currentTurnIndex = 0;
  next.muffinTimeTarget = 10;
  next.winnerId = undefined;
  next.finishReason = undefined;
  next.gameEndReason = undefined;
  next.winnerPlayerIds = undefined;
  next.finalHandCounts = undefined;
  next.globalRestrictions = [];
  next.pendingWinChecks = [];
  next.pendingActionObligations = undefined;
  next.actionRedirect = null;
  next.reactionStack = [];
  next.pendingResponse = null;
  next.pendingInteraction = null;
  next.lastResult = null;
  next.isShufflingDrawPile = false;
  next.shuffleSequence = 0;
  next.placedTrapMeta = {};
  next.pendingForcedDiscards = {};
  next.roundNumber = 1;
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;

  const firstPlayerId = next.turnOrder[0];
  return beginTurn(next, firstPlayerId);
}
```

**Preserved, deliberately untouched**: `hostId`, `joinOrder`, `maxPlayers`,
`gameSuggesterId` (per the ruling above), `playDirection`, and every `PlayerState` field
not listed above — `name`, `connected`, `birthdayMMDD`. These are room/social/identity
facts, not in-game state, and a mid-game restart shouldn't touch them, matching how
`startGame` itself never touches `hostId`/`maxPlayers` either.

**`gameEvents` (the activity-feed log added by `main`'s "Trap and card" commit,
`lib/presentation/`) is deliberately left untouched** — out of scope for this card. It's a
presentational audit trail with no bearing on game correctness, and this design doesn't
have enough context on how the newly-merged presentation layer consumes it to safely
decide whether "append a restart marker" or "clear it" is the right call. Flagged here
rather than silently assumed either way; a follow-up can revisit if the presentation layer
turns out to need it addressed.

### `executeEffect` (A092's card definition)

```ts
A092: {
  code: 'A092', name_en: "I'm Crazy", name_th: 'ฉันบ้าไปแล้ว!', kind: 'auto',
  description_th: 'นำไพ่ทั้งหมดกลับเข้ากอง สับไพ่ แล้วเริ่มเกมใหม่ทั้งหมด',
  executeEffect: (state) => restartGame(state),
},
```

No `frame` fields are read (no target, no custom payload) — this is a table-wide effect
with no manual input needed, `kind: 'auto'`, no new `needsX` flag, no new UI wiring.
Matches A035's existing precedent of omitting the unused `frame` parameter entirely
(`executeEffect: (state) => {...}`) rather than declaring and ignoring it.

### Safety with the reaction-stack, following Cluster B's precedent

Like A119, this `executeEffect` mutates `reactionStack` (clearing it to `[]`) while it is
itself still the top frame on that same stack, mid-resolution. Cluster B's design spec and
review already established this is safe: `popStackFrame` (called immediately after
`executeActionFrameEffect` returns, inside `lib/session.tsx`'s `resolveCompletedStackFrames`)
early-returns harmlessly when the stack is already empty
(`if (!next.reactionStack || next.reactionStack.length === 0) { ...; return { state: next }; }`),
so it never tries to pop a frame that A092 already cleared away. This is the same
mechanism, not a new pattern — see A119's `executeEffect` for the precedent.

## Testing plan

- `game/room.test.ts`: `restartGame` — happy path (pools drawPile + discardPile + every
  hand + every trap, reshuffles, deals 3 fresh cards per player, resets `turnOrder` to
  `seatOrder[0]`-first, `muffinTimeTarget` to 10, clears win/end-of-game fields,
  `globalRestrictions`/`pendingWinChecks`/`pendingActionObligations`/`actionRedirect`/
  reaction-stack fields/`placedTrapMeta`/`pendingForcedDiscards`), preserves `hostId`/
  `joinOrder`/`maxPlayers`/`gameSuggesterId`/`birthdayMMDD`/`connected`/`name`, no-op
  outside `'playing'` status.
- **Card-conservation check, using the existing `game/cardInvariant.ts` infrastructure**
  (`inspectCardConservation`/`assertCardConservation`, already used for exactly this kind
  of "did any card get lost, duplicated, or corrupted" verification elsewhere in this
  codebase — see `game/cardInvariant.test.ts`): assert conservation holds before and after
  `restartGame`, including with cards already in a placed-trap state (which A092 explicitly
  pools back in) and mid-resolution reaction-stack metadata.
- `game/turn.test.ts`: `resetPlayerPerTurnFlags` — a light direct test if it's simple
  enough to warrant one on its own, plus confirm `beginTurn`'s existing tests still pass
  unchanged after the extraction (a pure refactor of already-tested code).
- `game/room.test.ts`: spot-check `startGame` and `resetForPlayAgain`'s existing test
  suites still pass unchanged after they're switched to call `resetPlayerPerTurnFlags`
  instead of their inline lists.
- `game/actionRules/definitions.test.ts`: A092's `executeEffect` — confirms it delegates
  to `restartGame` (a thin wrapper test, since `restartGame` itself is where the real
  coverage lives).
- No new UI/component tests — `kind: 'auto'` with no `needsX` flags needs no new modal or
  local state machine; existing UI already handles a plain no-target action.

## Out of scope

- Clusters C, D, E, F (the other 8 Group 1 cards) — separate specs, separate
  implementation passes.
- `gameEvents`/activity-feed handling on restart (flagged above as a deliberate, documented
  simplification, not a silent gap).
