/* Test harness for engine.js — verifies the rules from the spec. */
const E = require('./engine.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else      { fail++; console.log('  FAIL  ' + name); }
}

// Deterministic RNG so tests are reproducible.
function seededRng(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

console.log('\n--- Deck composition ---');
(function () {
  const deck = E.buildDeck();
  check('260 cards total', deck.length === 260);
  const wilds = deck.filter(c => c.isWild).length;
  check('20 wilds', wilds === 20);
  const ones = deck.filter(c => c.value === 1).length;
  check('20 ones', ones === 20);
  const twelves = deck.filter(c => c.value === 12).length;
  check('20 twelves', twelves === 12 * 0 + 20);
  const numbered = deck.filter(c => !c.isWild).length;
  check('240 numbered', numbered === 240);
  const ids = new Set(deck.map(c => c.id));
  check('all card ids unique', ids.size === 260);
})();

console.log('\n--- Setup ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'Troy' }, { playerId: 'p2', displayName: 'Kaara' }],
    seededRng(42)
  );
  check('two players', g.players.length === 2);
  check('p1 stock = 30', g.players[0].stockPile.length === 30);
  check('p2 stock = 30', g.players[1].stockPile.length === 30);
  check('active player hand = 5', g.players[0].hand.length === 5);
  check('idle player hand = 0 (not yet their turn)', g.players[1].hand.length === 0);
  check('draw pile = 260 - 60 - 5', g.drawPile.length === 260 - 60 - 5);
  check('4 empty building slots', g.buildingPiles.every(p => p === null));
  check('status active', g.status === 'active');
})();

console.log('\n--- Building pile: start rules ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(1)
  );
  const p = g.players[0];
  // Force a known hand: [1, wild, 3, 5, 7]
  p.hand = [
    { id: 'x1', value: 1, isWild: false },
    { id: 'x2', value: null, isWild: true },
    { id: 'x3', value: 3, isWild: false },
    { id: 'x4', value: 5, isWild: false },
    { id: 'x5', value: 7, isWild: false },
  ];
  // A 3 cannot start an empty pile.
  check('3 cannot start a pile', E.canPlayOnBuilding(g, p.hand[2], 0) === false);
  // A 1 can start a pile.
  check('1 can start a pile', E.canPlayOnBuilding(g, p.hand[0], 0) === true);
  // A wild can start a pile.
  check('wild can start a pile', E.canPlayOnBuilding(g, p.hand[1], 0) === true);

  // Play the 1 to start pile 0.
  let r = E.playCard(g, { type: 'hand', index: 0 }, 0);
  check('play 1 to start pile ok', r.ok === true);
  check('pile 0 topValue = 1', g.buildingPiles[0].topValue === 1);

  // Now next needed is 2. The 3 still cannot play; a wild can (as the 2).
  check('3 cannot play on a 1', E.canPlayOnBuilding(g, p.hand.find(c=>c.value===3), 0) === false);
  const wildCard = p.hand.find(c => c.isWild);
  check('wild can play as the 2', E.canPlayOnBuilding(g, wildCard, 0) === true);
})();

console.log('\n--- Wild starting a pile means next card is a 2 ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(2)
  );
  const p = g.players[0];
  p.hand = [
    { id: 'w', value: null, isWild: true },
    { id: 'a', value: 2, isWild: false },
    { id: 'b', value: 1, isWild: false },
    { id: 'c', value: 9, isWild: false },
    { id: 'd', value: 4, isWild: false },
  ];
  E.playCard(g, { type: 'hand', index: 0 }, 0); // wild starts pile, occupies the "1" slot
  check('wild-started pile topValue = 1', g.buildingPiles[0].topValue === 1);
  check('startedWithWild flag set', g.buildingPiles[0].startedWithWild === true);
  const two = p.hand.find(c => c.value === 2);
  check('a 2 plays next on a wild-started pile', E.canPlayOnBuilding(g, two, 0) === true);
  const one = p.hand.find(c => c.value === 1);
  check('a 1 does NOT play on a wild-started pile', E.canPlayOnBuilding(g, one, 0) === false);
})();

console.log('\n--- Pile completes at 12 and clears to buffer ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(3)
  );
  const p = g.players[0];
  // Hand the player 1..5, we'll keep refilling hand manually for the climb.
  // Simpler: directly drive a pile from 1 to 12 using forced cards.
  // Start pile with a 1.
  p.hand = [{ id: 's1', value: 1, isWild: false }, {id:'f1',value:7,isWild:false},{id:'f2',value:7,isWild:false},{id:'f3',value:7,isWild:false},{id:'f4',value:7,isWild:false}];
  E.playCard(g, { type: 'hand', index: 0 }, 0);
  // Now feed 2..12 one at a time from the top of the hand.
  for (let v = 2; v <= 12; v++) {
    p.hand.unshift({ id: 'k' + v, value: v, isWild: false });
    const r = E.playCard(g, { type: 'hand', index: 0 }, 0);
    check('play ' + v + ' ok', r.ok === true);
  }
  check('pile slot 0 cleared (null) after 12', g.buildingPiles[0] === null);
  check('completed buffer has 12 cards', g.completedPilesBuffer.length === 12);
})();

console.log('\n--- Discard ends the turn; no same-turn redraw ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(4)
  );
  const startIdx = g.currentTurnIndex;
  const before = g.players[startIdx].hand.length;
  check('hand starts at 5', before === 5);
  const r = E.discard(g, 0, 0);
  check('discard ok', r.ok === true);
  check('turn passed to other player', g.currentTurnIndex !== startIdx);
  check('discarder hand is now 4 (no redraw on their own discard)', g.players[startIdx].hand.length === 4);
  check('new active player drew up to 5', g.players[g.currentTurnIndex].hand.length === 5);
})();

console.log('\n--- Emptying hand BY PLAYING triggers same-turn redraw ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(5)
  );
  const p = g.players[0];
  // Give a hand of exactly one playable card: a single 1.
  p.hand = [{ id: 'only', value: 1, isWild: false }];
  const r = E.playCard(g, { type: 'hand', index: 0 }, 0);
  check('play ok', r.ok === true);
  check('hand refilled to 5 after playing last card', p.hand.length === 5);
  check('still same player (turn did not pass)', g.currentTurnIndex === 0);
})();

console.log('\n--- Win: emptying the stock pile ends the game ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(6)
  );
  const p = g.players[0];
  // Shrink stock to a single playable card (a 1) and play it from stock.
  p.stockPile = [{ id: 'last', value: 1, isWild: false }];
  const r = E.playCard(g, { type: 'stock' }, 0);
  check('play from stock ok', r.ok === true);
  check('gameOver reported', r.gameOver === true);
  check('winner is p1', g.winnerPlayerId === 'p1');
  check('status finished', g.status === 'finished');
})();

console.log('\n--- Discard pile: only top card is playable ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(7)
  );
  const p = g.players[0];
  // Stack discard pile 0 with [9 (bottom), 1 (top)].
  p.discardPiles[0] = [
    { id: 'btm', value: 9, isWild: false },
    { id: 'top', value: 1, isWild: false },
  ];
  const seen = E.peekSource(p, { type: 'discard', pileIndex: 0 });
  check('peek returns the TOP card (the 1)', seen.id === 'top');
  // Play it; the 9 underneath is now exposed.
  E.playCard(g, { type: 'discard', pileIndex: 0 }, 0);
  const nowTop = E.discardTop(p, 0);
  check('9 is now exposed on top', nowTop.id === 'btm');
})();

console.log('\n--- Max 4 building piles ---');
(function () {
  const g = E.createGame(
    [{ playerId: 'p1', displayName: 'A' }, { playerId: 'p2', displayName: 'B' }],
    seededRng(8)
  );
  const p = g.players[0];
  p.hand = [
    { id: 'o1', value: 1, isWild: false },
    { id: 'o2', value: 1, isWild: false },
    { id: 'o3', value: 1, isWild: false },
    { id: 'o4', value: 1, isWild: false },
    { id: 'o5', value: 1, isWild: false },
  ];
  for (let s = 0; s < 4; s++) E.playCard(g, { type: 'hand', index: 0 }, s);
  check('4 piles now occupied', g.buildingPiles.every(p => p !== null));
  // There is no 5th slot; index 4 is out of range and must be rejected.
  const r = E.canPlayOnBuilding(g, p.hand[0], 4);
  check('cannot play to a 5th slot', r === false);
})();

console.log('\n=============================');
console.log('  ' + pass + ' passed, ' + fail + ' failed');
console.log('=============================\n');
process.exit(fail === 0 ? 0 : 1);
