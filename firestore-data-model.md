# Firestore Data Model — Custom Card Game

This defines how a single game's state is stored in Firestore. The design splits state across documents so privacy (hidden hands) can be enforced by security rules, not just hidden in the UI.

---

## Collection structure

```
games/{gameId}                          <- public game document (both players read)
games/{gameId}/hands/{playerId}         <- private hand document, one per player
```

- `{gameId}` — a unique ID per game (e.g. an auto-generated Firestore ID, or a short human-friendly code like "ABC123" so you can share/join a game easily).
- `{playerId}` — a stable identifier for each player (their Firebase Auth UID once auth is added; see note at bottom).

---

## 1. Public game document — `games/{gameId}`

Everything both players are allowed to see. No hands here.

| Field | Type | Description |
|---|---|---|
| `gameId` | string | Same as the document ID; convenient to have inside the doc. |
| `status` | string | `"waiting"` (created, opponent not joined yet), `"active"`, or `"finished"`. |
| `createdAt` | timestamp | When the game was created. |
| `updatedAt` | timestamp | Last write — useful for "did anything change since I last looked." |
| `players` | array of objects | The participants. See **player object** below. Length 2 now, up to 4 later. |
| `currentTurnPlayerId` | string | The `playerId` whose turn it is right now. |
| `turnNumber` | number | Increments each completed turn. Handy for history/debugging. |
| `drawPileCount` | number | How many cards remain in the shared draw pile. (The actual card list lives in `drawPile`, but the count is exposed for easy display.) |
| `drawPile` | array of card objects | The shared face-down draw pile, in order. Top of pile = a defined end (e.g. last element). See **card object**. |
| `buildingPiles` | array (length 4) | The 4 shared center piles. Each entry is a **building pile object** (or `null` for an empty slot). |
| `completedPilesBuffer` | array of card objects | Cards from finished (12-capped) building piles, set aside. Reshuffled into `drawPile` when it can't refill a hand to 5. |
| `winnerPlayerId` | string \| null | Set when someone empties their stock pile. |

### Player object (inside `players` array)

| Field | Type | Description |
|---|---|---|
| `playerId` | string | Stable player identifier. |
| `displayName` | string | e.g. "Troy", "Kaara". |
| `stockPile` | array of card objects | That player's 30-card stock pile, in order. The top card (e.g. last element) is the face-up, playable one. |
| `stockTopCard` | card object \| null | The currently face-up top card, duplicated out for easy display. Mirrors the top of `stockPile`. |
| `stockCount` | number | Cards left in the stock pile. Reaches 0 = this player wins. |
| `discardPiles` | array (length 4) | The player's 4 discard piles. Each is an array of card objects (bottom→top). Only the top (last) card is playable. Empty pile = empty array. |

> Note: stock piles and discard piles are **public** per the rules spec — both players see top cards and counts. They live in the public document deliberately. Only hands are private.

---

## 2. Private hand document — `games/{gameId}/hands/{playerId}`

One document per player. A security rule restricts read/write so only that player's account can access their own hand.

| Field | Type | Description |
|---|---|---|
| `playerId` | string | Whose hand this is. |
| `cards` | array of card objects | The player's current hand, up to 5 cards. |
| `updatedAt` | timestamp | Last modified. |

---

## Shared object shapes

### Card object

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique per physical card instance (e.g. `"c042"`), so identical numbers can be told apart and animated/tracked. |
| `value` | number \| null | 1–12 for a numbered card. `null` for a wild card (its played value is recorded on the building pile, not the card itself). |
| `isWild` | boolean | `true` for a wild card. |

### Building pile object (inside `buildingPiles`)

| Field | Type | Description |
|---|---|---|
| `topValue` | number | The current top number of the pile (1–12). The next playable card must be `topValue + 1`, or a wild played as `topValue + 1`. |
| `cards` | array of card objects | The cards making up the pile, in order. |
| `startedWithWild` | boolean | Optional/informational: whether this pile was opened with a wild standing in for the 1. |

An empty building-pile slot is represented as `null`. A new pile can only be started (a `null` slot filled) with a 1 or a wild.

---

## How a turn maps to writes

A single turn touches a small, predictable set of documents:

1. **Draw**: move N cards from `games/{gameId}.drawPile` into the active player's `games/{gameId}/hands/{playerId}.cards` to reach 5. Decrement `drawPileCount`. If the draw pile can't cover it, shuffle `completedPilesBuffer` back into `drawPile` first.
2. **Plays**: update `buildingPiles` (and, when a pile hits 12, move it into `completedPilesBuffer`); remove played cards from the hand doc, stock pile, or discard piles as appropriate; update `stockTopCard`/`stockCount` if a stock card was played.
3. **Discard**: append one card from the hand to one of the player's `discardPiles`; set `currentTurnPlayerId` to the opponent; increment `turnNumber`; set `updatedAt`.
4. **Win check**: if the active player's `stockCount` hit 0, set `status: "finished"` and `winnerPlayerId`.

> Writing the full set of changes for a turn as a single Firestore **batched write** keeps the game state consistent — either the whole turn lands or none of it does, so the two phones never see a half-applied turn.

---

## Auth note (next decision, not needed yet)

The private-hand security rule needs a way to know *which* player a phone belongs to. That comes from Firebase Authentication — each player signs in (even anonymously or with a simple shared method) and gets a stable UID that becomes their `playerId`. We'll choose the exact sign-in method as a later step; for now the schema is written so `playerId` slots straight into it.
