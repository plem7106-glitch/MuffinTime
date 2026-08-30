# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is currently pre-implementation: it contains the design spec and game content data, but no application code yet (no `package.json`, build tooling, or source directory exists). There are no build/lint/test commands to run until implementation starts.

## What this project is

A mobile-friendly web adaptation of the **Muffin Time** card game (asdfmovie × Big Potato Games), meant to be played by a group of friends physically together, each on their own phone via a shared room code, in place of a physical card deck.

Design decisions (architecture, data model, turn/effect handling, v1 scope) are fully specified in:
`docs/superpowers/specs/2026-08-31-muffin-time-web-design.md`

Read that file before making any architectural choice — it already answers most "how should this work" questions (e.g. Firebase Realtime Database + Firebase Hosting with no custom backend, client-authoritative game logic, no accounts, Thai-only UI, 3–8 players per room).

## Game content data

`data/cards.json` is the full, real card list for the game (138 Action, 40 Counter, 53 Trap — 231 total), each with English name, Thai name, and Thai effect text. This is the authoritative content source the app should read from — do not invent or rephrase card effects; treat this file as ground truth. `data/cards.csv` is a plain export of the same data for spreadsheet use and is not consumed by the app.

Per the design spec, each card still needs to be classified into one of three effect-handling tiers (fully automatable / mini-game with manual outcome entry / social-honor-system) as part of implementation — this classification does not exist yet in `cards.json`.
