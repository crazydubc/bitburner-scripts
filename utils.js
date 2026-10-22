import { purchaseRam } from './purchase-guard.js';
export async function getPlayerInfo(ns) { return await runScript(ns, "bin/getPlayer.js", false, []) }
export async function getReset(ns) { return await runScript(ns, "bin/getResetInfo.js", false, []) }
export async function getBNMults(ns) {
  const reset = await getReset(ns);
  const hasApi = reset.currentNode === 5 || Number(reset.ownedSF instanceof Map ? reset.ownedSF.get(5) : reset.ownedSF?.[5]) > 0;
  const result = await runScriptLocal(ns, "bin/getbnmultis.js", false, [], hasApi ? 6.6 : 2.6);
  if (!result || typeof result !== 'object' || !Number.isFinite(result.ScriptHackMoney))
    throw new Error(`Invalid BitNode multipliers: ${String(result)}`);
  return result;
}
export async function getServersLight(ns) { return await runScriptLocal(ns, "bin/getServersLight.js", false, []) }
export async function getServerAvailRam(ns, hostname) { return await runScriptLocal(ns, "bin/getServerAvailRam.js", false, [hostname]) }
export async function getServerMaxRam(ns, hostname) { return await runScript(ns, "bin/getServerMaxRam.js", false, [hostname]) }
export async function getServers(ns) { return await runScriptLocal(ns, "bin/getServers.js", false, []) }
export async function doSCP(ns, script, hostname, source = "home") { return await runScriptLocal(ns, "bin/scp.js", false, [script, hostname, source]) }
export async function getOptimalTarget(ns, first = false) { return await runScript(ns, "bin/getOptimalServer.js", false, [first]) }
export async function getServ(ns, hostname) { return await runScript(ns, "bin/getServer.js", false, [hostname]) }
export async function getGrowThreads(ns, hostname, moneystate, minsecurity) {
  const multipliers = await getBNMults(ns);
  const result = await runScript(ns, "bin/getGrowThreads.js", false, [hostname, moneystate, minsecurity, JSON.stringify(multipliers)]);
  if (!Number.isInteger(result) || result < 0) throw new Error(`Invalid grow calculation: ${String(result)}`);
  return result;
}
export async function getHackP(ns, target, batches, threadsavailable, starthack) {
  const multipliers = await getBNMults(ns);
  const result = await runScript(ns, "bin/getHackP.js", false, [target, batches, threadsavailable, starthack, JSON.stringify(multipliers)]);
  if (!result || !['H1', 'W1', 'G1', 'W2'].every(key => Number.isInteger(result[key]) && result[key] >= 0))
    throw new Error(`Invalid batch calculation: ${String(result)}`);
  return result;
}
export async function getHackPercent(ns, hostname, minsecurity) { return await runScript(ns, "bin/getHackPercent.js", false, [hostname, minsecurity]) }
export async function getHackChance(ns, hostname, minsecurity) { return await runScript(ns, "bin/getHackChance.js", false, [hostname, minsecurity]) }
export async function doGetServerMinSec(ns, hostname) { return await runScript(ns, "bin/doGetServerMinSec.js", false, [hostname]) }
export async function doGetServerCurSec(ns, hostname) { return await runScript(ns, "bin/doGetServerCurSec.js", false, [hostname]) }
export async function serverRun(ns, logging, target, w1, g1, w2, h1, w3, g2, w4, batchh1, batchw1, batchg1, batchw2, batches, usehacknet, shareHandoff = '') {
  const counts = {w1, g1, w2, h1, w3, g2, w4, batchh1, batchw1, batchg1, batchw2, batches};
  const invalid = Object.entries(counts).find(([, value]) => !Number.isInteger(value) || value < 0);
  if (invalid) throw new Error(`Invalid dispatcher count for ${target}: ${invalid[0]}=${String(invalid[1])}; refusing to launch work.`);
  return await runScriptLocal(ns, "bin/serverRun.js", false, [logging, target, w1, g1, w2, h1, w3, g2, w4, batchh1, batchw1, batchg1, batchw2, batches, usehacknet, shareHandoff]);
}
export async function hasTixApi(ns) { return await runScript(ns, "bin/hasTixApi.js", false, []) }
export async function getBoard(ns) { return await runScript(ns, "bin/getBoardState.js", false, []) }
export async function getGoSnapshot(ns) {
  const required = ns.getScriptRam('bin/getGoSnapshot.js', 'home');
  if (!(required > 0) || await getServerAvailRam(ns, 'home') < required) {
    // Keep the old low-peak-RAM path usable on small/busy home servers.
    return {board: await getBoard(ns), controlled: await getControlledENodes(ns),
      valid: await goValidMoves(ns), liberties: await goLiberties(ns), chains: await goChains(ns)};
  }
  const result = await runScriptLocal(ns, 'bin/getGoSnapshot.js', false, []);
  if (!result || !['board', 'controlled', 'valid', 'liberties', 'chains'].every(key => Array.isArray(result[key])))
    throw new Error(`Go snapshot failed: ${String(result)}`);
  return result;
}
export async function recordGoResult(ns, result) {
  const saved = await runScriptLocal(ns, 'bin/go-stats.js', false, [JSON.stringify(result)]) === true;
  if (!saved) ns.print('WARNING: Could not save Go results on home.');
  return saved;
}
export async function getGoResults(ns) {
  const result = await runScriptLocal(ns, 'bin/go-stats.js', false, ['read']);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(`Go results unavailable: ${String(result)}`);
  return result;
}
/** Optional once-per-game reads must not prevent playing when home RAM/API access is limited. */
export async function getGoContext(ns, sourceFiles = {}) {
  const required = ns.getScriptRam('bin/go-context.js', 'home');
  if (!(required > 0)) return null;
  const free = await getServerAvailRam(ns, 'home');
  if (!Number.isFinite(free) || free < required) return null;
  const context = await runScriptLocal(ns, 'bin/go-context.js', false, []);
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  if ((sourceFiles[4] ?? 0) > 0) {
    const fits = fn => free >= Math.max(6.6, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`singularity.${fn}`));
    try {
      if (fits('getCurrentWork')) {
        const work = await singRun(ns, 'getCurrentWork');
        if (work === null || (work && typeof work === 'object' && typeof work.type === 'string')) {
          context.work = work;
          context.workKnown = true;
        }
        if (work?.type === 'CRIME' && typeof work.crimeType === 'string' && fits('getCrimeChance'))
          context.crimeChance = await singRun(ns, 'getCrimeChance', work.crimeType);
      }
    } catch { /* Keep the cheap snapshot if the optional work/chance read fails. */ }
  }
  return context;
}
export async function getControlledENodes(ns) { return await runScript(ns, "bin/getControlledEmptyNodes.js", false, []) }
export async function goMove(ns, x, y) { return await runScript(ns, "bin/makeMove.js", false, [x, y]) }
export async function goValidMoves(ns) { return await runScript(ns, "bin/goValidMoves.js", false, []) }
export async function goLiberties(ns) { return await runScript(ns, "bin/getLiberties.js", false, []) }
export async function goChains(ns) { return await runScript(ns, "bin/getChains.js", false, []) }
export async function goCheatChance(ns) { return await runScript(ns, "bin/getCheatSuccessChance.js", false, []) }
export async function play2Moves(ns, x1, y1, x2, y2) { return await runScript(ns, "bin/playTwoMoves.js", false, [x1, y1, x2, y2]) }
export async function destroyND(ns, ...args) { return await runScript(ns, "bin/destroyNode.js", false, [...args]); }

async function apiRun(ns, namespace, helper, minimumRam, fn, args) {
  const ram = Math.max(minimumRam, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`${namespace}.${fn}`));
  let deadline;
  if (namespace === 'singularity' && fn === 'installBackdoor') {
    const target = await singRun(ns, 'getCurrentServer');
    const duration = await runScriptLocal(ns, 'bin/getBackdoorTime.js', false, [target]);
    if (!Number.isFinite(duration) || duration < 0) throw new Error('Could not determine backdoor duration');
    deadline = Math.max(120_000, duration * 1.5 + 60_000);
  }
  const result = await runScriptLocal(ns, helper, false, [fn, ...args], ram, deadline);
  if (typeof result === 'string' && result.startsWith('ERROR:'))
    throw new Error(`${namespace}.${fn}: ${result.slice(6)}`);
  return result;
}
export async function corpRun(ns, fn, ...args) { return apiRun(ns, 'corporation', 'bin/corpRun.js', 23.6, fn, args); }
export async function stockRun(ns, fn, ...args) { return apiRun(ns, 'stock', 'bin/stockRun.js', 5.6, fn, args); }
export async function sleeveRun(ns, fn, ...args) { return apiRun(ns, 'sleeve', 'bin/sleeveRun.js', 5.6, fn, args); }
export async function hnRun(ns, fn, ...args) { return apiRun(ns, 'hacknet', 'bin/hnRun.js', 6.6, fn, args); }
export async function bbRun(ns, fn, ...args) { return apiRun(ns, 'bladeburner', 'bin/bbRun.js', 5.6, fn, args); }
export async function singRun(ns, fn, ...args) { return apiRun(ns, 'singularity', 'bin/singRun.js', 6.6, fn, args); }
/** Read one Singularity API for many names using one helper and the same peak RAM as a single read. */
export async function singReadMany(ns, fn, items) {
  if (!Array.isArray(items) || !items.every(item => typeof item === 'string' && item.length > 0))
    throw new Error('Singularity bulk reads require a list of nonempty names');
  const names = [...new Set(items)], entries = [];
  if (!names.length) return {};
  const ram = Math.max(6.6, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`singularity.${fn}`));
  for (let i = 0; i < names.length; i += 512) {
    const chunk = names.slice(i, i + 512);
    const result = await runScriptLocal(ns, 'bin/singReadMany.js', false, [fn, JSON.stringify(chunk)], ram);
    if (!result || typeof result !== 'object' || Array.isArray(result) ||
      !chunk.every(name => Object.hasOwn(result, name)))
      throw new Error(`singularity.${fn} bulk read failed: ${String(result)}`);
    entries.push(...chunk.map(name => [name, result[name]]));
  }
  return Object.fromEntries(entries);
}
export async function stanekRun(ns, fn, ...args) { return apiRun(ns, 'stanek', 'bin/stanekRun.js', 6.6, fn, args); }
export async function gangRun(ns, fn, ...args) { return apiRun(ns, 'gang', 'bin/gangRun.js', 5.6, fn, args); }

export async function purchase(ns, namespace, method, args = [], policy = {}) {
  const result = await runScriptLocal(ns, 'bin/purchase.js', false,
    [namespace, method, JSON.stringify(args), JSON.stringify(policy)], purchaseRam(ns, namespace, method));
  if (!result || typeof result !== 'object' || !Number.isFinite(result.spent) || result.spent < 0)
    throw new Error(`Purchase failed: ${String(result)}`);
  return result;
}
export async function destroyWD(ns, bn, script) { return await runScript(ns, "bin/destroyWD.js", false, [bn, script]) }
export async function bitflume(ns, bn, script) { return await runScriptLocal(ns, "bin/bitflume.js", false, [bn, script]) }



export async function setStasis(ns, shouldLink = true) { return await runScript(ns, "bin/setStasisLink.js", false, [shouldLink]) }

export async function getOwnedAugs(ns, included = true) { return await runScript(ns, "bin/ownedAugs.js", false, [included]) }
export async function getFacInvReqs(ns, faction) { return await runScript(ns, "bin/getFacInvReqs.js", false, [faction]) }

export async function crackHosts(ns) { return await runScript(ns, "Tasks/crack-host.js", false, []) }

const reservedRam = 16;
const remoteLaunchTimeout = 10_000;
const remoteLaunchWarningTimes = new Map();
const unresponsiveReplies = new Map();

export function rpcReplyBudget(script, args = []) {
  const name = script.replace(/^\/+/, '');
  if (!name.startsWith('bin/')) return 0; // Caller-owned scripts retain their own lifetime contract.
  if (['bin/getHackP.js', 'bin/getOptimalServer.js'].includes(name)) return 120_000;
  if (name === 'bin/serverRun.js') return 300_000;
  if (['bin/makeMove.js', 'bin/passTurn.js', 'bin/playTwoMoves.js', 'bin/nextTurn.js'].includes(name)) return 600_000;
  if (name === 'bin/corpRun.js' && args[0] === 'nextUpdate') return 120_000;
  if (name === 'bin/stanekRun.js' && args[0] === 'chargeFragment') return 600_000;
  return 30_000;
}

/** Read current spending state on home, including when the caller has been offloaded. */
export async function getReserve(ns) {
  const value = ns.getHostname() === 'home'
    ? Number(ns.read('reserve.txt') || 0)
    : await runScriptLocal(ns, getFilePath('bin/reserve.js'), false, ['read']);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('Cannot read a valid reserve.txt from home; skipping spending.');
  return value;
}

/** Write only on home; never publish an offloaded process's stale local copy. */
export async function setReserve(ns, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`Invalid cash reserve: ${value}`);
  if (ns.getHostname() === 'home') await ns.write('reserve.txt', value, 'w');
  else if (await runScriptLocal(ns, getFilePath('bin/reserve.js'), false, ['write', value]) !== value)
    throw new Error('Could not update reserve.txt on home.');
  return value;
}
export const remoteScriptDependencies = [
  "utils.js",
  "faction-route-planner.js",
  "logger.js",
  "donation-favor.js",
  "progression.js",
  "hacking-formulas.js",
  "purchase-guard.js",
  "speedrun-policy.js",
  "augmentation-reset-policy.js",
  "go-policy.js",
  "share-controller.js",
  "infiltration-policy.js",
];

/** Return the complete shared runtime bundle copied before launching a script away from home. */
export function getRemoteScriptFiles(script) {
  return [...new Set([script, ...remoteScriptDependencies.map(getFilePath)])];
}

/** Returns a helpful error message if we forgot to pass the ns instance to a function
 *  @param {NS} ns The nestcript instance passed to your script's main entry point */
export function checkNsInstance(ns, fnName = "this function") {
  if (ns === undefined || !ns.print) throw new Error(`The first argument to function ${fnName} should be a 'ns' instance.`);
  return ns;
}

/**
 * Return a number formatted with the specified number of significant figures or decimal places, whichever is more limiting.
 * @param {number} num - The number to format
 * @param {number=} minSignificantFigures - (default: 6) The minimum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} minDecimalPlaces - (default: 3) The minimum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatNumber(num, minSignificantFigures = 3, minDecimalPlaces = 1) {
  return num == 0.0 ? "0" : num.toFixed(Math.max(minDecimalPlaces, Math.max(0, minSignificantFigures - Math.ceil(Math.log10(num)))));
}

/**
 * Return a formatted representation of the monetary amount using scale symbols (e.g. $6.50M)
 * @param {number} num - The number to format
 * @param {number=} maxSignificantFigures - (default: 6) The maximum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} maxDecimalPlaces - (default: 3) The maximum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatMoney(num, maxSignificantFigures = 6, maxDecimalPlaces = 3) {
  let numberShort = formatNumberShort(num, maxSignificantFigures, maxDecimalPlaces);
  return num >= 0 ? "$" + numberShort : numberShort.replace("-", "-$");
}

const symbols = ["", "k", "m", "b", "t", "q", "Q", "s", "S", "o", "n", "e33", "e36", "e39"];

/**
 * Return a formatted representation of the monetary amount using scale sympols (e.g. 6.50M)
 * @param {number} num - The number to format
 * @param {number=} maxSignificantFigures - (default: 6) The maximum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} maxDecimalPlaces - (default: 3) The maximum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatNumberShort(num, maxSignificantFigures = 6, maxDecimalPlaces = 3) {
  if (Math.abs(num) > 10 ** (3 * symbols.length)) // If we've exceeded our max symbol, switch to exponential notation
    return num.toExponential(Math.min(maxDecimalPlaces, maxSignificantFigures - 1));
  for (var i = 0, sign = Math.sign(num), num = Math.abs(num); num >= 1000 && i < symbols.length; i++) num /= 1000;

  return ((sign < 0) ? "-" : "") + num.toFixed(Math.max(0, Math.min(maxDecimalPlaces, maxSignificantFigures - Math.floor(1 + Math.log10(num))))) + symbols[i];
}

/** Format a duration (in milliseconds) as e.g. '1h 21m 6s' for big durations or e.g '12.5s' / '23ms' for small durations */
export function formatDuration(duration) {
  if (duration < 1000) return `${duration.toFixed(0)}ms`
  if (!isFinite(duration)) return 'forever (Infinity)'
  const portions = [];
  const msInHour = 1000 * 60 * 60;
  const hours = Math.trunc(duration / msInHour);
  if (hours > 0) {
    portions.push(hours + 'h');
    duration -= (hours * msInHour);
  }
  const msInMinute = 1000 * 60;
  const minutes = Math.trunc(duration / msInMinute);
  if (minutes > 0) {
    portions.push(minutes + 'm');
    duration -= (minutes * msInMinute);
  }
  let seconds = (duration / 1000.0)
  // Include millisecond precision if we're on the order of seconds
  seconds = (hours == 0 && minutes == 0) ? seconds.toPrecision(3) : seconds.toFixed(0);
  if (seconds > 0) {
    portions.push(seconds + 's');
    duration -= (minutes * 1000);
  }
  return portions.join(' ');
}

const memorySuffixes = ["GB", "TB", "PB", "EB"];

/** Formats some RAM amount as a round number of GB/TB/PB/EB with thousands separators e.g. `1.028 TB` */
export function formatRam(num, printGB) {
  if (printGB) {
    return `${Math.round(num).toLocaleString('en')} GB`;
  }
  let idx = Math.floor(Math.log10(num) / 3) || 0;
  if (idx >= memorySuffixes.length) {
    idx = memorySuffixes.length - 1;
  } else if (idx < 0) {
    idx = 0;
  }
  const scaled = num / 1000 ** idx; // Scale the number to the order of magnitude chosen
  // Only display decimal places if there are any
  const formatted = scaled - Math.round(scaled) == 0 ? Math.round(scaled) : formatNumber(num / 1000 ** idx);
  return formatted.toLocaleString('en') + " " + memorySuffixes[idx];
}



/** @param {NS} ns **/
export function disableLogs(ns, listOfLogs) { ['disableLog'].concat(...listOfLogs).forEach(log => checkNsInstance(ns, '"disableLogs"').disableLog(log)); }
/** @param {NS} ns */
//runs a script to conclusion and passes the result
export async function runScript(ns, scriptName, persistent, args = []) {
  checkNsInstance(ns, '"runScript"');
  return await runScriptLocal(ns, scriptName, persistent, args);
}

/** @param {NS} ns */
// Launch on home. Persistent callers receive a PID; request/reply callers receive the PID-port result.
export async function runScriptLocal(ns, scriptName, persistent = false, args = [], ramOverride = 0, replyBudget = rpcReplyBudget(scriptName, args)) {
  checkNsInstance(ns, '"runScriptLocal"');
  const requestKey = JSON.stringify([scriptName, args]);
  const stalled = unresponsiveReplies.get(requestKey);
  if (stalled && ns.isRunning(stalled)) throw new Error(`${scriptName} child ${stalled} is still unresponsive; stop that PID before retrying.`);
  unresponsiveReplies.delete(requestKey);
  const scriptRam = ns.getScriptRam(scriptName, 'home');
  if (!(scriptRam > 0)) throw new Error(`Cannot launch ${scriptName}: missing or invalid script on home.`);
  const options = { threads: 1, temporary: true };
  if (ramOverride > 0) options.ramOverride = ramOverride;
  const started = Date.now();
  let pidof;
  while ((pidof = ns.exec(scriptName, "home", options, ...args)) === 0) {
    if (Date.now() - started >= remoteLaunchTimeout)
      throw new Error(`Cannot launch ${scriptName} on home after ${remoteLaunchTimeout / 1000}s. ` +
        `Needs ${Math.max(scriptRam, ramOverride)} GB; free home RAM or inspect the launch log.`);
    await ns.sleep(10);
  }
  if (persistent) return pidof;
  return await waitForRpcReply(ns, scriptName, pidof, replyBudget, requestKey);
}

/** Preserve event-driven replies without adding a sleep to successful calls. */
async function waitForRpcReply(ns, scriptName, pid, replyBudget, requestKey) {
  const port = ns.getPortHandle(pid);
  if (!port.empty()) return port.read(); // A fast child may already have replied.
  if (!ns.isRunning(pid)) throw new Error(`${scriptName} (pid ${pid}) exited without a reply.`);
  let timer;
  let deadChild = false;
  let timedOut = false;
  const started = Date.now();
  const reply = port.nextWrite();
  try {
    await Promise.race([reply, new Promise((resolve, reject) => {
      const check = () => {
        try {
          if (!port.empty()) return resolve();
          if (!ns.isRunning(pid)) {
            deadChild = true;
            return reject(new Error(`${scriptName} (pid ${pid}) exited without a reply.`));
          }
          if (replyBudget > 0 && Date.now() - started >= replyBudget) {
            timedOut = true;
            unresponsiveReplies.set(requestKey, pid);
            // Keep kill's RAM charge in its own tiny helper; never kill an unrelated process or a whole filename.
            const killer = ns.exec('bin/terminate-rpc.js', 'home', {threads: 1, temporary: true}, pid);
            return reject(new Error(`${scriptName} child ${pid} exceeded its ${replyBudget / 1000}s reply budget. ` +
              (killer ? 'Requested termination; the caller can recover.' : 'Free home RAM or stop this PID before retrying.')));
          }
          // A live backdoor, Go turn, or calculator may legitimately take a long time.
          timer = setTimeout(check, 1000);
        } catch (error) { reject(error); }
      };
      timer = setTimeout(check, 1000);
    })]);
    return port.read();
  } finally {
    clearTimeout(timer);
    // Release our pending listener when the child has died or this request has been abandoned.
    if ((deadChild || timedOut) && port.empty()) { port.write(undefined); port.read(); }
  }
}

/** @param {NS} ns */
//runs a script on any server with free ram.
export async function runScriptSomewhere(ns, script, persistent, argmts, scriptOverride = 0, quiet = false) {
  checkNsInstance(ns, '"runScriptSomewhere"');
  let thispid = 0
  const startedWaiting = Date.now();
  let lastFailure = `no server had enough free RAM for ${script}`;
  const scriptRam = scriptOverride === 0 ? ns.getScriptRam(script, 'home') : scriptOverride;
  if (!Number.isFinite(scriptRam) || scriptRam <= 0) {
    if (!quiet) log(ns, `WARNING: Cannot launch ${script}: missing script or invalid RAM requirement on home.`);
    return 0;
  }
  const homeAvailRam = await getServerAvailRam(ns, "home") - reservedRam;
  if (!persistent && Math.floor(homeAvailRam / scriptRam) >= 1) {
    thispid = ns.exec(script, "home", { threads: 1, temporary: true }, ...argmts)
    if (thispid > 0) return thispid;
  }
  while (true) {
    const servers = await getServersLight(ns);
    let emergencyReserve = !persistent ? false : await getServerAvailRam(ns, "home") <= 16 ? true : false
    const maxRam = !persistent ? 0 : await maxRun(ns, persistent)
    const resRam = !persistent ? 0 : maxRam >= 256 ? 256 : maxRam >= 128 ? 128 : maxRam >= 64 ? 64 : maxRam >= 32 ? 32 : 16
    for (const server of servers) {
      if (server === "home") {
        continue;
      } else if (server.startsWith("hacknet")) {
        if (persistent) continue;
      } else if (!ns.hasRootAccess(server)) continue; //can't check for root on hacknets
      let tmpramavailable = await getServerAvailRam(ns, server)
      if (persistent && emergencyReserve && tmpramavailable >= resRam) {
        emergencyReserve = false
        tmpramavailable -= resRam
      }
      if (tmpramavailable <= 0) continue
      const threadsonserver = Math.floor(tmpramavailable / scriptRam)
      // How many threads can we run?  If we can run something, do it
      if (threadsonserver < 1) continue
      let copied = true;
      for (const dependency of getRemoteScriptFiles(script)) {
        if (!await doSCP(ns, dependency, server, "home")) {
          copied = false;
          lastFailure = `failed to copy required file ${dependency} to ${server}`;
          break;
        }
      }
      if (!copied) continue;
      if (await runScriptLocal(ns, getFilePath('bin/sync-script-config.js'), false, [script, server]) !== true) {
        lastFailure = `failed to synchronize configuration for ${script} on ${server}`;
        continue;
      }
      thispid = ns.exec(script, server, { threads: 1, temporary: true }, ...argmts)
      if (thispid > 0) return thispid;
      lastFailure = `ns.exec returned 0 for ${script} on ${server} after its dependencies were copied`;
    }
    // Prefer offloading persistent managers, but use home when it is the only suitable host.
    const homeFree = await getServerAvailRam(ns, 'home');
    const relocatingSelfFromHome = script.replace(/^\/+/, '') === ns.getScriptName() && ns.getHostname() === 'home';
    if (!relocatingSelfFromHome && homeFree - reservedRam >= scriptRam) {
      thispid = ns.exec(script, 'home', { threads: 1, temporary: true }, ...argmts);
      if (thispid > 0) return thispid;
    }
    if (persistent || Date.now() - startedWaiting >= remoteLaunchTimeout) {
      const now = Date.now();
      const lastWarning = remoteLaunchWarningTimes.get(script) ?? -Infinity;
      if (!quiet && now - lastWarning >= 60_000) {
        remoteLaunchWarningTimes.set(script, now);
        log(ns, `WARNING: Unable to launch ${script}: ${lastFailure}. ` +
          `${persistent ? "Will retry on the next autopilot loop." : "Giving up this attempt so the caller can continue."}`);
      }
      return 0;
    }
    await ns.sleep(50);
  }
}

/** Helper to log a message, and optionally also tprint it and toast it
 * @param {NS} ns The nestcript instance passed to your script's main entry point
 * @param {string} message The message to display
 * @param {boolean} alsoPrintToTerminal Set to true to print not only to the current script's tail file, but to the terminal
 * @param {""|"success"|"warning"|"error"|"info"} toastStyle - If specified, your log will will also become a toast notification
 * @param {int} */
export function log(ns, message = "", alsoPrintToTerminal = false, toastStyle = "", maxToastLength = Number.MAX_SAFE_INTEGER) {
  checkNsInstance(ns, '"log"');
  ns.print(message);
  if (toastStyle) ns.toast(message.length <= maxToastLength ? message : message.substring(0, maxToastLength - 3) + "...", toastStyle);
  if (alsoPrintToTerminal) {
    ns.tprint(message);
  }
  return message;
}
/** Helper for extracting the error message from an error thrown by the game.
 * @param {Error|string} err A thrown error message or object
*/
export function getErrorInfo(err) {
  if (err === undefined || err == null) return "(null error)"; // Nothing caught
  if (typeof err === 'string') return err; // Simple string was thrown
  let strErr = null;
  // Add the stack trace below, if available
  if (err instanceof Error) {
    if (err.stack) // Stack is the most useful for debugging an issue. (Remove bitburner source code from the stack though.)
      strErr = '  ' + err.stack.split('\n').filter(s => !s.includes('bitburner-official'))
        .join('\n    '); // While we're here, indent the stack trace to help distinguish it from the rest.
    if (err.cause) // Some errors have a nested "cause" error object - recurse!
      strErr = (strErr ? strErr + '\n' : '') + getErrorInfo(err.cause);
  }
  // Get the default string representation of this object
  let defaultToString = err.toString === undefined ? null : err.toString();
  if (defaultToString && defaultToString != '[object Object]') { // Ensure the string representation is meaningful
    // If we have no error message yet, use this
    if (!strErr)
      strErr = defaultToString
    // Add the error message if the stack didn't already include it (it doesn't always: https://mtsknn.fi/blog/js-error-stack/ )
    else if (!err.stack || !err.stack.includes(defaultToString))
      strErr = `${defaultToString}\n  ${strErr}`;
  }
  if (strErr) return strErr.trimEnd(); // Some stack traces have trailing line breaks.
  // Other types will be serialized
  let typeName = typeof err; // Get the type thrown
  // If the type is an "object", try to get its name from the constructor name (may be minified)
  if (typeName == 'object') typeName = `${typeName} (${err.constructor.name})`;
  return `non-Error type thrown: ${typeName}` +
    ' { ' + Object.keys(err).map(key => `${key}: ${err[key]}`).join(', ') + ' }';
}

/** Find which server is running a script
   * @param {NS} ns
   * @param {string} scriptName
   */
export async function whichServerIsRunning(ns, scriptName) {
  checkNsInstance(ns, '"whichServerIsRunning"');
  // Process lookup needs only hostnames. Avoid a home RPC and full server snapshots.
  const servers = new Set(['home']);
  for (const server of servers) {
    const procs = ns.ps(server);
    for (const p of procs) {
      if (p.filename === scriptName) {
        return [server, p.pid];
      }
    }
    for (const neighbor of ns.scan(server)) servers.add(neighbor);
  }
  return [null, null];
}

/** finds if a script is running * @param {NS} ns * @param {string} scriptName * @returns [] */
export async function isScriptRunning(ns, scriptName, snapshot) {
  if (snapshot) return snapshot.has(scriptName.replace(/^\/+/, ''));
  const running = await whichServerIsRunning(ns, scriptName);
  return running[0] !== null;
}

/** Reuse only within one scheduler pass; launches still use live RAM checks. */
export function getRunningScriptNames(ns, servers) {
  const names = new Set();
  for (const server of servers) {
    for (const process of ns.ps(server.hostname)) names.add(process.filename.replace(/^\/+/, ''));
  }
  return names;
}


/** find the PID's of all scripts on all servers.
   * @param {NS} ns
   * @param {string} scriptName
   * @returns [] */
export async function findPids(ns, scriptName) {
  checkNsInstance(ns, '"findPids"');
  const matches = [];
  const servers = await getServers(ns);
  for (const server of servers) {
    const procs = ns.ps(server.hostname);
    for (const p of procs) {
      if (p.filename == scriptName) matches.push(p.pid);
    }
  }
  return matches;
}

/** Joins all arguments as components in a path, e.g. pathJoin("foo", "bar", "/baz") = "foo/bar/baz" **/
export function pathJoin(...args) {
  return args.filter(s => !!s).join('/').replace(/\/\/+/g, '/');
}


/** Gets the path for the given local file, taking into account optional subfolder relocation via git-pull.js **/
export function getFilePath(file) {
  const subfolder = '';  // git-pull.js optionally modifies this when downloading
  return pathJoin(subfolder, file);
}

/** Helper to launch a script and log whether if it succeeded or failed
     * @param {NS} ns */
//launches a script. Doesn't care if it finishes or not. Return PID
export async function launchScriptHelper(ns, baseScriptName, args = [], convertFileName = true) {
  checkNsInstance(ns, '"launchScriptHelper"');
  let pid, err;
  try { pid = await runScript(ns, convertFileName ? getFilePath(baseScriptName) : baseScriptName, true, args); }
  catch (e) { err = e; }
  if (pid)
    log(ns, `INFO: Launched ${baseScriptName} (pid: ${pid}) with args: [${args.join(", ")}]`, true);
  else if (err)
    log(ns, `ERROR: Failed to launch ${baseScriptName} with args: [${args.join(", ")}]` +
      (err ? `\nCaught: ${getErrorInfo(err)}` : ''), true, 'error');
  return pid;
}

/** @param {NS} ns */
export async function maxRun(ns, persistent, useHacknet = false) {
  checkNsInstance(ns, '"maxRun"');
  let highest = 0
  /**@type {String[]} servers */
  const servers = await getServersLight(ns)
  let emergencyReserve = await getServerAvailRam(ns, "home") + 1.7 <= 16 ? true : false
  for (const server of servers) {
    if (server.startsWith("hacknet")) {
      if (!useHacknet) continue;
    } else if (!ns.hasRootAccess(server)) continue; //can't check for root on hacknets
    let tmpramavailable = await getServerAvailRam(ns, server)
    if (server === "home" && persistent) tmpramavailable = Math.max(tmpramavailable, 0)
    if (tmpramavailable > highest)
      highest = tmpramavailable
  }// All servers
  if (!persistent) return highest
  //Highest is now max run
  const resRam = highest >= 256 ? 256 : highest >= 128 ? 128 : highest >= 64 ? 64 : highest >= 32 ? 32 : 16
  //Now that we have the highest, we go again
  let highest2 = 0
  for (const server of servers) {
    if (server.startsWith("hacknet")) {
      if (!useHacknet) continue;
    } else if (!ns.hasRootAccess(server)) continue; //can't check for root on hacknets
    let tmpramavailable = await getServerAvailRam(ns, server)
    if (persistent && emergencyReserve && tmpramavailable >= resRam) {
      emergencyReserve = false
      tmpramavailable -= resRam
    }
    if (server === "home" && persistent) tmpramavailable = Math.max(tmpramavailable, 0)
    if (tmpramavailable > highest2)
      highest2 = tmpramavailable
  }// All servers
  return highest2
}

/** Helper to check which of a set of files exist on a remote server in a single batch ram-dodging request
 * @param {NS} ns
 * @param {string[]} fileNames
 * @returns {Promise<boolean[]>} */
export async function filesExist(ns, fileNames, hostname = "home") {
  checkNsInstance(ns, '"filesExist"');
  return fileNames.map(f => ns.fileExists(f, hostname));
}

/** A helper to parse the command line arguments with a bunch of extra features, such as
 * - Loading a persistent defaults override from a local config file named after the script.
 * - Rendering "--help" output without all scripts having to explicitly specify it
 * @param {NS} ns The nestcript instance passed to your script's main entry point
 * @param {[string, string | number | boolean | string[]][]} argsSchema - Specification of possible command line args. **/
export function getConfiguration(ns, argsSchema) {
  checkNsInstance(ns, '"getConfig"');
  const scriptName = ns.getScriptName();
  // If the user has a local config file, override the defaults in the argsSchema
  const confName = `${scriptName}.config.txt`;
  const overrides = ns.read(confName);
  const overriddenSchema = overrides ? [...argsSchema] : argsSchema; // Clone the original args schema
  if (overrides) {
    try {
      let parsedOverrides = JSON.parse(overrides); // Expect a parsable dict or array of 2-element arrays like args schema
      if (Array.isArray(parsedOverrides)) parsedOverrides = Object.fromEntries(parsedOverrides);
      log(ns, `INFO: Applying ${Object.keys(parsedOverrides).length} overriding default arguments from "${confName}"...`);
      for (const key in parsedOverrides) {
        const override = parsedOverrides[key];
        const matchIndex = overriddenSchema.findIndex(o => o[0] == key);
        const match = matchIndex === -1 ? null : overriddenSchema[matchIndex];
        if (!match)
          throw new Error(`Unrecognized key "${key}" does not match of this script's options: ` + JSON.stringify(argsSchema.map(a => a[0])));
        else if (override === undefined)
          throw new Error(`The key "${key}" appeared in the config with no value. Some value must be provided. Try null?`);
        else if (match && JSON.stringify(match[1]) != JSON.stringify(override)) {
          if (typeof (match[1]) !== typeof (override))
            log(ns, `WARNING: The "${confName}" overriding "${key}" value: ${JSON.stringify(override)} has a different type (${typeof override}) than the ` +
              `current default value ${JSON.stringify(match[1])} (${typeof match[1]}). The resulting behaviour may be unpredictable.`, false, 'warning');
          else
            log(ns, `INFO: Overriding "${key}" value: ${JSON.stringify(match[1])}  ->  ${JSON.stringify(override)}`);
          overriddenSchema[matchIndex] = { ...match }; // Clone the (previously shallow-copied) object at this position of the new argsSchema
          overriddenSchema[matchIndex][1] = override; // Update the value of the clone.
        }
      }
    } catch (err) {
      log(ns, `ERROR: There's something wrong with your config file "${confName}", it cannot be loaded.` +
        `\nThe error encountered was: ${getErrorInfo(err)}` +
        `\nYour config file should either be a dictionary e.g.: { "string-opt": "value", "num-opt": 123, "array-opt": ["one", "two"] }` +
        `\nor an array of dict entries (2-element arrays) e.g.: [ ["string-opt", "value"], ["num-opt", 123], ["array-opt", ["one", "two"]] ]` +
        `\n"${confName}" contains:\n${overrides}`, true, 'error', 80);
      return null;
    }
  }
  // Return the result of using the in-game args parser to combine the defaults with the command line args provided
  try {
    const finalOptions = ns.flags(overriddenSchema);
    log(ns, `INFO: Running ${scriptName} with the following settings:` + Object.keys(finalOptions).filter(a => a != "_").map(a =>
      `\n  ${a.length == 1 ? "-" : "--"}${a} = ${finalOptions[a] === null ? "null" : JSON.stringify(finalOptions[a])}`).join("") +
      `\nrun ${scriptName} --help  to get more information about these options.`)
    return finalOptions;
  } catch (err) {
    // Detect if the user passed invalid arguments, and return help text
    // If the user explictly asked for --help, suppress the parsing error
    const error = ns.args.includes("help") || ns.args.includes("--help") ? null : getErrorInfo(err);
    // Try to parse documentation about each argument from the source code's comments
    const source = ns.read(scriptName).split("\n");
    let argsRow = 1 + source.findIndex(row => row.includes("argsSchema ="));
    const optionDescriptions = {}
    while (argsRow && argsRow < source.length) {
      const nextArgRow = source[argsRow++].trim();
      if (nextArgRow.length == 0) continue;
      if (nextArgRow[0] == "]" || nextArgRow.includes(";")) break; // We've reached the end of the args schema
      const commentSplit = nextArgRow.split("//").map(e => e.trim());
      if (commentSplit.length != 2) continue; // This row doesn't appear to be in the format: [option...], // Comment
      const optionSplit = commentSplit[0].split("'"); // Expect something like: ['name', someDefault]. All we need is the name
      if (optionSplit.length < 2) continue;
      optionDescriptions[optionSplit[1]] = commentSplit[1];
    }
    log(ns, (error ? `ERROR: There was an error parsing the script arguments provided: ${error}\n` : 'INFO: ') +
      `${scriptName} possible arguments:` + argsSchema.map(a => `\n  ${a[0].length == 1 ? " -" : "--"}${a[0].padEnd(30)} ` +
        `Default: ${(a[1] === null ? "null" : (JSON.stringify(a[1]) ?? "undefined")).padEnd(10)}` +
        (a[0] in optionDescriptions ? ` // ${optionDescriptions[a[0]]}` : '')).join("") + '\n' +
      `\nTip: All argument names, and some values support auto-complete. Hit the <tab> key to autocomplete or see possible options.` +
      `\nTip: Array arguments are populated by specifying the argument multiple times, e.g.:` +
      `\n       run ${scriptName} --arrayArg first --arrayArg second --arrayArg third  to run the script with arrayArg=[first, second, third]` +
      (!overrides ? `\nTip: You can override the default values by creating a config file named "${confName}" containing e.g.: { "arg-name": "preferredValue" }`
        : overrides && !error ? `\nNote: The default values are being modified by overrides in your local "${confName}":\n${overrides}`
          : `\nThis error may have been caused by your local overriding "${confName}" (especially if you changed the types of any options):\n${overrides}`), true);
    return null; // Caller should handle null and shut down elegantly.
  }
}

export async function getOwnedSF(ns) {
  checkNsInstance(ns, '"getOwnedSF"');
  const cost = ns.getScriptRam('bin/getOwnedSF.js');
  //const bn = (await getReset(ns)).currentNode;
  if (cost > 20) return { 1 : 1 };
  return await runScript(ns, "bin/getOwnedSF.js", false, []) 
}
/** Helper to check which of a set of files exist on a remote server in a single batch ram-dodging request
 * @param {NS} ns*/
export async function getActiveSourceFiles(
  ns,
  includeLevelsFromCurrentBitnode = true,
  suppliedResetInfo = undefined,
) {
  checkNsInstance(ns, '"getActiveSourceFiles"');

  const resetInfo = suppliedResetInfo ?? await getReset(ns);

  // ResetInfo.ownedSF is Map<number, number>.
  const dictSourceFiles = Object.fromEntries(resetInfo.ownedSF ?? []);

  if (includeLevelsFromCurrentBitnode) {
    // These BitNodes provide their corresponding feature set at effective
    // level 3 while currently running inside them.
    const effectiveLevel = [4, 8, 15].includes(resetInfo.currentNode) ? 3 : 1;

    dictSourceFiles[resetInfo.currentNode] = Math.max(
      effectiveLevel,
      dictSourceFiles[resetInfo.currentNode] ?? 0,
    );
  }

  return dictSourceFiles;
}

export async function buildLib(ns, items, cmd) {
  let ret = {};
  for (const item of items) {
    const val = await stockRun(ns, cmd, item);
    ret[item] = val;
  }
  return ret;
}


/** Helper function to get the total value of stocks using as little RAM as possible.
 *  @param {NS} ns The nestcript instance passed to your script's main entry point
 * @returns {Promise<number>} The current total dollar value of all owned stocks */
export async function getStocksValue(ns) {
  if (!await hasTixApi(ns)) return 0;
  const required = ns.getScriptRam('bin/getStockValue.js', 'home');
  let value = 0;
  if (required > 0 && await getServerAvailRam(ns, 'home') >= required) {
    value = await runScriptLocal(ns, 'bin/getStockValue.js', false, []);
  } else {
    // Stock snapshots need 9.65 GB in v3.0.1. Retain the smaller per-call helper when they cannot fit.
    const symbols = await stockRun(ns, 'getSymbols');
    if (!Array.isArray(symbols)) throw new Error(`Invalid stock symbols: ${String(symbols)}`);
    for (const symbol of symbols) {
      const position = await stockRun(ns, 'getPosition', symbol);
      if (!Array.isArray(position) || position.length !== 4 || !position.every(Number.isFinite))
        throw new Error(`Invalid position for ${symbol}`);
      const [long, , short, shortPrice] = position;
      if (long > 0) value += long * await stockRun(ns, 'getBidPrice', symbol) - 100_000;
      if (short > 0) value += short * (2 * shortPrice - await stockRun(ns, 'getAskPrice', symbol)) - 100_000;
    }
  }
  if (!Number.isFinite(value)) throw new Error(`Stock valuation failed: ${String(value)}`);
  return value;
}

const crackNames = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
export async function getPortCrackers(ns) {
  const owned = await filesExist(ns, crackNames);
  return crackNames.filter((s, i) => owned[i]);
}
const MaxFavor = 35331;
const log1point02 = 0.019802627296179712;
function clampNumber(value, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
  return Math.max(Math.min(value, max), min);
}
export function repToFavor(rep) {
  return clampNumber(Math.log1p(rep / 25000) / log1point02, 0, MaxFavor);
}

export function favorToRep(f) {
  // expm1 is e^x - 1, which is more accurate for small x than doing it the obvious way.
  return clampNumber(25000 * Math.expm1(log1point02 * f), 0);
}

export function addRepToFavor(favor, playerReputation) {
  return repToFavor(favorToRep(favor) + playerReputation);
}
