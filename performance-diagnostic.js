/** Read-only snapshot: distinguish in-game RAM pressure from too many processes.
 * Run while the slowdown is occurring, before stopping the affected scripts.
 * @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');
  const report = {
    version: 1, timestamp: new Date().toISOString(), host: ns.getHostname(),
    currentNode: ns.getResetInfo().currentNode, game: ns.ui.getGameInfo(),
    coverage: 'Servers reachable through ns.scan; darknet-only hosts are not included.',
    hosts: [], scripts: [], managers: [], errors: [],
  };
  const ram = host => {
    const max = ns.getServerMaxRam(host), used = ns.getServerUsedRam(host);
    return {max, used, free: Math.max(0, max - used)};
  };
  report.homeBefore = ram('home');
  // No helper launches: the diagnostic itself must not wait for free home RAM.
  report.helperBaseRam = Object.fromEntries([
    'bin/serverRun.js', 'bin/getHackP.js', 'bin/getServerAvailRam.js',
    'bin/singRun.js', 'bin/purchase.js', 'bin/share-context.js',
  ].map(file => [file, ns.getScriptRam(file, 'home')]));

  const hosts = new Set(['home']), groups = new Map();
  const managerNames = new Set(['autopilot.js', 'kernel.js', 'go.js', 'darknet.js',
    'stockmaster.js', 'work-for-faction2.js', 'faction-manager.js',
    'bin/serverRun.js', 'bin/getHackP.js', 'Tasks/contractor.js.solver.js']);
  let total = 0, threads = 0;
  for (const host of hosts) {
    try {
      for (const neighbor of ns.scan(host)) hosts.add(neighbor);
      const processes = ns.ps(host);
      report.hosts.push({host, ...ram(host), processes: processes.length});
      for (let i = 0; i < processes.length; i++) {
        const process = processes[i], filename = process.filename.replace(/^\/+/, '');
        const group = groups.get(filename) ?? {filename, processes: 0, threads: 0};
        group.processes++; group.threads += process.threads;
        groups.set(filename, group); total++; threads += process.threads;
        // Bound both the number and size of log excerpts, even with duplicate managers.
        if (managerNames.has(filename) && report.managers.length < 20) {
          let logs;
          try { logs = ns.getScriptLogs(process.pid).slice(-3).map(line => String(line).slice(0, 300)); }
          catch (error) { logs = [`Log unavailable: ${String(error).slice(0, 200)}`]; }
          report.managers.push({host, filename, pid: process.pid, logs});
        }
        if ((i + 1) % 500 === 0) await ns.sleep(0);
      }
    } catch (error) { report.errors.push({host, error: String(error).slice(0, 300)}); }
    await ns.sleep(0);
  }
  report.scripts = [...groups.values()].sort((a, b) => b.processes - a.processes);
  report.totalProcesses = total; report.totalThreads = threads;
  // Scheduling delay is evidence of contention, not proof of a particular infinite loop.
  report.sleepOverrunsMs = [];
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    await ns.sleep(100);
    report.sleepOverrunsMs.push(Math.max(0, Date.now() - start - 100));
  }
  report.homeAfter = ram('home');

  ns.tprint(`Performance diagnostic v1 | BN${report.currentNode} | ${report.timestamp}`);
  ns.tprint(`Home RAM GB (includes this diagnostic if on home): ${JSON.stringify(report.homeBefore)}; after sample: ${JSON.stringify(report.homeAfter)}`);
  ns.tprint(`Scanned ${report.hosts.length} hosts: ${total} processes, ${threads} threads. ${report.coverage}`);
  ns.tprint(`Largest process groups: ${JSON.stringify(report.scripts.slice(0, 8))}`);
  ns.tprint(`Helper base RAM GB (API-specific overrides may need more): ${JSON.stringify(report.helperBaseRam)}`);
  ns.tprint(`100 ms sleep overruns: max ${Math.max(...report.sleepOverrunsMs)} ms, mean ${(report.sleepOverrunsMs.reduce((sum, value) => sum + value, 0) / 10).toFixed(1)} ms.`);
  for (const manager of report.managers)
    ns.tprint(`${manager.filename}@${manager.host} PID ${manager.pid}: ${manager.logs.join(' | ')}`);
  if (report.errors.length) ns.tprint(`Scan errors: ${JSON.stringify(report.errors)}`);
  const path = '/Temp/performance-diagnostic.json';
  try {
    await ns.write(path, JSON.stringify(report, null, 2), 'w');
    ns.tprint(`Saved ${path} on ${report.host}. Paste this terminal report; it does not identify the cause of an earlier freeze by itself.`);
  } catch (error) { ns.tprint(`Could not save report: ${String(error)}. Paste the terminal output instead.`); }
}
