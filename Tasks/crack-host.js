/** @param {NS} ns **/
export async function main(ns) {
  const servers = getServersLight(ns)
  for (const server of servers) {
    if (server.startsWith('hacknet')) continue;
    ns.brutessh(server)
    ns.ftpcrack(server)
    ns.relaysmtp(server)
    ns.httpworm(server)
    ns.sqlinject(server)
    ns.nuke(server)
  }
  const port = ns.getPortHandle(ns.pid)
  ns.atExit(() => port.write(1))
}

///this is here strictly for ram savings.
/** @param {NS} ns */
export function getServersLight(ns) {
  const serverList = new Set(["home"])
  for (const server of serverList) {
    for (const connection of ns.scan(server)) {
      serverList.add(connection)
    }
  }
  return Array.from(serverList)
}