# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The stack is Next.js (App Router) + React + TypeScript + Tailwind CSS v4, with Supabase (Postgres + Realtime + Auth)
replacing the originally-planned Firebase backend — see
`docs/superpowers/specs/2026-08-31-nextjs-supabase-foundation-design.md` for why and how.

As of 2026-09-01 the app is feature-complete for real multiplayer play and merged to `main`:

- **Auth**: real accounts via Supabase Auth magic-link email login (`lib/auth.tsx`, `app/login/page.tsx`) — a
  friend signs up once and logs back in as the same person from any device. `supabase/migrations/0002_require_auth_for_rooms.sql`
  requires an authenticated session (`auth.uid() is not null`) to read/write the `rooms` table; the older
  "no accounts" scope note in `docs/superpowers/specs/2026-08-31-muffin-time-web-design.md` (v1 design spec) is
  **superseded** by this — that spec's game rules/data model/turn-effect handling are still accurate, only its
  account-less assumption is not.
- **Multiplayer sync**: `lib/session.tsx` is a full Supabase-backed `GameSessionProvider` — every game action
  writes to Postgres via `multiplayer/room.ts`'s `updateRoomWithRetry` (optimistic concurrency, no local-only
  state), and all connected clients receive updates via a `multiplayer/realtime.ts` Realtime subscription. Rooms
  are created/joined by a real 4-character code (`multiplayer/room.ts`'s `createRoomWithRetry`/`insertRoom`).
  `pendingResponse`/`lastResult` (the counter/trap response-window state) live in `RoomState` itself
  (`game/types.ts`), guarded by a `responseId` idempotency token so racing clients can't double-apply an effect.
  The old fake seeded-rooms list and local bots are gone.
- **UI**: all lobby/room-flow screens are built (`app/create`, `app/join/[code]`, `app/room/[code]`,
  `components/room/*`) and wired to the real backend above — none of this is placeholder/mock data anymore.

**Known gaps, not yet built:**
- No presence/reconnect tracking (`PlayerState.connected` exists in the type but nothing writes `false` yet) —
  `leaveRoom` only tears down the local subscription, it doesn't remove the player server-side. A host-only
  "unstick" button (`GameSettingsModal.tsx`'s `onHostUnstick`, backed by `lib/session.tsx`'s `hostSkipTurn` and
  the existing `skipCounter`) is a stopgap for a departed player stalling the current turn or a response window —
  real presence tracking is deferred to a follow-up spec.
- No sign-out UI affordance (`lib/auth.tsx` exports `signOut()`, nothing calls it yet) — a mistyped display name
  at first signup is permanently stuck (Supabase's `user_metadata` only sets on first-ever signup).
- The one manual end-to-end check this multiplayer rewrite has (two real accounts, live join + Realtime sync +
  gameplay across two browser sessions) has not been fully run — completed: real magic-link login, real room
  creation, `WaitingRoom` rendering live Supabase state. Not yet completed: a second account joining and observed
  live sync, mid-game refresh/resume, host-controlled shuffle sync. Worth a real two-device playtest before
  trusting this fully.
- Deployed to Vercel at `https://muffin-time-ruddy.vercel.app` — its Supabase env vars
  (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`) need to be set in the Vercel project settings
  separately from local `.env.local` (which isn't committed); the Supabase Auth Redirect URLs allowlist already
  includes this domain.

## What this project is

A mobile-friendly web adaptation of the **Muffin Time** card game (asdfmovie × Big Potato Games), meant to be played by a group of friends physically together, each on their own phone via a shared room code, in place of a physical card deck.

Design decisions (architecture, data model, turn/effect handling, v1 scope) are fully specified in:
`docs/superpowers/specs/2026-08-31-muffin-time-web-design.md`

Read that file for game rules, data model, turn/effect handling, and v1 scope (client-authoritative game logic, no accounts, Thai-only UI, 3–8 players per room). Its backend/hosting choice (Firebase Realtime Database + Firebase Hosting) is superseded — see "Project status" above for the current stack.

## Game content data

`data/cards.json` is the full, real card list for the game (138 Action, 40 Counter, 53 Trap — 231 total), each with English name, Thai name, and Thai effect text. This is the authoritative content source the app should read from — do not invent or rephrase card effects; treat this file as ground truth. `data/cards.csv` is a plain export of the same data for spreadsheet use and is not consumed by the app.

Per the design spec, each card still needs to be classified into one of three effect-handling tiers (fully automatable / mini-game with manual outcome entry / social-honor-system) as part of implementation — this classification does not exist yet in `cards.json`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
