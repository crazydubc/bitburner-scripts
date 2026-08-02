const reservedRam = 32

/**@type {String[]} servers */
let servers;
let max;
let chunkSwitch;
let logging;
/** @param {NS} ns */
export async function main(ns) {
  logging = ns.args[0]
  const target = ns.args[1]
  const w1 = ns.args[2]
  const g1 = ns.args[3]
  const w2 = ns.args[4]
  const h1 = ns.args[5]
  const w3 = ns.args[6]
  const g2 = ns.args[7]
  const w4 = ns.args[8]
  const batchh1 = ns.args[9]
  const batchw1 = ns.args[10]
  const batchg1 = ns.args[11]
  const batchw2 = ns.args[12]
  const batches = ns.args[13]
  const useHacknet = ns.args[14]
  servers = getServers(ns, useHacknet)
  let results;
  const hacktime = ns.getHackTime(target)
  const growtime = ns.getGrowTime(target)
  const weaktime = ns.getWeakenTime(target)
  let waitTime = 0
  let recalc = false
  chunkSwitch = true
  max = maxRun(ns, false, useHacknet)

  let starttime = performance.now()
  waitTime = w1 + w2 + w3 + w4 > 0 ? weaktime : growtime
  if (w1) results = runIt_Local(ns, "/Remote/weak-target.js", [target, 0, w1, false, useHacknet])
  if (g1) results = runIt_Local(ns, "/Remote/grow-target.js", [target, waitTime - growtime, g1, chunkSwitch, useHacknet])
  if (w2) results = runIt_Local(ns, "/Remote/weak-target.js", [target, 0, w2, false, useHacknet])
  if (h1) results = runIt_Local(ns, "/Remote/hack-target.js", [target, waitTime - hacktime, h1, chunkSwitch, useHacknet])
  if (w3) results = runIt_Local(ns, "/Remote/weak-target.js", [target, 0, w3, false, useHacknet])
  if (g2) results = runIt_Local(ns, "/Remote/grow-target.js", [target, waitTime - growtime, g2, chunkSwitch, useHacknet])
  if (w4) results = runIt_Local(ns, "/Remote/weak-target.js", [target, 0, w4, false, useHacknet])
  let batchesrun = 0
  let start = performance.now()
  for (let i = 1; i <= Math.min(batches, 99999); i++) {
    if (starttime + weaktime <= performance.now()) { //The performance wall
      recalc = true
      break
    }
    if (i === 99999) recalc = true

    batchesrun++
    if (batchh1) results = runIt_Local(ns, "/Remote/hack-target.js", [target, weaktime - hacktime, batchh1, chunkSwitch, useHacknet])
    if (batchw1) results = runIt_Local(ns, "/Remote/weak-target.js", [target, 0, batchw1, false, useHacknet])
    if (batchg1) results = runIt_Local(ns, "/Remote/grow-target.js", [target, weaktime - growtime, batchg1, chunkSwitch, useHacknet])
    if (batchw2) results = runIt_Local(ns, "/Remote/weak-target.js", [target, 0, batchw2, false, useHacknet])

    if (performance.now() - start >= 200) {
      start = performance.now()
      await ns.sleep(0)
    }
  }


  const record = {
    "lastpid": results,
    "recalc": recalc,
    "batches": batchesrun,
    "batching": chunkSwitch
  }
  const port = ns.getPortHandle(ns.pid)
  ns.atExit(() => port.write(record))
}
/** @param {NS} ns */
function runIt_Local(ns, script, argmts) {
  const target = argmts[0];
  const sleeptm = argmts[1];
  let threads = argmts[2];
  const chunks = argmts[3];
  const useHacknet = argmts[4];

  let thispid = 0;
  const serversRemove = [];

  let emergencyReserve = ns.getServerMaxRam("home") <= 64;
  const resRam = !emergencyReserve ? 0 : max >= 256 ? 256 : max >= 128 ? 128 : max >= 64 ? 64 : max >= 32 ? 32 : 16;

  // helper: one allocation sweep over a filtered server set
  const allocateOn = (predicate) => {
    for (let i = 0; i < servers.length && threads > 0; i++) {
      const server = servers[i][0];
      if (!predicate(server)) continue;

      let tmpramavailable = servers[i][1];
      //if (server === "home") continue;

      if (emergencyReserve && tmpramavailable >= resRam) {
        emergencyReserve = false;
        tmpramavailable -= resRam;
      }

      const threadsonserver = Math.floor(tmpramavailable / 1.75);
      if (threadsonserver <= 0) {
        serversRemove.push(server);
        continue;
      }

      if (chunks) {
        if (threadsonserver >= threads) {
          thispid = ns.exec(script, server, { threads, temporary: true }, target, sleeptm, "QUIET");
          if (logging && thispid === 0) ns.tprintf("Failed to run: %s on %s threads:%s target:%s", script, server, threads, target);
          servers[i][1] -= threads * 1.75;
          threads = 0;
          return;
        }
      } else {
        const use = Math.min(threadsonserver, threads);
        thispid = ns.exec(script, server, { threads: use, temporary: true }, target, sleeptm, "QUIET");
        if (logging && thispid === 0) ns.tprintf("Failed to run: %s on %s threads:%s target:%s", script, server, use, target);
        servers[i][1] -= use * 1.75;
        threads -= use;

        // you had i=0 to “start over”; keeping it preserves your behavior
        if (threads > 0) i = 0;
      }
    }
  };

  // Pass 1: everything except hacknet
  allocateOn((s) => !s.startsWith("hacknet") && !s.startsWith("home"));

  // Pass 2: hacknets last (only if allowed and still need threads)
  if (useHacknet && threads > 0) {
    allocateOn((s) => s.startsWith("hacknet"));
  }
  if (threads > 0)
    allocateOn((s) => s.startsWith("home"));

  if (threads > 0 && chunks) {
    chunkSwitch = false;
    thispid = runIt_Local(ns, script, [target, sleeptm, threads, false, useHacknet]);
  } else if (logging && threads > 0) {
    ns.tprintf("Failed to allocate all %s threads. %s left. Chunk: %s Error!", script, threads, chunks);
  }

  servers = servers.filter(([f]) => !serversRemove.includes(f));
  return thispid;
}

/** @param {NS} ns */
function getServers(ns, useHacknet) {
  const serverList = new Set(["home"])
  for (const server of serverList) {
    for (const connection of ns.scan(server)) {
      serverList.add(connection)
    }
  }

  const serverDetails = []
  for (const server of serverList) {
    if (!ns.hasRootAccess(server) || ns.getServerMaxRam(server) <= 0) continue
    if (server.startsWith("hacknet") && !useHacknet) continue
    ns.scp(["/Remote/hack-target.js", "/Remote/grow-target.js", "/Remote/weak-target.js"], server, "home")
    serverDetails.push([server, ns.getServerMaxRam(server) - ns.getServerUsedRam(server)])
  }
  serverDetails.sort((a, b) => { return (ns.getServerMaxRam(a[0]) - ns.getServerUsedRam(a[0])) - (ns.getServerMaxRam(b[0]) - ns.getServerUsedRam(b[0])) })

  return serverDetails
}
/** @param {NS} ns */
export function maxRun(ns, persistent, useHacknet) {
  //Any runIt now has a persistent argument to pass along if it can run on hacknet servers.
  //This way you can choose to run something like puppet on a hacknet server
  let highest = 0
  /**@type {String[]} servers */
  const servers = getServers(ns, useHacknet)
  let emergencyReserve = ns.getServerMaxRam("home") <= 16 ? true : false
  for (const [server, ram] of servers) {
    if (!ns.hasRootAccess(server)) continue
    if ((server.startsWith("hacknet") && persistent)) continue
    let tmpramavailable = ns.getServerMaxRam(server) - ns.getServerUsedRam(server)
    if (server === "home" && persistent) tmpramavailable = Math.max(tmpramavailable - reservedRam, 0)
    if (tmpramavailable > highest)
      highest = tmpramavailable
  }// All servers
  if (!persistent) return highest
  //Highest is now max run
  const resRam = highest >= 256 ? 256 : highest >= 128 ? 128 : highest >= 64 ? 64 : highest >= 32 ? 32 : 16
  //Now that we have the highest, we go again
  let highest2 = 0
  for (const [server, ram] of servers) {
    if (!ns.hasRootAccess(server)) continue
    if ((server.startsWith("hacknet") && persistent)) continue
    let tmpramavailable = ns.getServerMaxRam(server) - ns.getServerUsedRam(server)
    if (persistent && emergencyReserve && tmpramavailable >= resRam) {
      emergencyReserve = false
      tmpramavailable -= resRam
    }
    if (server === "home" && persistent) tmpramavailable = Math.max(tmpramavailable - reservedRam, 0)
    if (tmpramavailable > highest2)
      highest2 = tmpramavailable
  }// All servers
  return highest2
}