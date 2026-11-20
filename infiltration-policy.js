export const INFILTRATION_TARGET = '/Temp/infiltration-target.txt';
export const INFILTRATION_LEASE = '/Temp/infiltration-lease.txt';
export const INFILTRATION_ACK = '/Temp/infiltration-worker-ack.txt';
export const INFILTRATION_HISTORY = '/data/infiltration-results.json';
export const INFILTRATION_PROGRESS = '/Temp/infiltration-progress.txt';
export const SOA_FACTION = 'Shadows of Anarchy';
export const SOA_WKS = 'SoA - phyzical WKS harmonizer';
export const SOA_AUGS = [SOA_WKS, 'SoA - Beauty of Aphrodite', 'SoA - Chaos of Dionysus',
  'SoA - Flood of Poseidon', 'SoA - Hunt of Artemis', 'SoA - Knowledge of Apollo',
  'SoA - Might of Ares', 'SoA - Trickery of Hermes', 'SoA - Wisdom of Athena'];

/** SoA uses its own cost multipliers, including queued purchases. Never use ordinary aug inflation. */
export function soaAugmentationQuote(owned) {
  const count = SOA_AUGS.filter(name => owned.includes(name)).length;
  return {cost: 1e6 * 7 ** count, rep: 1e4 * 1.3 ** count};
}

/** WKS first; remaining SoA augs are modest count additions until the Daedalus threshold is covered. */
export function planSoaProgression({owned, joined, rep, money, reserve, augRequirement = 30, factions = [], quotes}) {
  if (!Array.isArray(owned) || ![rep, money, reserve, augRequirement].every(Number.isFinite) ||
    rep < 0 || money < 0 || reserve < 0 || augRequirement < 0 || owned.includes('The Red Pill')) return null;
  const next = SOA_AUGS.find(name => !owned.includes(name));
  if (!next) return null;
  const rewardAug = next === SOA_WKS;
  if (!rewardAug && (new Set(owned).size >= augRequirement || factions.includes('Daedalus'))) return null;
  const quote = quotes?.[next];
  if (!quote || ![quote.cost, quote.rep].every(Number.isFinite) || quote.cost < 0 || quote.rep <= 0) return null;
  const budget = Math.max(0, Math.min(money - reserve, rewardAug ? money : money * 0.05));
  // Avoid grinding solely for expensive count fillers. Ordinary income may make them worthwhile later.
  if (!rewardAug && quote.cost > budget) return null;
  return {augmentation: next, cost: quote.cost, targetRep: quote.rep, rep: joined ? rep : 0,
    needsInvite: !joined, budget, canBuy: joined && rep >= quote.rep && quote.cost <= budget,
    moneyTarget: rewardAug ? reserve + quote.cost : 0};
}

export function infiltrationAlternativeIncome(scriptIncome, sources, elapsedSeconds) {
  const recurring = ['hacking', 'hacknet', 'corporation', 'stock', 'gang', 'sleeves', 'work', 'bladeburner', 'darknet'];
  const average = recurring.reduce((sum, name) => sum + Math.max(0, Number(sources?.[name]) || 0), 0) /
    Math.max(1, elapsedSeconds);
  return Math.max(0, Number(scriptIncome) || 0, average);
}

export function freshInfiltrationTarget(target, reset, factions, now = Date.now()) {
  return target && target.lastAugReset === reset.lastAugReset && target.lastNodeReset === reset.lastNodeReset &&
    now >= target.updatedAt && now - target.updatedAt <= 90_000 && factions.includes(target.faction) &&
    ['faction-rep', 'donation-unlock'].includes(target.kind) && Number.isFinite(target.targetRep) && target.targetRep > 0;
}

/** Use real BN-adjusted quotes, same-city locations, and a conservative duration estimate. */
export function chooseInfiltration({locations, player, target, rep, moneyTarget, income = 0,
  minDemand = 0.8, demand = minDemand, company = '', remainingMs = 120_000, history = {}, soa = null}) {
  if (!Number.isFinite(demand) || demand < minDemand || demand > 1) return null;
  const mode = target && player.factions.includes(target.faction) && (rep == null || target.targetRep > rep) ? 'rep' : 'money';
  const gap = mode === 'rep' ? (rep == null ? Infinity : target.targetRep - rep) :
    Math.max(moneyTarget, soa?.moneyTarget ?? 0) - player.money;
  const soaGap = soa ? (soa.needsInvite ? 1 : Math.max(0, soa.targetRep - soa.rep)) : 0;
  if (!(gap > 0) && !(soaGap > 0)) return null;
  const rows = locations.filter(location => location.location.city === player.city &&
    (!company || location.location.name === company) && Number.isFinite(location.difficulty) && location.difficulty < 3.5 &&
    Number.isInteger(location.maxClearanceLevel) && location.maxClearanceLevel > 0).map(location => {
    const past = history[location.location.name];
    const seconds = Math.max(3 + location.maxClearanceLevel * 1.3,
      past?.games >= 2 ? past.durationMs / past.games / 1000 : 0);
    const reward = location.reward[mode === 'rep' ? 'tradeRep' : 'sellCash'] * demand;
    const soaReward = location.reward.SoARep * demand;
    const rate = reward / seconds;
    const alternative = mode === 'rep' ? Math.max(0, Number(target.repRate) || 0) : Math.max(0, income);
    return {company: location.location.name, mode, faction: mode === 'rep' ? target.faction : '',
      targetRep: target?.targetRep, reward, soaReward, seconds, rate, alternative,
      utility: Math.min(gap, reward) / seconds,
      soaUtility: Math.min(soaGap, soaReward) / seconds};
  }).filter(row => Number.isFinite(row.reward) && row.reward >= 0 && row.seconds * 1000 <= remainingMs);
  const productive = rows.filter(row => gap > 0 && row.reward > 0 && row.rate >= row.alternative * 1.5 &&
    (row.alternative === 0 || gap / row.alternative > row.seconds));
  if (productive.length) return productive.sort((a, b) => b.utility - a.utility || a.seconds - b.seconds)[0];
  // SoA reputation arrives alongside either normal reward; it is never a dropdown recipient.
  const training = rows.filter(row => soaGap > 0 && Number.isFinite(row.soaUtility) && row.soaUtility > 0);
  return training.sort((a, b) => b.soaUtility - a.soaUtility || a.seconds - b.seconds)[0] ?? null;
}
