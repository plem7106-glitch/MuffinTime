# Handoff — Group 1 Cluster F (A091), paused mid final-review fix loop

**For a fresh AI agent picking this up with zero prior context.** Read this whole file
before touching code. Project context (stack, game rules) is in `CLAUDE.md` at the repo
root — read it first. This cluster's own design/plan docs:
`docs/superpowers/specs/2026-09-03-group1-cluster-f-design.md` and
`docs/superpowers/plans/2026-09-03-group1-cluster-f.md`.

## What this is

Implementing Action card `A091` "ฉันเป็นหมอ" (draw N cards, N = cards stolen/forced-discarded
from you since your last turn) via `superpowers:subagent-driven-development`, following the
8-task plan above. **All 8 tasks are done and individually reviewed clean.** The final
whole-branch review then found real bugs; **one fix wave for those bugs has already been
applied and committed**, but has **not yet been through its required scoped re-review**.
That re-review is the next action — do not skip it, do not treat the fix wave as final
without it.

## Branch state

- Branch `feature/group1-cluster-f`, forked from `main` at `a9e1c85`. **9 commits ahead of
  `origin/feature/group1-cluster-f`, not pushed.** Working tree clean.
- `HEAD` is `946e73d` "fix: correct forcedLossSinceLastTurn reset timing and close remaining
  tracking gaps" — this IS the final-review fix-wave commit, already landed.
- Last verified test run (by the fix-wave implementer, in its own report — not independently
  re-verified by a reviewer yet): `855 passed (855) / 61 files`, `npx tsc --noEmit` clean.
  855 = 847 (all-8-tasks baseline) + 8 new tests from the fix wave. Re-run both yourself
  before doing anything else — confirm this hasn't drifted.

## SDD workspace (all artifacts for this plan)

`.superpowers/sdd/2026-09-03-group1-cluster-f/` (git-ignored). Key files:

- `progress.md` — **the ledger. Read this in full**, especially the
  `FINAL WHOLE-BRANCH REVIEW` section at the bottom and everything after it. It records
  all 8 tasks' completions, two items from Task 6/7 review that were later corrected/refined
  by the final review (read the `I1 CORRECTION` entry — an earlier ledger entry about
  `game/group.ts` was wrong, don't act on it, the correction supersedes it), and the full
  final-review findings (C1 critical, C2 critical, I1 correction, I2 important, I3, I4,
  minors) with the exact reasoning for why they had to be fixed together in one wave.
- `final-fix-report.md` — the fix-wave implementer's full report: what changed for C1/C2/I2/I4,
  file:line references, the deliberate skip-edge-case decision it made and documented, why it
  used the general `finalizeForcedDiscard` fix for I2 rather than an A099-only patch (with a
  caller audit table), test evidence including a discrimination check (stashed the fix, reran
  the new tests against the old code, confirmed all 10 fail), and two forward-looking concerns
  (see "Known residual risk" below).
- `review-*.diff` files — one per task's reviewed diff, plus the final whole-branch review's
  diff (`review-a9e1c85..4975d8b.diff`, base..head *before* the fix wave — i.e. what the final
  reviewer actually reviewed).
- `task-N-brief.md` / `task-N-report.md` for all 8 tasks, if you need per-task detail.

## What's actually left (in order)

1. **Generate a review package for the fix-wave diff and dispatch ONE scoped re-review.**
   This is `subagent-driven-development`'s final-review fix-loop step, not yet done:
   ```
   scripts/review-package docs/superpowers/plans/2026-09-03-group1-cluster-f.md 4975d8bda76e42892a12f5f1125ab267aed285ef 946e73d
   ```
   (base = `4975d8b`, the commit the final reviewer actually reviewed; head = `946e73d`, the
   fix-wave commit). Dispatch the re-review using
   `superpowers:subagent-driven-development`'s `re-review-prompt.md` template, model per that
   skill's Model Selection guidance (this fix touched turn-transition semantics across 6 call
   sites plus 3 other cards — judgment-heavy, use a standard-or-above model). Give the
   re-reviewer: the original final-review findings list (from the ledger), the fix report, and
   the diff. It should verdict each finding ADDRESSED or NOT ADDRESSED and flag any new
   Critical/Important breakage introduced by the fix itself.
2. **Adjudicate.** Per the skill: this was round 1 of the *final-review* fix loop, which gets
   exactly one fix wave and one scoped re-review — no second wave. If the re-review comes back
   clean, done. If it finds residual issues, park non-load-bearing ones with a ruling in the
   ledger (final review's own findings, not a fresh whole-branch review); anything load-bearing
   surfaces to the human partner via `finishing-a-development-branch`, per the skill — don't
   silently loop further.
3. **If clean (or cleanly parked):** delete this plan's workspace
   (`rm -rf .superpowers/sdd/2026-09-03-group1-cluster-f`) — git history is the record from
   there. Then use `superpowers:finishing-a-development-branch` to decide how this branch gets
   integrated (PR, direct merge, etc. — ask the human, branch is not pushed yet).

## Known residual risk (already surfaced by the fix-wave implementer, not yet acted on)

From `final-fix-report.md`'s own "Concerns" section — worth relaying to the re-reviewer
explicitly, not fixing unprompted:

1. The ~19 single-target-selection cards (A029, A115, A077, etc.) still rely entirely on
   `components/room/GameTable.tsx`'s `opponentCandidates` UI filter to guarantee
   `targetId !== actorId` — no game-logic-level enforcement. Pre-existing, out of scope for
   this cluster, but the fix wave's own author notes it's now "slightly more load-bearing":
   with the new `finalizeForcedDiscard` self-source guard, the *discard* family degrades safely
   if this UI guarantee is ever violated (just stops tracking); the *steal* family
   (`forceSteal`) has no equivalent guard and would incorrectly track a self-target as forced.
2. Counter cards C14/C37 now pass the countering player as `sourcePlayerId` into
   `finalizeForcedDiscard`. If the counter system is ever extended to let a player counter
   their own Action, that self-discard would (correctly, per the self-inflicted rule) stop
   being tracked — a behavior change with no current test coverage, because no test exercises
   self-countering today.

Neither blocks the re-review from passing; both are candidates for a Minor/deferred note in
the final ledger entry, same as the other pre-existing architectural notes already parked
there (`stealRandomTrapToHand`'s hardcoded count-of-1, `stealAllActionCards`' length-vs-splice
counting).

## After this cluster ships

Per the earlier `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md` (now itself
partly stale — Cluster E and F have since landed/are landing; trust this file and `git log`
over that one for current status): the last piece of Group 1's Action-card backlog is
**Cluster D — A017, A028, A094, A108** (recursive/forced card resolution, touches the
reaction-stack engine surface). Explicitly called the hardest remaining cluster, saved for
last on purpose. Not started. No spec/plan doc exists for it yet — needs the full
brainstorming → design spec → plan → subagent-driven-development flow used for every other
cluster, branched fresh off `main` *after* this cluster (F) is merged in.

## A live background agent may still be mid-flight

At the moment this handoff was written, a fix-wave implementer subagent (dispatched from a
different Claude Code session than whichever one picks this up) had already committed `946e73d`
and written `final-fix-report.md` in full, but had not yet sent its final short-form status
reply in that original session. Its work is complete and captured above regardless — you do
not need to wait for or chase that notification. If you are resuming in the *exact same*
session that dispatched it, the notification may still arrive; it carries no new information
beyond what's already in `final-fix-report.md`.
