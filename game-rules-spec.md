# Custom Card Game — Rules Spec (Skip-Bo variant)

## Deck
- 20 sets of cards numbered 1–12 = 240 numbered cards
- 20 Wild cards
- **Total: 260 cards**

## Setup
- Each player is dealt a 30-card **Stock pile** (face down). Top card is flipped face-up.
  - 2 players × 30 = 60 cards dealt
- Remaining 200 cards form the shared **Draw pile**
- One player is chosen at random to go first

## Player areas
- **Stock pile** (30 cards): personal. Top card is always face-up and playable. Emptying this pile wins the game.
- **Hand**: up to 5 cards, drawn from the Draw pile.
- **Discard piles** (4 per player): personal, start empty. Any card can be discarded to any of the 4 piles regardless of value. Only the top card of each pile is playable. No ordering requirement within a pile.

## Shared area
- **Building piles**: up to 4 at a time, shared by both players.
  - A pile can only be started with a Wild card or a 1.
  - If started with a Wild, the next card needed is a 2 (the Wild occupies the "1" slot).
  - Piles build upward in sequence: 1 → 2 → 3 → ... → 12.
  - Wild cards can be played at any point in the sequence (start or mid-pile) as whatever value is needed.
  - When a pile reaches 12, it is cleared aside (set aside, not yet returned to the Draw pile).

## Turn structure
1. **Draw**: draw from the Draw pile until hand = 5 cards.
2. **Play**: the active player may play zero, some, or all eligible cards, in any order, from:
   - their hand
   - the top of their Stock pile
   - the top of any of their own Discard piles
   
   Each play must be legal (matches the next needed value on a Building pile, or is a Wild used as the needed value). Playing a Stock or Discard pile card reveals the next card underneath, which becomes available to play immediately if the player wants to.
   
   **Playing is entirely voluntary.** A player is never forced to make available plays — they can choose to play none, some, or all of them before discarding.
   
   If a player empties their hand to 0 purely through **playing** cards (not discarding), they immediately draw 5 more cards and may continue playing in the same turn.
3. **Discard (ends the turn)**: the player discards exactly one card from their hand onto one of their 4 personal Discard piles (any card, no restriction). **Discarding always ends the turn immediately — there is no same-turn redraw after a discard, even if the discard happens to empty the hand.** Example: a player plays 4 of their 5 cards, then discards the 5th — that discard ends the turn; they do not draw 5 new cards until their next turn begins.
4. Play passes to the opponent.

## Replenishing the Draw pile
- If the Draw pile doesn't have enough cards to refill a player's hand to 5, all previously completed (cleared) Building piles are shuffled together and added back into the Draw pile.

## Win condition
- The first player to completely empty their 30-card Stock pile wins. The game ends immediately at that moment.

## Players
- Designed for 2 players initially (you and Kaara), with room to extend to 3–4 players later (e.g., kids) without changing core architecture — just adding more Stock piles, hands, and Discard pile sets.

## Play mode
- Asynchronous, remote: two phones, not necessarily online at the same time. A player opens the app, checks if it's their turn, plays it, and the other player can pick it up whenever they're free. No timers, no forced real-time presence.

## Visibility
- **Public (both players can see at all times):** both players' Stock pile top card and remaining count; both players' four Discard piles (top card of each, and pile heights); the four community Building piles.
- **Private:** each player's hand — only that player can see their own 5 cards. Hands are never visible to the opponent.
