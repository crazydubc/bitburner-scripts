import { getServers } from './utils.js'

/** @param {NS} ns **/
export async function main(ns) {
  const servers = await getServers(ns);
  for (const server of servers) {
    const hostname = server.hostname;
    for (let file of ns.ls(hostname, 'Temp/'))
      ns.print((ns.rm(file, hostname) ? "Removed " : "Failed to remove ") + file);
    ns.rm('reserve.txt', hostname)
    ns.rm('telemetry.txt', hostname)
  }
}