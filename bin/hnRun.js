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
    const f = ns.hacknet?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid hacknet function: ${String(fn)}`);

    response = await f(...args);
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
