// Bump this when move priorities change: old strategies must not train a new one.
export const GO_STRATEGY = 'patterns-1';
export const GO_SIZES = [5, 7, 9, 13];
export const GO_SAMPLE_LIMIT = 60;
export const GO_GOALS = ['auto', 'crime', 'combat', 'rep', 'money', 'hacking'];
export const GO_OPPONENTS = ['Netburners', 'Slum Snakes', 'The Black Hand', 'Tetrads', 'Daedalus', 'Illuminati'];
export const GO_FAVOR_BUDGET_MS = 15 * 60_000;
// User's 2026-10-20 patterns-1/no-cheats/normal results: conservative favor rewards/minute.
// These are fixed defaults, not seeded runtime samples. Small-board evidence is still limited.
export const GO_BOARD_PROFILE = Object.freeze({
  'Netburners': 5, 'Slum Snakes': 5, 'The Black Hand': 7,
  'Tetrads': 5, 'Daedalus': 5, 'Illuminati': 13,
});

const hiddenOpponent = '????????????';
const positive = value => Number.isFinite(value) && value > 0 ? value : 0;

export function hasHiddenGoOpponent(reset) {
  const augs = reset?.ownedAugs;
  return augs instanceof Map ? augs.has('The Red Pill') : Number(augs?.['The Red Pill']) > 0;
}

/** Ignore old worker plans after a reset, shutdown, or a change of work. */
export function freshGoWorkTarget(target, reset, now = Date.now()) {
  return !!target && Number.isFinite(target.updatedAt) && now >= target.updatedAt && now - target.updatedAt <= 90_000 &&
    target.lastAugReset === reset?.lastAugReset && target.lastNodeReset === reset?.lastNodeReset &&
    ['faction-rep', 'donation-unlock'].includes(target.kind) && typeof target.faction === 'string';
}

/** Detect a cash seller without changing its configuration or redirecting any hashes. */
export function sellsGoHashesForMoney(args, config = {}) {
  if (!Array.isArray(args)) return false;
  const explicit = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--spend-on') explicit.push(args[++i]);
    else if (typeof args[i] === 'string' && args[i].startsWith('--spend-on=')) explicit.push(args[i].slice(11));
  }
  const options = Array.isArray(config) ? Object.fromEntries(config) : config;
  const actions = explicit.length ? explicit : options?.['spend-on'] ?? ['Sell for Money'];
  return Array.isArray(actions) && actions.some(action => typeof action === 'string' && action.replaceAll('_', ' ') === 'Sell for Money');
}

/** A donation unlock is valuable only with a useful, affordable purchase and a short measured route.
 * Official favor conversion and Go's per-faction reward cap; current faction rep is NOT current favor. */
export function selectGoFavorTarget({context, reset, stats = {}, liveStats = {}, cohort, boardSize = 'profile',
  favorDeadlines = {}, now = Date.now()}) {
  const snapshot = context?.favorSnapshot;
  if (!snapshot || snapshot.current_node !== reset?.currentNode || snapshot.last_aug_reset !== reset?.lastAugReset ||
    !Number.isFinite(snapshot.generated_at) || snapshot.generated_at < reset.lastAugReset ||
    now < snapshot.generated_at || now - snapshot.generated_at > 90_000 || !Array.isArray(snapshot.go_favor_targets) ||
    !Array.isArray(context.factions) || !Number.isFinite(context.money) || !Number.isFinite(context.reserve) || context.reserve < 0) return null;
  const sf14 = reset.ownedSF instanceof Map ? reset.ownedSF.get(14) : reset.ownedSF?.[14];
  const maxRep = 100_000 * (1 + Math.min(3, positive(sf14)));
  const reward = maxRep / 200, spendable = Math.max(0, context.money - context.reserve);
  const favorRep = favor => 25_000 * Math.expm1(0.019802627296179712 * favor);
  const candidates = [];
  for (const target of snapshot.go_favor_targets) {
    if (!GO_OPPONENTS.includes(target?.faction) || !context.factions.includes(target.faction) ||
      ![target.currentFavor, target.requiredFavor, target.cost, target.goRep].every(Number.isFinite) ||
      target.currentFavor < 0 || target.currentFavor >= target.requiredFavor || target.cost <= 0 ||
      target.cost > spendable || target.goRep < 0 || typeof target.augmentation !== 'string') continue;
    const live = liveStats[target.faction];
    if (!live || !Number.isFinite(live.rep) || live.rep < target.goRep) continue;
    // Go favor earned since the planner read must not be requested twice before the next refresh.
    const gap = favorRep(target.requiredFavor) - favorRep(target.currentFavor) - (live.rep - target.goRep);
    if (!(gap > 1e-7) || gap > maxRep - live.rep + 1e-7) continue;
    const rewards = Math.ceil((gap - 1e-7) / reward);
    const board = selectGoBoard({opponent: target.faction, requested: boardSize, stats, cohort,
      streak: live.winStreak, favorRewards: rewards, explore: false});
    const samples = summarizeGoSamples(stats?._adaptive?.[cohort]?.[`${target.faction}:${board.size}`]);
    if (samples.games < 4 || samples.confidence <= 0) continue; // No invented game-time forecast.
    const eta = goFavorEta(samples, rewards, live.winStreak);
    const key = `${reset.lastAugReset}:${target.faction}:${target.requiredFavor}`;
    const remaining = Math.min(GO_FAVOR_BUDGET_MS, (favorDeadlines[key] ?? now + GO_FAVOR_BUDGET_MS) - now);
    if (eta > remaining) continue;
    candidates.push({opponent: target.faction, board, eta, key, rewards, augmentation: target.augmentation,
      reason: `funded donation unlock for ${target.faction}: ~${Math.ceil(eta / 60_000)}m, ${rewards} favor rewards; ${target.augmentation}`});
  }
  return candidates.sort((a, b) => a.eta - b.eta)[0] ?? null;
}

/** Goal relevance first; bonus balance and same-strategy reliability break useful alternatives apart.
 * Weights are routing heuristics, not predictions of income or a guaranteed win rate. */
export function selectAutoGoOpponent({goal = 'auto', context = null, reset, includeHidden = true,
  liveStats = {}, stats = {}, cohort, boardSize = 'profile', favorDeadlines = {}, now = Date.now()} = {}) {
  const fresh = context && Number.isFinite(context.updatedAt) && now >= context.updatedAt && now - context.updatedAt <= 30_000 &&
    context.lastAugReset === reset?.lastAugReset && context.lastNodeReset === reset?.lastNodeReset;
  const state = fresh ? context : {};
  if (goal === 'auto' || goal === 'rep') {
    const favor = selectGoFavorTarget({context: state, reset, stats, liveStats, cohort, boardSize, favorDeadlines, now});
    if (favor) {
      favorDeadlines[favor.key] ??= now + GO_FAVOR_BUDGET_MS;
      return {...favor, goal: 'favor'};
    }
  }
  const work = state.work;
  const target = freshGoWorkTarget(state.target, reset, now) ? state.target : null;
  const cashLow = Number.isFinite(state.money) && state.money < Math.max(1e6, positive(state.reserve));
  let reason = `manual ${goal} goal`;
  if (goal === 'auto') {
    if (work?.type === 'CRIME') { goal = 'crime'; reason = `crime work (${work.crimeType ?? 'active crime'})`; }
    else if (work?.type === 'CLASS' && ['str', 'def', 'dex', 'agi'].includes(work.classType)) {
      goal = 'combat'; reason = `combat training (${work.classType})`;
    } else if (['FACTION', 'COMPANY'].includes(work?.type)) {
      goal = 'rep'; reason = `reputation work (${work.factionName ?? work.companyName ?? 'active work'})`;
    } else if (!state.workKnown && target) { goal = 'rep'; reason = `worker reputation target (${target.faction})`; }
    else if (hasHiddenGoOpponent(reset)) { goal = 'hacking'; reason = 'installed Red Pill: build hacking level'; }
    else if (cashLow) { goal = 'money'; reason = 'cash below reserve / early cash cushion'; }
    else { goal = 'hacking'; reason = fresh ? 'background hacking progress' : 'goal data unavailable: hacking fallback'; }
  }
  const weights = {};
  if (goal === 'rep') weights.Daedalus = 1;
  else if (goal === 'combat') weights.Tetrads = 1;
  else if (goal === 'crime') {
    // Avoid farming an already capped success multiplier; combat stats help unlock harder crimes too.
    const chance = state.crimeChance;
    weights['Slum Snakes'] = Number.isFinite(chance) && chance >= 0 && chance <= 1 ? Math.min(1, (1 - chance) / 0.25) : 1;
    weights.Tetrads = 0.8;
  } else if (goal === 'money') {
    const hacknet = positive(state.hacknetCashRate), hacking = positive(state.hackingIncome);
    // BN8 disables these cash sources. Never prioritize nonexistent/disabled nodes or unspent hashes.
    const usefulHacknet = reset?.currentNode !== 8 && hacknet > 0 && hacknet >= hacking * 0.1;
    if (usefulHacknet) {
      weights.Netburners = 1;
      reason += '; productive Hacknet cash source';
    }
    weights['The Black Hand'] = reset?.currentNode === 8 ? 0 : usefulHacknet ? 0.65 : 1;
    weights.Illuminati = reset?.currentNode === 8 ? 1 : usefulHacknet ? 0.45 : 0.75;
  } else {
    weights['The Black Hand'] = reset?.currentNode === 8 ? 0 : 1;
    weights.Illuminati = 0.8;
    if (includeHidden && hasHiddenGoOpponent(reset)) {
      weights[hiddenOpponent] = 1.4;
      weights['The Black Hand'] *= 0.5;
    }
  }
  const candidates = Object.entries(weights).filter(([, weight]) => weight > 0).map(([opponent, weight]) => {
    const size = selectGoBoard({opponent, requested: boardSize, stats, cohort, explore: false}).size;
    const samples = summarizeGoSamples(stats?._adaptive?.[cohort]?.[`${opponent}:${size}`]);
    const reliability = samples.games >= 12 ? 0.5 + 0.5 * samples.confidence : 0.9;
    const bonus = positive(liveStats?.[opponent]?.bonusPercent);
    return {opponent, score: weight * reliability / (1 + bonus / 100), bonus, samples};
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {opponent: best.opponent, goal, reason: `${reason}; current bonus +${best.bonus.toFixed(1)}%` +
    (best.samples.games >= 12 ? `, ${best.samples.wins}/${best.samples.games} recent wins` : '')};
}

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

/** Expected time for consecutive-win rewards, using a conservative win probability.
 * A reward needs two wins in a row; a loss breaks the pair. Board area does not affect favor. */
export function goFavorEta(samples, rewards = 1, streak = 0) {
  const p = samples.confidence;
  if (!(p > 0 && p <= 1) || !Number.isFinite(samples.durationMs) || samples.durationMs <= 0 ||
    !Number.isInteger(rewards) || rewards < 1) return Infinity;
  const pairGames = (1 + p) / (p * p);
  const firstGames = streak > 0 && streak % 2 === 1 ? 1 + (1 - p) * pairGames : pairGames;
  return (firstGames + (rewards - 1) * pairGames) * samples.durationMs;
}

/** Fixed measured profile by default. Optional auto mode learns within the current cohort.
 * Funded favor routes minimize time to the remaining rewards; other auto goals retain reliability-first learning. */
export function selectGoBoard({opponent, requested = 'profile', stats = {}, cohort, streak = 0, explore = true, favorRewards = 0}) {
  if (opponent === '????????????') return {size: 19, reason: 'fixed hidden board'};
  if (requested === 'profile') return {size: GO_BOARD_PROFILE[opponent] ?? 13, reason: 'fixed favor/time profile (2026-10-20 results)'};
  if (requested !== 'auto') return {size: Number(requested), reason: 'manual size'};
  const data = stats?._adaptive?.[cohort] ?? {};
  const rows = GO_SIZES.map(size => ({size, ...summarizeGoSamples(data[`${opponent}:${size}`])}));
  if (favorRewards > 0) {
    const best = rows.filter(row => row.games >= 4 && row.confidence > 0)
      .sort((a, b) => goFavorEta(a, favorRewards, streak) - goFavorEta(b, favorRewards, streak))[0];
    if (best) return {size: best.size, reason: `fastest measured favor route: ${best.wins}/${best.games} wins, ${(best.durationMs / 1000).toFixed(1)}s/game`};
  }
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
