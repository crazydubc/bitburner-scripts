/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(6.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;

  try {
    const f = ns.singularity?.[fn];
    //if (typeof f !== "function") throw new Error(`Invalid singularity function: ${String(fn)}`);

    const result = f(...args);
    ns.atExit(() => port.write(result));
  } catch (e) {
    ns.atExit(() => port.write(`ERROR:${String(e?.stack ?? e)}`));
  }
}