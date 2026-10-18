export const INFILTRATION_TARGET = '/Temp/infiltration-target.txt';
export const INFILTRATION_LEASE = '/Temp/infiltration-lease.txt';
export const INFILTRATION_ACK = '/Temp/infiltration-worker-ack.txt';
export const INFILTRATION_HISTORY = '/data/infiltration-results.json';

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
  minDemand = 0.8, demand = minDemand, company = '', remainingMs = 120_000, history = {}}) {
  if (!Number.isFinite(demand) || demand < minDemand || demand > 1) return null;
  const mode = target && player.factions.includes(target.faction) && (rep == null || target.targetRep > rep) ? 'rep' : 'money';
  const gap = mode === 'rep' ? (rep == null ? Infinity : target.targetRep - rep) : moneyTarget - player.money;
  if (!(gap > 0)) return null;
  const rows = locations.filter(location => location.location.city === player.city &&
    (!company || location.location.name === company) && Number.isFinite(location.difficulty) && location.difficulty < 3.5 &&
    Number.isInteger(location.maxClearanceLevel) && location.maxClearanceLevel > 0).map(location => {
    const past = history[location.location.name];
    const seconds = Math.max(3 + location.maxClearanceLevel * 1.3,
      past?.games >= 2 ? past.durationMs / past.games / 1000 : 0);
    const reward = location.reward[mode === 'rep' ? 'tradeRep' : 'sellCash'] * demand;
    const rate = reward / seconds;
    const alternative = mode === 'rep' ? Math.max(0, Number(target.repRate) || 0) : Math.max(0, income);
    return {company: location.location.name, mode, faction: mode === 'rep' ? target.faction : '',
      targetRep: target?.targetRep, reward, seconds, rate, alternative,
      utility: Math.min(gap, reward) / seconds};
  }).filter(row => Number.isFinite(row.reward) && row.reward > 0 && row.seconds * 1000 <= remainingMs &&
    row.rate >= row.alternative * 1.5 && (row.alternative === 0 || gap / row.alternative > row.seconds));
  return rows.sort((a, b) => b.utility - a.utility || a.seconds - b.seconds)[0] ?? null;
}
