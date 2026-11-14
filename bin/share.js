/** @param {NS} ns */
export async function main(ns) {
  const owner = ns.args[0] === '--owner' && Number.isInteger(ns.args[1]) && ns.args[1] > 0 ? ns.args[1] : 0;
  // Unmanaged invocations keep their original one-cycle behavior. Managed workers have no 1s gaps.
  if (!owner) return await ns.share();
  while (ns.isRunning(owner)) await ns.share();
}
