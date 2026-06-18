/* ============================================================================
 * 12s — Network state layer (pure, no Firebase)
 * ----------------------------------------------------------------------------
 * Splits the engine's single state object into:
 *   - a PUBLIC document (everything both players may see) + per-player handCount
 *   - PRIVATE hand documents (one per player, holding actual cards)
 *
 * and reconstructs an engine-usable state on a given device, where only THAT
 * device's own hand is known (the opponent's hand is placeholders sized to its
 * public count). Keeping this Firebase-free lets us unit-test the hand-split
 * and the turn-start draw boundary without a live database.
 * ==========================================================================*/

const PLACEHOLDER = { placeholder: true, value: null, isWild: false };

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* Build a brand-new networked game (deck dealt, creator dealt a hand).
 * Status starts 'waiting' until the second player joins.
 * Returns { pub, myHand } — myHand is the creator's (player 0) hand. */
function netCreate(creatorName, opponentName) {
  const state = Engine.createGame([
    { playerId: 'p0', displayName: creatorName },
    { playerId: 'p1', displayName: opponentName || '—' },
  ]);
  state.status = 'waiting';        // becomes 'active' when p1 joins
  state.drawnForTurn = state.turnNumber; // p0's opening draw is already done
  return { pub: serialize(state), myHand: clone(state.players[0].hand) };
}

/* Serialize a full engine state into the PUBLIC document.
 * Each player carries handCount (not the cards). Hand cards live in private
 * per-player documents written separately by their owner. */
function serialize(state) {
  return {
    status: state.status,
    currentTurnIndex: state.currentTurnIndex,
    turnNumber: state.turnNumber,
    drawnForTurn: state.drawnForTurn != null ? state.drawnForTurn : state.turnNumber,
    drawPile: clone(state.drawPile),
    completedPilesBuffer: clone(state.completedPilesBuffer),
    buildingPiles: clone(state.buildingPiles),
    winnerPlayerId: state.winnerPlayerId != null ? state.winnerPlayerId : null,
    // Preserve the auth binding so a full set() doesn't wipe it.
    playerUids: state.playerUids != null ? clone(state.playerUids) : null,
    players: state.players.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      stockPile: clone(p.stockPile),
      // Firestore forbids arrays-of-arrays, so each discard pile is wrapped as
      // { cards: [...] } here and unwrapped in reconstruct().
      discardPiles: p.discardPiles.map((pile) => ({ cards: clone(pile) })),
      handCount: p.hand.length,
      uid: p.uid != null ? p.uid : null,   // carry the player's auth uid through
    })),
  };
}

/* Reconstruct an engine state on a device, given the public doc, which player
 * index this device is, and this device's own hand cards. The opponent's hand
 * is filled with placeholders sized to its public handCount. */
function reconstruct(pub, myIndex, myCards) {
  const state = {
    status: pub.status,
    currentTurnIndex: pub.currentTurnIndex,
    turnNumber: pub.turnNumber,
    drawnForTurn: pub.drawnForTurn,
    drawPile: clone(pub.drawPile),
    completedPilesBuffer: clone(pub.completedPilesBuffer),
    buildingPiles: clone(pub.buildingPiles),
    winnerPlayerId: pub.winnerPlayerId,
    playerUids: pub.playerUids != null ? clone(pub.playerUids) : null,
    players: pub.players.map((p, i) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      stockPile: clone(p.stockPile),
      // Unwrap { cards:[...] } back into the engine's array-of-arrays shape.
      discardPiles: (p.discardPiles || []).map((d) => clone(d.cards || [])),
      uid: p.uid != null ? p.uid : null,   // carry auth uid through
      hand: i === myIndex
        ? clone(myCards || [])
        : Array.from({ length: p.handCount || 0 }, () => clone(PLACEHOLDER)),
    })),
  };
  return state;
}

/* Does this device owe a start-of-turn draw right now?
 * True when the game is active, it's my turn, and the once-per-turn draw for
 * this turn number hasn't been done yet. */
function owesTurnStartDraw(pub, myIndex) {
  return pub.status === 'active'
    && pub.currentTurnIndex === myIndex
    && (pub.drawnForTurn == null || pub.drawnForTurn < pub.turnNumber);
}

/* Perform this device's start-of-turn draw.
 * Returns { pub, myHand } to write (pub + this device's own hand doc). */
function applyTurnStartDraw(pub, myIndex, myCards) {
  const state = reconstruct(pub, myIndex, myCards);
  Engine.drawToFull(state);          // draws the current player (me) up to 5
  state.drawnForTurn = state.turnNumber;
  return { pub: serialize(state), myHand: clone(state.players[myIndex].hand) };
}

/* Apply a play action on this device. Returns { pub, myHand, result }. */
function applyPlay(pub, myIndex, myCards, source, slotIndex) {
  const state = reconstruct(pub, myIndex, myCards);
  const result = Engine.playCard(state, source, slotIndex);
  return { pub: serialize(state), myHand: clone(state.players[myIndex].hand), result };
}

/* Apply a discard (ends the turn, does NOT draw the opponent).
 * Returns { pub, myHand, result }. The opponent draws on their own device. */
function applyDiscard(pub, myIndex, myCards, handIndex, pileIndex) {
  const state = reconstruct(pub, myIndex, myCards);
  const result = Engine.discard(state, handIndex, pileIndex, false);
  return { pub: serialize(state), myHand: clone(state.players[myIndex].hand), result };
}

const NET = {
  PLACEHOLDER,
  netCreate, serialize, reconstruct,
  owesTurnStartDraw, applyTurnStartDraw,
  applyPlay, applyDiscard,
};

if (typeof module !== 'undefined' && module.exports) {
  // For node tests, pull Engine from the sibling module.
  if (typeof Engine === 'undefined') { global.Engine = require('./engine.js'); }
  module.exports = NET;
}
if (typeof window !== 'undefined') { window.Net = NET; }
