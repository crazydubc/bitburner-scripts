import assert from 'node:assert/strict';
import {analyzeGoBoard, chooseGoTactic, shuffleGoMoves} from './go-tactics-model.mjs';
import {loadGoEngine} from './go-engine.mjs';

const e = await loadGoEngine(process.argv[2] ?? '../bitburner-engine');
const {black, white} = e.GoColor;
let comparisons = 0;
function compare(boardState) {
  const board = e.simpleBoardFromBoard(boardState.board);
  const analysis = analyzeGoBoard(board);
  for (const [color, stone] of [[black, 'X'], [white, 'O']]) {
    const state = {...boardState, previousPlayer:color === black ? white : black};
    for (const {x, y} of e.getAllValidMoves(state, color)) {
      const predicted = analysis.move(x, y, stone);
      const actual = e.evaluateMoveResult(state.board, x, y, color, true);
      const point = actual[x][y];
      const enemy = color === black ? white : black;
      const count = b => b.flat().filter(p => p?.color === enemy).length;
      assert.equal(predicted.liberties, point.liberties.length, `liberties at ${stone} ${x},${y} on ${board}`);
      assert.equal(predicted.captured, count(state.board) - count(actual), `captures at ${stone} ${x},${y}`);
      assert.equal(predicted.size, actual.flat().filter(p => p && p.chain === point.chain).length);
      comparisons++;
    }
  }
}

// Captures, a chain touching a move on several sides, shared liberties, board edges, and offline nodes.
for (const board of [
  ['.XX..', 'X.X..', '.XX..', '.....', '.....'],
  ['.XX..', 'XOX..', 'X....', '.....', '.....'],
  ['#OX##', 'OO.X.', 'XXX..', '.....', '.....'],
  ['#####', '#O.##', '#X.##', '#####', '#####'],
]) compare(e.getNewBoardStateFromSimpleBoard(board));

const rescue = analyzeGoBoard(['#####', '#O.##', '#X.##', '#####', '#####']);
const tactic = chooseGoTactic(rescue, [[2, 2], [1, 2]]);
assert.deepEqual(tactic.coords, [1, 2], 'Capture the atari attacker instead of extending into another atari');
assert.equal(rescue.move(2, 2).liberties, 1);
assert.equal(chooseGoTactic(rescue, []).coords, undefined, 'Never invent a move absent from the legal mask');

// Compare to the reference implementation on positions produced by legal play, not just hand-picked fixtures.
let seed = 1234567;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
for (const size of [5, 7, 13]) {
  e.Player.totalPlaytime = 100 + size;
  const state = e.getNewBoardState(size, e.GoOpponent.Netburners, true);
  e.Go.currentGame = state;
  e.updateChains(state.board);
  for (let ply = 0; ply < 55; ply++) {
    if (ply % 5 === 0) compare(state);
    const color = state.previousPlayer === black ? white : black;
    const moves = e.getAllValidMoves(state, color);
    if (!moves.length) { e.passTurn(state, color, false); continue; }
    const move = moves[Math.floor(random() * moves.length)];
    assert(e.makeMove(state, move.x, move.y, color));
  }
}
const shuffled = shuffleGoMoves([[0, 0], [0, 1], [1, 0]], () => 0);
assert.equal(new Set(shuffled.map(p => p.join(','))).size, 3);
console.log(`${comparisons} move/liberty/capture comparisons passed against the official Go engine; tactical checks passed`);
