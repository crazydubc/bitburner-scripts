// Bump this when move priorities change: old strategies must not train a new one.
export const GO_STRATEGY = 'patterns-1';
export const GO_SIZES = [5, 7, 9, 13];
export const GO_SAMPLE_LIMIT = 60;

export function goCohort(cheats, threshold, bonus) {
  return `${GO_STRATEGY}:${cheats ? `cheats-${threshold}` : 'no-cheats'}:${bonus ? 'bonus' : 'normal'}`;
}

/** One-sided 90% Wilson lower bound. Small perfect records are still uncertain. */
export function winConfidence(wins, games) {
  if (!(games > 0)) return 0;
  const z = 1.282, p = wins / games, z2 = z * z;
  return (p + z2 / (2 * games) - z * Math.sqrt((p * (1 - p) + z2 / (4 * games)) / games)) / (1 + z2 / games);
}

export function summarizeGoSamples(samples) {
  const rows = (Array.isArray(samples) ? samples : []).filter(row =>
    typeof row?.won === 'boolean' && Number.isFinite(row.durationMs) && row.durationMs > 0).slice(-GO_SAMPLE_LIMIT);
  const wins = rows.filter(row => row.won).length;
  return {games: rows.length, wins, rate: rows.length ? wins / rows.length : 0,
    confidence: winConfidence(wins, rows.length),
    durationMs: rows.length ? rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length : Infinity};
}

/** Reliability first, then full-game wall time, independently for each opponent. */
export function selectGoBoard({opponent, requested = 'auto', stats = {}, cohort, streak = 0, explore = true}) {
  if (opponent === '????????????') return {size: 19, reason: 'fixed hidden board'};
  if (requested !== 'auto') return {size: Number(requested), reason: 'manual size'};
  const data = stats?._adaptive?.[cohort] ?? {};
  const rows = GO_SIZES.map(size => ({size, ...summarizeGoSamples(data[`${opponent}:${size}`])}));
  const proven = rows.filter(row => row.games >= 12);
  const bestConfidence = Math.max(0, ...proven.map(row => row.confidence));
  // A faster candidate may give up at most 5 percentage points of measured reliability.
  const bestRate = Math.max(0, ...proven.map(row => row.rate));
  const reliable = proven.filter(row => row.rate >= 0.8 && row.rate >= bestRate - 0.05 &&
    row.confidence >= 0.65 && row.confidence >= bestConfidence - 0.05);
  const selected = reliable.sort((a, b) => a.durationMs - b.durationMs)[0] ??
    (rows[3].games >= 12 ? proven.sort((a, b) => b.confidence - a.confidence || a.durationMs - b.durationMs)[0] : rows[3]);
  // Learn at most once in eight starts per opponent, only after a loss/no active streak.
  // This counter is lifetime within this cohort; the rolling sample window is bounded separately.
  const played = Number(data[`${opponent}:completed`] ?? 0);
  const lastTrial = Number(data[`${opponent}:lastTrial`] ?? -4);
  if (explore && streak <= 0 && played >= 4 && played - lastTrial >= 8) {
    const order = opponent === 'Illuminati' ? [9, 7, 5, 13] : [5, 7, 9, 13];
    const candidate = rows.filter(row => row.size !== selected.size && row.games < GO_SAMPLE_LIMIT)
      .sort((a, b) => a.games - b.games || order.indexOf(a.size) - order.indexOf(b.size))[0];
    if (candidate) return {size: candidate.size, trial: true, reason: `bounded trial (${candidate.games} full games recorded)`};
  }
  return {size: selected.size, reason: selected.games >= 12
    ? `${selected.wins}/${selected.games} recent wins, ${(selected.durationMs / 1000).toFixed(1)}s/game`
    : '13x13 baseline while collecting reliable timing data'};
}
