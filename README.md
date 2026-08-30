# MUFFIN TIME [TH]

Web-based multiplayer card game inspired by **Muffin Time**, designed for playing together with friends using individual mobile devices.

> This project is currently under development.

---

## About the Project

**MUFFIN TIME [TH]** is a web multiplayer adaptation project designed for local party play.

Instead of using physical cards, each player uses their own smartphone to:

- Join the same game room
- View their own cards
- Draw and play cards
- Activate Trap cards
- Play Counter cards
- Interact with other players in real life

The website acts as the digital card table and manages the game state, while social interactions still happen between players in real life.

---

## How the Game Works

### Objective

The objective is to have exactly **10 cards in your hand at the start of your turn**.

When a player reaches 10 cards, they must announce:

> "It's Muffin Time!"

If they still have exactly 10 cards when their next turn begins, they win.

---

## Basic Rules

- Each player starts with **3 randomly drawn cards**.
- During their turn, a player can either:
  - Draw one card from the deck, or
  - Play one Action card.
- During their turn, a player may also place a Trap card face-down.
- Counter cards may be played in response to other cards.
- Trap cards placed face-down do not count toward the player's hand total.
- A player may have a maximum of **3 active Trap cards**.
- A player wins by starting their turn with exactly **10 cards**.

---

## Card Types

The game contains three main types of cards.

### Action

Action cards are normally played during the player's turn.

Their effects may include:

- Drawing cards
- Discarding cards
- Stealing cards
- Giving cards to another player
- Swapping cards or hands
- Affecting multiple players
- Starting a mini-game

Some Action cards are **Mini-Game cards**, requiring players to perform an activity or challenge in real life.

---

### Trap

Trap cards are placed face-down during the player's turn.

They remain active until their trigger condition occurs.

Examples of triggers may involve another player:

- Saying something
- Laughing
- Yawning
- Performing a particular action
- Triggering another condition written on the card

When the condition occurs, the owner reveals the Trap and its effect is resolved.

Trap cards:

- Do not count toward the player's hand total while active.
- Are limited to **3 active Traps per player**.

---

### Counter

Counter cards are response cards.

They may be used against:

- Action cards
- Trap cards
- Other Counter cards

Depending on the card, a Counter may:

- Cancel an effect
- Reverse an effect
- Negate an effect
- Modify an effect
- Redirect an effect

Counter cards may be played during another player's turn when their conditions allow it.

---

## Multiplayer Concept

The game is designed primarily for players who are physically together.

Each player uses their own smartphone:

```text
Player A ──┐
Player B ──┤
Player C ──┼── Game Room
Player D ──┘
