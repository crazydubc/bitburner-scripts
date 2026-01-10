
export async function main(ns: NS) {
  if (ns.serverExists('hacknet-server-0')) {
    while (true){
      if (ns.getPlayer().money > 1e+10) return;
      let stats = ns.hacknet.getNodeStats(0);
      //10% sold every second
      const amount = Math.floor(stats.production / 400 * ns.hacknet.numNodes());
      if (stats.hashCapacity && amount) {
        ns.hacknet.spendHashes('Sell for Money', undefined, amount);
      }
      await ns.sleep(100);
    }
  }
}