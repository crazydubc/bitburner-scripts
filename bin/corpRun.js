/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(23.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response = `ERROR:corporation.${String(fn)} exited before returning a result`;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from corporation.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const required = Math.max(23.6, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`corporation.${fn}`));
    if (ns.ramOverride(required) < required) throw new Error(`Insufficient RAM for corporation.${fn}: ${required} GB required`);
    const f = ns.corporation?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid corporation function: ${String(fn)}`);

    response = await f(...args);
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
