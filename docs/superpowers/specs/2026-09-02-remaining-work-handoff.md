# Handoff — Action Card Effects (2026-09-02)

**For a fresh AI agent picking this up with zero prior context.** Read this whole file
before touching code — it's written to be self-contained. Deeper per-card reasoning for
all 173 cards lives in `docs/superpowers/specs/2026-09-02-action-card-classification.md`;
this file only covers what's left and how to build it.

## What this project is

Muffin Time: a Thai-language web port of a physical party card game (Next.js App Router +
React + TypeScript + Supabase). Full project context is in `CLAUDE.md` at the repo root —
read it first, it's short. `data/cards.json` is the ground-truth card list/text; never
invent or rephrase a card's effect, only what's written there.

## Status: 153/173 Action cards implemented

Implemented cards live in `game/actionRules/definitions.ts` as a big object literal keyed
by card code (`A001`, `A037`, etc). Each entry is an `ActionRuleDefinition`
(`game/actionRules/types.ts`) — the declarative registry pattern this whole subsystem
follows (mirrors the sibling `game/trapRules/` for Trap cards, which a collaborator built
independently).

## Branch state — start here, don't branch from `main`

- Work so far is on `feature/birthday-cards`, forked from `main`, fully pushed to origin
  (tip `a4a6d5f` at time of writing). **Not merged, no PR opened yet.**
- `main` only has 150/173 cards. This branch has 153/173 (adds A037/A066/A137, the
  birthday-comparison cards) plus a new `PlayerState.birthdayMMDD` schema field. **Branch
  your next work off `feature/birthday-cards`, not `main`**, or you'll be missing that
  infrastructure and the 3 extra cards.
- When your work is done and tests pass: open a PR from your branch **into `main`**
  (not into `feature/birthday-cards` — that one should get its own PR/merge first, or get
  merged as part of yours if you fold it in). Use `git push` and the PR-creation URL GitHub
  prints, or `gh pr create` if the `gh` CLI is available in your environment (it wasn't in
  the session that wrote this doc — no `GITHUB_TOKEN` either, so PR status was checked via
  raw `curl` against `https://api.github.com/repos/plem7106-glitch/MuffinTime/pulls`).
- Before pushing anything: `git fetch origin && git log --oneline main..origin/main` to
  check nothing new landed on `main` since you branched.
- Last known-good check on this branch: `npx vitest run` → 502 passed,
  `npx tsc --noEmit` → clean. Run both again before you start — confirm your baseline.

## How to implement a card (the pattern)

1. Look up the card's exact Thai/English text in `data/cards.json` (`action` array, search
   by `code`). Never guess effect text.
2. Pick an `ActionResolutionKind` (`game/actionRules/types.ts`): `'auto'` (no manual input
   needed once any target is already picked), `'roster_select'` (multi-pick from the
   player list), `'outcome_entry'` (someone enters a real-world result), `'no_op'`.
3. Write the `ActionRuleDefinition` object and add it to the exported object in
   `game/actionRules/definitions.ts`. `executeEffect: (state, frame) => RoomState` **must
   stay pure** — never call `new Date()`, `Math.random()` without an injectable `rng`
   param, etc. inside it. Any real-world input (today's date, a chosen winner, a roster of
   matching players) gets resolved in the UI *before* the frame is pushed, and read back out
   of `frame.customPayload` via a small typed accessor (see `todayFromFrame`,
   `rosterIdsFromFrame`, `outcomeFromFrame`, `winnerIdFromFrame` in `types.ts`) — this keeps
   effects testable without mocking the clock or RNG.
4. Reuse existing primitives before writing new state-mutation logic:
   `game/primitives.ts` (`executeDraw`/`executeRandomSteal`/`executeAllRandomSteal`/etc.),
   `game/transfer.ts` (`stealRandom(state, fromId, toId, n, rng?)`, `swapHands`),
   `game/roster.ts` (loops over a multi-select roster), `game/turnFlow.ts`
   (`changeMuffinTarget(state, n)`, `skipTurn`, `reverseDirection`).
5. Best worked example to copy: **A037/A066/A137** at
   `game/actionRules/definitions.ts:997-1040` — shows the `needsTodayDate` flag pattern
   (stamping real-world input into the frame from `components/room/GameTable.tsx`'s
   `handlePlayActionDirect`), a shared helper (`soonestBirthdayPlayers`) reused across
   multiple cards, and respecting `GlobalRestriction`'s `no_win` type.
6. UI wiring already exists for every kind currently in use — you should not need new
   modal components for Group 2 below, except A135 (see its entry). Reference:
   `components/room/GameTable.tsx` reads `getActionRule(cardCode)` and branches on
   `needsRosterSelection` / `needsOutcomeEntry` / `needsTargetSelection` /
   `needsDualTargetSelection` / `needsTodayDate` before pushing the frame.
   `components/modals/TargetSelector.tsx` handles both single-select (`needsTargetSelection`)
   and multi-select (`needsRosterSelection`, pass `multiSelect` + optional `requiredCount`).
   `components/modals/OutcomeToggle.tsx` handles binary `needsOutcomeEntry` cases.
7. Add unit tests in `game/actionRules/definitions.test.ts` (there's a `describe` block per
   card family already — follow that structure) covering the happy path, the no-op/edge
   case, and (if relevant) the `GlobalRestriction` gate.
8. Verify: `npx vitest run --reporter=dot` and `npx tsc --noEmit`, both clean, before
   committing. Small focused commits, descriptive messages.

## What's next — 20 cards left, 3 groups

### Group 2 (6 cards, data-collection, no deep engine work) — do these next

Relevant schema today: `RoomState` (`game/types.ts:146`) has `muffinTimeTarget: number`,
`globalRestrictions?: GlobalRestriction[]`, `players: Record<PlayerId, PlayerState>`.
`PlayerState` (`game/types.ts:109`) has `hand`, `traps`, `birthdayMMDD?`. Neither has
anything for "who suggested this game" or "drink count" yet — you'll add fields.

- **`A135` "เวลาแห่งความตาย" — do this one first, it's the simplest.**
  Card text: "เปลี่ยนเงื่อนไขชนะของ Muffin Time จาก 10 ใบ เป็นจำนวนไพ่ที่คุณเลือก" (change
  the Muffin Time win target from 10 to a number you choose, for the rest of the game).
  `changeMuffinTarget(state, n)` already exists (`game/turnFlow.ts:16`) — the only new work
  is UI: no numeric-input modal exists yet (`components/modals/` has `TargetSelector` and
  `OutcomeToggle` but nothing for a free-form number). Add a `needsNumberInput?: boolean` +
  `numberInputPrompt?: string` pair to `ActionRuleDefinition` (mirror how `needsTodayDate`
  was added), a small new modal component, and wire it into `GameTable.tsx` the same way
  the others are wired. Pick sane min/max bounds for the input (e.g. 1–20) — the physical
  game has no stated limit, use judgment.

- **`A023`, `A024`, `A027` — same new mechanic, do together in one PR.**
  - A023 "ยิงฉันสิ": "หากถึงเทิร์นถัดไปของคุณแล้วยังมีไพ่เหลืออยู่ในมือ คุณชนะเกม" — if you
    (the actor) still have any cards in hand by your own next turn, you win.
  - A024 "จุดจบ": "เมื่อถึงเทิร์นถัดไปของคุณ ผู้เล่นที่มีไพ่ในมือน้อยที่สุดชนะ หากเสมอกัน
    ให้ลองใหม่" — at the actor's next turn, whoever has the fewest cards wins; if tied, no
    winner this time ("try again" in the physical game means redraw/replay the card later —
    treating a tie as a one-shot no-op instead of re-scheduling is a scope simplification;
    confirm this reading is acceptable before shipping, or design the re-trigger if not).
  - A027 "เหลือเวลาอีก 1 ปี": same as A024 but *most* cards wins instead of fewest.
  - None of these resolve immediately when played — they all need a **scheduled check** that
    fires specifically when the *actor's own* next turn starts (not the very next player's
    turn, unless the actor is also the next player). No such mechanism exists yet. Design:
    add `RoomState.pendingWinChecks?: Array<{ sourcePlayerId: PlayerId; type:
    'hand_nonempty' | 'fewest_hand' | 'most_hand' }>` (or similar — your call on exact
    shape), push an entry in each card's `executeEffect`, and evaluate it in
    `lib/session.tsx`'s `advanceAndCheckWin` (`lib/session.tsx:120`) right alongside the
    existing `checkWinnerAtTurnStart(advanced, currentId)` call — that function already runs
    exactly once per turn transition, checking whether `currentId === advanced turnOrder[currentTurnIndex]`
    matches any pending check's `sourcePlayerId`, evaluating it, and removing it from the
    array (consume-once) is the natural hook point. Respect `GlobalRestriction`'s `no_win`
    type the same way `checkWinnerAtTurnStart` does (`game/turn.ts:146`).

- **`A118` "ไอเดียใครเนี่ย?"**: "ขโมยไพ่ 3 ใบจากผู้เล่นที่เป็นคนเสนอให้เล่นเกมนี้" — steal 3
  cards from whoever suggested playing this game. Needs a one-time fact captured somewhere
  before/at game start (no players exist yet at room-creation time, so it can't be collected
  the same way as birthday — the natural point is the host's "start game" action in
  `components/room/WaitingRoom.tsx`'s `handleStartGame`, once the roster is full, asking the
  host to pick who suggested the game from the joined players). Add
  `RoomState.gameSuggesterId?: PlayerId`. Effect itself is trivial once that field exists:
  `stealRandom(state, state.gameSuggesterId, frame.actorId, 3)` guarded by
  `state.gameSuggesterId` being set and a valid player.

- **`A158` "ตาสว่างยามเมา"**: "ถ้าคุณยังไม่ได้ดื่มเลยในรอบนี้ ขโมยไพ่ 3 ใบจากผู้เล่นที่ดื่มมาก
  ที่สุด" — if you haven't drunk this round, steal 3 from whoever has drunk the most. Needs a
  live per-player drink counter that does not exist anywhere in `RoomState`/`PlayerState`
  today, and — more importantly — **no existing mechanism increments a drink count at all**
  (several other cards' text mentions drinking, e.g. A139/A145, but none of them track it
  numerically; they're currently implemented as pure card-draw/discard effects with the
  drinking treated as unmodeled flavor text). Adding real tracking here means deciding: does
  *every* card that mentions drinking now need to increment this counter too (bigger,
  cross-cutting change), or does this one card get its own narrow self-contained counter
  that only it reads/writes? The narrow option is far less work and matches how the rest of
  the "drinking" flavor text has been treated so far — recommended, but flag the tradeoff
  to whoever's directing this work rather than silently picking.

### Group 1 (13 cards, needs core turn/engine changes — untouched)

`A017, A028, A035, A040, A064, A091, A092, A094, A100, A108, A119, A126, A130`. Each needs
something beyond a single `executeEffect`: recursive resolution, turn-economy exceptions,
an action-history log, multi-hop delegated targeting, a full game reset, or a hook inside
`draw()` (`game/pile.ts`), the most-called primitive in the game. Full per-card reasoning
in the classification doc's "Phase 2" table. This is its own planning effort — don't start
it casually inside a Group 2 PR; it likely wants a `superpowers:brainstorming` +
`superpowers:writing-plans` pass of its own given the engine-level surface area.

### Group 3 (1 card, blocked on a rules question)

`A166` "หมดแก้วเร็วก็รวย" — the Thai and English card text both fail to say who draws the 3
cards (the player who chooses, or the player who gets chosen). This is a genuine rules
ambiguity in the source text, not a missing primitive — get a ruling from whoever owns the
physical rulebook before writing it. Do not guess a default.

## Known gap, not yet built (unrelated to the above)

No UI to edit a player's birthday after first entry — same shape as the existing "no
sign-out, a mistyped display name is permanently stuck" gap already documented in
`CLAUDE.md`. Not blocking, just flagged in case someone wants a settings-modal fix later.
