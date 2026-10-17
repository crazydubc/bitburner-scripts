import { getFilePath, getConfiguration, log } from '../utils.js';
const argsSchema = [
  ['spawn-delay', 50], // Yield between launches; the child owns connection and backdoor startup.
  ['reserved-home-ram', 22], // Leave this much home RAM free after each child launch.
];
export function autocomplete(data) { data.flags(argsSchema); return []; }

export async function main(ns) {
  const options = getConfiguration(ns, argsSchema);
  if (!options) return;
  const script = getFilePath('Tasks/backdoor-all-servers.js.backdoor-one.js');
  const normalize = name => name.replace(/^\/+/, '');
  const ram = ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost('singularity.connect') +
    ns.getFunctionRamCost('singularity.installBackdoor') + ns.getFunctionRamCost('getServer');
  const routes = new Map([['home', ['home']]]);
  for (const [host, route] of routes) {
    for (const neighbor of ns.scan(host)) if (!routes.has(neighbor)) routes.set(neighbor, [...route, neighbor]);
  }
  const hacking = ns.getHackingLevel();
  const candidates = [...routes.keys()].map(host => ns.getServer(host))
    .filter(server => server.hostname !== 'home' && server.hostname !== 'w0r1d_d43m0n' &&
      !server.purchasedByPlayer && !server.hostname.startsWith('hacknet-') && server.hasAdminRights &&
      !server.backdoorInstalled && server.requiredHackingSkill <= hacking)
    .sort((left, right) => left.requiredHackingSkill - right.requiredHackingSkill);
  for (const server of candidates) {
    if (ns.ps('home').some(process => normalize(process.filename) === normalize(script) && process.args[0] === server.hostname)) continue;
    if (ns.getServerMaxRam('home') - ns.getServerUsedRam('home') < ram + options['reserved-home-ram']) {
      log(ns, `Backdoors deferred: need ${ram} GB for a child plus ${options['reserved-home-ram']} GB home reserve.`);
      return;
    }
    const pid = ns.exec(script, 'home', {threads: 1, temporary: true, ramOverride: ram, preventDuplicates: true},
      server.hostname, JSON.stringify(routes.get(server.hostname)));
    if (!pid) { log(ns, `Backdoor launch failed for ${server.hostname}; check the child file and home RAM.`); return; }
    await ns.sleep(Math.max(0, options['spawn-delay']));
  }
}
