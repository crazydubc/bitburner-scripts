import { GO_SAMPLE_LIMIT } from '../go-policy.js';

/** Keep legacy totals and bounded, strategy/cheat/speed-specific adaptation samples on home. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Go statistics unavailable';
  ns.atExit(() => port.write(result));
  try {
    const file = '/data/go-results.json';
    const stats = JSON.parse(ns.read(file) || '{}');
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('Invalid Go statistics file');
    if (ns.args[0] === 'read') { result = stats; return; }
    const game = JSON.parse(ns.args[0]);
    if (typeof game.opponent !== 'string' || ![5, 7, 9, 13, 19].includes(game.size) ||
      ![game.blackScore, game.whiteScore, game.durationMs].every(Number.isFinite) || game.durationMs < 0)
      throw new Error('Invalid completed Go game');
    const key = `${game.opponent}:${game.size}`;
    const row = stats[key] ??= {opponent: game.opponent, size: game.size, games: 0, wins: 0,
      blackScore: 0, timedGames: 0, durationMs: 0};
    row.games++;
    const won = typeof game.won === 'boolean' ? game.won : game.blackScore >= game.whiteScore;
    row.wins += Number(won);
    row.blackScore += game.blackScore;
    if (!game.resumed) { row.timedGames++; row.durationMs += game.durationMs; }
    row.updatedAt = Date.now();
    if (!game.resumed && typeof game.cohort === 'string' && game.cohort.length < 100 && game.durationMs > 0) {
      const cohorts = stats._adaptive ??= {};
      // Retain a few configurations; arbitrary threshold experiments cannot grow the file forever.
      if (!cohorts[game.cohort] && Object.keys(cohorts).length >= 8) delete cohorts[Object.keys(cohorts)[0]];
      const cohort = cohorts[game.cohort] ??= {};
      cohort[key] = [...(cohort[key] ?? []), {won, durationMs: game.durationMs}].slice(-GO_SAMPLE_LIMIT);
      cohort[`${game.opponent}:completed`] = (Number(cohort[`${game.opponent}:completed`]) || 0) + 1;
      if (game.trial) cohort[`${game.opponent}:lastTrial`] = cohort[`${game.opponent}:completed`];
    }
    await ns.write(file, JSON.stringify(stats, null, 2), 'w');
    result = true;
  } catch (error) { result = `ERROR:${String(error)}`; }
}
