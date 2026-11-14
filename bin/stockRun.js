/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(5.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response = `ERROR:stock.${String(fn)} exited before returning a result`;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from stock.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const required = Math.max(5.6, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`stock.${fn}`));
    if (ns.ramOverride(required) < required) throw new Error(`Insufficient RAM for stock.${fn}: ${required} GB required`);
    const f = ns.stock?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid stock function: ${String(fn)}`);

    response = await f(...args);
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
