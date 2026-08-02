/** @param {NS} ns */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  const result = ns.go.analysis.getLiberties();
  ns.atExit(() => port.write(result))
}