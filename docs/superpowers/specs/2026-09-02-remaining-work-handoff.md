# Handoff — Action Card Effects (2026-09-02)

Quick resume note. Full classification/reasoning lives in
`docs/superpowers/specs/2026-09-02-action-card-classification.md` — this file is just
"where did I leave off and what's next."

## Status

**153/173 Action cards implemented** (`game/actionRules/definitions.ts`).

## Branch state

- Working branch: `feature/birthday-cards`, forked from `main`, fully pushed to origin
  (`eeef0e3`, clean tree, nothing local ahead of remote).
- Not merged yet, no PR opened yet. GitHub's auto-suggested PR URL:
  https://github.com/plem7106-glitch/MuffinTime/pull/new/feature/birthday-cards
- Contains: A037/A066/A137 (birthday cards + `PlayerState.birthdayMMDD` schema + date
  inputs on create/join screens) + the lobby birthday badge (`WaitingRoom.tsx`).
- Last known-good check: `npx vitest run` → 502 passed, `npx tsc --noEmit` → clean.

## What's next — 20 cards left, 3 groups

**Group 2 (6 cards, data-collection, no deep engine work) — do these next:**
- `A135` — probably easiest: `changeMuffinTarget` game logic already exists, just needs a
  numeric-input UI to let the player pick the new win-target count.
- `A023, A024, A027` — same mechanic family: a win/lose condition checked *later*, at the
  actor's next turn (extreme hand size at a future checkpoint), not immediately when played.
  Needs a scheduled/pending-check hooked into `turn.ts`'s win-check (`checkWinnerAtTurnStart`
  or equivalent) — do these 3 together, one PR.
- `A118` — needs "who suggested playing this game" captured once at room setup (no field for
  this yet anywhere — decide where it's collected: room creation form, like birthday).
- `A158` — needs a live per-player drink-count tally (no such counter exists in `RoomState`
  or `PlayerState` yet — decide schema before implementing).

**Group 1 (13 cards, needs core turn/engine changes — untouched, do after Group 2):**
A017, A028, A035, A040, A064, A091, A092, A094, A100, A108, A119, A126, A130 — each needs
something beyond a single `executeEffect` (recursive resolution, turn-economy exceptions,
action-history log, multi-hop delegated targeting, full game reset, etc). See the
classification doc's "Phase 2" table for per-card reasoning — this needs its own plan, not a
quick batch.

**Group 3 (1 card, blocked on a rules question):**
`A166` "หมดแก้วเร็วก็รวย" — Thai/English card text doesn't say who draws the 3 cards (the
chooser or the chosen). Needs a human ruling against the physical rulebook before writing it,
not a guessed default.

## Known gap noted, not yet built

No UI to edit a player's birthday after first entry (same shape as the existing
"no sign-out, mistyped name is stuck" gap in `CLAUDE.md`). Not blocking, just flagged.
