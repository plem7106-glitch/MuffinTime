# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The stack is Next.js (App Router) + React + TypeScript + Tailwind CSS v4, with Supabase (Postgres + Realtime) replacing the originally-planned Firebase backend — see
`docs/superpowers/specs/2026-08-31-nextjs-supabase-foundation-design.md` for why and how.

The game engine (`game/*.ts`) and card-loading pipeline are ported and tested (Vitest). The Supabase schema
(`supabase/migrations/0001_create_rooms.sql`) and the multiplayer read/write/realtime layer (`multiplayer/`) exist.
UI components, the lobby/room-flow screens, and `multiplayer/player.ts` (localStorage player identity) are NOT built
yet — they're deferred to a follow-up design spec, per the foundation spec's own scope section.

## What this project is

A mobile-friendly web adaptation of the **Muffin Time** card game (asdfmovie × Big Potato Games), meant to be played by a group of friends physically together, each on their own phone via a shared room code, in place of a physical card deck.

Design decisions (architecture, data model, turn/effect handling, v1 scope) are fully specified in:
`docs/superpowers/specs/2026-08-31-muffin-time-web-design.md`

Read that file for game rules, data model, turn/effect handling, and v1 scope (client-authoritative game logic, no accounts, Thai-only UI, 3–8 players per room). Its backend/hosting choice (Firebase Realtime Database + Firebase Hosting) is superseded — see "Project status" above for the current stack.

## Game content data

`data/cards.json` is the full, real card list for the game (138 Action, 40 Counter, 53 Trap — 231 total), each with English name, Thai name, and Thai effect text. This is the authoritative content source the app should read from — do not invent or rephrase card effects; treat this file as ground truth. `data/cards.csv` is a plain export of the same data for spreadsheet use and is not consumed by the app.

Per the design spec, each card still needs to be classified into one of three effect-handling tiers (fully automatable / mini-game with manual outcome entry / social-honor-system) as part of implementation — this classification does not exist yet in `cards.json`.
