/** Aggregate completed games on home; resumed games count in wins but not full-game timings. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Go statistics unavailable';
  ns.atExit(() => port.write(result));
  try {
    const game = JSON.parse(ns.args[0]);
    if (typeof game.opponent !== 'string' || ![5, 7, 9, 13, 19].includes(game.size) ||
      ![game.blackScore, game.whiteScore, game.durationMs].every(Number.isFinite) || game.durationMs < 0)
      throw new Error('Invalid completed Go game');
    const file = '/data/go-results.json';
    const stats = JSON.parse(ns.read(file) || '{}');
    const key = `${game.opponent}:${game.size}`;
    const row = stats[key] ??= {opponent: game.opponent, size: game.size, games: 0, wins: 0,
      blackScore: 0, timedGames: 0, durationMs: 0};
    row.games++;
    row.wins += Number(game.blackScore >= game.whiteScore);
    row.blackScore += game.blackScore;
    if (!game.resumed) { row.timedGames++; row.durationMs += game.durationMs; }
    row.updatedAt = Date.now();
    await ns.write(file, JSON.stringify(stats, null, 2), 'w');
    result = true;
  } catch (error) { result = `ERROR:${String(error)}`; }
}
