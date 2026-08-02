import { singRun, getActiveSourceFiles } from './utils.js'
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
  //TODO: Limit the amount of money we spend
  const reserve = (Number(ns.read("reserve.txt") || 0));
  const money = ns.getServerMoneyAvailable("home");
  let spendable = Math.max(0, Math.min(money - reserve, money * 0.2));
  if (spendable <= 0) return false;

  //Get basic cloud servers first if able
  let servers = ns.cloud.getServerNames();
  const maxServers = ns.cloud.getServerLimit();
  let serverAmount = servers.length;
  for (let i = serverAmount; i < maxServers; i++) {
    const server = ns.cloud.purchaseServer(purchasedServerName, 2);
    if (server) servers.push(server); //add to the server list
    await ns.sleep(10);
  }
  let max_ram = 2 ** 30;//max ram for home
  //We want to prioritize home ram as it is persistent. If we have BN 4...
  if (4 in unlockedSFlevels) {
    let currentRam = ns.getServerMaxRam("home");
    let cost = (await singRun(ns, 'getUpgradeHomeRamCost'));
    if (cost < Number.MAX_VALUE && currentRam !== max_ram) {
      if (cost < spendable && (await singRun(ns, 'upgradeHomeRam'))) return true;
    }
  }

  max_ram = ns.cloud.getRamLimit();
  for (const server of servers) {
    let ram = ns.getServerMaxRam(server);
    while (ram < max_ram) {
      const newRam = ram * 2;
      const cost = ns.cloud.getServerUpgradeCost(server, newRam);
      if (!isFinite(cost) || cost > spendable) break;

      if (!ns.cloud.upgradeServer(server, newRam)) break;

      spendable -= cost;
      ram = newRam;
      await ns.sleep(10);
    }
  }
}