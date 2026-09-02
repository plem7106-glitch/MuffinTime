# Action Card Classification (173 cards)

Source of truth: `data/cards.json`'s `"action"` array (A001–A173, contiguous, no gaps, no
duplicate codes — verified by direct grep/count, 2026-09-02). This supersedes CLAUDE.md's
stale "138 Action cards" figure — see the plan this doc was written for
(`docs/superpowers/plans/` reference: "ระบบจัดการเอฟเฟกต์ไพ่ Action") for the full
architecture this classification feeds into (`game/actionRules/`).

A001–A138 is the original 138-card base set. A139–A173 is a 35-card party/drinking
expansion appended later — same schema, and every expansion card fits an existing pattern
group below (no new pattern exists only in the expansion).

Each group lists: a short mechanic label, the implementation `kind` (per
`game/actionRules/types.ts`'s `ActionResolutionKind`), the full card code list, 2–3
representative examples, and what a digital implementation needs.

`kind` values: `auto` (no manual input beyond an already-resolved target), `roster_select`
(multi-select checklist of players), `outcome_entry` (manual result entry: winner/pass-fail/
vote), `no_op` (zero card-state change).

---

## Family A — Condition-filtered player selection ("all players matching X") — kind: `roster_select`

**A1. All players matching a fuzzy/self-report/physical condition draw N cards** — 8 cards
Codes: A001, A002, A011, A065, A069, A098, A138, A139
- A001 "ผิดบ้านแล้ว!" — "ผู้เล่นทุกคนที่ไม่ได้อาศัยอยู่ที่นี่ จั่วไพ่คนละ 2 ใบ"
- A069 "หมวกเท่จัง" — "ผู้เล่นทุกคนที่สวมหมวก จั่วไพ่คนละ 3 ใบ"
- A139 "หมดแก้ว!" — "ผู้เล่นทุกคนที่ยังดื่มไม่หมดแก้วในมือ ดื่มให้หมด แล้วจั่วไพ่คนละ 1 ใบ"
Needs: multi-select roster where the active player marks who matches, then fixed-N draw
applied to each selected (`rosterDraws`).

**A2. All players matching a fuzzy condition discard N cards** — 6 cards
Codes: A012, A013, A042, A068, A102, A131
- A012 "หมวกสวยนะ" — "ผู้เล่นทุกคนที่สวมหมวก ทิ้งไพ่คนละ 3 ใบ"
- A068 "แพ้แมว" — "ผู้เล่นทุกคนที่เลี้ยงแมว ทิ้งไพ่คนละ 2 ใบ"
- A131 "สายรุ้ง" — "เลือกสีของสายรุ้ง 1 สี ผู้เล่นทุกคนที่สวมใส่สีนั้นทิ้งไพ่คนละ 1 ใบ"
Needs: same roster select, discard variant (`rosterDiscards`).

**A3. Steal 1 card from every player matching a fuzzy condition** — 3 cards
Codes: A081, A103, A111
- A081 "เฮ้ เธอเป็นนางฟ้าเหรอ?" — "ขโมยไพ่ 1 ใบจากผู้เล่นผู้หญิงทุกคน"
- A111 "แขนงู" — "ขโมยไพ่ 1 ใบจากผู้เล่นผู้ชายทุกคน"
- A103 "ไม่นะ ลามะ ไม่!" — "ขโมยไพ่ 1 ใบจากผู้เล่นทุกคนที่ขับรถไม่เป็น"
Needs: roster select, active player gains 1 card from each selected (`rosterStolenBy`).

**A4. All players matching a fuzzy condition skip their turn** — 1 card
Codes: A089 — "ฉันเคยเป็นวัว" — "ผู้เล่นทุกคนที่กินเนื้อสัตว์ ข้ามเทิร์นถัดไป"
Needs: roster select + skip-turn primitive (`rosterSkipTurn`).

---

## Family B — Unconditional "everyone" effects — kind: `auto`

**B1. All players draw N cards, unconditional (ritual flavor)** — 3 cards
Codes: A145, A168, A171 — e.g. A145 "เมตตารอบนี้" — "ทุกคนดื่ม 1 อึกพร้อมกัน แล้วจั่วไพ่คนละ 1 ใบ"
Needs: `everyoneDraws(state, n, [])`.

**B2. All/all-other players discard N cards, unconditional** — 2 cards
Codes: A008, A099 — A008 "ปาชีส!" — "ผู้เล่นคนอื่นทั้งหมดทิ้งไพ่คนละ 1 ใบ"
Needs: `everyoneDiscards(state, n, [actorId])` or `[]` depending on card.

**B3. Steal 1 card from every other player, unconditional** — 2 cards
Codes: A005, A121 — **not the same resolver**: A005 "พวกถูกทิ้ง" has an extra step (keep 1,
discard the rest) that A121 "เย้! คุกกี้!" does not have — implement as two separate
`executeEffect`s even though both start from `executeAllRandomSteal`.
Needs: `executeAllRandomSteal`.

**B4. Self + all-other-players draw different fixed amounts in one resolution** — 2 cards
Codes: A132, A159 — A132 "เลเวลอัป!" — "คุณจั่วไพ่ 2 ใบ ผู้เล่นคนอื่นทั้งหมดจั่วคนละ 1 ใบ"
Needs: `executeDraw(actorId, 2)` + `everyoneDraws(1, [actorId])`.

---

## Family C — Self-only effects — kind: `auto`

**C1. Self draws a fixed N cards, unconditional** — 3 cards: A097, A101, A155
**C2. Self discards own chosen cards (fixed N or free choice)** — 2 cards: A056, A127
**C3. Self draws N cards equal to a counted/tracked game-state value** — 2 cards: A004, A091
  A004 "จักรวาลคู่ขนาน" = current hand size (trivial, implemented). A091 "ฉันเป็นหมอ" moved to
  Phase 2 (§Grand total reconciliation) — see there for why.

---

## Family D — Single-target direct effects (choose exactly one other player) — kind: `auto`

**D1. Steal N cards from ONE chosen opponent, simple/unconditional** — 5 cards
Codes: A029, A077, A112, A141, A144 — **judgment call**: A141/A144 pair a drink dare with
"then steal" with no explicit success/fail clause in either language; treated as
unconditional steal (see ambiguity list in the plan) — confirm before implementing.

**D2. Steal from ONE opponent with an extra selection/filter step** — 2 cards: A051, A120
(A051 reveals hand then pick 1; A120 filters by card type first)

**D3. Cause ONE chosen player to draw N cards** — 3 cards: A052, A124, A140

**D4. Single target discards a fixed partial N cards** — 3 cards: A038, A039, A041

**D5. Single target discards ALL cards of a category (hand / Action / Counter)** — 4 cards
Codes: A016, A045, A093, A123

**D6. Single target skips their turn** — 2 cards: A018, A047

**D7. Give own cards (voluntarily) to ONE chosen player — not a steal** — 4 cards
Codes: A060, A079, A082, A107

**D8. Hand off THIS specific action card to another player** — 4 cards
Codes: A049, A078, A125, A164 — the *card instance being played* transfers, not a generic
hand card.

---

## Family E — Dare / challenge / social-judgment — needs a live human verdict

**E1. Skill/luck contest; real-world winner draws N** — kind: `outcome_entry` (reuse
`TargetSelector`, prompt = "ใครชนะ") — 5 cards: A006, A067, A096, A114, A160

**E2. Single-target dare/guess/fact-check; success favors the ACTIVE player** — kind:
`outcome_entry` (`TargetSelector`, prompt = "ทำสำเร็จไหม") — 7 cards: A033, A062, A105,
A136, A147, A149, A170 — A105 steals ALL of a type, not a fixed N.

**E3. Single-target dare; failure/refusal → TARGET discards N** — kind: `outcome_entry` — 5
cards: A057, A061, A151, A152, A162

**E4. Active player performs for the group; verdict → self draw/discard** — kind:
`outcome_entry` (new `OutcomeToggle`, binary) — 2 cards: A148, A150

**E5. 2–3 chosen players compete, group-judged; loser(s) discard N** — kind: `outcome_entry`
(new `RosterSelector` to pick the competitors, then `TargetSelector`/`RosterSelector` again
for the loser(s)) — 3 cards: A146, A157, A165 (A165 picks 3, not 2)

**E6. All players do a simultaneous/ongoing challenge; straggler(s) discard N** — kind:
`outcome_entry` (`RosterSelector` for who lost — usually 1 but could be more) — 5 cards:
A083, A104, A134, A143, A163

**E7. Whole group votes/collectively decides a target; target discards N** — kind:
`outcome_entry` (reuse `TargetSelector`, prompt = "ใครโดนโหวต" — no real vote-tally UI
needed, the active player enters the already-physically-decided result) — 2 cards: A142, A173

**E8. Single target offered a choice; one branch has a card effect** — kind: `outcome_entry`
(new `OutcomeToggle`, binary) — 2 cards: A153, A167

**E9. Purely social/physical action, zero card-state change** — kind: `no_op` — 4 cards:
A128, A154, A161, A169

---

## Family F — Structural / seating & hand-redistribution — kind: `auto`

**F1. Structural neighbor-based effect** — 6 cards: A010, A080, A087, A110, A156, A172
(uses `seatOrder`/`turnOrder` for "left/right neighbor" — already exists on `RoomState`)
A172 needed its own primitive (`swapSeats`, exact-2 permutation, vs. `rotateSeatOrder`'s
whole-table shift) plus a `rosterSelectionCount` UI constraint (§types.ts) since it swaps
exactly 2 specific players rather than everyone.
**False alarm caught during review, corrected before shipping:** while adding A172, briefly
suspected `rotateSeatOrder` (used by A010/A156, both already shipped) needed `currentTurnIndex`
moved along with `seatOrder` after a rotation, and shipped that change in one commit. A second
review pass traced every actual reader of "whose turn is it" — `GameTable.tsx`'s
`currentTurnPlayerId` and every gameplay gate in `lib/session.tsx` (`playAction`, `drawCard`,
`placeTrapCard`, etc.) — and found they all read `turnOrder[currentTurnIndex]`, **never**
`seatOrder[currentTurnIndex]`. `turnOrder` is fixed at game start and neither
`rotateSeatOrder` nor `swapSeats` touches it, so the *original* (pre-session) behavior — leaving
`currentTurnIndex` untouched — was already correct: it keeps indexing the same player in the
untouched `turnOrder`. The "fix" that moved `currentTurnIndex` to follow `seatOrder` was itself
the bug: it desynced `currentTurnIndex` from the array everything else trusts, which would have
handed the active turn to the wrong player immediately after any of these 3 cards was played.
Reverted in the same session before merging. `rotateSeatOrder`/`swapSeats` now deliberately
leave `currentTurnIndex` alone; regression tests in `game/actionRules/definitions.test.ts`
assert `turnOrder[currentTurnIndex]` stays pointed at the actor across all 3 cards.

**Second real bug found (same review pass) — fixed, not deferred:** `advanceTurn`
(`game/turn.ts`) preferred `seatOrder` over `turnOrder` when walking to find the next
non-skipped player and when resetting per-turn flags (`placedTrapThisTurn`,
`hasDrawnThisTurn`, `hasPlayedActionThisTurn`) on the new active player. This was low-severity
before this session (only `placedTrapThisTurn` was at stake) but the collaborator's concurrent
main-branch work added the two `hasDrawnThisTurn`/`hasPlayedActionThisTurn` gates — once
`seatOrder` and `turnOrder` diverge (permanently, after A010/A156/A172, since nothing resyncs
them), `advanceTurn` would reset those flags on the *wrong* player every turn for the rest of
the game, and the real next player would start their turn still marked as having already
played/drawn — a permanent soft-lock ("คุณใช้แอ็กชันประจำเทิร์นไปแล้ว") for anyone after a
seat-shuffle card. Fixed by making `advanceTurn` prefer `turnOrder`, matching
`emergencyForceSkipTurn`'s existing (already-correct) preference. Regression test in
`game/turn.test.ts` ("walks turnOrder, not seatOrder...") covers the diverged-arrays case.

**F2. All players' hands normalized to a fixed size** — 2 cards: A044, A129

**F3. Selected players' hands pooled, shuffled, and redealt evenly** — 2 cards: A032, A074
(`executeHandSwapAndDeal` already does the 2-player case; A074 needs an N-player version)

---

## Family G — Trap-card subsystem — kind: `auto`, gated on `game/trapPile.ts`

**G1. Trap-card manipulation (discard/peek/flip/return-to-hand/steal-one)** — 10 cards
Codes: A003, A009, A015, A025, A030, A034, A053, A059, A086, A113
Needs: operations on `player.traps[]` (peek without triggering, discard specific/all,
return to hand, steal one trap card between players) — **no existing primitive touches
`.traps`**, all current primitives are hand-only. Build `game/trapPile.ts` first.

---

## Family H — Deck & discard-pile manipulation — kind: `auto`

**H1.** 8 cards, 7 implemented: A026, A046, A106, A116, A117, A122, A133
- A046 "การบ้าน" — peek top 5, keep 1
- A122 — take fixed N most-recent cards from discard pile
Needs: `peekTopN`, `takeChosenFromPeek`, `takeTopNFromDiscard` (new `game/deckOps.ts`);
`drawFromBottom` already exists in `game/pile.ts`.
- A064 "เปลือกกล้วย" — moved to Phase 2 (§Grand total reconciliation): deferred trigger,
  insert a face-up marker into the draw pile that fires an extra effect when someone later
  draws it. No existing hook for that in `draw()` (`game/pile.ts`), the most-called primitive
  in the game — same risk class as the other Phase 2 cards, not a definitions-only addition.

---

## Family I — Global rules, win-conditions, meta/named-card references

**I1. Temporary global rule suspension** — kind: needs new `RoomState.globalRestrictions`
schema — 3 cards: A019 (no Counters until your next turn), A072 (no Actions until your next
turn), A085 (no one can win until your next turn)

**I2. Global one-off rule change** — kind: `auto` — 2 cards: A076 (reverse direction — use
existing `reverseDirection`), A135 (change Muffin Time win-condition target — use existing
`changeMuffinTarget`)

**I3. Delayed win-condition check based on extreme hand size at a future checkpoint** — kind:
`auto` (hooks into `turn.ts`'s win-check) — 2 cards: A024, A027

**I4. Special win condition unrelated to hand-size ranking** — kind: `auto` — 2 cards: A023
(self hand non-empty at next turn, still deferred — see Phase 2 list), A037 — **implemented**
(2026-09-02): added `PlayerState.birthdayMMDD` (optional, self-reported, month+day only, never
a year — see `game/types.ts`), an optional date input on the create/join screens, and
`needsTodayDate` on `ActionRuleDefinition` so `GameTable` stamps the actor's local "today" into
the frame before pushing it (`executeEffect` itself stays a pure function of state+frame, never
calls the clock). Respects A085's `no_win` restriction and no-ops instead of throwing if the
game already finished in the same resolution pass.

**I5. Effect references another specific NAMED card elsewhere in deck/discard** — kind:
`auto` — 3 cards: A021, A048, A073 (hardcoded name→code lookups against "Magical Pony", "My
Lemons", "Desmond The Moon Bear")

---

## Family J — State-extreme / computed-target selection

**J1. Extreme-state player(s) discard N (ties → all tied)** — kind: `roster_select`
(subjective attribute, no stored data) — 3 cards: A031 (oldest), A058 (youngest), A054 (most
jewelry)

**J2. Extreme-state player(s) draw N (ties → all tied)** — split:
- A088 "ฉันห่วยเกมนี้" (fewest cards in hand) — kind: `auto`, objectively computable from
  live hand counts, no manual input at all.
- A095 (biggest feet), A070 (farthest from home) — kind: `roster_select`, subjective.

**J3. Extreme-state player(s) skip their turn** — kind: `auto` — 1 card: A050 (most cards in
hand — objectively computable, unlike J1).

**J4. Effect resolves against a player determined by a stored/computed fact** — kind: `auto`
— 4 cards: A118 (who suggested playing this game — a one-time room-setup fact, still deferred)
and A158 (a live drink-count tally, still deferred — both see Phase 2/remaining-work list).
A066 and A137 — **implemented** (2026-09-02), same `birthdayMMDD`/`needsTodayDate`
infrastructure as A037 (see §I4). Shared `soonestBirthdayPlayers` helper (ties → all tied, same
convention as J1/J2) plus `everyoneGivesOneTo`/`everyoneStealsOneFrom` for the give/steal
direction each card needs. Players who never set a birthday are simply excluded from the
comparison, not treated as tied at 0.

---

## Section 3 — Genuinely unique/one-off cards (26 total)

**Phase 1 (15 cards, fit the current engine once the above primitives/UI exist):**

| Code | Name | Effect | Note |
|---|---|---|---|
| A007 | ปุ่มปริศนา | Coin flip: heads draw 3, tails discard 3 | self-only, RNG |
| A014 | ดึงนิ้วฉันสิ | Choose 1 player to steal 1 card *from your hand* | inverted steal direction; already in demo switch |
| A020 | ตัวตนใหม่ | Discard entire hand, redraw the same count | trivial combo |
| A022 | ตัวคนเดียว | If this card is the only card in hand, draw 10 | guard + draw |
| A036 | คำสารภาพ | Draw 3, must reveal hand | draw + UI-only "revealed" flag |
| A043 | เอากลับเข้าไปแล้ว | Steal target's whole hand, bury shuffled into deck | needs insert-at-random-position on drawPile |
| A055 | ฆ่าพวกเราหมดเลย | Self discards 2, all others discard 1 | discard-verb mirror of B4 |
| A063 | เด็กถือปืน | Steal any N cards from any M players, both free-form | **only card needing free-form count/multi-target UI** |
| A071 | ล้มตัวลง! | All hands face-up until your next turn | timed visibility flag (share I1's temp-flag mechanism) |
| A075 | เนกไทปีศาจ | Steal 1 from every player with hand size == yours | objective predicate, simple |
| A084 | ถือไว้นะ! | Pure 1:1 hand swap with chosen player | `swapHands` already exists |
| A090 | ฉันอยากตาย | Discard entire hand, optional "leave game" | discard trivial; leave-game reuses existing `leaveRoom()` — confirm with user whether to build the leave option at all |
| A109 | ไม่มีประโยชน์ | Literally nothing happens | `kind: no_op` |
| A115 | คนแคระตัวสูง | Tallest gives 3 cards to shortest | **implemented** — `needsDualTargetSelection`, two sequential single-target picks (tallest, then shortest); rejected reusing the multi-select roster because click order alone can't safely disambiguate two roles (a deselect-reselect fumble silently swaps them with no on-screen indication) |

**A166 (still deferred, not Phase 1 or Phase 2):** "หมดแก้วเร็วก็รวย" / "Speed Chug Bonus" —
checked `description_en` and `description_th` directly in `data/cards.json`; neither names who
draws the 3 cards (the chooser or the chosen). This is a rules-ambiguity block, not a missing
primitive — needs a call from the group/friend against the physical rulebook, not a guessed
default.

**Phase 2 (13 cards, deferred — need core turn/engine changes beyond a single `executeEffect`):**

| Code | Name | Why it's deep-engine |
|---|---|---|
| A017 | นายตาบอด | Proxy blind-draws next deck card and plays it; if Trap/Counter, discard and retry until an Action — recursive resolution |
| A028 | ทาเยอะไปหน่อย | Co-played with another Action card, doubles its effect — needs a "play 2 as one" UI + effect multiplier on a second frame |
| A035 | ออกมาเล่นกันเถอะ | Forces every Action-holder to play one next turn — persistent per-player obligation flag |
| A040 | ฉันชอบมัน! | Redirects the next 3 played Actions' post-resolution destination into your hand — persistent global redirect counter |
| A064 | เปลือกกล้วย | Marks a card in the draw pile that fires an extra effect when later drawn — needs a hook inside `draw()` (`game/pile.ts`), the most-called primitive in the game |
| A091 | ฉันเป็นหมอ | Draws N = cards stolen/forced-discarded from you since your last turn — needs a forced-vs-voluntary distinction the low-level primitives can't see, threaded through every call site in `transfer.ts`/`primitives.ts`/`roster.ts`/`group.ts` |
| A092 | ฉันบ้าไปแล้ว! | Full game reset |
| A094 | พร้อมเพรียง | Replays the most recently played Action's effect — needs an action-history log |
| A100 | โรงงานมัฟฟิน | Grants 2 extra Action plays this turn — turn-economy exception |
| A108 | เล่นใบนั้นสิ | Pick a specific visible card from a target's hand, force them to play it — reveal + forced-play + recursive resolution |
| A119 | จะรอทำไม? | Jumps play order forward to a chosen player's turn — mutates `currentTurnIndex` outside normal `advanceTurn` |
| A126 | มือปืน | Chosen player then picks a third player to suffer the effect — 2-hop delegated targeting |
| A130 | เลื่อนตำแหน่ง | Chosen player picks one of their own cards to give to another — 2-hop delegated targeting |

---

## Grand total reconciliation

Family A(18) + B(9) + C(7) + D(27) + E(35) + F(10) + G(10) + H(8) + I(12) + J(11) = 147
grouped-pattern cards, + 26 unique (15 Phase 1 + 11 Phase 2) = **173**, matching
`data/cards.json` exactly.

**Post-implementation update (2026-09-02):** two cards originally counted inside Family
grouped patterns (C3's A091, H1's A064) turned out to need the same class of core-engine
change as the Phase 2 batch once actually implemented, and moved there. One originally-listed
Phase 1 unique card (A115) shipped after adding a small dual-target-selection primitive; one
(A166) stays deferred as a genuine rules-ambiguity, not an engine gap. Current status: **150
of 173 implemented**, 11 Phase 2 (unchanged, all still need core turn/engine work), 2 moved
into Phase 2 (A064, A091), 1 blocked on a rules-ambiguity call (A166). See
`game/actionRules/definitions.ts`'s trailing comments for the up-to-date per-card reasoning —
this doc is the historical classification pass, that file is the live source of truth.
