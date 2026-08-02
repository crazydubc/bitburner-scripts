/** @param {NS} ns */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = ns.singularity.getOwnedSourceFiles();
  ns.atExit(() => port.write(result))
}