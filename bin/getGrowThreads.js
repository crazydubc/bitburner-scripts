import { growThreads } from '../hacking-formulas.js';
import { calculatorMultipliers } from './getbnmultis.js';
export function main(ns) {
  ns.ramOverride(4.1);
  let result = 'ERROR:Grow calculation exited without a result';
  const port = ns.getPortHandle(ns.pid);
  ns.atExit(() => port.write(result));
  const server = ns.getServer(ns.args[0]);
  server.moneyAvailable = ns.args[1];
  server.hackDifficulty = ns.args[2];
  result = growThreads(server, ns.getPlayer(), calculatorMultipliers(ns, ns.args[3], 4.1));
}
