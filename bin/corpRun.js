/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(23.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from corporation.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const f = ns.corporation?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid corporation function: ${String(fn)}`);

    response = await f(...args);
  } catch {
    // Preserve the existing corpRun contract: corporation API errors return undefined.
    response = undefined;
  }
}
