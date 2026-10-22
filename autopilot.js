import {
  log, getReset, getPlayerInfo, getBNMults, getErrorInfo, isScriptRunning, getRunningScriptNames, getStocksValue, destroyWD,
  launchScriptHelper, crackHosts, getActiveSourceFiles, formatDuration, disableLogs, getConfiguration,
  getOwnedAugs, getFacInvReqs, singRun, formatMoney, getServerMaxRam, getPortCrackers,
  getServers, runScriptSomewhere, runScriptLocal, doSCP, gangRun, sleeveRun, stanekRun, bbRun, getReserve, setReserve
} from './utils.js';

import { recordBnStart, recordRunEvents, printBnRunSummary } from './logger.js'
import { evaluateAugmentationReset } from './augmentation-reset-policy.js';
import {
  buildAscendArgs, getFreshDonationFavorProgress, NEUROFLUX
} from './donation-favor.js'
import {
  selectNextBitNode, sourceFileLevel, hasBladeburnerAccess, hasCompletedBladeburner,
  getIntelFarmReadiness, intelFarmState, BN_ROUTE, EARLY_UNLOCK_ROUTE
} from './progression.js'

const argsSchema = [
  ['bn-route', 'current'], // current or unlocks-first; set autopilot.js.config.txt to retain the experiment across resets.
  ['disable-go', false], // Prevent Go auto-launch while comparing an external bot; stop an existing go.js yourself first.
  ['infiltration', true], // Bounded UI automation after casino, including Shadows of Anarchy progression.
  ['infiltration-money-target', 10e9], // Cash goal when no useful reputation target is active.
  ['infiltration-faction', ''], // Optional explicit reward recipient in BN1; otherwise use the SF4 faction planner.
];
export function autocomplete(data) { data.flags(argsSchema); return []; }

/** Preserve player reserves and don't repeatedly launch a disabled corporation feature. */
export function shouldStartCorporation(ns, sourceFiles, currentNode, money, reserve) {
  if (!(3 in sourceFiles)) return false
  if (ns.corporation.hasCorporation()) return true
  const selfFund = Number(currentNode) !== 3
  const status = ns.corporation.canCreateCorporation(selfFund)
  if (status !== 'Success' && status !== true) return false
  return !selfFund || (Number.isFinite(money) && Number.isFinite(reserve) && reserve >= 0 && money >= 150e9 + reserve)
}


/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(4.2) // Include the reply watchdog's API cost, with a small margin.
  const options = getConfiguration(ns, argsSchema);
  if (!options) return;
  if (!['current', 'unlocks-first'].includes(options['bn-route'])) {
    ns.tprint('ERROR: --bn-route must be current or unlocks-first.');
    return;
  }
  if (!Number.isFinite(options['infiltration-money-target']) || options['infiltration-money-target'] < 0) {
    ns.tprint('ERROR: --infiltration-money-target must be a finite nonnegative cash goal.');
    return;
  }
  const route = options['bn-route'] === 'unlocks-first' ? EARLY_UNLOCK_ROUTE : BN_ROUTE;
  const factionManagerOutputFile = "/Temp/affordable-augs.txt"; // Temp file produced by faction manager with status information
  //disableLogs(ns, ['getServerMaxRam', 'getServerUsedRam', 'getServerMoneyAvailable', 'getServerGrowth', 'getServerSecurityLevel', 'exec', 'scan', 'sleep', 'scp'])
  log(ns, `Cracking initial hosts..`, 'info')
  await crackHosts(ns); //do an initial crack to run scripts on other servers
  log(ns, `Cracked!`, 'info')
  const augTRP = "The Red Pill";
  const augStanek = `Stanek's Gift - Genesis`;
  let player = await getPlayerInfo(ns);
  let alreadyJoinedDaedalus = false, autoJoinDaedalusUnavailable = false, reservingMoneyForDaedalus = false, disableStockmasterForDaedalus = false;
  let resetInfo = await getReset(ns);
  let dictOwnedSourceFiles = await getActiveSourceFiles(ns, false);
  const unlockedSFs = await getActiveSourceFiles(ns, true);
  const currBN = `${resetInfo.currentNode}.${sourceFileLevel(dictOwnedSourceFiles, resetInfo.currentNode) + 1}`;
  let ownedCracks = [];
  const STAGGER = 1000; //default staggering of routine scripts
  const PERIOD = 30000; //timeframe in which we will attempt to rerun routine scripts. (30 sec)
  const MAX_AUGMENTATION_WAIT = 4 * 60 * 60 * 1000;
  let bitNodeMults = 5 in unlockedSFs ? await getBNMults(ns) : getHardCodedBNMultis(resetInfo.currentNode);
  let installedAugmentations = [];
  let playerInstalledAugCount;
  let nextRecommendedBn;
  let have4sApi;
  let acceptedStanek = false;
  let reservedPurchase = 0;
  let currentMoneyReserve = await getReserve(ns);
  let wdHack = null;
  let maxRam = 8;
  let lastFactionManagerWarning = 0;
  const observedMilestones = new Set();
  let nextTelemetryAttempt = 0;
  let lastInvestmentDeadline, nextInvestmentDeadlineAttempt = 0;
  async function noteMilestones(events) {
    if (Date.now() < nextTelemetryAttempt) return;
    const fresh = events.filter(event => !observedMilestones.has(`${event.kind}:${event.key ?? ''}`));
    if (fresh.length) {
      if (await recordRunEvents(ns, fresh, currBN))
        fresh.forEach(event => observedMilestones.add(`${event.kind}:${event.key ?? ''}`));
      else nextTelemetryAttempt = Date.now() + 30_000;
    }
  }
  const lastRestart = Date.now();
  let augMomentum = {
    lastAugCount: 0,
    lastIncreaseTime: 0,
    bestRate: 0,
    lastAugReset: 0,
    nextExpectedAug: 0,
    hardCapLogged: false,
  };
  const resetDecisionState = {};
  let lastResetDecisionLog = '', nextResetDecisionLog = 0;
  const shouldUpgradeHacknet = () =>
    bitNodeMults.HacknetNodeMoney > 0 && // Ensure hacknet is not disabled in this BN
    getPlayerMoney(ns) > reservedMoney(ns); // Player money exceeds the reserve (otherwise it will sit there buying nothing)
  let playerInGang = false;
  let shouldIntelFarm = false, readyToFarmIntel = false, farmState;
  let lastIntelPreparationCheck = -Infinity;
  async function refreshIntelFarmReadiness(ns, force = false) {
    // Readiness is live, but expensive invite/state reads need only run once per planning interval.
    if (force || Date.now() - lastIntelPreparationCheck >= 30_000) {
      try {
        farmState = await intelFarmState(ns);
        const invitations = sourceFileLevel(dictOwnedSourceFiles, 5) > 0 && 4 in unlockedSFs
          ? await singRun(ns, 'checkFactionInvitations') : [];
        const readiness = getIntelFarmReadiness(player, installedAugmentations, invitations, dictOwnedSourceFiles, farmState);
        shouldIntelFarm = readiness.needed;
        readyToFarmIntel = readiness.ready;
      } catch (error) {
        // An unavailable state helper must not take down money/augmentation automation or start an untracked farm.
        shouldIntelFarm = getIntelFarmReadiness(player, installedAugmentations, [], dictOwnedSourceFiles, farmState).needed;
        readyToFarmIntel = false;
        log(ns, `WARNING: Intelligence preparation state unavailable; retrying in 30 seconds: ${String(error)}`);
      }
      lastIntelPreparationCheck = Date.now();
    }
    // A live INT increase can release the finish gate without waiting for the next invite poll.
    if (!getIntelFarmReadiness(player, installedAugmentations, [], dictOwnedSourceFiles, farmState).needed)
      shouldIntelFarm = readyToFarmIntel = false;
  }

  function getFactionWorkerArgs() {
    if (shouldIntelFarm)
      return ["--fast-crimes-only", "--prioritize-invites", "--all-company-invites", "--intel-farm-preparation"];
    const args = 2 in unlockedSFs && !playerInGang
      ? ["--fast-crimes-only", "--get-invited-to-every-faction", "--crime-focus",
        "--training-stat-per-multi-threshold", 200, "--prioritize-invites"]
      : ["--fast-crimes-only", "--get-invited-to-every-faction"];
    return options.infiltration ? [...args, '--infiltration'] : args;
  }

  //in order by importance!
  const asynchronousHelpers = [
    {
      name: "kernel.js",
      shouldRun: () => true,
      args: () => []
    },
    {
      name: "work-for-faction2.js",
      shouldRun: () => 4 in unlockedSFs,
      args: getFactionWorkerArgs
    },
    {
      name: "host-manager.js",
      shouldRun: () => shouldImproveHacking(ns) && getPlayerMoney(ns) > 400000,
      args: () => [],
      nextRun: Date.now() + (1 * STAGGER)
    },
    {
      name: "corporation.js",
      shouldRun: () => shouldStartCorporation(ns, unlockedSFs, resetInfo.currentNode, getPlayerMoney(ns), currentMoneyReserve),
      args: () => []
    },
    {
      name: "gangs.js",
      shouldRun: () => 2 in unlockedSFs, //might need to consider BNmults here
      args: () => []
    },
    {
      name: "sleeve.js",
      shouldRun: () => 10 in unlockedSFs && reqRam(1000),
      args: () => []
    },
    {
      name: "go.js",
      shouldRun: () => !options['disable-go'] && reqRam(2000),
      args: () => []
    },
    {
      name: "stockmaster.js",
      shouldRun: () => 
        !disableStockmasterForDaedalus &&
        (reqRam(3000) || !shouldImproveHacking(ns)) &&
        (getTimeInAug() > 20000 || resetInfo.currentNode == 8),
      args: () => []
    },
    {
      name: "bladeburner.js",
      shouldRun: () => 
        !shouldIntelFarm && hasBladeburnerAccess(unlockedSFs) && bitNodeMults.BladeburnerRank > 0,
      args: () => []
    },
    {
      name: "darknet.js",
      shouldRun: () => ns.fileExists('DarkscapeNavigator.exe', 'home'),
      args: () => []
    },
    {
      name: "spend-hashes.js",
      shouldRun: () => 9 in unlockedSFs && bitNodeMults.HacknetNodeMoney > 0,
      args: () => [],
      nextRun: Date.now() + (6 * STAGGER)
    },
    {
      name: "purchaseSleeves.js",
      shouldRun: () => resetInfo.currentNode == 10 && reqRam(4000),
      args: () => []
    },
    { name: "stats.js", shouldRun: () => reqRam(1000), args: () => [] }, // Adds stats not usually in the HUD (nice to have)
    {
      name: 'infiltrate.js',
      shouldRun: () => options.infiltration && !shouldIntelFarm && !reservedPurchase && reqRam(128),
      args: () => ['--scheduled', '--auto', '--quiet', '--soa', '--aug-count-target', bitNodeMults.DaedalusAugsRequirement,
        '--money-target', reservingMoneyForDaedalus ? 100e9 : options['infiltration-money-target'],
        ...(options['infiltration-faction'] && !(4 in unlockedSFs) ? ['--faction', options['infiltration-faction']] : [])],
    },
  ];
  const reqRam = (ram) => maxRam >= ram;
  const periodicScripts = [
    // Buy tor as soon as we can if we haven't already, and all the port crackers
    {
      name: "/Tasks/tor-manager.js",
      shouldRun: () => 4 in unlockedSFs,
      args: () => [],
      nextRun: Date.now() + (6 * STAGGER)
    },
    {
      name: "/Tasks/program-manager.js",
      shouldRun: () => 4 in unlockedSFs && shouldImproveHacking(ns),
      args: () => [],
      nextRun: Date.now() + (7 * STAGGER)
    },
    {
      name: "faction-manager.js",
      shouldRun: () => 4 in unlockedSFs && reqRam(100) && (player.factions.length > 0 || getPlayerMoney(ns) > 1e9),
      args: () => ['--verbose', 'false'],
      nextRun: Date.now() + (9 * STAGGER)
    },
    {
      name: "/Tasks/contractor.js",
      shouldRun: () => true,
      args: () => [],
      nextRun: Date.now() + (0 * STAGGER)
    },
    {
      name: "hacknet-upgrade-manager.js",
      shouldRun: shouldUpgradeHacknet,
      args: () => ["-c", "--max-payoff-time", "4h", "--respect-reset-horizon"],
      nextRun: Date.now() + (2 * STAGGER)
    },
    {
      name: "/Tasks/backdoor-all-servers.js",
      shouldRun: () => 4 in unlockedSFs,
      args: () => [],
      nextRun: Date.now() + (5 * STAGGER)
    },
  ];

  let kernelStartTime = 0; // The time we personally launched daemon.
  function getAugmentationCycleStart() {
    const lastAugReset = Number(resetInfo?.lastAugReset);
    return Number.isFinite(lastAugReset) && lastAugReset > 0 ? lastAugReset : lastRestart;
  }
  function getTimeInAug() { return Math.max(0, Date.now() - getAugmentationCycleStart()); }
  function getTimeInBitnode() { return Date.now() - resetInfo.lastNodeReset; }

  /** Returns the amount of money we   ould currently be reserving. Dynamically adapts to save money for a couple of big  urchases on the horizo 
* @param {NS} n 
* @returns {number} */
  function reservedMoney(ns) {
    let shouldReserve = currentMoneyReserve;
    let playerMoney = getPlayerMoney(ns);
    // Conserve money if we're close to being able to afford the Stock Market 4s API
    const fourSigmaCost = (bitNodeMults.FourSigmaMarketDataApiCost * 25000000000);
    if (!have4sApi && playerMoney >= fourSigmaCost / 2)
      shouldReserve += fourSigmaCost; // Start saving if we're half-way to buying 4S market access
    // Conserve money if we're in BN10 and nearing the cost of the last last sleeve
    if (resetInfo.currentNode == 10 && playerMoney >= 10e15) // 10q - 10% the cost of the last sleeve
      shouldReserve = 100e15; // 100q, the cost of the 6th sleeve from The Covenant
    return shouldReserve;
  }

  /** @param {NS} ns **/
  async function main_start(ns) {
    log(ns, "INFO: Cracking hosts", true, 'info');
    await crackHosts(ns); 
    //do an initial crack to run scripts on other servers
    log(ns, "INFO: Cracked", true, 'info');
    // Intelligence farming is coordinated by mainLoop so preparation can survive augmentation resets.
    if (ns.getHostname() == 'home') {
      if (await getServerMaxRam(ns, 'home') < 64) {
        log(ns, "INFO: Bootstrapping autopilot.", true, 'info');
        const pid = await runScriptSomewhere(ns, 'autopilot.js', true, ns.args);
        if (pid != 0) return;
      }
    }
    log(ns, "INFO: Auto-pilot engaged...", true, 'info');
    // A restarted autopilot must not duplicate a coinflipper that is still earning.
    if (!await isScriptRunning(ns, 'coinflip.js'))
      await launchScriptHelper(ns, 'coinflip.js'); //lets try to get some cash!
    let startUpRan = false, keepRunning = true;
    while (keepRunning) {
      try {
        // Start-up actions, wrapped in error handling in case of temporary failures
        if (!startUpRan) startUpRan = await startUp(ns);
        // Main loop: Monitor progress in the current BN and automatically reset when we can afford TRP, or N augs.
        keepRunning = await mainLoop(ns);
      }
      catch (err) {
        log(ns, `WARNING: autopilot.js Caught (and suppressed) an unexpected error:` +
          `\n${getErrorInfo(err)}`, false, 'warning');
        keepRunning = shouldWeKeepRunning(ns);
      }
      await ns.sleep(1000);
    }
  }

  /** @param {NS} ns **/
  async function startUp(ns) {
    if ((4 in unlockedSFs)) {
      if (unlockedSFs[4] !== 3 && resetInfo.currentNode !== 4) { // No idea why this failed, treat as temporary and allow auto-retry.
        log(ns, `WARNING: You only have SF4 level ${unlockedSFs[4]}. Without level 3, some singularity functions will be ` +
          `too expensive to run until you have bought a lot of home RAM.`, true);
      }
      installedAugmentations = await getOwnedAugs(ns, false);
      playerInstalledAugCount = installedAugmentations.length;
    } else {
      log(ns, `WARNING: This script requires SF4 (singularity) functions to assess purchasable augmentations ascend automatically. ` +
        `Some functionality will be disabled and you'll have to manage working for factions, purchasing, and installing augmentations yourself.`, true);

      if (resetInfo.currentNode === 1 && !dictOwnedSourceFiles[1]) {
        // Non-modal guidance. A failed optional launch must not stall the income loop.
        if (!await isScriptRunning(ns, 'bn1-guide.js')) {
          const guidePid = ns.exec('bn1-guide.js', 'home', { threads: 1, temporary: true });
          if (!guidePid) log(ns, 'BN1.1 guide could not start. Free home RAM, then run bn1-guide.js.', true);
        }
      }
      log(ns, 'Manual steps: work for factions, buy/install useful augmentation bundles, then restart automation. ' +
        'For first-BN1 prompts, run bn1-guide.js. After BN1.1, complete BN4.1–4.3 for Singularity automation.', true);
    }
    const runLog = await recordBnStart(ns, currBN, {route: options['bn-route']});
    printBnRunSummary(ns, 25, runLog);
    const next = selectNextBitNode(dictOwnedSourceFiles, resetInfo.currentNode, route);
    nextRecommendedBn = next.node;
    log(ns, `INFO: After BN${currBN}, next is BN${next.node}` +
      (next.repeat ? ' (repeat).' : ` until SF${next.node}.${next.targetLevel}.`), true);
    await refreshIntelFarmReadiness(ns, true);
    return true;
  }

  /** Logic run periodically througho   the BN
   * @param {NS} ns */
  async function mainLoop(ns) {
    //crack hosts if we increased in hacking level, or gain cracks.
    const playerHackLevel = player.skills.hacking
    player = await getPlayerInfo(ns);
    await refreshIntelFarmReadiness(ns);
    if (readyToFarmIntel) {
      // The farm owns the reset phase. Do not race it with augmentation installation or new work.
      if (!await isScriptRunning(ns, 'farm-intel.js')) {
        await refreshIntelFarmReadiness(ns, true);
        if (readyToFarmIntel) await runScriptLocal(ns, 'farm-intel.js', true, []);
      }
      if (readyToFarmIntel) return true;
    }
    const numCracksOwned = ownedCracks.length;
    ownedCracks = await getPortCrackers(ns);
    if (player.skills.hacking > playerHackLevel || ownedCracks.length > numCracksOwned) await crackHosts(ns);
    
    have4sApi = ns.stock.has4SDataTixApi();
    playerInGang = 2 in unlockedSFs && await gangRun(ns, 'inGang') === true;
    const servers = await getServers(ns);
    maxRam = 0;
    for (const server of servers) {
      if (server.hasAdminRights && server.maxRam > 0)
        maxRam += server.maxRam
    }
    let stocksValue = null;
    try { stocksValue = await getStocksValue(ns); } catch { /* Keep unreadable holdings distinct from an empty portfolio. */ }

    await manageReservedMoney(ns, player, stocksValue ?? 0); // Reserve conservatively using only confirmed cash during a stock outage.
    await checkOnDaedalusStatus(ns, player, stocksValue);
    await checkIfBnIsComplete(ns);
    await maybeAcceptStaneksGift(ns);
    const runningScripts = getRunningScriptNames(ns, servers);
    await checkOnRunningScripts(ns, runningScripts);
    await runPeriodicScripts(ns, runningScripts);
    await noteMilestones([
      ...player.factions.map(faction => ({kind: 'faction-joined', key: faction})),
      ...(runningScripts.has('kernel.js') ? [{kind: 'hacking-automation-running'}] : []),
      ...(stocksValue > 0 ? [{kind: 'stock-position-observed'}] : []),
    ]);
    await maybeInstallAugmentations(ns, player, stocksValue !== null);
    return shouldWeKeepRunning(ns); // Return false to shut down autopilot.js if we installed augs, or don't have enough home RAM
  }

  /** Consolidated logic for all the   mes we want to reserve money
   * @  ram {NS} ns
   * @param {Play    player */
  async function manageReservedMoney(ns, player, stocksValue) {
    if (reservedPurchase) return; // Do not mess with money reserved for installing augmentations
    const currentReserve = currentMoneyReserve = await getReserve(ns);
    if (reservingMoneyForDaedalus) // Reserve 100b to get the daedalus invite
      return currentReserve == 100E9 ? true : currentMoneyReserve = await setReserve(ns, 100E9);
    // Otherwise, reserve money for stocks for a while, as it's our main source of income early in the BN
    // It also acts as a decent way to save up for augmentations
    const minStockValue = 8E9; // At a minimum 8 of the 10 billion earned from the casino must be reserved for buying stock
    // As we earn more money, reserve a percentage of it for further investing in stock. Decrease this as the BN progresses.
    const minStockPercent = Math.max(0, 0.8 - 0.1 * getTimeInBitnode() / 3.6E6); // Reduce by 10% per hour in the BN
    const reserveCap = 1E12; // As we start start to earn crazy money, we will hit the stock market cap, so cap the maximum reserve
    // Dynamically update reserved cash based on how much money is already converted to stocks.
    const reserve = Math.min(reserveCap, Math.max(0, player.money * minStockPercent, minStockValue - stocksValue));
    return currentReserve == reserve ? true : currentMoneyReserve = await setReserve(ns, reserve); // Reserve for stocks
  }

  async function checkOnRunningScripts(ns, runningScripts) {
    for (const script of asynchronousHelpers) {
      if (Date.now() < (script.nextRun ?? 0)) continue;
      try {
        const serverRunning = await isScriptRunning(ns, script.name, runningScripts);
        if (script.shouldRun() && !serverRunning) {
          let pid;
          if (['darknet.js', 'infiltrate.js'].includes(script.name))
            pid = ns.exec(script.name, 'home', { threads: 1, temporary: true, preventDuplicates: true }, ...script.args());
          else
            pid = await runScriptSomewhere(ns, script.name, true, script.args());
          if (pid > 0) runningScripts?.add(script.name.replace(/^\/+/, ''));
        }
      } catch (error) {
        log(ns, `WARNING: ${script.name} launch deferred: ${getErrorInfo(error)}`);
      } finally {
        script.nextRun = Date.now() + PERIOD;
      }
    }
  }
  async function runPeriodicScripts(ns, runningScripts) {
    const now = Date.now();

    for (const script of periodicScripts) {
      if (now > script.nextRun) {
        try {
          const serverRunning = await isScriptRunning(ns, script.name, runningScripts);
          if (script.shouldRun() && !serverRunning) {
            log(ns, `Running ${script.name}`);
            const pid = await runScriptSomewhere(ns, script.name, false, script.args());
            if (pid > 0) runningScripts?.add(script.name.replace(/^\/+/, ''));
          }
        } catch (error) {
          log(ns, `WARNING: ${script.name} launch deferred: ${getErrorInfo(error)}`);
        }
        // Schedule next run
        script.nextRun = now + PERIOD;
      }
    }
  }
  /** Accept Stanek's gift immediatel  at the start of the BN (as opposed to just before the first install)
   * if it looks like it will scale w   .
   * @param {NS} ns*/
  async function maybeAcceptStaneksGift(ns) {
    // Look for any reason not to accept stanek's gift (do the quickest checks first)
    if (acceptedStanek) return;
    // Don't get Stanek's gift too early if its size is reduced in this BN
    //if (bitNodeMults.StaneksGiftExtraSize < 0) return;
    // If Stanek's gift size isn't reduced, but is penalized, don't get it too early 
    //if (bitNodeMults.StaneksGiftExtraSize == 0 && bitNodeMults.StaneksGiftPowerMultiplier < 1) return;
    // Otherwise, it is not penalized in any way, it's probably safe to get it immediately despite the 10% penalty to all stats
    // If we won't have access to Stanek yet, skip this
    if (!(13 in unlockedSFs)) return;
    // If we've already accepted Stanek's gift (Genesis aug is installed), skip
    if (installedAugmentations.includes(augStanek)) {
      acceptedStanek = true;
    }
    // If we have more than Neuroflux (aug) installed, we won't be allowed to accept the gift (but we can try)
    if (installedAugmentations.length > 1)
      log(ns, `WARNING: We think it's a good idea to accept Stanek's Gift, but it appears to be too late - other augmentations have been installed. Trying Anyway...`);
    // Use the API to accept Stanek's gift
    if (!acceptedStanek) {
      if (await stanekRun(ns, 'acceptGift')) {
        log(ns, `SUCCESS: Accepted Stanek's Gift!`, true, 'success');
        installedAugmentations.push(augStanek); // Manually add Genesis to installed augmentations so checkOnRunningScripts picks up on the change.
      } else
        log(ns, `WARNING: autopilot.js tried to accepted Stanek's Gift, but was denied.`, true, 'warning');
    }
    await runScriptSomewhere(ns, 'stanek.js', false, []);
    // Whether we succeded or failed, don't try again - if we're denied entry (due to having an augmentation) we will never be allowed in
    acceptedStanek = true;
  }
  /** Checks if the BN is complete
     @param {NS} ns */
  async function checkIfBnIsComplete(ns) {
    if (shouldIntelFarm) return false;
    // Check if there is some reason not to automatically destroy this BN
    if (resetInfo.currentNode == 10) { // Suggest the user doesn't reset until they buy all sleeves and max memory
      let sleeveCost = await sleeveRun(ns, 'getSleeveCost');
      if (sleeveCost !== Number.POSITIVE_INFINITY)
        return false;

      const numSleeves = await sleeveRun(ns, `getNumSleeves`);
      if (!Number.isInteger(numSleeves) || numSleeves < 0) return false;

      for (let i = 0; i < numSleeves; i++) {
        const sleeve = await sleeveRun(ns, 'getSleeve', i);
        if (!Number.isFinite(sleeve?.memory) || sleeve.memory < 100) return false;
      }
    }
    const bladeburnerComplete = await hasCompletedBladeburner(ns, unlockedSFs);
    if (!bladeburnerComplete && !Number.isFinite(wdHack)) {
      wdHack = ns.scan("The-Cave").includes("w0r1d_d43m0n") ? ns.getServerRequiredHackingLevel("w0r1d_d43m0n") : Number.POSITIVE_INFINITY;
    }

    if (bladeburnerComplete || (Number.isFinite(wdHack) && player.skills.hacking >= wdHack && ns.hasRootAccess("w0r1d_d43m0n"))) {
        await noteMilestones([{kind: 'bn-finish-ready', data: {method: bladeburnerComplete ? 'bladeburner' : 'hacking'}}]);
        //time to leave....
        if (!(4 in unlockedSFs)) {
          log(ns, `You do not own SF4, so you must manually exit the bitnode (` +
            `${bladeburnerComplete ? "on the Bladeburner BlackOps tab" : "by hacking W0r1dD43m0n"}).`, true);
          return true;
        } else {
          await destroyWD(ns, nextRecommendedBn, ns.getScriptName()); //this should kill it.
        }
    }
    return false;
  }

  function getHardCodedBNMultis(bn) {
    return Object.fromEntries(Object.entries({
      AgilityLevelMultiplier: /*     */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 0.5, 0.7],
      AugmentationMoneyCost: /*      */[1, 1, 3, 1, 2, 1, 3, 1, 1, 5, 2, 1, 1, 1.5, 3],
      AugmentationRepCost: /*        */[1, 1, 3, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1],
      BladeburnerRank: /*            */[1, 1, 1, 1, 1, 1, 0.6, 0, 0.9, 0.8, 1, 1, 0.45, 0.6, 0.2],
      BladeburnerSkillCost: /*       */[1, 1, 1, 1, 1, 1, 2, 1, 1.2, 1, 1, 1, 2, 2, 3],
      CharismaLevelMultiplier: /*    */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 1, 1, 1.1],
      ClassGymExpGain: /*            */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      CodingContractMoney: /*        */[1, 1, 1, 1, 1, 1, 1, 0, 1, 0.5, 0.25, 1, 0.4, 1, 1],
      CompanyWorkExpGain: /*         */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      CompanyWorkMoney: /*           */[1, 1, 0.25, 0.1, 1, 0.5, 0.5, 0, 1, 0.5, 0.5, 1, 0.4, 1, 1],
      CompanyWorkRepGain: /*         */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.2, 1],
      CorporationDivisions: /*       */[1, 0.9, 1, 1, 0.75, 0.8, 0.8, 0, 0.8, 0.9, 0.9, 0.5, 0.4, 0.8, 0.4],
      CorporationSoftcap: /*         */[1, 0.9, 1, 1, 1, 0.9, 0.9, 0, 0.75, 0.9, 0.9, 0.8, 0.4, 0.9, 0.4],
      CorporationValuation: /*       */[1, 1, 1, 1, 0.75, 0.2, 0.2, 0, 0.5, 0.5, 0.1, 1, 0.001, 0.4, 0.2],
      CrimeExpGain: /*               */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      CrimeMoney: /*                 */[1, 3, 0.25, 0.2, 0.5, 0.75, 0.75, 0, 0.5, 0.5, 3, 1, 0.4, 0.75, 1],
      CrimeSuccessRate: /*           */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.4, 1],
      DaedalusAugsRequirement: /*    */[30, 30, 30, 30, 30, 35, 35, 30, 30, 30, 30, 31, 30, 30, 20],
      DefenseLevelMultiplier: /*     */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 1, 0.7],
      DexterityLevelMultiplier: /*   */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 0.5, 0.7],
      FactionPassiveRepGain: /*      */[1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      FactionWorkExpGain: /*         */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      FactionWorkRepGain: /*         */[1, 0.5, 1, 0.75, 1, 1, 1, 1, 1, 1, 1, 1, 0.6, 0.2, 1],
      FourSigmaMarketDataApiCost: /* */[1, 1, 1, 1, 1, 1, 2, 1, 4, 1, 4, 1, 10, 1, 1],
      FourSigmaMarketDataCost: /*    */[1, 1, 1, 1, 1, 1, 2, 1, 5, 1, 4, 1, 10, 1, 1],
      GangSoftcap: /*                */[1, 1, 0.9, 1, 1, 0.7, 0.7, 0, 0.8, 0.9, 1, 0.8, 0.3, 0.7, 1],
      GangUniqueAugs: /*             */[1, 1, 0.5, 0.5, 0.5, 0.2, 0.2, 0, 0.25, 0.25, 0.75, 1, 0.1, 0.4, 0.3],
      GoPower: /*                    */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1],
      HackExpGain: /*                */[1, 1, 1, 0.4, 0.5, 0.25, 0.25, 1, 0.05, 1, 0.5, 1, 0.1, 1, 1],
      HackingLevelMultiplier: /*     */[1, 0.8, 0.8, 1, 1, 0.35, 0.35, 1, 0.5, 0.35, 0.6, 1, 0.25, 0.4, 0.6],
      HackingSpeedMultiplier: /*     */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.3, 0.6],
      HacknetNodeMoney: /*           */[1, 1, 0.25, 0.05, 0.2, 0.2, 0.2, 0, 1, 0.5, 0.1, 1, 0.4, 0.25, 1],
      HomeComputerRamCost: /*        */[1, 1, 1.5, 1, 1, 1, 1, 1, 5, 1.5, 1, 1, 1, 1, 1],
      InfiltrationMoney: /*          */[1, 3, 1, 1, 1.5, 0.75, 0.75, 0, 1, 0.5, 2.5, 1, 1, 0.75, 1],
      InfiltrationRep: /*            */[1, 1, 1, 1, 1.5, 1, 1, 1, 1, 1, 2.5, 1, 1, 1, 1],
      ManualHackMoney: /*            */[1, 1, 1, 1, 1, 1, 1, 0, 1, 0.5, 1, 1, 1, 1, 1],
      CloudServerCost: /*        */[1, 1, 2, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1],
      CloudServerSoftcap: /*     */[1, 1.3, 1.3, 1.2, 1.2, 2, 2, 4, 1, 1.1, 2, 1, 1.6, 1, 1],
      CloudServerLimit: /*       */[1, 1, 1, 1, 1, 1, 1, 1, 0, 0.6, 1, 1, 1, 1, 1],
      CloudServerMaxRam: /*      */[1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1],
      FavorToDonateToFaction: /*       */[1, 1, 0.5, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
      ScriptHackMoney: /*            */[1, 1, 0.2, 0.2, 0.15, 0.75, 0.5, 0.3, 0.1, 0.5, 1, 1, 0.2, 0.3, 1],
      ScriptHackMoneyGain: /*        */[1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
      ServerGrowthRate: /*           */[1, 0.8, 0.2, 1, 1, 1, 1, 1, 1, 1, 0.2, 1, 1, 1, 1],
      ServerMaxMoney: /*             */[1, 0.08, 0.04, 0.1125, 1, 0.2, 0.2, 1, 0.01, 1, 0.01, 1, 0.3375, 0.7, 0.8],
      ServerStartingMoney: /*        */[1, 0.4, 0.2, 0.75, 0.5, 0.5, 0.5, 1, 0.1, 1, 0.1, 1, 0.75, 0.5, 0.5],
      ServerStartingSecurity: /*     */[1, 1, 1, 1, 2, 1.5, 1.5, 1, 2.5, 1, 1, 1.5, 3, 1.5, 1.5],
      ServerWeakenRate: /*           */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1],
      StrengthLevelMultiplier: /*    */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 0.5, 0.7],
      StaneksGiftPowerMultiplier: /* */[1, 2, 0.75, 1.5, 1.3, 0.5, 0.9, 1, 0.5, 0.75, 1, 1, 2, 0.5, 0.7],
      StaneksGiftExtraSize: /*       */[0, -6, -2, 0, 0, 2, -1, -99, 2, -3, 0, 1, 1, -1, -2],
      WorldDaemonDifficulty: /*      */[1, 5, 2, 3, 1.5, 2, 2, 1, 2, 2, 1.5, 1, 3, 5, 2]
    }).map(([mult, values]) => [mult, values[bn - 1]]));
  }
  function resetAugTrackersIfNeeded() {
    const augmentationCycleStart = getAugmentationCycleStart();
    if (augMomentum.lastAugReset !== augmentationCycleStart) {
      augMomentum = {
        lastAugReset: augmentationCycleStart,
        lastAugCount: 0,
        lastIncreaseTime: Date.now(),
        bestRate: 0,
        nextExpectedAug: 0,
        hardCapLogged: false,
      };
    }
  }
  function updateAugMomentum(ns, pendingAugCount, pendingNfCount = 0, quiet = false) {
    const momentumCount = pendingAugCount || (pendingNfCount > 0 ? 1 : 0);
    if (momentumCount <= 0) return;

    const now = Date.now();
    const timeInAug = Math.max(1, getTimeInAug());
    const hardCapReached = timeInAug >= MAX_AUGMENTATION_WAIT;
    let weight = 2;
    if ((2 in unlockedSFs)) weight += 0.5; // Resetting with a gang reduces its multipliers.
    if ((13 in unlockedSFs)) weight += 0.5; // Resetting loses Stanek charges.
    const nextDeadline = count => timeInAug + Math.max(
      (timeInAug / count) * Math.max(1, 5 - Math.ceil(count / weight)), 100000);

    if (momentumCount > augMomentum.lastAugCount) {
      augMomentum.lastAugCount = momentumCount;
      augMomentum.lastIncreaseTime = now;

      // "expected time since reset when the next aug should arrive"
      augMomentum.nextExpectedAug = nextDeadline(momentumCount);

      const eta = Math.max(0, augMomentum.nextExpectedAug - timeInAug);

      if (!quiet) log(
        ns,
        `INFO: ${formatDuration(timeInAug)} since last reset. ` +
        `Pending augs: ${pendingAugCount} + ${pendingNfCount} NF. Next expected in ${formatDuration(eta)} ` +
        `(at T+${formatDuration(augMomentum.nextExpectedAug)}).`,
        true
      );

      const rate = momentumCount / timeInAug;
      augMomentum.bestRate = Math.max(augMomentum.bestRate, rate);
    }

    // nextExpectedAug is always expressed as elapsed T+ milliseconds. The previous code stored
    // Date.now() here after four hours, then compared it with elapsed time, making the reset
    // unreachable and suppressing all subsequent queue logs.
    if (hardCapReached) {
      augMomentum.nextExpectedAug = timeInAug;
      if (!augMomentum.hardCapLogged) {
        augMomentum.hardCapLogged = true;
        log(ns, `INFO: Pending augs: ${pendingAugCount} + ${pendingNfCount} NF. The four-hour augmentation wait cap has been reached; ` +
          `the next safe reset check will ascend.`, true, 'info');
      }
    }
  }
  /** Retrieves the last faction ma    r output file, parses, and provides  ype-hints for it 
* @returns {{ installed_augs: string[], installed_count: number, installe _count_nf: number, installed_count_ex_nf: number 
*             owned_augs: string[], owned_count: number, owned_count_nf:  umber, owned_count_ex_nf: number 
*             awaitin  install_augs: string[], awaiting_install_count: nu ber, awaiting_install_count_nf: number, a aiting_install_count_ex_nf: number 
*             affordable_augs: string[], affordable_count: number, afford ble_count_nf: number, affordable_count_ex_nf: number 
*             donation_favor_progress: { faction: string, current_favor: number, projected_favor: number, required_favor: number,
*               desired_augs: string[], ready: boolean }[], current_node: number, last_aug_reset: number,
*             total_rep_cost: number, total_aug_cost: number, unown d_cou t: number }} */
  function getFactionManagerOutput(ns) {
    const facmanOutput = ns.read(factionManagerOutputFile)
    if (!facmanOutput) return null;
    try {
      return JSON.parse(facmanOutput);
    } catch (error) {
      warnAboutFactionManagerOutput(ns, `Could not parse ${factionManagerOutputFile}: ${String(error)}`);
      return null;
    }
  }
  function warnAboutFactionManagerOutput(ns, message) {
    const now = Date.now();
    if (now - lastFactionManagerWarning < 60_000) return;
    lastFactionManagerWarning = now;
    log(ns, `WARNING: ${message}`, true, 'warning');
  }
  /** Read queued augmentations from the canonical name arrays, with count-field fallback for older output. */
  function getPendingAugmentationCounts(facman) {
    if (Array.isArray(facman.affordable_augs) && Array.isArray(facman.awaiting_install_augs) &&
      facman.affordable_augs.every(aug => typeof aug === "string") &&
      facman.awaiting_install_augs.every(aug => typeof aug === "string")) {
      const queuedAugs = facman.affordable_augs.concat(facman.awaiting_install_augs);
      const pendingNfCount = queuedAugs.filter(aug => aug === NEUROFLUX).length;
      return {
        pendingAugCount: queuedAugs.length - pendingNfCount,
        pendingNfCount,
      };
    }

    const fields = [
      "affordable_count_ex_nf", "awaiting_install_count_ex_nf",
      "affordable_count_nf", "awaiting_install_count_nf",
    ].map(field => Number(facman[field]));
    if (!fields.every(value => Number.isInteger(value) && value >= 0)) return null;
    return {
      pendingAugCount: fields[0] + fields[1],
      pendingNfCount: fields[2] + fields[3],
    };
  }
  /** Logic to detect if it's a goo    me to install augmentations, and if  so, do so    
   * * @param {NS} ns    
   * * @p     {Player} player */
  async function maybeInstallAugmentations(ns, player, stockValueKnown = true) {
    if (!(4 in unlockedSFs))
      return;
    await doSCP(ns, factionManagerOutputFile, ns.getHostname(), "home");
    resetAugTrackersIfNeeded();
    const timeSinceAug = getTimeInAug();
    const facman = getFactionManagerOutput(ns);
    if (!stockValueKnown || facman?.stock_value_known === false) {
      // Exclude cash-only samples from wealth/ETA estimates, including the jump when valuation recovers.
      resetDecisionState.samples = [];
      resetDecisionState.wait = null;
      warnAboutFactionManagerOutput(ns, `Automatic installation is waiting for stock holdings to become readable. ` +
        `Faction planning continues using cash. If this persists, save and reload the game.`);
      return;
    }
    if (!facman) return;

    const queue = getPendingAugmentationCounts(facman);
    if (!queue) {
      warnAboutFactionManagerOutput(ns, `The faction-manager output has no valid augmentation queue. ` +
        `Restart faction-manager.js after updating all PR files.`);
      return;
    }
    const { pendingAugCount, pendingNfCount } = queue;

    const generatedAt = Number(facman.generated_at);
    const outputNode = Number(facman.current_node);
    const outputAugReset = Number(facman.last_aug_reset);
    const hasSnapshotMetadata = Number.isFinite(generatedAt) && Number.isFinite(outputNode) && Number.isFinite(outputAugReset);
    if (hasSnapshotMetadata) {
      const snapshotAge = Date.now() - generatedAt;
      if (outputNode !== Number(resetInfo.currentNode) || outputAugReset !== Number(resetInfo.lastAugReset)) {
        warnAboutFactionManagerOutput(ns, `Ignoring an augmentation queue from a different BitNode or augmentation reset.`);
        return;
      }
      if (snapshotAge < -5_000 || snapshotAge > 2 * 60_000) {
        warnAboutFactionManagerOutput(ns, `Ignoring a faction-manager augmentation queue that is ` +
          `${formatDuration(Math.abs(snapshotAge))} ${snapshotAge < 0 ? "in the future" : "old"}. ` +
          `faction-manager.js may not be relaunching successfully.`);
        return;
      }
    } else {
      warnAboutFactionManagerOutput(ns, `The faction-manager output has no freshness metadata. ` +
        `Using its augmentation queue for compatibility; update and restart faction-manager.js.`);
    }

    const pendingAugInclNfCount = pendingAugCount + pendingNfCount;
    // NF contributes one distinct augmentation only on its first installation.
    const pendingDistinctAugCount = pendingAugCount +
      (pendingNfCount > 0 && !installedAugmentations.includes(NEUROFLUX) ? 1 : 0);
    const donationFavorProgress = getFreshDonationFavorProgress(facman, resetInfo);
    const readyDonationFavor = donationFavorProgress.filter(progress => progress.ready);

    // Repeat NeuroFlux levels cannot keep moving a useful bundle's installation deadline.
    // Use this historical timing only when current goal estimates are unavailable.
    updateAugMomentum(ns, pendingAugCount, pendingNfCount, facman.reset_planning?.version === 1 && !shouldIntelFarm);
    const stockUpgradeCost = have4sApi ? 0 : 25e9 * bitNodeMults.FourSigmaMarketDataApiCost +
      (ns.stock.has4SData() ? 0 : 1e9 * bitNodeMults.FourSigmaMarketDataCost);
    const goalDecision = shouldIntelFarm ? {action: 'fallback', reason: 'intel-preparation'} :
      evaluateAugmentationReset(facman, resetInfo, resetDecisionState, Date.now(),
        installedAugmentations.includes(augTRP) ? wdHack : 0, stockUpgradeCost);
    const goalTimingAvailable = ['wait', 'reset'].includes(goalDecision.action);
    const expectedInstallTime = goalTimingAvailable
      ? goalDecision.action === 'reset' ? timeSinceAug : goalDecision.deadline - getAugmentationCycleStart()
      : augMomentum.nextExpectedAug;
    const installationDetails = { pendingAugs: pendingAugCount, pendingNeuroflux: pendingNfCount,
      pendingDistinctAugs: pendingDistinctAugCount, elapsed: timeSinceAug,
      deadline: expectedInstallTime, decision: goalDecision };

    // Publish only changed deadlines on home. The buyer checks the matching fresh queue before using one.
    const resetSoon = goalDecision.action === 'reset' || readyDonationFavor.length > 0 || facman.affordable_augs.includes(augTRP) ||
      facman.awaiting_install_augs.includes(augTRP) ||
      (playerInstalledAugCount < bitNodeMults.DaedalusAugsRequirement &&
        pendingDistinctAugCount + playerInstalledAugCount >= bitNodeMults.DaedalusAugsRequirement);
    const investmentDeadline = resetSoon ? getAugmentationCycleStart() + 1 : pendingAugInclNfCount <= 0 ? 0 :
      getAugmentationCycleStart() + Math.min(MAX_AUGMENTATION_WAIT, expectedInstallTime);
    if (investmentDeadline !== lastInvestmentDeadline && Date.now() >= nextInvestmentDeadlineAttempt) {
      nextInvestmentDeadlineAttempt = Date.now() + 30_000;
      try {
        if (await runScriptLocal(ns, 'bin/getHacknetPayoff.js', false,
          ['update', investmentDeadline, resetInfo.lastAugReset]) === true) lastInvestmentDeadline = investmentDeadline;
      } catch (error) { log(ns, `WARNING: Hacknet reset horizon update deferred: ${String(error)}`); }
    }

    //we need 30 augs to get an invite from deadalus. Reset to get this.
    if (playerInstalledAugCount < bitNodeMults.DaedalusAugsRequirement
      && pendingDistinctAugCount + playerInstalledAugCount >= bitNodeMults.DaedalusAugsRequirement)
      return await installAugs(ns, false, { ...installationDetails, reason: 'daedalus-count' });
    //Always install if we can get the red pill or another critical aug list in the run options

    if (facman.affordable_augs.includes(augTRP) ||
      facman.awaiting_install_augs.includes(augTRP))
      return await installAugs(ns, false, { ...installationDetails, reason: 'red-pill' });

    const totalCost = facman.total_rep_cost + facman.total_aug_cost;
    currentMoneyReserve = await setReserve(ns, totalCost);

    // Reaching the donation threshold is its own reset milestone. It must bypass the ordinary
    // augmentation-count and momentum gates, and can require a soft reset when nothing is affordable yet.
    if (readyDonationFavor.length > 0) {
      if (await shouldDelayInstall(ns, player, facman, { favorMilestoneReady: true })) return;
      const milestones = readyDonationFavor.map(progress =>
        `${progress.faction} (${progress.projected_favor.toFixed(1)}/${progress.required_favor} favor; ` +
        `${progress.desired_augs.join(", ")})`).join("; ");
      log(ns, `SUCCESS: Projected favor now unlocks donations after reset for ${milestones}. Ascending now.`, true, 'success');
      return await installAugs(ns, true, { ...installationDetails, reason: 'donation-favor' });
    }

    const hardCapReached = timeSinceAug >= MAX_AUGMENTATION_WAIT;
    if (pendingAugInclNfCount <= 0) return;
    if (goalTimingAvailable) {
      const signature = `${goalDecision.action}:${goalDecision.reason}:${goalDecision.goal ?? ''}`;
      if (signature !== lastResetDecisionLog || Date.now() >= nextResetDecisionLog) {
        lastResetDecisionLog = signature;
        nextResetDecisionLog = Date.now() + 60_000;
        log(ns, `INFO: Ready to install ${pendingAugCount} augs + ${pendingNfCount} NF. ` +
          (goalDecision.action === 'wait' ? goalDecision.goal
            ? `Working toward ${goalDecision.goal}: ETA ${formatDuration(goalDecision.eta)}, ` +
              `wait limit ${formatDuration(Math.max(0, goalDecision.deadline - Date.now()))}.`
            : 'Measuring money and reputation progress before choosing the next goal.'
            : `Time to install (${goalDecision.reason}).`), true);
      }
      if (!hardCapReached && goalDecision.action === 'wait') return;
    } else if (!hardCapReached && timeSinceAug < augMomentum.nextExpectedAug) return;

    if (await shouldDelayInstall(ns, player, facman, { forceReset: hardCapReached, goalTimingAvailable }))
      return;

    return await installAugs(ns, false, { ...installationDetails,
      reason: hardCapReached ? 'hard-cap' : goalTimingAvailable ? goalDecision.reason : 'momentum' });
  }
  /** Logic to detect if it's a good time to install augmentations, and if  o, do s    * @param {NS} ns*/
  async function installAugs(ns, allowSoftReset = false, decision = {}) {
    // A bounded infiltration session may have an unclaimed reward. Let it release the screen first.
    const infiltrationLease = await runScriptLocal(ns, 'bin/infiltration-control.js', false, ['lease']);
    if (infiltrationLease !== false) {
      log(ns, infiltrationLease === true
        ? 'INFO: Installation is ready; waiting for the active infiltration session to finish.'
        : 'WARNING: Could not verify infiltration status; deferring installation until the next check.', true);
      return;
    }
    await noteMilestones([{kind: 'installation-requested', data: { ...decision, allowSoftReset }}]);
    const ascendArgs = buildAscendArgs(ns.getScriptName(), allowSoftReset);
    await runScriptLocal(ns, "ascend.js", false, ascendArgs);
    await ns.sleep(1000000);
  }
  /** Clear invite-rush state as soon as Daedalus has been joined. */
  function markDaedalusJoined() {
    alreadyJoinedDaedalus = true;
    reservingMoneyForDaedalus = false;
    disableStockmasterForDaedalus = false;
    return true;
  }
  /** Logic run periodically to if     e is anything we can do to speed al  g earnin  a Daedalus invite
     * @param {NS} ns
     * @param       r} player **/
  async function checkOnDaedalusStatus(ns, player, stocksValue) {
    // Early exit conditions, if we Daedalus is not (or is no longer) a concern for this reset
    if (alreadyJoinedDaedalus | autoJoinDaedalusUnavailable) return;
    // If we've already installed the red pill we no longer nee     try to join this      on.
    // Even without SF4, we can "deduce" whether we've installed TRP by checking whether w0r1d_d43m0n has a non-zero hack level
    if (installedAugmentations.includes(augTRP) || (wdHack != null && Number.isFinite(wdHack) && wdHack > 0))
      return markDaedalusJoined(); // Set up an early exit condition for future checks and release any stale reservation
    // See if we even have enough augmentations to attempt to join Daedalus (once we have a count of our augmentations)
    if (playerInstalledAugCount !== null && playerInstalledAugCount < bitNodeMults.DaedalusAugsRequirement) {
      if (!(10 in unlockedSFs))
        autoJoinDaedalusUnavailable = true; // Won't be able to unlock daedalus this ascend if we can't graft augs and have to install for them
      return; // Either way, for now we can't get into Daedalus without more augmentations
    }
    // See if we've already joined this faction
    if (player.factions.includes("Daedalus")) return markDaedalusJoined();
    const moneyReq = 100E9;
    // If we've previously set a flag to wait for the daedalus invite and reserve money, try to speed-along joining them
    if (reservingMoneyForDaedalus && player.money >= moneyReq) { // If our cash has dipped below the threshold again, we may need to take action below
      const joined = await singRun(ns, 'joinFaction', "Daedalus"); // Note, we should have already checked that we have SF4 access before reserving money
      return joined === true ? markDaedalusJoined() : false;
    }

    // Preserve an existing invite reservation when a missing stock valuation cannot prove a wealth drop.
    if (stocksValue === null) return;
    // Remaining logic below is for rushing a Daedalus invite in the current reset
    const totalWorth = player.money + stocksValue;
    // Check for sufficient hacking level before attempting to reserve money
    if (player.skills.hacking < 2500) {
      return reservingMoneyForDaedalus = false; // Don't reserve money until hack level suffices
    }
    // If we have sufficient augs and hacking, the only requirement left is the money (100b)
    // If our net worth is sufficient, reserve our money and liquidate stocks if necessary until we get the invite
    if (player.money < moneyReq && totalWorth > moneyReq * 1.001 /* slight buffer to account for timing issues */) {
      // Note: Without SF4, we have no way of knowing how many augmentations we own, so we should probably
      //       never reserve money in case this requirement is not met, or we're potentially just wasting money
      if (!(4 in unlockedSFs)) {
        log(ns, `SUCCESS: ${player.money < moneyReq ? "If you sell your stocks, y" : "Y"}ou should have enough money ` +
          `(>=${formatMoney(moneyReq)}) and a sufficiently high hack level (>=${2500}) to get an invite from the faction Daedalus. ` +
          `Before you attempt this though, ensure you have ${bitNodeMults.DaedalusAugsRequirement} ` +
          `augmentations installed (scripts cannot check this without SF4).`, true, 'success');
        return autoJoinDaedalusUnavailable = true; // We won't show this again.
      }
      reservingMoneyForDaedalus = true; // Flag to pause all spending (set reserve.txt) until we've gotten the Daedalus invite
      if (player.money < moneyReq) { // Only liquidate stocks if we don't have enough cash lying around.
        disableStockmasterForDaedalus = true; // Flag to keep stockmaster offline until we've gotten a daedalus invite
        log(ns, "INFO: Temporarily liquidating stocks to earn an invite to Daedalus...", true, 'info');
        await launchScriptHelper(ns, 'stockmaster.js', ['--liquidate-once']);
        await ns.sleep(5000);
      } // else if we don't liquidate stocks, and our money dips below 100E9 again, we can always do it on the next loop
    } else if (resetInfo.currentNode == 8) {
      // In BN8, there is nothing worth spending money on when we've met all other Daedalus requirements except the $100b money.
      // We should immediately set the reserve and wait until we have enough wealth to liquidate stocks and get the invite.
      reservingMoneyForDaedalus = true;
    } // Cancel the reserve if our money drops below the threshold before getting an invite (due to other scripts not respecting the reserve?)
    else if (reservingMoneyForDaedalus && totalWorth < moneyReq * 0.999 /* slight buffer to let cash recover */) {
      reservingMoneyForDaedalus = false; // Cancel the hold on funds, and wait for total worth to increase again
      disableStockmasterForDaedalus = false; // Allow stockmaster to be relaunched
      log(ns, `WARN: We previously had sufficient wealth to earn a Daedalus invite (>=${formatMoney(moneyReq)}), ` +
        `but our wealth somehow decreased (to ${formatMoney(totalWorth)}) before the invite was recieved, ` +
        `so we'll need to wait for it to recover and try again later.`, false, 'warning');
    }
  }
  /** Logic to detect if we are close to a milestone and should postpone installing augmentations
     * @param {NS} ns
     * @param {Player} player **/
  async function shouldDelayInstall(ns, player, facmanOutput, {
    favorMilestoneReady = false,
    forceReset = false,
    goalTimingAvailable = false,
  } = {}) {
    const bypassOptimizationDelays = favorMilestoneReady || forceReset;
    // A completed donation milestone or the four-hour hard cap must not be postponed by 4S/BN8
    // optimization. Daedalus and active BlackOps remain higher-priority safety safeguards.
    if (!bypassOptimizationDelays && !goalTimingAvailable && !have4sApi) {
      let stockWorth;
      try { stockWorth = await getStocksValue(ns); }
      catch {
        warnAboutFactionManagerOutput(ns, `Stock holdings became unreadable during installation planning; retrying next cycle.`);
        return true;
      }
      const totalWorth = player.money + stockWorth;
      const has4S = ns.stock.has4SData();
      const totalCost = 25E9 * bitNodeMults.FourSigmaMarketDataApiCost +
        (has4S ? 0 : 1E9 * bitNodeMults.FourSigmaMarketDataCost);
      const ratio = totalWorth / totalCost;
      // If we're e.g. 50% of the way there, hold off, regardless of the '--wait-for-4s' setting
      // TODO: If ratio is > 1, we can afford it - but stockmaster won't buy until it has e.g. 20% more than the cost
      //       (so it still has money to invest). It doesn't know we want to restart ASAP. Perhaps we should purchase ourselves?
      if (ratio >= 0.9) {
        return true;
      }
    }
    if (!bypassOptimizationDelays && resetInfo.currentNode == 8) { // Many special rules for this special Bitnode
      if (player.factions.includes("Daedalus")) { // If we've already joined Daedalus
        // In BN8, large sums of money are hard to accumulate, so if we've made it into Daedalus, but can't purchase TRP rep yet,
        // remain in the BN until we have enough rep and/or money to buy TRP (Reminder: in BN8, donations are immediately unlocked for all factions)    
        if (!installedAugmentations.includes(augTRP) && !facmanOutput.affordable_augs.includes(augTRP) && !facmanOutput.awaiting_install_augs.includes(augTRP)) {
          return true;
        }
      } else if (playerInstalledAugCount >= bitNodeMults.DaedalusAugsRequirement && player.skills.hacking >= (2500 * 0.9)) {
        // If we meet the Daedalus aug count requirement and at least 90% of the required hack level, wait to earn the invite
        return true;
      } /*else if (getTimeInAug() > 4 * 60 * 60 * 1000) { // 4 hours = 4hrs/min * 60mins/sec * 60secs/ms * 1000ms
        // If we've been in BN8 for more than 4 hours, we shouldn't reset unless we're making significant progress towards unlocking Daedalus.
        // because it takes so long to build up money, and nothing we install will accellerate our earnings in the next augmentation.
        const augsReadyToInstall = facmanOutput.awaiting_install_count_ex_nf + facmanOutput.affordable_count_ex_nf;
        if (augsReadyToInstall < 10) { // Heuristic: 10 augs per install means max 3 installs before we meet the Daedalus aug requirement
          return true;
        }
      }*/
    }
    // If we're reserving money because we're close to getting an invite to Daedalus don't reset.
    if (reservingMoneyForDaedalus) {
      return true;
    }

    if (await bbRun(ns, 'inBladeburner') && (await bbRun(ns, 'getCurrentAction'))?.type == 'Black Operations') return true;

    // Merely being close to a donation-favor milestone must not override the existing
    // diminishing-return reset. Once the threshold is actually reached, maybeInstallAugmentations
    // invokes the dedicated ready-favor path before the momentum gate.
    return false;
  }
  /** Logic to determine whether we should keep running, or shut down autopilot.js for some reason     * @param {NS} n     * @returns {boolean} true then we should keep running false if we should shut down this script. */
  function shouldWeKeepRunning(ns) {
    return true;
  }
   /** @param {NS} ns**/
  function getPlayerMoney(ns) {
    return ns.getServerMoneyAvailable("home");
  }

  function shouldImproveHacking(ns) {
    return (bitNodeMults.ScriptHackMoneyGain * bitNodeMults.ScriptHackMoney) > 0 || // Check for disabled hack-income
      getPlayerMoney(ns) > 1e12
  }
  await main_start(ns);
}
