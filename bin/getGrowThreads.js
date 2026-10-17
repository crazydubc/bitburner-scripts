import { growThreads } from '../hacking-formulas.js';
export function main(ns) {
  let result = 'ERROR:Grow calculation exited without a result';
  const port = ns.getPortHandle(ns.pid);
  ns.atExit(() => port.write(result));
  const server = ns.getServer(ns.args[0]);
  server.moneyAvailable = ns.args[1];
  server.hackDifficulty = ns.args[2];
  result = growThreads(server, ns.getPlayer(), JSON.parse(ns.args[3]));
}
