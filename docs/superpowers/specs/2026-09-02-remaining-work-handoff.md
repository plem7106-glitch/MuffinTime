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

## Status: 157/173 Action cards implemented

Implemented cards live in `game/actionRules/definitions.ts` as a big object literal keyed
by card code (`A001`, `A037`, etc). Each entry is an `ActionRuleDefinition`
(`game/actionRules/types.ts`) — the declarative registry pattern this whole subsystem
follows (mirrors the sibling `game/trapRules/` for Trap cards, which a collaborator built
independently).

## Branch state — start here, don't branch from `main`

- Work so far is on `feature/birthday-cards`, forked from `main`. **Not merged, no PR opened
  yet as of the 153/173 checkpoint (tip `a4a6d5f`)** — a later commit on this same branch
  added A135/A023/A024/A027 (157/173) plus `RoomState.pendingWinChecks` (see Group 2 below);
  check `git log` for the current tip before assuming this file is fully in sync with it.
- `main` only has 150/173 cards. This branch adds A037/A066/A137 (birthday-comparison cards,
  `PlayerState.birthdayMMDD`) and A135/A023/A024/A027 (`RoomState.pendingWinChecks`,
  `ActionRuleDefinition.needsNumberInput`). **Branch your next work off `feature/birthday-cards`,
  not `main`**, or you'll be missing that infrastructure and these 7 extra cards.
- When your work is done and tests pass: open a PR from your branch **into `main`**
  (not into `feature/birthday-cards` — that one should get its own PR/merge first, or get
  merged as part of yours if you fold it in). Use `git push` and the PR-creation URL GitHub
  prints, or `gh pr create` if the `gh` CLI is available in your environment (it wasn't in
  the session that wrote this doc — no `GITHUB_TOKEN` either, so PR status was checked via
  raw `curl` against `https://api.github.com/repos/plem7106-glitch/MuffinTime/pulls`).
- Before pushing anything: `git fetch origin && git log --oneline main..origin/main` to
  check nothing new landed on `main` since you branched.
- Last known-good check on this branch (at the 157/173 checkpoint): `npx vitest run` → 520
  passed, `npx tsc --noEmit` → clean. Run both again before you start — confirm your baseline.

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

## What's next — 16 cards left, 3 groups

### Group 2 (4 cards left, data-collection, no deep engine work) — do these next

**Done (157/173 checkpoint):** A135, A023, A024, A027. See `game/actionRules/definitions.ts`
(search "A135", "A023/A024/A027"), `game/types.ts`'s `PendingWinCheck`, `game/turn.ts`'s
`resolvePendingWinChecks` (wired into `lib/session.tsx`'s `advanceAndCheckWin`), and
`components/modals/NumberInputModal.tsx`. A135 added `ActionRuleDefinition.needsNumberInput`
(mirrors `needsTodayDate`). A023/A024/A027 added `RoomState.pendingWinChecks`, consumed
exactly once — on the actor's own next turn — by `resolvePendingWinChecks`; A024/A027 ties
resolve as a one-shot no-op (not the physical game's "try again" redraw) — a deliberate scope
simplification, not a silent assumption, flagged here for whoever reviews the PR.

Relevant schema today: `RoomState` (`game/types.ts:146`) has `muffinTimeTarget: number`,
`globalRestrictions?: GlobalRestriction[]`, `pendingWinChecks?: PendingWinCheck[]`,
`players: Record<PlayerId, PlayerState>`. `PlayerState` (`game/types.ts:109`) has `hand`,
`traps`, `birthdayMMDD?`. Neither has anything for "who suggested this game" or "drink
count" yet — you'll add fields for the two cards below.

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
