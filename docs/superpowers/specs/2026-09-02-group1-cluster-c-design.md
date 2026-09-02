# Group 1 Cluster C: 2-Hop Delegated Targeting (A126, A130)

## Context

Group 1 was decomposed into 7 clusters during brainstorming (see the handoff doc and
Cluster A's design spec for the full table). Clusters A (persistent per-player/table
flags), B (turn-order mutation, A119), and G (mid-game full reset, A092) already shipped.
This spec covers **Cluster C**: two cards where the actor's target then makes a further
choice mid-resolution, before the card's effect is known.

- **A126** "มือปืน" (Gunman): "เลือกผู้เล่นอีก 1 คนให้เป็นมือปืน จากนั้นผู้เล่นคนนั้นต้อง
  เลือกผู้เล่นคนใดก็ได้ 1 คนให้ทิ้งไพ่ทั้งหมดในมือ" — choose another player to be a
  gunman; that player then chooses any player to discard their entire hand.
- **A130** "เลื่อนตำแหน่ง" (Promotion): "เลือกผู้เล่น 1 คน ให้ผู้เล่นคนนั้นเลือกไพ่ของตัวเอง
  1 ใบแล้วมอบให้ผู้เล่นอีก 1 คน" — choose a player; that player picks one of their own
  cards and gives it to another player.

The remaining 6 Group 1 cards (clusters D, E, F) are out of scope for this spec and this
implementation pass.

## Why this needs real engine work

Every existing `ActionRuleDefinition` pattern (`needsTargetSelection`,
`needsDualTargetSelection`, `needsTodayDate`, etc.) has the **actor** decide everything
before the card is even played — the choice is stamped into the frame's `customPayload`
by the UI, then `executeEffect: (state, frame) => RoomState` reads it back out and stays a
pure function of what's already decided. Both Cluster C cards break that: a **second
player**, not the actor, has to make a choice after the card has already resolved onto
them, and nothing decides that choice up front.

## Rulings confirmed with the user (not resolved by card text alone)

- **A126**: the gunman (Player 1) may target **any player except themselves** — including
  the original actor. Matches how every other "pick a player" card in this codebase
  already excludes self-targeting; nothing in the text protects the actor specifically.
- **A130**: Player 1 (not the original actor) picks **both** which card to give and who
  receives it — matches the English text's "their choice" framing, and mirrors A126's
  shape where the delegated player drives their own step.
- **A130's card choice**: Player 1 does **not** get a UI to pick a specific card — the
  card given is chosen **at random** from their hand. This follows the existing precedent
  set by A056 (`game/actionRules/definitions.ts`), which hit the identical need ("pick a
  specific card from your own hand") and deliberately punted for the same reason: no
  "pick one card from your hand" UI component exists anywhere in this codebase yet, and
  building one is out of scope for a single card. Player 1 only picks the recipient.

## Approach: extend `RoomState.pendingInteraction`, not the reaction stack

The codebase already has a mechanism for "pause the game and let one specific non-actor
player decide something": `RoomState.pendingInteraction`, currently used only by T10's
date-invite trap (`game/trapRules/engine.ts`'s `initiateTrapInteraction`/
`respondToTrapInteraction`). It is already wired into every place that matters:

- `game/turn.ts`'s `canEndTurn` blocks while it's set
- `lib/session.tsx`'s `drawCard`/`playAction` both no-op while it's set
- `lib/session.tsx`'s `hostSkipTurn` → `emergencyForceSkipTurn` already clears it (the
  "unstick a stuck game" escape hatch works for free, no new gap to document)
- `components/room/PresentationBridge.tsx` already renders a "waiting on X" banner keyed
  off it

Two alternatives were considered and rejected:

- **A nested `StackFrame` using `eligibleResponderIds`/`responses`** (the reaction-stack's
  own response mechanism): that system is built for Counter-card responses ("does anyone
  want to cancel this effect"), not "make a targeting choice that determines what the
  effect even does." Reusing it would mean overloading `PlayerResponseStatus` and touching
  the reaction-stack's core resolution loop — exactly the surface area Cluster D (the
  hardest cluster) was deliberately split out to own. Cluster C staying clear of it keeps
  the two clusters independent.
- **A new, separate `RoomState` field** (e.g. `pendingDelegatedChoice`): cleaner typing,
  but every guard listed above would need a matching second check added — a duplicate-gap
  risk of exactly the shape the handoff doc has flagged repeatedly for this project.
  Extending `pendingInteraction` needs zero changes to any of those call sites.

**Both cards turn out to need the identical interaction shape** once the rulings above are
applied: "Player 1 picks one other player, excluding themselves." Only the resolution
differs. So this is one new interaction `type`, one new modal wiring, and two small
`executeEffect` bodies — not two separate mechanisms.

### `game/actionRules/delegatedTargetPick.ts` (new)

```ts
import { cloneState } from '../util';
import { discard } from '../pile';
import { stealRandom } from '../transfer';
import type { RoomState, PlayerId, StackFrame, Rng } from '../types';

/**
 * Pauses resolution and hands the choice to frame.targetIds[0] (the player
 * the actor already picked) -- called from inside executeEffect, so it must
 * stay pure: the interactionId is derived from frame.frameId (already
 * unique) rather than Date.now()/Math.random(), and timestamp is a
 * placeholder -- nothing reads PendingInteraction.timestamp today (it's a
 * T10-only, write-only field).
 */
export function initiateDelegatedTargetPick(state: RoomState, frame: StackFrame, prompt: string): RoomState {
  const next = cloneState(state);
  const targetPlayerId = frame.targetIds[0];
  if (!targetPlayerId || !next.players[targetPlayerId]) return next;
  next.pendingInteraction = {
    interactionId: `interact-${frame.frameId}`,
    type: 'delegated_target_pick',
    sourceCardCode: frame.sourceCode,
    initiatorId: frame.actorId,
    targetPlayerId,
    prompt,
    timestamp: 0,
  };
  return next;
}

/**
 * Resolves a pending delegated_target_pick once the delegated player has
 * chosen. Branches on sourceCardCode for the two different outcomes; both
 * currently in this cluster share the same pick shape (one other player).
 */
export function resolveDelegatedTargetPick(
  state: RoomState,
  interactionId: string,
  responderId: PlayerId,
  chosenTargetId: PlayerId,
  rng: Rng = Math.random
): RoomState {
  const next = cloneState(state);
  const interaction = next.pendingInteraction;
  if (!interaction || interaction.interactionId !== interactionId) return next;
  if (interaction.type !== 'delegated_target_pick') return next;
  if (interaction.targetPlayerId !== responderId) {
    throw new Error('only the delegated player can respond to this choice');
  }
  if (!next.players[chosenTargetId]) return next;

  const delegatedPlayerId = interaction.targetPlayerId;
  next.pendingInteraction = null;

  if (interaction.sourceCardCode === 'A126') {
    return discard(next, chosenTargetId, next.players[chosenTargetId].hand.length);
  }
  if (interaction.sourceCardCode === 'A130') {
    if (next.players[delegatedPlayerId].hand.length === 0) return next;
    return stealRandom(next, delegatedPlayerId, chosenTargetId, 1, rng);
  }
  return next;
}
```

No self-target engine guard: nothing in this cluster reaches a "live predicate" hazard the
way A119's turn-transition did (Cluster B's documented reason for an engine-level guard
there). Self-exclusion is enforced the same way every other single-target card in this
codebase enforces it — the candidate list the picker UI offers — matching existing
precedent (e.g. A016's `TargetSelector` candidates already exclude the actor with no
engine-level check inside `executeEffect`).

### Card definitions (`game/actionRules/definitions.ts`)

```ts
A126: {
  code: 'A126', name_en: 'Gunman', name_th: 'มือปืน',
  description_th: 'เลือกผู้เล่นอีก 1 คนให้เป็นมือปืน จากนั้นผู้เล่นคนนั้นต้องเลือกผู้เล่นคนใดก็ได้ 1 คนให้ทิ้งไพ่ทั้งหมดในมือ',
  kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้เป็นมือปืน',
  executeEffect: (state, frame) =>
    initiateDelegatedTargetPick(state, frame, 'คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ'),
},
A130: {
  code: 'A130', name_en: 'Promotion', name_th: 'เลื่อนตำแหน่ง',
  description_th: 'เลือกผู้เล่น 1 คน ให้ผู้เล่นคนนั้นเลือกไพ่ของตัวเอง 1 ใบแล้วมอบให้ผู้เล่นอีก 1 คน',
  kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่น 1 คน',
  executeEffect: (state, frame) =>
    initiateDelegatedTargetPick(state, frame, 'คุณได้รับเลื่อนตำแหน่ง! เลือกผู้เล่นที่จะได้รับไพ่ 1 ใบจากคุณ (สุ่มเลือกให้)'),
},
```

Step 1 (the actor picking Player 1) is the existing `needsTargetSelection` flow — no new
UI for that half.

### `game/types.ts`

`PendingInteraction.type` is already `'date_invite' | string`, so no type-signature change
is strictly required, but the union gets `'delegated_target_pick'` added explicitly for
discoverability (a one-line doc-clarity change, not a behavior change).

### `lib/session.tsx`

Add `respondToDelegatedTargetPick`, mirroring the existing `respondToTrapInteraction`
wiring exactly (same `useCallback` shape, same `run()` call, same place in the returned
context object):

```ts
const respondToDelegatedTargetPick = useCallback(
  (interactionId: string, chosenTargetId: PlayerId) =>
    run((state) => engineResolveDelegatedTargetPick(state, interactionId, myPlayerId!, chosenTargetId)),
  [run, myPlayerId]
);
```

### `components/room/GameTable.tsx`

One new `TargetSelector` instance, gated the same way `DateInviteModal` is gated today
(gate on `pendingInteraction.type` *and* `targetPlayerId === myPlayerId`, so it renders
only on the delegated player's own client):

```tsx
<TargetSelector
  open={Boolean(
    state.pendingInteraction?.type === 'delegated_target_pick' &&
    state.pendingInteraction.targetPlayerId === myPlayerId
  )}
  candidates={allPlayerCandidatesExcept(myPlayerId)}
  selectedId={delegatedPickChoice}
  onSelect={setDelegatedPickChoice}
  onConfirm={() => {
    if (state.pendingInteraction) {
      respondToDelegatedTargetPick(state.pendingInteraction.interactionId, delegatedPickChoice!);
      setDelegatedPickChoice(null);
    }
  }}
  prompt={state.pendingInteraction?.prompt ?? ''}
/>
```

No `onCancel` is passed — see the `TargetSelector` change below. `allPlayerCandidatesExcept`
is whatever existing helper already builds a same-shaped candidate list for other
`TargetSelector` usages (e.g. `opponentCandidates`), just keyed off `myPlayerId` instead of
the actor, since here the *viewer* is the one choosing, not the actor whose turn it is.

### `components/modals/TargetSelector.tsx`

`onCancel` becomes optional; the "ยกเลิก" button and the `BottomSheet`'s scrim-dismiss are
omitted when the caller doesn't pass one. There is no valid "cancel" for this interaction —
the card has already been played and discarded, and the game is blocked on this exact
choice — so a visible Cancel button that does nothing would be actively misleading at the
one moment a player's input is required to unstick the table. This is a backward-compatible
prop change (every existing caller keeps passing `onCancel` and is unaffected).

## Testing plan

- `game/actionRules/delegatedTargetPick.test.ts` (new): `initiateDelegatedTargetPick` —
  sets `pendingInteraction` correctly from a frame, no-ops on a missing/invalid
  `targetIds[0]`. `resolveDelegatedTargetPick` — A126 branch (chosen target's hand fully
  discarded, `pendingInteraction` cleared), A130 branch (exactly one card moves from the
  delegated player to the chosen target, chosen via injectable `rng` for a deterministic
  test), A130 no-op when the delegated player's hand is empty, throws on a responder who
  isn't the delegated player, no-ops on a stale/mismatched `interactionId` or an unknown
  `chosenTargetId`.
- `game/actionRules/definitions.test.ts`: A126 and A130 entries — confirm `executeEffect`
  sets up the interaction with the right `sourceCardCode`/`targetPlayerId`/prompt from a
  frame (thin wrapper tests; the real coverage is in `delegatedTargetPick.test.ts`).
- `game/turn.test.ts` / existing `canEndTurn` tests: no new tests needed — this reuses the
  existing `pendingInteraction` guard, already covered for T10.
- No new tests needed for `drawCard`/`playAction`/`hostSkipTurn` guards — same reasoning,
  already covered generically via `pendingInteraction`, not per-`type`.
- `components/modals/TargetSelector.test.tsx` (if one exists, else skip): confirm the
  Cancel button doesn't render when `onCancel` is omitted, existing callers unaffected.

## Out of scope

- Clusters D, E, F (the remaining 6 Group 1 cards) — separate specs, separate
  implementation passes.
- A real "pick one card from your own hand" UI component — deliberately deferred per the
  A130 ruling above; if a later card needs it, that's a new, separate scoping decision
  (same precedent-setting note A158 left for future drink-tracking cards).
- Bot-driven (`bot-*`) rooms: consistent with Cluster A's documented, accepted gap, bot
  play isn't specifically exercised against this new interaction type. If a bot ever played
  A126/A130, the resulting `pendingInteraction` would still correctly block every human
  guard listed above (drawing, playing, ending turn) until resolved or until the host uses
  the unstick button — not a new gap, just not actively tested here.
