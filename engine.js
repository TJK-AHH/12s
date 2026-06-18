/* ============================================================================
 * 12s — Rules Engine
 * ----------------------------------------------------------------------------
 * Pure game logic for the custom Skip-Bo-style card game. No UI, no network.
 * Everything operates on a plain `state` object so the same engine can drive
 * a local hot-seat version AND a Firestore-synced version later.
 *
 * Deck:   20 sets of 1-12 (240 cards) + 20 wilds = 260 cards
 * Win:    first player to empty their 30-card stock pile wins
 * ==========================================================================*/

/* ----------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------*/
const SETS = 20;          // copies of each numbered value
const MAX_VALUE = 12;     // numbered cards run 1..12
const WILD_COUNT = 20;    // number of wild cards in the deck
const STOCK_SIZE = 30;    // cards dealt to each player's stock pile
const HAND_SIZE = 5;      // a full hand
const MAX_BUILDING_PILES = 4;
const DISCARD_PILES_PER_PLAYER = 4;

/* ----------------------------------------------------------------------------
 * Card helpers
 * --------------------------------------------------------------------------*/

// A card is { id, value, isWild }. value is 1..12 for numbered cards, null for wilds.
let _cardCounter = 0;
function makeCard(value, isWild) {
  _cardCounter += 1;
  return {
    id: 'c' + String(_cardCounter).padStart(4, '0'),
    value: isWild ? null : value,
    isWild: !!isWild,
  };
}

// Build the full 260-card deck (unshuffled).
function buildDeck() {
  const deck = [];
  for (let s = 0; s < SETS; s++) {
    for (let v = 1; v <= MAX_VALUE; v++) {
      deck.push(makeCard(v, false));
    }
  }
  for (let w = 0; w < WILD_COUNT; w++) {
    deck.push(makeCard(null, true));
  }
  return deck;
}

// Fisher-Yates shuffle. Takes an optional rng() returning [0,1) for testability.
function shuffle(array, rng) {
  const r = rng || Math.random;
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ----------------------------------------------------------------------------
 * Game setup
 * --------------------------------------------------------------------------*/

/**
 * Create a fresh game state.
 * @param {Array<{playerId:string, displayName:string}>} playerInfos  2-4 players
 * @param {function} [rng]  optional deterministic RNG for tests
 */
function createGame(playerInfos, rng) {
  if (!playerInfos || playerInfos.length < 2 || playerInfos.length > 4) {
    throw new Error('Game requires 2 to 4 players.');
  }

  let deck = shuffle(buildDeck(), rng);

  const players = playerInfos.map((info) => {
    const stockPile = deck.splice(0, STOCK_SIZE); // deal 30 off the top
    return {
      playerId: info.playerId,
      displayName: info.displayName,
      stockPile,                       // bottom -> top; last element is face-up top
      hand: [],                        // up to 5; private in the networked version
      discardPiles: emptyDiscardPiles() // 4 arrays, bottom -> top
    };
  });

  const state = {
    status: 'active',                  // 'waiting' | 'active' | 'finished'
    players,
    currentTurnIndex: 0,               // index into players[] whose turn it is
    turnNumber: 1,
    drawPile: deck,                    // remaining cards after dealing stocks
    completedPilesBuffer: [],          // cards from finished 12-piles, set aside
    buildingPiles: [null, null, null, null], // 4 center slots; null = empty
    winnerPlayerId: null,
  };

  // Active player draws up to 5 to begin.
  drawToFull(state);
  return state;
}

function emptyDiscardPiles() {
  const piles = [];
  for (let i = 0; i < DISCARD_PILES_PER_PLAYER; i++) piles.push([]);
  return piles;
}

/* ----------------------------------------------------------------------------
 * Small accessors
 * --------------------------------------------------------------------------*/
function currentPlayer(state) {
  return state.players[state.currentTurnIndex];
}
function stockTop(player) {
  return player.stockPile.length ? player.stockPile[player.stockPile.length - 1] : null;
}
function discardTop(player, pileIndex) {
  const pile = player.discardPiles[pileIndex];
  return pile.length ? pile[pile.length - 1] : null;
}
// The value a building pile currently shows on top (0 = empty slot, next needed is 1).
function buildingTopValue(state, slotIndex) {
  const pile = state.buildingPiles[slotIndex];
  return pile ? pile.topValue : 0;
}

/* ----------------------------------------------------------------------------
 * Drawing
 * --------------------------------------------------------------------------*/

// Refill the active player's hand to 5, reshuffling completed piles if the
// draw pile runs short.
function drawToFull(state) {
  const player = currentPlayer(state);
  while (player.hand.length < HAND_SIZE) {
    if (state.drawPile.length === 0) {
      if (!refillDrawPileFromCompleted(state)) break; // nothing left to draw
    }
    player.hand.push(state.drawPile.pop());
  }
}

// When the draw pile can't refill a hand, shuffle the set-aside completed piles
// back into it. Returns true if any cards were added.
function refillDrawPileFromCompleted(state, rng) {
  if (state.completedPilesBuffer.length === 0) return false;
  const reshuffled = shuffle(state.completedPilesBuffer, rng);
  state.drawPile = reshuffled.concat(state.drawPile);
  state.completedPilesBuffer = [];
  return true;
}

/* ----------------------------------------------------------------------------
 * Legality checks
 * --------------------------------------------------------------------------*/

// Can `card` be placed on building-pile slot `slotIndex` right now?
function canPlayOnBuilding(state, card, slotIndex) {
  if (slotIndex < 0 || slotIndex >= MAX_BUILDING_PILES) return false;
  const pile = state.buildingPiles[slotIndex];

  if (pile === null) {
    // Empty slot: only a 1 or a wild may start a pile.
    return card.isWild || card.value === 1;
  }
  // Existing pile: need exactly topValue + 1 (a wild can stand in for it).
  if (pile.topValue >= MAX_VALUE) return false; // shouldn't happen; 12 auto-clears
  return card.isWild || card.value === pile.topValue + 1;
}

/* ----------------------------------------------------------------------------
 * Source resolution — pull a card out of wherever it came from
 * --------------------------------------------------------------------------*/

/**
 * A "source" describes where a played card comes from:
 *   { type: 'hand',    index }          - hand[index]
 *   { type: 'stock' }                   - top of own stock pile
 *   { type: 'discard', pileIndex }      - top of own discard pile
 */
function peekSource(player, source) {
  switch (source.type) {
    case 'hand':    return player.hand[source.index] || null;
    case 'stock':   return stockTop(player);
    case 'discard': return discardTop(player, source.pileIndex);
    default:        return null;
  }
}

function removeFromSource(player, source) {
  switch (source.type) {
    case 'hand':    return player.hand.splice(source.index, 1)[0];
    case 'stock':   return player.stockPile.pop();
    case 'discard': return player.discardPiles[source.pileIndex].pop();
    default:        return null;
  }
}

/* ----------------------------------------------------------------------------
 * Core action: play a card onto a building pile
 * --------------------------------------------------------------------------*/

/**
 * Play a card from `source` onto building-pile slot `slotIndex`.
 * Returns { ok, error?, gameOver? }.
 * Does NOT end the turn (playing is voluntary and repeatable).
 */
function playCard(state, source, slotIndex) {
  if (state.status !== 'active') return { ok: false, error: 'Game is not active.' };

  const player = currentPlayer(state);
  const card = peekSource(player, source);
  if (!card) return { ok: false, error: 'No card at that source.' };

  if (!canPlayOnBuilding(state, card, slotIndex)) {
    return { ok: false, error: 'That card cannot be played there.' };
  }

  // Remove from source, place on building pile.
  const played = removeFromSource(player, source);
  placeOnBuilding(state, played, slotIndex);

  // Win check: emptying the stock pile ends the game immediately.
  if (player.stockPile.length === 0) {
    state.status = 'finished';
    state.winnerPlayerId = player.playerId;
    return { ok: true, gameOver: true, winnerPlayerId: player.playerId };
  }

  // If the hand was fully emptied BY PLAYING (not discarding), redraw to 5 and
  // continue the same turn.
  if (player.hand.length === 0) {
    drawToFull(state);
  }

  return { ok: true };
}

// Place a card on a building slot, recording the effective value, and clear the
// pile to the completed buffer when it reaches 12.
function placeOnBuilding(state, card, slotIndex) {
  let pile = state.buildingPiles[slotIndex];

  if (pile === null) {
    // Starting a new pile. A 1 or a wild-as-1.
    pile = {
      topValue: 1,
      startedWithWild: card.isWild,
      cards: [card],
    };
    state.buildingPiles[slotIndex] = pile;
  } else {
    pile.topValue += 1;        // wild or numbered, it occupies the next slot
    pile.cards.push(card);
  }

  // Completed pile (reached 12): set it aside.
  if (pile.topValue >= MAX_VALUE) {
    state.completedPilesBuffer.push(...pile.cards);
    state.buildingPiles[slotIndex] = null;
  }
}

/* ----------------------------------------------------------------------------
 * Core action: discard (ends the turn)
 * --------------------------------------------------------------------------*/

/**
 * Discard hand[handIndex] onto discard pile `pileIndex`. ENDS THE TURN.
 * No same-turn redraw even if this empties the hand.
 * Returns { ok, error? }.
 */
function discard(state, handIndex, pileIndex, autoDrawNext) {
  if (state.status !== 'active') return { ok: false, error: 'Game is not active.' };

  const player = currentPlayer(state);
  if (handIndex < 0 || handIndex >= player.hand.length) {
    return { ok: false, error: 'No card at that hand position.' };
  }
  if (pileIndex < 0 || pileIndex >= DISCARD_PILES_PER_PLAYER) {
    return { ok: false, error: 'Invalid discard pile.' };
  }

  const card = player.hand.splice(handIndex, 1)[0];
  player.discardPiles[pileIndex].push(card);

  // autoDrawNext defaults true (local hot-seat). The networked layer passes
  // false so the next player's draw happens on THEIR own device.
  endTurn(state, autoDrawNext === undefined ? true : autoDrawNext);
  return { ok: true };
}

// Advance to the next player. Draw them up to 5 only when autoDraw is true.
function endTurn(state, autoDraw) {
  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
  state.turnNumber += 1;
  if (autoDraw === undefined ? true : autoDraw) drawToFull(state);
}

/* ----------------------------------------------------------------------------
 * Convenience: does the active player have ANY legal play available?
 * (Useful for UI hints; the player is never forced to use it.)
 * --------------------------------------------------------------------------*/
function hasAnyLegalPlay(state) {
  const player = currentPlayer(state);
  const sources = [];
  player.hand.forEach((_, i) => sources.push({ type: 'hand', index: i }));
  sources.push({ type: 'stock' });
  player.discardPiles.forEach((_, i) => sources.push({ type: 'discard', pileIndex: i }));

  for (const source of sources) {
    const card = peekSource(player, source);
    if (!card) continue;
    for (let slot = 0; slot < MAX_BUILDING_PILES; slot++) {
      if (canPlayOnBuilding(state, card, slot)) return true;
    }
  }
  return false;
}

/* ----------------------------------------------------------------------------
 * Exports (works both as an ES module and via window for the browser)
 * --------------------------------------------------------------------------*/
const ENGINE = {
  // constants
  SETS, MAX_VALUE, WILD_COUNT, STOCK_SIZE, HAND_SIZE,
  MAX_BUILDING_PILES, DISCARD_PILES_PER_PLAYER,
  // setup
  buildDeck, shuffle, createGame,
  // accessors
  currentPlayer, stockTop, discardTop, buildingTopValue,
  // actions
  drawToFull, playCard, discard, endTurn,
  // checks
  canPlayOnBuilding, hasAnyLegalPlay, peekSource,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ENGINE;
}
if (typeof window !== 'undefined') {
  window.Engine = ENGINE;
}
