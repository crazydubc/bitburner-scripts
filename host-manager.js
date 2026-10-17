import { singRun, getActiveSourceFiles, getReserve } from './utils.js'
const purchasedServerName = "daemon";
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
    const server = ns.cloud.purchaseServer(purchasedServerName, 2);
    if (!server) break;
    servers.push(server);
    spendable -= cost;
    await ns.sleep(10);
  }
  let max_ram = 2 ** 30;//max ram for home
  //We want to prioritize home ram as it is persistent. If we have BN 4...
  if (4 in unlockedSFlevels) {
    let currentRam = ns.getServerMaxRam("home");
    let cost = (await singRun(ns, 'getUpgradeHomeRamCost'));
    if (Number.isFinite(cost) && cost >= 0 && currentRam < max_ram) {
      if (cost <= await availableBudget() && (await singRun(ns, 'upgradeHomeRam')) === true) return true;
    }
  }

  max_ram = ns.cloud.getRamLimit();
  for (const server of servers) {
    let ram = ns.getServerMaxRam(server);
    while (ram < max_ram) {
      const newRam = ram * 2;
      const cost = ns.cloud.getServerUpgradeCost(server, newRam);
      if (!Number.isFinite(cost) || cost < 0 || cost > await availableBudget()) break;

      if (!ns.cloud.upgradeServer(server, newRam)) break;

      spendable -= cost;
      ram = newRam;
      await ns.sleep(10);
    }
  }
}
