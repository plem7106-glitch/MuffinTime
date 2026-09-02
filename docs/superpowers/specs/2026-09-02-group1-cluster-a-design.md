# Group 1 Cluster A: Persistent Per-Player/Table Flags (A100, A035, A040)

## Context

Group 1 (per `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`) is the last
13 unimplemented Action cards, each needing something beyond a single `executeEffect` —
i.e. a real engine change, not just a UI picker. It's too large for one spec, so it's
decomposed into 7 clusters by shared mechanism (see that handoff doc's table). This spec
covers **Cluster A only**: the three cards whose engine needs are closest to
infrastructure already built for Group 2 (`RoomState.pendingWinChecks`,
`GlobalRestriction`) — lowest risk, done first.

- **A100** "โรงงานมัฟฟิน" (Muffin Factory): "คุณสามารถเล่น Action เพิ่มอีก 2 ใบในเทิร์นนี้"
  — play 2 additional Action cards this turn.
- **A035** "ออกมาเล่นกันเถอะ" (Come Out to Play): "ในเทิร์นถัดไป ผู้เล่นทุกคนที่มี Action
  อยู่ในมือต้องเล่น Action" — on their own next turn, every player who holds an Action
  card must play one.
- **A040** "ฉันชอบมัน!" (I Love It!): "Action 3 ใบถัดไปที่ถูกเล่น เมื่อใช้เสร็จแล้วจะเข้ามา
  อยู่ในมือคุณแทนที่จะลงกองทิ้ง" — the next 3 Action cards played by *anyone* at the
  table enter the actor's hand instead of the discard pile.

The remaining 10 Group 1 cards (clusters B–G) are out of scope for this spec and this
implementation pass.

## Rulings confirmed with the user (not guessable from card text alone)

- **A035 enforcement**: on an obligated player's turn, if they hold ≥1 Action card, they
  are **hard-blocked from ending their turn** until they play one — not merely an honor-
  system reminder. If they hold zero Action cards, they are exempt and play proceeds
  completely normally (no special UI for the exempt case — flagged and confirmed with the
  user as an acceptable simplification, since it has no gameplay consequence).
- **A035 scope**: the obligation applies to **every player at the table**, each on their
  own individual next turn (not just whoever's turn is immediately next) — the same
  "your own next turn" framing established by A023/A024/A027.
- **A040 scope**: the redirect counts the next 3 Action plays by **anyone** at the table,
  not just the actor's own subsequent plays.

## Approach

Extend the two patterns already built for Group 2 (`RoomState.pendingWinChecks` for
per-player scheduled checks, simple per-turn `PlayerState` flags for temporary state)
rather than building a shared "turn modifier" abstraction. These three cards don't share
trigger conditions (turn-start vs. play-attempt vs. discard-time) or expiry rules
(per-turn vs. per-player-next-turn vs. count-of-3-plays), so a unified dispatcher would be
solving a generalization problem these three cards don't actually have. Folding them into
the existing `GlobalRestriction` type was also considered and rejected: that type's
lifecycle is specifically "cleared when play returns to `sourcePlayerId`"
(`advanceTurn`'s existing rule), which doesn't fit A040's play-count-based expiry.

## Data model

```ts
// PlayerState (game/types.ts) — both reset every turn, same spot advanceTurn already
// clears hasDrawnThisTurn/hasPlayedActionThisTurn/placedTrapThisTurn
interface PlayerState {
  // ...existing fields...
  /** A100: extra Action plays available this turn, beyond the normal 1. */
  bonusActionPlaysRemaining?: number;
  /** A035: this player is obligated to play an Action before ending their
   * current turn (set only when resolvePendingActionObligations finds them
   * holding at least one Action card at their obligated turn's start). */
  mustPlayActionThisTurn?: boolean;
}

// RoomState (game/types.ts)
interface RoomState {
  // ...existing fields...
  /** A035: player IDs still owed an obligation check on their own next turn.
   * Consumed exactly once per player by resolvePendingActionObligations,
   * mirroring PendingWinCheck/resolvePendingWinChecks's lifecycle. */
  pendingActionObligations?: PlayerId[];
  /** A040: an active "next N action plays redirect to my hand" effect.
   * null/undefined when inactive. Cleared when remaining hits 0. */
  actionRedirect?: { toPlayerId: PlayerId; remaining: number } | null;
}
```

## A100 flow

1. `executeEffect(state, frame)`: `next.players[frame.actorId].bonusActionPlaysRemaining =
   (current ?? 0) + 2`.
2. `lib/session.tsx`'s `playAction` gate changes from
   `if (player?.hasPlayedActionThisTurn) return state;` to allow a play when
   `bonusActionPlaysRemaining > 0` even though `hasPlayedActionThisTurn` is already true.
3. After a successful play: if the play consumed a bonus slot, decrement
   `bonusActionPlaysRemaining` (leave `hasPlayedActionThisTurn` as `true`, unchanged);
   otherwise set `hasPlayedActionThisTurn = true` as today (first play of the turn).
4. `advanceTurn` resets `bonusActionPlaysRemaining` to `undefined`/`0` alongside the other
   per-turn flags — unused bonus plays don't carry over.
5. UI: `HandTrayModal`'s existing "คุณใช้แอ็กชันประจำเทิร์นแล้ว" (already-used-your-action)
   banner's guard condition changes to also check `bonusActionPlaysRemaining <= 0`, so it
   only shows once bonus plays are exhausted too.

## A035 flow

1. `executeEffect(state, frame)`: adds every current player ID to
   `state.pendingActionObligations` (deduped — a player already queued doesn't get a
   second entry from a repeated A035 play).
2. New `game/turn.ts` function `resolvePendingActionObligations(state, currentId)`,
   structurally a sibling of `resolvePendingWinChecks`: called from `lib/session.tsx`'s
   `advanceAndCheckWin`, same call site as the other pending-check resolvers. On a match
   for `currentId`: removes them from `pendingActionObligations`; if their hand contains
   ≥1 card where `getCardById(code)?.type === 'action'` **and** no `no_actions`
   `GlobalRestriction` is active table-wide (checked the same unscoped way
   `playAction`'s existing gate does: `globalRestrictions?.some((r) => r.type ===
   'no_actions')`, no `sourcePlayerId` filtering), sets `mustPlayActionThisTurn = true`.
   No flag set (silently exempt) otherwise — this check exists specifically to avoid a
   soft-lock: without it, a player obligated by A035 while a `no_actions` restriction
   (from A019/A072/A085) is active table-wide could never legally play an Action and
   would be permanently unable to end their turn.
3. `lib/session.tsx`'s `endTurn` gains a new guard:
   `if (player?.mustPlayActionThisTurn && !player.hasPlayedActionThisTurn) return state;`
4. UI (`GameTable.tsx`): a persistent amber banner, matching the existing per-turn-status
   banner style, reading "ต้องเล่น Action ก่อนจบเทิร์นนี้ (A035)" whenever
   `mustPlayActionThisTurn && !hasPlayedActionThisTurn`; the "จบเทิร์น" button stays
   disabled (via the same `canEndTurn` computation) until they comply.
5. `advanceTurn` resets `mustPlayActionThisTurn` to `undefined`/`false` alongside the
   other per-turn flags once the turn ends (whether satisfied or, if exempt, never set).
6. Residual soft-lock risk, intentionally not specially handled: if a player's last Action
   card gets stolen/discarded by another player's effect mid-turn *after* their obligation
   already set `mustPlayActionThisTurn = true` (checked once, at their turn's start), they
   could be stuck unable to comply. This is the same class of stuck-game scenario the
   existing host-only `hostSkipTurn` (`emergencyForceSkipTurn`) escape hatch already exists
   to cover — see CLAUDE.md's "Known gaps" section — so no bespoke handling is added here.

## A040 flow

1. `executeEffect(state, frame)`: `next.actionRedirect = { toPlayerId: frame.actorId,
   remaining: 3 }` — overwrites any existing redirect (only one realistically active at a
   time; replaying A040 just refreshes the counter to a fresh 3, no stacking).
2. `lib/session.tsx`'s `playAction`, at the existing line
   `const afterDiscard = discard(state, actorId, 1, [code]);`: before that call, check
   `state.actionRedirect`. If active (`remaining > 0`), push the played card directly into
   `actionRedirect.toPlayerId`'s hand instead of discarding it, and decrement `remaining`
   (clearing the redirect to `null` at 0). Otherwise, `discard` proceeds exactly as today.
3. Applies to any player's play (per the confirmed ruling above) — the check lives in the
   single shared `playAction` path, no per-card special-casing.
4. A040's own card discard (the moment it's played) happens via this same code path
   *before* `executeEffect` runs and activates the redirect — so A040 itself is
   unaffected by its own redirect, matching physical intuition ("the next 3 *after* this
   one").

## Testing plan

- `game/actionRules/definitions.test.ts`: A100/A035/A040 `executeEffect` happy paths, plus
  edge cases — A040 overwriting an existing redirect, A035 deduping repeated obligations
  for an already-queued player.
- `game/turn.test.ts`: `resolvePendingActionObligations` — mirrors
  `resolvePendingWinChecks`'s existing test shape (consume-once, hand-with-Action vs.
  hand-without-Action, no matching entry).
- `lib/session.tsx` has no existing test file (it's glue code, confirmed by its absence
  elsewhere in this codebase) — the `playAction`/`endTurn` gate changes and the
  `actionRedirect` discard-interception are exercised only indirectly through the
  `game/`-layer tests above, consistent with how Group 2's `advanceAndCheckWin` wiring
  was handled.
- No new UI/component tests — matches this codebase's existing convention (zero component
  test files exist anywhere in the project).

## Out of scope

- Clusters B–G (the other 10 Group 1 cards) — separate specs, separate implementation
  passes.
- Any generalized "turn modifier" system — explicitly rejected above as premature
  abstraction for 3 cards with unrelated lifecycles.
