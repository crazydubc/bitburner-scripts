import {runScriptLocal, doSCP} from './utils.js';

export const SHARE_WORKER = 'bin/share.js';
export const SHARE_DEFAULTS = {'share-mode': 'auto', 'share-home-buffer': 64, 'share-host-buffer': 8, 'share-buffer-fraction': 0.05};

export function validShareOptions(options) {
  return ['auto', 'on', 'off'].includes(options['share-mode']) &&
    ['share-home-buffer', 'share-host-buffer', 'share-buffer-fraction'].every(key => Number.isFinite(options[key]) && options[key] >= 0) &&
    options['share-buffer-fraction'] <= 1;
}

/** Keep the larger of a helper cushion and a fraction of spare capacity, including our workers. */
export function shareBuffer(host, availableRam, options = SHARE_DEFAULTS) {
  return Math.max(host === 'home' ? options['share-home-buffer'] : options['share-host-buffer'], availableRam * options['share-buffer-fraction']);
}

export function shareContextRam(ns, workAccess, sleeveAccess) {
  return ns.getFunctionRamCost('baseCost') +
    (workAccess ? ns.getFunctionRamCost('singularity.getCurrentWork') : 0) +
    (sleeveAccess ? ns.getFunctionRamCost('sleeve.getNumSleeves') + ns.getFunctionRamCost('sleeve.getTask') : 0);
}

/** Optional work reads must not block batch progress when home is busy or an API is unavailable. */
export async function getShareContext(ns, sourceFiles) {
  const workAccess = (sourceFiles[4] ?? 0) > 0, sleeveAccess = (sourceFiles[10] ?? 0) > 0;
  if (!workAccess && !sleeveAccess) return null;
  const ram = shareContextRam(ns, workAccess, sleeveAccess);
  if (!(ns.getScriptRam('bin/share-context.js', 'home') > 0) || !Number.isFinite(ram) ||
    ns.getServerMaxRam('home') - ns.getServerUsedRam('home') < ram) return null;
  try {
    const result = await runScriptLocal(ns, 'bin/share-context.js', false, [workAccess, sleeveAccess], ram);
    return result && typeof result === 'object' && typeof result.active === 'boolean' ? result : null;
  } catch { return null; }
}

/** Owns its PIDs across batches; the dispatcher may reclaim them when hacking needs RAM. */
export function createShareController(ns, options, sourceFiles, currentNode = 0) {
  const jobs = new Map(), copied = new Set();
  // BN1 progression needs manual faction work before Singularity can report it.
  // Make spare RAM available by default, including repeat BN1 runs before SF4.
  const bn1WithoutWorkAccess = currentNode === 1 && !(sourceFiles[4] > 0);
  let nextContext = 0, contextTime = 0, nextAllocation = 0, context = null, previousStatus = '', nextLog = 0;
  const stopHost = host => {
    const job = jobs.get(host);
    if (job && ns.isRunning(job.pid)) ns.kill(job.pid);
    jobs.delete(host);
  };
  const stop = () => {
    for (const host of jobs.keys()) stopHost(host);
    nextAllocation = 0;
  };
  const reclaimableRam = host => {
    const job = jobs.get(host);
    return job && ns.isRunning(job.pid) ? Math.round(job.threads * job.ram * 100) / 100 : 0;
  };
  const handoff = () => {
    // Allocation can resume immediately after dispatch, even within the usual 2s sweep interval.
    nextAllocation = 0;
    return JSON.stringify({owner: ns.pid, pids: [...jobs.values()].filter(job => ns.isRunning(job.pid)).map(job => job.pid)});
  };
  const report = (active, reason) => {
    const key = `${active}:${reason}`;
    if (key === previousStatus && (!active || Date.now() < nextLog)) return;
    previousStatus = key; nextLog = Date.now() + 60_000;
    const live = [...jobs.values()].filter(job => ns.isRunning(job.pid));
    const threads = live.reduce((sum, job) => sum + job.threads, 0), ram = live.reduce((sum, job) => sum + job.threads * job.ram, 0);
    ns.print(`INFO: Share ${active ? 'active' : 'idle'}: ${reason}. ${threads} threads / ${ram.toFixed(1)} GB; ` +
      `buffers home ${options['share-home-buffer']} GB, other hosts ${options['share-host-buffer']} GB, or ${(options['share-buffer-fraction'] * 100).toFixed(0)}% of available RAM (whichever is larger).`);
  };
  async function update(servers, canAllocate = () => true) {
    if (!canAllocate()) { stop(); return false; }
    if (options['share-mode'] === 'auto' && !bn1WithoutWorkAccess && Date.now() >= nextContext) {
      const latest = await getShareContext(ns, sourceFiles);
      if (latest) { context = latest; contextTime = Date.now(); }
      // One busy/missing helper must not tear down otherwise useful sharing. Never
      // retain unknown work indefinitely; a successful idle snapshot still stops immediately.
      else if (Date.now() - contextTime >= 15_000) context = null;
      nextContext = Date.now() + 5_000;
    }
    const active = options['share-mode'] === 'on' ||
      options['share-mode'] === 'auto' && (bn1WithoutWorkAccess || context?.active === true);
    const reason = options['share-mode'] === 'on' ? 'manual faction-work mode' : options['share-mode'] === 'off' ? 'disabled' :
      bn1WithoutWorkAccess ? 'BN1 before SF4: spare RAM available for manual faction work' :
      context?.active ? context.reason : context ? 'no faction work on player or sleeves' :
        'work data unavailable (use --share-mode on while doing faction work)';
    if (!active) { stop(); report(false, reason); return false; }
    if (Date.now() < nextAllocation) return true;
    nextAllocation = Date.now() + 2_000;
    const eligible = servers.filter(server => server.hasAdminRights && server.maxRam > 0 && !server.hostname.startsWith('hacknet'));
    const allowed = new Set(eligible.map(server => server.hostname));
    for (const host of jobs.keys()) if (!allowed.has(host)) stopHost(host);
    // Core bonuses make home/high-core hosts useful too; never spend their helper buffer.
    eligible.sort((a, b) => (b.cpuCores ?? 1) - (a.cpuCores ?? 1));
    for (const server of eligible) {
      if (!canAllocate()) { stop(); return false; }
      const host = server.hostname;
      try {
        let job = jobs.get(host);
        if (job && !ns.isRunning(job.pid)) { jobs.delete(host); job = null; }
        const ram = ns.getScriptRam(SHARE_WORKER, 'home');
        if (!(ram > 0) || !Number.isFinite(ram)) { stopHost(host); continue; }
        const budget = () => {
          const max = ns.getServerMaxRam(host), used = ns.getServerUsedRam(host);
          // Total installed RAM can be mostly occupied by hacking. Reserve from the spare
          // pool; count our workers back in so stable allocations keep a stable buffer.
          const available = Math.max(0, max - used + (job ? job.threads * job.ram : 0));
          const free = available - shareBuffer(host, available, options);
          return Number.isFinite(free) ? Math.max(0, Math.floor(free / ram)) : 0;
        };
        let threads = budget();
        if (threads === job?.threads && ram === job.ram) continue;
        if (threads <= 0) { stopHost(host); continue; }
        if (host !== 'home' && !copied.has(host)) {
          if (!await doSCP(ns, SHARE_WORKER, host)) continue;
          copied.add(host);
        }
        // SCP/helper waits allow other scripts to allocate RAM or cancel this sweep. Recheck both.
        if (!canAllocate()) { stop(); return false; }
        threads = budget();
        stopHost(host); job = null;
        if (threads > 0) {
          const pid = ns.exec(SHARE_WORKER, host, {threads, temporary: true}, '--owner', ns.pid);
          if (pid) jobs.set(host, {pid, threads, ram});
        }
      } catch (error) {
        stopHost(host);
        ns.print(`WARNING: Share skipped ${host}: ${String(error)}`);
      }
    }
    report(true, reason);
    return true;
  }
  const refresh = servers => { nextAllocation = 0; return update(servers); };
  return {update, refresh, stop, reclaimableRam, handoff};
}
