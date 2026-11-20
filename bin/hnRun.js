/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(6.6); //The game doesn't realize we are using the hacknet API...
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response = `ERROR:hacknet.${String(fn)} exited before returning a result`;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from hacknet.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const required = Math.max(6.6, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`hacknet.${fn}`));
    if (ns.ramOverride(required) < required) throw new Error(`Insufficient RAM for hacknet.${fn}: ${required} GB required`);
    const f = ns.hacknet?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid hacknet function: ${String(fn)}`);

    response = await f(...args);
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
