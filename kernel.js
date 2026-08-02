import {
  log, getErrorInfo, getServ, getOptimalTarget,
  getGrowThreads, getServers, serverRun, getServerAvailRam, getPlayerInfo, getHackP,
  doGetServerMinSec, doGetServerCurSec, getReset,
  getActiveSourceFiles, doSCP, getBNMults, stanekRun,
  getServerMaxRam, getPortCrackers
} from './utils.js'


//ram to reserve on home.
const reservedRam = 32;
/** @param {NS} ns */
export async function main(ns) {
  let resetInfo = await getReset(ns);
  let player = await getPlayerInfo(ns);
  let target, nextTarget;
  let weakenStrength = ns.weakenAnalyze(1);

  let moneySources = ns.getMoneySources();
  const backupServerName = 'n00dles';
  let botnetStatus = false;
  let botsSent = 0;
  let botsRequired = -1;
  let threadsLeft = 0;
  let lastShareTime = Date.now() + 30000;
  let totalram = await getServerAvailRam(ns, "home");
  const dictSourceFiles = await getActiveSourceFiles(ns);
  if (resetInfo.currentNode == 4) dictSourceFiles[4] = 3;
  const bnMultis = await getBNMults(ns);
  const useHacknet = bnMultis.CloudServerLimit == 0 && 9 in dictSourceFiles;

  let stanekUnlocked = 13 in dictSourceFiles;

  /** @param {NS} ns **/
  async function startup(ns) {
    getPortCrackers(ns);
    await doTargetingLoop(ns);
  }
  // Main targeting loop
  /** @param {NS} ns **/
  async function doTargetingLoop(ns) {
    target = await getOptimalTarget(ns);
    let hacking = player.skills.hacking;

    if (!target) target = await getServ(ns, backupServerName); //absolute failsafe
    log(ns, `INFO: Detected best hacking target: ${target.hostname}`, true, 'info');

    let batchInfo = await getHackP(ns, target.hostname, -1, -1, 1);
    nextTarget = target;
    let prepWeaken1 = 0;
    let prepWeaken2 = 0;
    let prepWeaken3 = 0;
    let prepWeaken4 = 0;
    let prepGrow1 = 0;
    let prepHack1 = 0;
    let prepGrow2 = 0;
    let baseServers;
    let recalcbad = false;
    let recalcgood = false;
    let overflowed = false;
    let targetUpdate = true;
    let loopCount = 0;
    do {
      await ns.sleep(500);
      player = await getPlayerInfo(ns);
      target = await getServ(ns, target.hostname);
      baseServers = await getServers(ns);
      const hackTime = ns.getHackTime(target.hostname) + Date.now();
      threadsLeft = 0;
      totalram = 0;
      //calc total number of threads we can exploit
      for (const server of baseServers) {
        if (server.hasAdminRights && server.maxRam > 0) {
          let tmpramavailable = await getServerAvailRam(ns, server.hostname);
          totalram += await getServerMaxRam(ns, server.hostname);
          if (server.hostname === "home") {
            tmpramavailable = Math.max(tmpramavailable - reservedRam, 0)
          }
          let tmpthreads = Math.floor(tmpramavailable / 1.75)
          threadsLeft += tmpthreads
        }
      }
      let threadsMax = threadsLeft;

      const waveweaken1 = Math.ceil((target.hackDifficulty - target.minDifficulty) / weakenStrength);
      const wavegrow1 = Math.ceil(await getGrowThreads(ns, target.hostname, target.moneyAvailable, target.minDifficulty));

      //weaken
      if (waveweaken1 > threadsLeft) {
        prepWeaken1 = threadsLeft
        threadsLeft = 0;
      } else {
        prepWeaken1 = waveweaken1;
        threadsLeft -= prepWeaken1;
      }
      prepWeaken2 = 0;
      prepGrow1 = 0;
      //grow/weaken
      if (wavegrow1 > threadsLeft) {
        prepWeaken2 = Math.ceil((threadsLeft * .004) / weakenStrength);
        prepGrow1 = threadsLeft - prepWeaken2;
        threadsLeft = 0;
      } else {
        prepWeaken2 = Math.ceil((wavegrow1 * .004) / weakenStrength);
        if (prepWeaken2 + wavegrow1 <= threadsLeft) {
          prepGrow1 = wavegrow1;
          threadsLeft -= prepGrow1 + prepWeaken2;
        } else {
          const growP = .004 / weakenStrength
          const remainder = wavegrow1 + prepWeaken2 - threadsLeft
          const weakremove = Math.floor(remainder * growP)
          const growremove = remainder - weakremove
          prepGrow1 = wavegrow1 - growremove
          prepWeaken2 -= weakremove
          threadsLeft = 0
        }
      }
      //if there are threads left over..
      //Hack/weaken
      if (batchInfo.H1 > threadsLeft) { //We don't have enough to fully hack!
        prepWeaken3 = Math.ceil((threadsLeft * .002) / weakenStrength)
        prepHack1 = threadsLeft - prepWeaken3
        threadsLeft = 0
      }
      else { //We can handle the total hack threads, but what about the weakens it produces?
        prepWeaken3 = Math.ceil((batchInfo.H1 * .002) / weakenStrength)
        if (prepWeaken3 + batchInfo.H1 <= threadsLeft) { //We have enough for both hack and weaken
          prepHack1 = batchInfo.H1
          threadsLeft -= prepHack1 + prepWeaken3
        }
        else { //We don'thave enough.  Calculate optimal
          const hackP = .002 / weakenStrength
          const remainder = batchInfo.H1 + prepWeaken3 - threadsLeft
          const weakenremove = Math.ceil(remainder * hackP)
          const hackremove = remainder - weakenremove
          prepHack1 = batchInfo.H1 - hackremove
          prepWeaken3 -= weakenremove
          threadsLeft = 0
        }
      }
      //grow/weaken
      if (batchInfo.G1 > threadsLeft) { //We need more grow than we can handle
        prepWeaken4 = Math.ceil((threadsLeft * .004) / weakenStrength) //Figure out how many weaken threads we need to accomodate the highest
        prepGrow2 = threadsLeft - prepWeaken4 //Fill in as many grows as can fit now
        threadsLeft = 0
      }
      else { //We can handle the total grow threads, but can we handle it with weaken?
        prepWeaken4 = Math.ceil((batchInfo.G1 * .004) / weakenStrength) //total weakens we need for a full grow
        if (prepWeaken4 + batchInfo.G1 <= threadsLeft) {//We have enough for both grow and weaken!
          prepGrow2 = batchInfo.G1
          threadsLeft -= prepGrow2 + prepWeaken4 //Could be as low as 0 now
        }
        else { //We don't have enough.  Calculate optimal
          const growP = .004 / weakenStrength
          const remainder = batchInfo.G1 + prepWeaken4 - threadsLeft
          const weakremove = Math.floor(remainder * growP)
          const growremove = remainder - weakremove
          prepGrow2 = batchInfo.G1 - growremove
          prepWeaken4 -= weakremove
          threadsLeft = 0
        }
      }
      let batchesTotal = Math.floor(threadsLeft / (batchInfo.H1 + batchInfo.W1 + batchInfo.G1 + batchInfo.W2))
      if (botnetStatus && botsRequired !== botsSent) batchesTotal = Math.max(batchesTotal - 2, 0)

      let results = await serverRun(ns, false, target.hostname, prepWeaken1, prepGrow1, prepWeaken2, prepHack1, prepWeaken3,
        prepGrow2, prepWeaken4, batchInfo.H1, batchInfo.W1, batchInfo.G1, batchInfo.W2, batchesTotal, useHacknet);

      threadsLeft -= ((batchesTotal.H1 + batchesTotal.W1 + batchesTotal.G1 + batchesTotal.W2) * results.batches);
      await ns.sleep(10);
      if (botnetStatus && botsRequired !== botsSent) await runbotnet(ns, threadsLeft);
      loopCount++;
      let pids = [];
      while (ns.isRunning(results.lastpid, "home")) {
        //share what is left
        if (stanekUnlocked) {
          if (!pids.some(pid => ns.isRunning(pid))) {
            pids = [];
            const frags = await stanekRun(ns, 'activeFragments');
            if (frags.length == 0) break;
            for (const server of baseServers) {
              if (server.hostname == 'home') continue;
              const mult = server.hostname.startsWith('hacknet') ? 10 : 2.1;
              const threads = Math.floor(await getServerAvailRam(ns, server.hostname) / mult);
              if (threads > 0) {
                await doSCP(ns, 'stanek.charge.js', server.hostname);
                const pid = ns.exec('stanek.charge.js', server.hostname, threads, JSON.stringify(frags));
                if (pid) pids.push(pid);
              }
            }
          }
        }
        if (totalram > 1200 && lastShareTime < Date.now() - 11000) {
          lastShareTime = Date.now();
          for (const server of baseServers) {
            if (server.hostname == 'home') continue;
            if (server.hostname.startsWith('hacknet')) continue;
            if (server.hasAdminRights && server.maxRam > 0) {
              const threads = Math.floor(await getServerAvailRam(ns, server.hostname) / 6)
              if (threads > 0) {
                await doSCP(ns, 'bin/share.js', server.hostname)
                ns.exec('bin/share.js', server.hostname, threads)
              }
            }
          }
        }
        await ns.sleep(100);
      }
      player = await getPlayerInfo(ns);
      if (hacking < player.skills.hacking) {
        hacking = player.skills.hacking;
        recalcgood = true;
        targetUpdate = true;
      }


      recalcbad = results.recalc;
      recalcgood = true;

      if (target.hostname == nextTarget.hostname && targetUpdate) {
        const upcoming = await getOptimalTarget(ns);
        if (upcoming && upcoming.hostname !== target.hostname) {
          log(ns, `INFO: Detected a new hacking target to prep: ${upcoming.hostname}`, true, 'info');
          nextTarget = upcoming;
          botnetStatus = true
        }
        targetUpdate = false;
      }
      else if (nextTarget.hostname !== target.hostname
        && ((await doGetServerCurSec(ns, nextTarget.hostname)) <= (await doGetServerMinSec(ns, nextTarget.hostname)) || loopCount > 10)) {
        log(ns, `INFO: Switching active hacking target to: ${nextTarget.hostname}`, true, 'info');
        target = nextTarget;
        loopCount = 0;
        botnetStatus = false;
        botsSent = 0;
        botsRequired = -1;
        recalcbad = false;
        recalcgood = false;
        batchInfo = getHackP(ns, target, -1, -1, 1);
      }

      if (recalcbad) {
        batchInfo = await getHackP(ns, target.hostname, results.batches, threadsMax, batchInfo.H1);
        recalcbad = false;
        overflowed = true
      } else if (recalcgood && !overflowed) {
        batchInfo = await getHackP(ns, target.hostname, -1, -1, 1);
        recalcgood = false;
      } else {
        batchInfo = await getHackP(ns, target.hostname, -1, -1, Math.max(batchInfo.H1 - 1, 1));
      }

      //charge stanek?
      //if (stanekUnlocked) {
      // const fragments = await getActiveFragments(ns);
      //if (fragments.length == 0) continue        /*for (const server of baseServers)           const availableRam             ns.getServerMaxRam(server) - ns.getServerUsedRam(server)          const scriptRam = 2          const threads = Math.floor(availableRam / scriptRam);          if (threads <= 0) continue          await maxRun(ns, "stanek.charge.js", false          const pid = ns.exec            "stanek.charge.js"            server            threads            JSON.stringify(fragmentsToCharge          )        }*/
      //}

    } while (true);
  }

  async function runbotnet(ns, threads) {
    if (botsRequired <= 0) botsRequired = Math.ceil((nextTarget.hackDifficulty - nextTarget.minDifficulty) / weakenStrength) + 1;
    if (botsSent >= botsRequired || threads == 0) return;
    const weakthreadsneeded = Math.ceil((nextTarget.hackDifficulty - nextTarget.minDifficulty) / weakenStrength) + 1 - botsSent;
    const threadsthisround = weakthreadsneeded >= threads ? threads : weakthreadsneeded
    if (threadsthisround > 0) {
      botsSent += threadsthisround;
      threadsLeft -= threadsthisround;
      await serverRun(ns, false, nextTarget.hostname, threadsthisround, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, useHacknet);
    }
  }

  /** Periodic scripts helper function: Get how much we're willing to spend on new servers (host-manager.js budget) */
  function getHostManagerBudget() {
    moneySources = ns.getMoneySources();
    const serverSpend = -(moneySources?.sinceInstall?.servers ?? 0); // This is given as a negative number (profit), we invert it to get it as a positive expense amount
    const budget = Math.max(0,
      // Ensure the total amount of money spent on new servers is less than the configured max spend amount
      0.25 * (moneySources?.sinceInstall?.hacking ?? 0) - serverSpend,
      // Special-case support: In some BNs hack income is severely penalized (or zero) but earning hack exp is still useful.
      // To support these, always allow a small percentage (0.1%) of our total earnings (including other income sources) to be spent on servers
      (moneySources?.sinceInstall?.total ?? 0) * 0.001 - serverSpend);
    //log(ns, `Math.max(0, ${options['max-purchased-server-spend']} * (${formatMoney(moneySources?.sinceInstall?.hacking)} ?? 0) - ${formatMoney(serverSpend)}, ` +
    //    `(${formatMoney(moneySources?.sinceInstall?.total)} ?? 0) * 0.001 - ${formatMoney(serverSpend)}) = ${formatMoney(budget)}`);
    return budget;
  }
  // script entry point
  /** @param {NS} ns **/
  async function startup_withRetries(ns) {
    let startupAttempts = 0;
    while (startupAttempts++ <= 5) {
      try {
        await startup(ns);
      } catch (err) {
        if (startupAttempts == 5)
          log(ns, `ERROR: daemon.js Keeps catching a fatal error during startup: ${getErrorInfo(err)}`, true, 'error');
        else {
          log(ns, `WARN: daemon.js Caught an error during startup: ${getErrorInfo(err)}` +
            `\nWill try again (attempt ${startupAttempts} of 5)`, false, 'warning');
          await ns.sleep(5000);
        }
      }
    }
  }

  // Start daemon.js
  await startup_withRetries(ns);
}