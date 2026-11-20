import {freshGoWorkTarget, sellsGoHashesForMoney} from '../go-policy.js';
import {INFILTRATION_TARGET} from '../infiltration-policy.js';

/** Once per completed game, read authoritative home state. No purchases or player actions. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Go goal context unavailable';
  ns.atExit(() => port.write(result));
  const readJson = file => { try { return JSON.parse(ns.read(file) || 'null'); } catch { return null; } };
  try {
    const reset = ns.getResetInfo(), player = ns.getPlayer(), now = Date.now();
    const target = readJson(INFILTRATION_TARGET);
    let hacknetCashRate = 0, hashes = 0, capacity = 0;
    for (let i = 0; i < ns.hacknet.numNodes(); i++) {
      const node = ns.hacknet.getNodeStats(i);
      const rate = Number.isFinite(node.production) && node.production > 0 ? node.production : 0;
      if ('hashCapacity' in node) { hashes += rate; capacity += node.hashCapacity; }
      else hacknetCashRate += rate;
    }
    if (hashes > 0) {
      const configText = ns.read('spend-hashes.js.config.txt');
      const config = readJson('spend-hashes.js.config.txt');
      const visited = new Set(['home']), hosts = ['home'];
      let cashSeller = false;
      for (const host of hosts) {
        for (const process of ns.ps(host)) {
          if (process.filename.replace(/^\/+/, '') === 'spend-hashes.js' &&
            (!configText || config) && sellsGoHashesForMoney(process.args, config)) cashSeller = true;
        }
        if (cashSeller) break;
        for (const next of ns.scan(host)) if (!visited.has(next)) { visited.add(next); hosts.push(next); }
      }
      const cost = ns.hacknet.hashCost('Sell for Money');
      if (cashSeller && Number.isFinite(cost) && cost > 0 && capacity >= cost) hacknetCashRate += hashes * 1e6 / cost;
    }
    result = {updatedAt: now, lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset,
      money: player.money, factions: player.factions, reserve: Number(ns.read('reserve.txt') || 0),
      favorSnapshot: readJson('/Temp/affordable-augs.txt'),
      // Total script income also includes stock sales; compare Hacknet with hacking alone.
      hackingIncome: ns.getMoneySources().sinceInstall.hacking / Math.max(1, (now - reset.lastAugReset) / 1000), hacknetCashRate,
      target: freshGoWorkTarget(target, reset, now) && Number.isInteger(target.pid) && ns.isRunning(target.pid) ? target : null};
  } catch (error) { result = `ERROR:${String(error)}`; }
}
