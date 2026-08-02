/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(23.6);
  const port = ns.getPortHandle(ns.pid);

  const [fn, ...args] = ns.args;

  try {
    const f = ns.corporation?.[fn];
    //if (typeof f !== "function") throw new Error(`Invalid corp function: ${String(fn)}`);

    const result = f(...args);
    ns.atExit(() => port.write(result));
  } catch (e) {
    ns.atExit(() => port.write(undefined));
  }
}
