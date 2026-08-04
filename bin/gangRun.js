/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(5.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response = `ERROR:gang.${String(fn)} exited before returning a result`;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from gang.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const f = ns.gang?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid gang function: ${String(fn)}`);

    response = await f(...args);
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
