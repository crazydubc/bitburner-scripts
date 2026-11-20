import { singRun, getActiveSourceFiles, getReserve, purchase } from './utils.js'
const purchasedServerName = "daemon";

/** Quotes are cumulative price differences, so one jump costs the same as consecutive doublings. */
export function affordableCloudUpgrade(currentRam, maxRam, budget, quote) {
  if (![currentRam, maxRam, budget].every(Number.isFinite) || currentRam <= 0 || maxRam <= currentRam || budget < 0 ||
    !Number.isInteger(Math.log2(currentRam)) || !Number.isInteger(Math.log2(maxRam))) return null;
  let lower = Math.log2(currentRam) + 1, upper = Math.log2(maxRam), best = null;
  while (lower <= upper) {
    const exponent = Math.floor((lower + upper) / 2), ram = 2 ** exponent, cost = quote(ram);
    if (typeof cost !== 'number' || Number.isNaN(cost) || cost < 0) return null;
    if (Number.isFinite(cost) && cost <= budget) { best = {ram, cost}; lower = exponent + 1; }
    else upper = exponent - 1;
  }
  return best;
}
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');
  while (true) {
    await tryUpgradeRam(ns);
    await ns.sleep(1000);
  }
}

/** @param {NS} ns */
async function tryUpgradeRam(ns) {
  const unlockedSFlevels = await getActiveSourceFiles(ns, true);
  const money = ns.getServerMoneyAvailable("home");
  let spendable = money * 0.2; // One shared allowance for this pass, including initial purchases.
  const availableBudget = async () => {
    const reserve = await getReserve(ns);
    const cash = ns.getServerMoneyAvailable("home");
    if (!Number.isFinite(reserve) || !Number.isFinite(cash) || !Number.isFinite(spendable)) return 0;
    return Math.max(0, Math.min(spendable, cash - Math.max(0, reserve)));
  };
  spendable = await availableBudget(); // Later income/reserve reductions must not enlarge this pass's allowance.
  if (spendable <= 0) return false;

  //Get basic cloud servers first if able
  let servers = ns.cloud.getServerNames();
  const maxServers = ns.cloud.getServerLimit();
  let serverAmount = servers.length;
  for (let i = serverAmount; i < maxServers; i++) {
    const cost = ns.cloud.getServerCost(2);
    if (!Number.isFinite(cost) || cost < 0 || cost > await availableBudget()) break;
    const bought = await purchase(ns, 'cloud', 'purchaseServer', [purchasedServerName, 2], {budget: spendable});
    const server = bought.result;
    if (!server) break;
    servers.push(server);
    spendable -= bought.spent;
    await ns.sleep(10);
  }
  let max_ram = 2 ** 30;//max ram for home
  //We want to prioritize home ram as it is persistent. If we have BN 4...
  if (4 in unlockedSFlevels) {
    let currentRam = ns.getServerMaxRam("home");
    let cost = (await singRun(ns, 'getUpgradeHomeRamCost'));
    if (Number.isFinite(cost) && cost >= 0 && currentRam < max_ram) {
      if (cost <= await availableBudget() && (await purchase(ns, 'singularity', 'upgradeHomeRam', [], {budget: spendable})).result === true) return true;
    }
  }

  max_ram = ns.cloud.getRamLimit();
  for (const server of servers) {
    const budget = await availableBudget();
    if (budget <= 0) break;
    const upgrade = affordableCloudUpgrade(ns.getServerMaxRam(server), max_ram, budget,
      ram => ns.cloud.getServerUpgradeCost(server, ram));
    if (!upgrade) continue;
    const bought = await purchase(ns, 'cloud', 'upgradeServer', [server, upgrade.ram], {budget});
    if (bought.result !== true) continue;
    spendable -= bought.spent;
    await ns.sleep(10);
  }
}
