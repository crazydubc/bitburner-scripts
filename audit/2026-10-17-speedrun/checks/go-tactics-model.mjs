// Per-board analysis only. The engine's valid-move mask remains authoritative for ko/superko.
export function analyzeGoBoard(board) {
  const size = board.length;
  const groups = [];
  const at = Array.from({length: size}, () => Array(size).fill(null));
  const neighbors = (x, y) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < size && ny < size);
  const key = (x, y) => x * size + y;
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) {
    const color = board[x][y];
    if (!['X', 'O'].includes(color) || at[x][y]) continue;
    const group = {color, stones: [], liberties: new Set()};
    const pending = [[x, y]];
    at[x][y] = group;
    while (pending.length) {
      const [gx, gy] = pending.pop();
      group.stones.push([gx, gy]);
      for (const [nx, ny] of neighbors(gx, gy)) {
        if (board[nx][ny] === '.') group.liberties.add(key(nx, ny));
        else if (board[nx][ny] === color && !at[nx][ny]) {
          at[nx][ny] = group;
          pending.push([nx, ny]);
        }
      }
    }
    groups.push(group);
  }
  const cache = new Map();
  function move(x, y, color = 'X') {
    const cacheKey = `${color}:${x},${y}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (board[x]?.[y] !== '.') return null;
    const friendly = new Set(), captured = new Set(), liberties = new Set();
    const played = key(x, y);
    for (const [nx, ny] of neighbors(x, y)) {
      const group = at[nx][ny];
      if (board[nx][ny] === '.') liberties.add(key(nx, ny));
      else if (group?.color === color) friendly.add(group);
      else if (group && group.liberties.size === 1 && group.liberties.has(played)) captured.add(group);
    }
    const stones = [[x, y], ...[...friendly].flatMap(group => group.stones)];
    for (const group of friendly) for (const liberty of group.liberties) liberties.add(liberty);
    liberties.delete(played);
    // Captured intersections are liberties only when adjacent to the resulting friendly chain.
    for (const [gx, gy] of stones) for (const [nx, ny] of neighbors(gx, gy))
      if (captured.has(at[nx][ny])) liberties.add(key(nx, ny));
    let saved = 0;
    for (const group of groups) {
      if (group.color !== color || group.liberties.size !== 1) continue;
      if (friendly.has(group)) {
        if (liberties.size > 1) saved += group.stones.length;
      } else if (captured.size) {
        // A counter-capture can rescue a chain that does not touch the new stone.
        const after = new Set(group.liberties);
        after.delete(played);
        for (const [gx, gy] of group.stones) for (const [nx, ny] of neighbors(gx, gy))
          if (captured.has(at[nx][ny])) after.add(key(nx, ny));
        if (after.size > 1) saved += group.stones.length;
      }
    }
    const result = {
      liberties: liberties.size, saved, size: stones.length,
      captured: [...captured].reduce((sum, group) => sum + group.stones.length, 0),
    };
    cache.set(cacheKey, result);
    return result;
  }
  return {at, groups, move};
}

/** Rank immediate captures and atari rescues by actual distinct stones, then breathing room. */
export function chooseGoTactic(analysis, validMoves) {
  let best = null, bestValue = 0, bestLiberties = -1;
  for (const [x, y] of validMoves) {
    const move = analysis.move(x, y);
    if (!move || move.liberties === 0 || (move.liberties === 1 && move.captured === 0)) continue;
    // Avoid trading a larger connected chain for a smaller capture. Single-stone ko captures remain eligible.
    if (move.liberties === 1 && move.captured < move.size) continue;
    const value = move.captured + move.saved;
    if (value > bestValue || (value === bestValue && value > 0 && move.liberties > bestLiberties)) {
      bestValue = value;
      bestLiberties = move.liberties;
      best = {coords: [x, y], msg: `Tactical: capture ${move.captured}, save ${move.saved}, liberties ${move.liberties}`};
    }
  }
  return best ?? [];
}

export function shuffleGoMoves(moves, random = Math.random) {
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  return moves;
}
