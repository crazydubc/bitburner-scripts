import {
  log, getConfiguration, disableLogs, getActiveSourceFiles, singRun, gangRun, hnRun,
  formatMoney, formatDuration, getPlayerInfo, getReset, findPids, sleeveRun, bbRun, getOwnedAugs
} from './utils.js'
import {
  DEFAULT_DESIRED_AUGS, DEFAULT_PRIORITY_AUGS, buildAugUtilityMap, buildDesiredAugSet,
  getDefaultDesiredStats, planDistinctFactionRepRoutes
} from './faction-route-planner.js'

const argsSchema = [
  ['min-shock-recovery', 97], // Minimum shock recovery before attempting to train or do crime (Set to 100 to disable, 0 to recover fully)
  ['shock-recovery', 0.05], // Set to a number between 0 and 1 to devote that ratio of time to periodic shock recovery (until shock is at 0)
  ['crime', null], // If specified, sleeves will perform only this crime regardless of stats
  ['homicide-chance-threshold', 0.5], // Sleeves on crime will automatically start homicide once their chance of success exceeds this ratio
  ['disable-gang-homicide-priority', false], // By default, sleeves will do homicide to farm Karma until we're in a gang. Set this flag to disable this priority.
  ['aug-budget', 0.1], // Spend up to this much of current cash on augs per tick (Default is high, because these are permanent for the rest of the BN)
  ['buy-cooldown', 60 * 1000], // Must wait this may milliseconds before buying more augs for a sleeve
  ['min-aug-batch', 20], // Must be able to afford at least this many augs before we pull the trigger (or fewer if buying all remaining augs)
  ['reserve', null], // Reserve this much cash before determining spending budgets (defaults to contents of reserve.txt if not specified)
  ['disable-follow-player', false], // Disable assigning sleeves to the player's company/faction and other useful faction-rep routes
  ['disable-training', false], // Set to true to disable having sleeves workout at the gym (costs money)
  ['train-to-strength', 105], // Sleeves will go to the gym until they reach this much Str
  ['train-to-defense', 105], // Sleeves will go to the gym until they reach this much Def
  ['train-to-dexterity', 70], // Sleeves will go to the gym until they reach this much Dex
  ['train-to-agility', 70], // Sleeves will go to the gym until they reach this much Agi
  ['study-to-hacking', 25], // Sleeves will go to university until they reach this much Hak
  ['study-to-charisma', 25], // Sleeves will go to university until they reach this much Cha
  ['training-reserve', null], // Defaults to global reserve.txt. Can be set to a negative number to allow debt. Sleeves will not train if money is below this amount.
  ['training-cap-seconds', 2 * 60 * 60 /* 2 hours */], // Time since the start of the bitnode after which we will no longer attempt to train sleeves to their target "train-to" settings
  ['disable-spending-hashes-for-gym-upgrades', false], // Set to true to disable spending hashes on gym upgrades when training up sleeves.
  ['disable-spending-hashes-for-study-upgrades', false], // Set to true to disable spending hashes on study upgrades when smarting up sleeves.
  ['enable-bladeburner-team-building', false], // Set to true to have one sleeve support the main sleeve, and another do recruitment. Otherwise, they will just do more "Infiltrate Synthoids"
  ['disable-bladeburner', false], // Set to true to disable having sleeves workout at the gym (costs money)
  ['failed-bladeburner-contract-cooldown', 30 * 60 * 1000], // Default 30 minutes: time to wait after failing a bladeburner contract before we try again
];

const interval = 1000; // Update (tick) this often to check on sleeves and recompute their ideal task
const rerollTime = 61000; // How often we re-roll for each sleeve's chance to be randomly placed on shock recovery
const taskValidationInterval = 5000; // Reconcile cached assignments with the Sleeve API so idle sleeves recover quickly
const statusUpdateInterval = 10 * 60 * 1000; // Log sleeve status this often, even if their task hasn't changed
const factionAssignmentRefreshInterval = 30 * 1000;
const factionWorkRetryInterval = 5 * 60 * 1000;
const NON_SLEEVE_WORK_FACTIONS = new Set([
  'Bladeburners', 'Church of the Machine God', 'Shadows of Anarchy'
]);
const trainingReserveFile = '/Temp/sleeves-training-reserve.txt';
const works = ['security', 'field', 'hacking']; // When doing faction work, we prioritize physical work since sleeves tend towards having those stats be highest
const trainStats = ['str', 'def', 'dex', 'agi'];
const trainSmarts = ['hacking', 'charisma'];
const sleeveBbContractNames = ["Tracking", "Bounty Hunter", "Retirement"];
const minBbContracts = 2; // There should be this many contracts remaining before sleeves attempt them
const minBbProbability = 0.99; // Player chance should be this high before sleeves attempt contracts
const waitForContractCooldown = 60 * 1000; // 1 minute - Cooldown when contract count or probability gets too low

let cachedCrimeStats, workByFaction; // Cache of crime statistics and which factions support which work
let task, lastStatusUpdateTime, lastPurchaseTime, lastPurchaseStatusUpdate, availableAugs, cacheExpiry,
  shockChance, lastRerollTime, lastTaskValidationTime, bladeburnerCooldown, lastSleeveHp, lastSleeveShock; // State by sleeve
let numSleeves, ownedSourceFiles, playerInGang, playerInBladeburner, bladeburnerCityChaos, bladeburnerContractChances, bladeburnerContractCounts;
let stagedShockRecoveryState, sleeveRepAssignments;
let factionPlanRefreshedAt, factionPlanStaticKey, factionPlanPreference, factionPlanRoutes;
let factionAugs, factionWorkTypes, augRepReqs, augStats, augPrereqs;
let factionWorkFailureCount, factionWorkUnavailableUntil, lastFactionPlanWarning;
let options;


export function isSleeveApiError(value) {
  return typeof value === "string" && value.startsWith("ERROR:");
}

export function isSleeveAssignmentSuccessful(value) {
  return value === true;
}

/** getTask() returns either a task object or null. Wrapper error strings are not active tasks. */
export function hasActiveSleeveTask(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function shouldRerollShockRecovery(now, lastReroll = 0, intervalMs = rerollTime) {
  return Number(now) - (Number(lastReroll) || 0) >= Number(intervalMs);
}

export function shouldPrioritizeGangKarma(playerIsInGang, priorityDisabled, hasGangAccess, karma) {
  const numericKarma = Number(karma);
  return playerIsInGang !== true && priorityDisabled !== true && hasGangAccess === true &&
    Number.isFinite(numericKarma) && numericKarma > -54000;
}


function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getFactionWorkOptions(faction, workTypesByFaction = {}) {
  const supported = asArray(workTypesByFaction?.[faction]).map(String);
  const preferred = works.filter(work => supported.includes(work));
  return preferred.length > 0 ? preferred : supported;
}

/** Prefer general-purpose sleeves before reserving indices 1-3 for unique Bladeburner contracts. */
export function getSleeveRepWorkerOrder(sleeves, stagedRecovery = {}, inBladeburner = false) {
  const list = Array.isArray(sleeves) ? sleeves : [];
  const stagedWorkers = stagedRecovery?.active === true
    ? new Set(asArray(stagedRecovery.workSleeves).map(Number))
    : null;
  const available = list
    .map((sleeve, index) => ({index, sync: Number(sleeve?.sync)}))
    .filter(entry => Number.isFinite(entry.sync) && entry.sync >= 100 &&
      (!stagedWorkers || stagedWorkers.has(entry.index)))
    .map(entry => entry.index);
  const priority = inBladeburner ? [0, 4, 5, 6, 7, 1, 2, 3] : available;
  return [...priority.filter(index => available.includes(index)),
    ...available.filter(index => !priority.includes(index))];
}

/** Assign one sleeve per distinct faction, while retaining one company follower when the player works a company. */
export function assignSleeveRepTargets(
  workerSleeves,
  playerWorkInfo,
  factionRoutes = [],
  workTypesByFaction = {},
  disabled = false,
) {
  const assignments = {};
  if (disabled) return assignments;
  const sleeves = asArray(workerSleeves);
  let nextSleeve = 0;
  const usedFactions = new Set();

  if (playerWorkInfo?.type === 'COMPANY' && typeof playerWorkInfo.companyName === 'string' && sleeves[nextSleeve] != null) {
    assignments[sleeves[nextSleeve++]] = {type: 'COMPANY', companyName: playerWorkInfo.companyName};
  }

  const routes = asArray(factionRoutes).slice();
  const preferredFaction = playerWorkInfo?.type === 'FACTION' ? playerWorkInfo.factionName : null;
  if (preferredFaction && !routes.some(route => route?.faction === preferredFaction)) {
    routes.unshift({faction: preferredFaction, targetRep: Infinity, unlockedAugs: []});
  } else if (preferredFaction) {
    routes.sort((left, right) => Number(right?.faction === preferredFaction) - Number(left?.faction === preferredFaction));
  }

  for (const route of routes) {
    if (sleeves[nextSleeve] == null) break;
    const faction = typeof route?.faction === 'string' ? route.faction : '';
    const workTypes = getFactionWorkOptions(faction, workTypesByFaction);
    if (!faction || usedFactions.has(faction) || workTypes.length === 0) continue;
    assignments[sleeves[nextSleeve++]] = {
      type: 'FACTION',
      faction,
      targetRep: route.targetRep,
      unlockedAugs: asArray(route.unlockedAugs),
      workTypes,
    };
    usedFactions.add(faction);
  }
  return assignments;
}


/**
 * Coordinate shock recovery across the whole sleeve fleet.
 *
 * While every synchronized sleeve still has shock, exactly one sleeve recovers so the fleet reaches its
 * first fully recovered worker as quickly as possible. Once at least one synchronized sleeve has zero shock,
 * every remaining shocked sleeve recovers while the recovered sleeves perform normal work.
 */
export function getStagedShockRecoveryPlan(sleeves, cachedTasks = [], previousState = {}) {
  const synchronized = (Array.isArray(sleeves) ? sleeves : [])
    .map((sleeve, index) => ({
      index,
      sync: Number(sleeve?.sync),
      shock: Number(sleeve?.shock),
    }))
    .filter(entry => Number.isFinite(entry.sync) && entry.sync >= 100 &&
      Number.isFinite(entry.shock));
  const shocked = synchronized.filter(entry => entry.shock > 0);
  const recovered = synchronized.filter(entry => entry.shock <= 0);

  if (shocked.length === 0) {
    return {
      active: false,
      mode: 'none',
      anchor: -1,
      recoverySleeves: [],
      workSleeves: synchronized.map(entry => entry.index),
    };
  }

  const priorAnchor = Number(previousState?.anchor);
  if (recovered.length > 0) {
    const anchor = recovered.some(entry => entry.index === priorAnchor)
      ? priorAnchor
      : recovered[0].index;
    return {
      active: true,
      mode: 'drain',
      anchor,
      recoverySleeves: shocked.map(entry => entry.index),
      workSleeves: recovered.map(entry => entry.index),
    };
  }

  const priorEntry = shocked.find(entry => entry.index === priorAnchor);
  const cachedEntry = shocked.find(entry => cachedTasks?.[entry.index] === 'recover from shock');
  const fastestEntry = shocked.reduce((best, candidate) =>
    candidate.shock < best.shock ||
      (candidate.shock === best.shock && candidate.index < best.index)
      ? candidate
      : best);
  const anchor = (priorEntry ?? cachedEntry ?? fastestEntry).index;
  return {
    active: true,
    mode: 'prime',
    anchor,
    recoverySleeves: [anchor],
    workSleeves: shocked.filter(entry => entry.index !== anchor).map(entry => entry.index),
  };
}
export function autocomplete(data, _) {
  data.flags(argsSchema);
  return [];
}

/** @param {NS} ns **/
export async function main(ns) {
  const runOptions = getConfiguration(ns, argsSchema);
  if (!runOptions || (await findPids(ns, 'sleeve.js')).length > 1) return; // Prevent multiple instances of this script from being started, even with different args.
  options = runOptions; // We don't set the global "options" until we're sure this is the only running instance
  disableLogs(ns, ['getServerMoneyAvailable']);
  // Ensure the global state is reset (e.g. after entering a new bitnode)
  task = [], lastStatusUpdateTime = [], lastPurchaseTime = [], lastPurchaseStatusUpdate = [], availableAugs = [],
    cacheExpiry = [], shockChance = [], lastRerollTime = [], lastTaskValidationTime = [],
    bladeburnerCooldown = [], lastSleeveHp = [], lastSleeveShock = [];
  workByFaction = {}, cachedCrimeStats = {};
  playerInGang = playerInBladeburner = false;
  stagedShockRecoveryState = {active: false, mode: 'none', anchor: -1};
  sleeveRepAssignments = {};
  factionPlanRefreshedAt = 0, factionPlanStaticKey = '', factionPlanPreference = '', factionPlanRoutes = [];
  factionAugs = {}, factionWorkTypes = {}, augRepReqs = {}, augStats = {}, augPrereqs = {};
  factionWorkFailureCount = {}, factionWorkUnavailableUntil = {}, lastFactionPlanWarning = 0;
  // Ensure we have access to sleeves
  ownedSourceFiles = await getActiveSourceFiles(ns);
  if (!(10 in ownedSourceFiles))
    return ns.tprint("WARNING: You cannot run sleeve.js until you do BN10.");
  // Start the main loop
  while (true) {
    try { await mainLoop(ns); }
    catch (err) {
      log(ns, `WARNING: sleeve.js Caught (and suppressed) an unexpected error in the main loop:\n` +
        (err?.stack || '') + (typeof err === 'string' ? err : err.message || JSON.stringify(err)), false, 'warning');
    }
    await ns.sleep(interval);
  }
}

/** @param {NS} ns
 * Purchases augmentations for sleeves */
async function manageSleeveAugs(ns, i, budget) {
  // Retrieve and cache the set of available sleeve augs (cached temporarily, but not forever, in case rules around this change)
  if (availableAugs[i] == null || Date.now() > cacheExpiry[i]) {
    cacheExpiry[i] = Date.now() + 60000;
    availableAugs[i] = (await sleeveRun(ns, 'getSleevePurchasableAugs', i)).sort((a, b) => a.cost - b.cost);
  }
  if (availableAugs[i].length == 0) return 0;

  const cooldownLeft = Math.max(0, options['buy-cooldown'] - (Date.now() - (lastPurchaseTime[i] || 0)));
  const [batchCount, batchCost] = availableAugs[i].reduce(([n, c], aug) => c + aug.cost <= budget ? [n + 1, c + aug.cost] : [n, c], [0, 0]);
  const purchaseUpdate = `sleeve ${i} can afford ${batchCount.toFixed(0).padStart(2)}/${availableAugs[i].length.toFixed(0).padEnd(2)} remaining augs ` +
    `(cost ${formatMoney(batchCost)} of ${formatMoney(availableAugs[i].reduce((t, aug) => t + aug.cost, 0))}).`;
  if (lastPurchaseStatusUpdate[i] != purchaseUpdate)
    log(ns, `INFO: With budget ${formatMoney(budget)}, ${(lastPurchaseStatusUpdate[i] = purchaseUpdate)} ` +
      `(Min batch size: ${options['min-aug-batch']}, Cooldown: ${formatDuration(cooldownLeft)})`);
  if (cooldownLeft == 0 && batchCount > 0 && ((batchCount >= availableAugs[i].length - 1) || batchCount >= options['min-aug-batch'])) { // Don't require the last aug it's so much more expensive
    let strAction = `Purchase ${batchCount}/${availableAugs[i].length} augmentations for sleeve ${i} at total cost of ${formatMoney(batchCost)}`;
    let toPurchase = availableAugs[i].splice(0, batchCount);
    const purchase = toPurchase.map(a => a.name).slice(1).reduce((s, aug) => s && ns.sleeve.purchaseSleeveAug(i, aug), true);
    if (purchase) {
      //log(ns, `SUCCESS: ${strAction}`, true, 'success');
      [lastSleeveHp[i], lastSleeveShock[i]] = [undefined, undefined]; // Sleeve stats are reset on installation of augs, so forget saved health info
    } //else log(ns, `ERROR: Failed to ${strAction}`, true, 'error');
    lastPurchaseTime[i] = Date.now();
    return batchCost; // Even if we think we failed, return the predicted cost so if the purchase did go through, we don't end up over-budget
  }
  return 0;
}

/** @param {NS} ns
 * @returns {Promise<Task>} */
async function getCurrentWorkInfo(ns) {
  return (await singRun(ns, 'getCurrentWork')) ?? {};
}


async function buildSingularityMap(ns, fn, items) {
  const result = {};
  for (const item of items) {
    const value = await singRun(ns, fn, item);
    if (isSleeveApiError(value)) throw new Error(`${fn}(${String(item)}) failed: ${value}`);
    result[item] = value;
  }
  return result;
}

/** Build desired, non-overlapping faction targets for all currently usable sleeves. */
async function refreshSleeveFactionRoutes(ns, playerInfo, resetInfo, playerWorkInfo, routeLimit) {
  const maxRoutes = Math.max(0, Math.floor(Number(routeLimit) || 0));
  if (options['disable-follow-player'] || maxRoutes === 0) return [];
  const now = Date.now();

  try {
    let gangFaction = null;
    if (playerInGang) {
      const gangInfo = await gangRun(ns, 'getGangInformation');
      if (gangInfo && typeof gangInfo === 'object' && !Array.isArray(gangInfo)) gangFaction = gangInfo.faction ?? null;
    }

    const joinedFactions = asArray(playerInfo?.factions).filter(faction =>
      typeof faction === 'string' && faction !== gangFaction && !NON_SLEEVE_WORK_FACTIONS.has(faction) &&
      now >= Number(factionWorkUnavailableUntil[faction] || 0));
    const metadataFactions = [...new Set([...joinedFactions, ...(gangFaction ? [gangFaction] : [])])];
    const staticKey = metadataFactions.slice().sort().join('|');
    const preferredFaction = playerWorkInfo?.type === 'FACTION' ? String(playerWorkInfo.factionName ?? '') : '';

    if (staticKey !== factionPlanStaticKey) {
      for (const faction of metadataFactions) {
        if (!Object.hasOwn(factionAugs, faction))
factionAugs[faction] = asArray(await singRun(ns, 'getAugmentationsFromFaction', faction));
        if (!Object.hasOwn(factionWorkTypes, faction))
factionWorkTypes[faction] = asArray(await singRun(ns, 'getFactionWorkTypes', faction)).map(String);
      }
      const augmentationNames = [...new Set(metadataFactions.flatMap(faction => factionAugs[faction] ?? []))];
      const missingRep = augmentationNames.filter(aug => !Object.hasOwn(augRepReqs, aug));
      const missingStats = augmentationNames.filter(aug => !Object.hasOwn(augStats, aug));
      const missingPrereqs = augmentationNames.filter(aug => !Object.hasOwn(augPrereqs, aug));
      Object.assign(augRepReqs, await buildSingularityMap(ns, 'getAugmentationRepReq', missingRep));
      Object.assign(augStats, await buildSingularityMap(ns, 'getAugmentationStats', missingStats));
      Object.assign(augPrereqs, await buildSingularityMap(ns, 'getAugmentationPrereq', missingPrereqs));
      for (const aug of augmentationNames) {
        const requirement = Number(augRepReqs[aug]);
        augRepReqs[aug] = Number.isFinite(requirement) ? requirement : Infinity;
        if (!augStats[aug] || typeof augStats[aug] !== 'object' || Array.isArray(augStats[aug])) augStats[aug] = {};
        augPrereqs[aug] = asArray(augPrereqs[aug]);
      }
      factionPlanStaticKey = staticKey;
      factionPlanRefreshedAt = 0;
    }

    if (preferredFaction !== factionPlanPreference) factionPlanRefreshedAt = 0;
    if (now - factionPlanRefreshedAt < factionAssignmentRefreshInterval)
      return factionPlanRoutes.slice(0, maxRoutes);

    const workableFactions = joinedFactions.filter(faction => getFactionWorkOptions(faction, factionWorkTypes).length > 0);
    const factionRep = await buildSingularityMap(ns, 'getFactionRep', metadataFactions);
    for (const faction of metadataFactions) factionRep[faction] = Number(factionRep[faction]) || 0;
    const ownedAugs = await getOwnedAugs(ns, true);
    if (!Array.isArray(ownedAugs)) throw new Error(`getOwnedAugs returned ${String(ownedAugs)}`);
    const augmentationNames = [...new Set(metadataFactions.flatMap(faction => factionAugs[faction] ?? []))];
    const desiredStats = getDefaultDesiredStats({
      bitNode: resetInfo?.currentNode,
      ownedAugCount: ownedAugs.length,
      factions: asArray(playerInfo?.factions),
      lastAugReset: resetInfo?.lastAugReset,
    });
    const desiredAugSet = buildDesiredAugSet({
      augmentationNames,
      augStats,
      augPrereqs,
      ownedAugs,
      desiredStats,
      desiredAugs: DEFAULT_DESIRED_AUGS,
      priorityAugs: DEFAULT_PRIORITY_AUGS,
    });
    const augUtility = buildAugUtilityMap({
      desiredAugSet,
      augStats,
      augPrereqs,
      desiredAugs: DEFAULT_DESIRED_AUGS,
      priorityAugs: DEFAULT_PRIORITY_AUGS,
    });
    const gangAugs = new Set(gangFaction ? asArray(factionAugs[gangFaction]).filter(aug =>
      (factionRep[gangFaction] ?? 0) >= (augRepReqs[aug] ?? Infinity)) : []);
    const factionRepRate = Object.fromEntries(workableFactions.map(faction => [faction, 1]));

    factionPlanRoutes = planDistinctFactionRepRoutes({
      joinedFactions: workableFactions,
      factionAugs,
      factionRep,
      factionRepRate,
      donationFactions: new Set(),
      gangFaction,
      gangAugs,
      desiredAugSet,
      augUtility,
      augRepReqs,
      augPrereqs,
      ownedAugs,
      priorityAugs: DEFAULT_PRIORITY_AUGS,
    }, Math.max(maxRoutes, numSleeves || maxRoutes), preferredFaction);
    factionPlanRefreshedAt = now;
    factionPlanPreference = preferredFaction;
    return factionPlanRoutes.slice(0, maxRoutes);
  } catch (error) {
    if (now - lastFactionPlanWarning >= factionAssignmentRefreshInterval) {
      lastFactionPlanWarning = now;
      log(ns, `WARNING: Unable to refresh sleeve faction routes: ${String(error?.stack ?? error)}`,
        false, 'warning');
    }
    return factionPlanRoutes.slice(0, maxRoutes);
  }
}

/** @param {NS} ns
 * @param {number} numSleeves
 * @returns {Promise<SleevePerson[]>} */
async function getAllSleeves(ns, numSleeves) {
  const sleeves = []
  for (let i = 0; i < numSleeves; i++)
    sleeves.push((await sleeveRun(ns, 'getSleeve', i)));
  return sleeves;
}

/** @param {NS} ns
 * Main loop that gathers data, checks on all sleeves, and manages them. */
async function mainLoop(ns) {
  // Update info
  numSleeves = (await sleeveRun(ns, 'getNumSleeves'));
  const playerInfo = await getPlayerInfo(ns);
  // If we have not yet detected that we are in bladeburner, do that now (unless disabled)
  if (!options['disable-bladeburner'] && !playerInBladeburner)
    playerInBladeburner = await bbRun(ns, 'inBladeburner');
  const playerWorkInfo = await getCurrentWorkInfo(ns);
  if (!playerInGang && (2 in ownedSourceFiles)) {
    const inGangResult = await gangRun(ns, 'inGang');
    playerInGang = inGangResult === true; // ERROR strings from the RAM-dodge helper must not count as gang membership
  }
  const gangKarmaPriority = shouldPrioritizeGangKarma(
    playerInGang,
    options['disable-gang-homicide-priority'],
    2 in ownedSourceFiles,
    ns.heart.break(),
  );
  let globalReserve = Number(ns.read("reserve.txt") || 0);
  let budget = (playerInfo.money - (options['reserve'] || globalReserve)) * options['aug-budget'];
  // Estimate the cost of sleeves training over the next time interval to see if (ignoring income) we would drop below our reserve.
  const costByNextLoop = interval / 1000 * task.filter(t => t?.startsWith("train")).length * 12000; // TODO: Training cost/sec seems to be a bug. Should be 1/5 this ($2400/sec)
  // Get time in current bitnode (to cap how long we'll train sleeves)
  const resetInfo = await getReset(ns);
  const timeInBitnode = Date.now() - resetInfo.lastNodeReset
  let canTrain = !options['disable-training'] &&
    // To avoid training forever when mults are crippling, stop training if we've been in the bitnode a certain amount of time
    (options['training-cap-seconds'] * 1000 > timeInBitnode) &&
    // Don't train if we have no money (unless player has given permission to train into debt)
    (playerInfo.money - costByNextLoop) > (options['training-reserve'] ||
      (ns.read(trainingReserveFile)) || globalReserve);
  // If any sleeve is training at the gym, see if we can purchase a gym upgrade to help them
  if (canTrain && task.some(t => t?.startsWith("train")) && !options['disable-spending-hashes-for-gym-upgrades'])
    if (await hnRun(ns, 'spendHashes', "Improve Gym Training"))
      log(ns, `SUCCESS: Bought "Improve Gym Training" to speed up Sleeve training.`, false, 'success');
  if (canTrain && task.some(t => t?.startsWith("study")) && !options['disable-spending-hashes-for-study-upgrades'])
    if (await hnRun(ns, 'spendHashes', "Improve Studying"))
      log(ns, `SUCCESS: Bought "Improve Studying" to speed up Sleeve studying.`, false, 'success');
  if (playerInBladeburner && (7 in ownedSourceFiles)) {
    const bladeburnerCity = await bbRun(ns, 'getCity');
    bladeburnerCityChaos = await bbRun(ns, 'getCityChaos', bladeburnerCity);
    bladeburnerContractChances = {};
    bladeburnerContractCounts = {};
    for (const cName of sleeveBbContractNames) {
      bladeburnerContractChances[cName] = (await bbRun(ns, 'getActionEstimatedSuccessChance', "Contracts", cName))[0];
      bladeburnerContractCounts[cName] = (await bbRun(ns, 'getActionCountRemaining', "Contracts", cName));
    }
  } else
    bladeburnerCityChaos = 0, bladeburnerContractChances = {}, bladeburnerContractCounts = {};

  // Update all sleeve information and loop over all sleeves to do some individual checks and task assignments
  let sleeveInfo = await getAllSleeves(ns, numSleeves);
  stagedShockRecoveryState = getStagedShockRecoveryPlan(
    sleeveInfo, task, stagedShockRecoveryState,
  );

  const repWorkerOrder = getSleeveRepWorkerOrder(
    sleeveInfo, stagedShockRecoveryState, playerInBladeburner,
  );
  const factionRoutes = gangKarmaPriority ? [] : await refreshSleeveFactionRoutes(
    ns, playerInfo, resetInfo, playerWorkInfo, repWorkerOrder.length,
  );
  sleeveRepAssignments = assignSleeveRepTargets(
    repWorkerOrder,
    playerWorkInfo,
    factionRoutes,
    factionWorkTypes,
    options['disable-follow-player'] || gangKarmaPriority,
  );

  for (let i = 0; i < numSleeves; i++) {
    let sleeve = sleeveInfo[i]; // For convenience, merge all sleeve stats/info into one object
    // Manage sleeve augmentations (if available)
    if (sleeve.shock == 0) // No augs are available augs until shock is 0
      budget -= await manageSleeveAugs(ns, i, budget);

    // Decide what we think the sleeve should be doing for the next little while
    let [designatedTask, command, args, statusUpdate] =
      await pickSleeveTask(ns, playerInfo, playerWorkInfo, i, sleeve, canTrain, gangKarmaPriority,
        stagedShockRecoveryState, sleeveRepAssignments[i]);

    // After picking sleeve tasks, take a note of the sleeve's health at the end of the prior loop so we can detect failures
    [lastSleeveHp[i], lastSleeveShock[i]] = [sleeve.hp.current, sleeve.shock];

    // Cached task strings can outlive the actual Sleeve API work (manual changes, failed helpers, or resets).
    // Reconcile periodically so an apparently assigned sleeve cannot remain idle indefinitely.
    let assignSuccess;
    if (task[i] === designatedTask &&
      Date.now() - (lastTaskValidationTime[i] || 0) >= taskValidationInterval) {
      const actualTask = await sleeveRun(ns, 'getTask', i);
      lastTaskValidationTime[i] = Date.now();
      if (!hasActiveSleeveTask(actualTask)) {
        const detail = isSleeveApiError(actualTask) ? actualTask : 'Sleeve API reports no active task';
        log(ns, `WARNING: Sleeve ${i} lost cached task '${designatedTask}' (${detail}); reassigning.`,
false, 'warning');
        delete task[i];
      }
    }
    if (task[i] !== designatedTask) {
      assignSuccess = await setSleeveTask(ns, i, designatedTask, command, args);
      if (assignSuccess === true) lastTaskValidationTime[i] = Date.now();
    }

    // For certain tasks, log a periodic status update.
    if (statusUpdate && (assignSuccess === true || (
      assignSuccess === undefined && (Date.now() - (lastStatusUpdateTime[i] ?? 0)) > statusUpdateInterval))) {
      log(ns, `INFO: Sleeve ${i} is ${assignSuccess === undefined ? '(still) ' : ''}${statusUpdate} `);
      lastStatusUpdateTime[i] = Date.now();
    }
  }
}

/** Picks the best task for a sleeve, and returns the information to assign and give status updates for that task.
 * @param {NS} ns
 * @param {Player} playerInfo
 * @param {{ type: "COMPANY"|"FACTION"|"CLASS"|"CRIME", cyclesWorked: number, crimeType: string, classType: string, location: string, companyName: string, factionName: string, factionWorkType: string }} playerWorkInfo
 * @param {SleevePerson} sleeve
 * @returns {Promise<[string, string, any[], string]>} a 4-tuple of task name, command, args, and status message */
async function pickSleeveTask(ns, playerInfo, playerWorkInfo, i, sleeve, canTrain, gangKarmaPriority,
  stagedShockRecovery, repAssignment) {
  // Initialize sleeve dicts on first loop
  if (lastSleeveHp[i] === undefined) lastSleeveHp[i] = sleeve.hp.current;
  if (lastSleeveShock[i] === undefined) lastSleeveShock[i] = sleeve.shock;
  // Must synchronize first iif you haven't maxed memory on every sleeve
  if (sleeve.sync < 100)
    return ["synchronize", 'setToSynchronize', [i], `syncing... ${sleeve.sync.toFixed(2)}%`];
  const stagedRecoveryActive = stagedShockRecovery?.active === true;
  const stagedRecoverySleeve = stagedRecoveryActive &&
    stagedShockRecovery.recoverySleeves?.includes(i) === true;

  if (stagedRecoverySleeve) {
    const reason = stagedShockRecovery.mode === 'prime'
      ? 'this is the single sleeve recovering first so the fleet gets one fully recovered worker'
      : `sleeve ${stagedShockRecovery.anchor} is fully recovered and working while the rest recover`;
    return shockRecoveryTask(sleeve, i, reason);
  }

  // The staged fleet policy supersedes independent per-sleeve recovery rolls. During the prime phase,
  // non-anchor sleeves keep working; during the drain phase, every shocked sleeve was returned above.
  if (!stagedRecoveryActive) {
    if (sleeve.shock > options['min-shock-recovery'])
      return shockRecoveryTask(sleeve, i,
        `shock is above ${options['min-shock-recovery'].toFixed(0)}% (--min-shock-recovery)`);
    if (sleeve.shock > 0 && options['shock-recovery'] > 0) {
      if (shouldRerollShockRecovery(Date.now(), lastRerollTime[i])) {
        shockChance[i] = Math.random();
        lastRerollTime[i] = Date.now();
      }
      if (shockChance[i] < options['shock-recovery'])
        return shockRecoveryTask(sleeve, i,
`there is a ${(options['shock-recovery'] * 100).toFixed(1)}% chance ` +
`(--shock-recovery) of picking this task every minute until fully recovered.`);
    }
  }  // Gang karma is a true priority: after mandatory/periodic recovery, do not let training or player-follow
  // work consume the only usable sleeve while the player is still unlocking gangs.
  if (gangKarmaPriority)
    return await crimeTask(ns, 'Homicide', i, sleeve, 'we want gang karma');

  // Once gang Karma is no longer urgent, use every available sleeve on a distinct productive rep target.
  if (repAssignment?.type === 'FACTION') {
    const faction = repAssignment.faction;
    const workOptions = getFactionWorkOptions(faction, {[faction]: repAssignment.workTypes});
    const workIndex = Math.min(Number(workByFaction[faction]) || 0, Math.max(0, workOptions.length - 1));
    const work = workOptions[workIndex];
    if (work) {
      const unlocks = repAssignment.unlockedAugs?.length
        ? ` toward [${repAssignment.unlockedAugs.join(', ')}]`
        : '';
      return [
        `work for faction '${faction}' (${work})`,
        'setToFactionWork',
        [i, faction, work],
        `helping earn rep with faction ${faction} by doing ${work} work${unlocks}.`,
      ];
    }
  }
  if (repAssignment?.type === 'COMPANY') {
    const companyName = repAssignment.companyName;
    return [
      `work for company '${companyName}'`,
      'setToCompanyWork',
      [i, companyName],
      `helping earn rep with company ${companyName}.`,
    ];
  }
  // Train if our sleeve's physical stats aren't where we want them
  if (canTrain) {
    const univClasses = {
      "hacking": ns.enums.UniversityClassType.algorithms,
      "charisma": ns.enums.UniversityClassType.leadership
    };
    let untrainedStats = trainStats.filter(stat => sleeve.skills[stat] < options[`train-to-${stat}`]);
    let untrainedSmarts = trainSmarts.filter(smart => sleeve.skills[smart] < options[`study-to-${smart}`]);

    // prioritize physical training
    if (untrainedStats.length > 0) {
      if (sleeve.city != ns.enums.CityName.Sector12) {
        log(ns, `Moving Sleeve ${i} from ${sleeve.city} to Sector-12 so that they can train at Powerhouse Gym.`);
        const traveled = await sleeveRun(ns, 'travel', i, ns.enums.CityName.Sector12);
        if (!isSleeveAssignmentSuccessful(traveled))
log(ns, `WARNING: Failed to move Sleeve ${i} to Sector-12: ${String(traveled)}`, false, 'warning');
      }
      var trainStat = untrainedStats.reduce((min, s) => sleeve.skills[s] < sleeve.skills[min] ? s : min, untrainedStats[0]);
      var gym = ns.enums.LocationName.Sector12PowerhouseGym;
      return [
        `train ${trainStat} (${gym})`,
        'setToGymWorkout',
        [i, gym, trainStat.slice(0, 3)], // Gym expects the short form stat names ('str', 'def', 'dex', 'agi')
        `training ${trainStat}... ${sleeve.skills[trainStat]}/${(options[`train-to-${trainStat}`])}`
      ];
      // if we're tough enough, flip over to studying to improve the mental stats
    } else if (untrainedSmarts.length > 0) {
      if (sleeve.city != ns.enums.CityName.Volhaven) {
        log(ns, `Moving Sleeve ${i} from ${sleeve.city} to Volhaven so that they can study at ZB Institute.`);
        const traveled = await sleeveRun(ns, 'travel', i, ns.enums.CityName.Volhaven);
        if (!isSleeveAssignmentSuccessful(traveled))
log(ns, `WARNING: Failed to move Sleeve ${i} to Volhaven: ${String(traveled)}`, false, 'warning');
      }
      var trainSmart = untrainedSmarts.reduce((min, s) => sleeve.skills[s] < sleeve.skills[min] ? s : min, untrainedSmarts[0]);
      var univ = ns.enums.LocationName.VolhavenZBInstituteOfTechnology;
      var course = univClasses[trainSmart];
      return [
        `study ${trainSmart} (${univ})`,
        'setToUniversityCourse',
        [i, univ, course],
        `studying ${trainSmart}... ${sleeve.skills[trainSmart]}/${(options[`study-to-${trainSmart}`])}`
      ];
    }
  }
  // If the player is in bladeburner, and has already unlocked gangs with Karma, generate contracts and operations
  if (playerInBladeburner) {
    // Hack: Without paying much attention to what's happening in bladeburner, pre-assign a variety of tasks by sleeve index
    const bbTasks = [
            // Note: Sleeve 0 might still be used for faction work (unless --disable-follow-player is set), so don't assign them a 'unique' task
            /*0*/options['enable-bladeburner-team-building'] ? ["Support main sleeve"] : ["Infiltrate Synthoids"],
            // Note: Each contract type can only be performed by one sleeve at a time (similar to working for factions)
            /*1*/["Take on contracts", "Retirement"], /*2*/["Take on contracts", "Bounty Hunter"], /*3*/["Take on contracts", "Tracking"],
            // Other bladeburner work can be duplicated, but tackling a variety is probably useful. Overrides occur below
            /*4*/["Infiltrate Synthoids"], /*5*/["Diplomacy"], /*6*/["Field Analysis"],
            /*7*/options['enable-bladeburner-team-building'] ? ["Recruitment"] : ["Infiltrate Synthoids"]
    ];
    let [action, contractName] = bbTasks[i];
    const contractChance = bladeburnerContractChances[contractName] ?? 1;
    const contractCount = bladeburnerContractCounts[contractName] ?? Infinity;
    const onCooldown = () => Date.now() <= bladeburnerCooldown[i]; // Function to check if we're on cooldown
    // Detect if the sleeve recently failed the task. If so, put them on a "cooldown" before trying again
    if (sleeve.hp.current < lastSleeveHp[i] || sleeve.shock > lastSleeveShock[i]) {
      bladeburnerCooldown[i] = Date.now() + options['failed-bladeburner-contract-cooldown'];
      log(ns, `Sleeve ${i} appears to have recently failed its designated bladeburner task '${action} - ${contractName}' ` +
        `(HP ${lastSleeveHp[i].toFixed(1)} -> ${sleeve.hp.current.toFixed(1)}, ` +
        `Shock: ${lastSleeveShock[i].toFixed(2)} -> ${sleeve.shock.toFixed(2)}). ` +
        `Will try again in ${formatDuration(options['failed-bladeburner-contract-cooldown'])}`);
    } // If the contract success chance appears too low, or there are insufficient contracts remaining, smaller cooldown
    else if (!onCooldown() && (contractChance <= minBbProbability || contractCount < minBbContracts)) {
      bladeburnerCooldown[i] = Date.now() + waitForContractCooldown;
      log(ns, `Delaying sleeve ${i} designated bladeburner task '${action} - ${contractName}' - ` +
        (contractCount < minBbContracts ? `Insufficient contract count (${contractCount} < ${minBbContracts})` :
          `Player chance is too low (${(contractChance * 100).toFixed(2)}% < ${(minBbProbability * 100)}%). `) +
        `Will try again in ${formatDuration(waitForContractCooldown)}`);
    }
    // As current city chaos gets progressively bad, assign more and more sleeves to Diplomacy to help get it under control
    if (bladeburnerCityChaos > (10 - i) * 10) // Later sleeves are first to get assigned, sleeve 0 is last at 100 chaos.
      [action, contractName] = ["Diplomacy"];
    // If the sleeve is on cooldown ,do not perform their designated bladeburner task
    else if (onCooldown()) { // When on cooldown from a failed task, recover shock if applicable, or else add contracts
      if (sleeve.shock > 0 && !stagedRecoveryActive)
        return shockRecoveryTask(sleeve, i, `bladeburner task is on cooldown`);
      [action, contractName] = ["Infiltrate Synthoids"]; // Fall-back to something long-term useful
    }
    return [`Bladeburner ${action} ${contractName || ''}`.trimEnd(),
        /*   */ 'setToBladeburnerAction', [i, action, contractName ?? ''],
        /*   */ `doing ${action}${contractName ? ` - ${contractName}` : ''} in Bladeburner.`];
  }
  // If there's nothing more productive to do (above) and there's still shock, prioritize recovery
  if (sleeve.shock > 0 && !stagedRecoveryActive)
    return shockRecoveryTask(sleeve, i, `there appears to be nothing better to do`);

  //default to comiting crimes for stats/karma
  //Note: Heist and assassin give intel, homicide is best for karma.
  //Heist is better for stats than assassination.
  const bestCrimesByDifficulty = ["Heist", "Assassination", "Homicide"];
  const chanceThresholds = [1.0, 1.0, 0.5];
  async function buildLibCrimeTask(ns, sleeve, items) {
    let ret = {};
    for (const item of items) {
      const val = await calculateCrimeChance(ns, sleeve, item);
      ret[item] = val;
    }
    return ret;
  }
  const crimeChances = await buildLibCrimeTask(ns, sleeve, bestCrimesByDifficulty);

  let crime = "Mug"; //default as it has a decent chance rate.
  for (let i = 0; i < bestCrimesByDifficulty.length; i++) {
    const c = bestCrimesByDifficulty[i];
    if ((crimeChances[c] ?? 0) > chanceThresholds[i]) { crime = c; break; }
  }

  return await crimeTask(ns, crime, i, sleeve, `there appears to be nothing better to do`);
}

/** Helper to prepare the shock recovery task
 * @param {SleevePerson} sleeve */
function shockRecoveryTask(sleeve, i, reason) {
  return [`recover from shock`, 'setToShockRecovery', [i],
    /*   */ `recovering from shock (${sleeve.shock.toFixed(2)}%) beacause ${reason}...`];
}

/** Helper to prepare the crime task
 * @param {NS} ns
 * @param {SleevePerson} sleeve
 * @returns {Promise<[string, string, any[], string]>} a 4-tuple of task name, command, args, and status message */
async function crimeTask(ns, crime, i, sleeve, reason) {
  const successChance = await calculateCrimeChance(ns, sleeve, crime);
  return [`commit ${crime}`, 'setToCommitCrime', [i, crime],
    /*   */ `committing ${crime} with chance ${(successChance * 100).toFixed(2)}% because ${reason}` +
    /*   */ (options.crime || crime == "Homicide" ? '' : // If auto-criming, user may be curious how close we are to switching to homicide
    /*   */     ` (Note: Homicide chance would be ${((await calculateCrimeChance(ns, sleeve, "Homicide")) * 100).toFixed(2)}%)`)];
}


/** Sets a sleeve to its designated task, with some extra error handling logic for working for factions.
 * @param {NS} ns
 * @param {number} i - Sleeve number
 * @param {string} designatedTask - string describing the designated task
 * @param {string} command - dynamic command to initiate this work
 * @param {any[]} args - arguments consumed by the dynamic command
 * */
async function setSleeveTask(ns, i, designatedTask, command, args) {
  const strAction = `Set sleeve ${i} to ${designatedTask}`;
  let failureDetail = '';
  try {
    const result = await sleeveRun(ns, command, ...args);
    // RAM-dodge helpers return serialized ERROR strings. Treat only the API's literal boolean true as success.
    if (isSleeveAssignmentSuccessful(result)) {
      task[i] = designatedTask;
      if (designatedTask.startsWith('work for faction')) {
        const faction = args[1];
        factionWorkFailureCount[faction] = 0;
        delete factionWorkUnavailableUntil[faction];
      }
      log(ns, `SUCCESS: ${strAction}`);
      return true;
    }
    failureDetail = isSleeveApiError(result) ? result : `returned ${String(result)}`;
  } catch (error) {
    failureDetail = String(error?.stack ?? error);
  }

  delete task[i];
  lastTaskValidationTime[i] = 0;
  lastRerollTime[i] = 0;
  const suffix = failureDetail ? ` (${failureDetail})` : '';
  // If working for a faction, it's possible the current work isn't supported, so try the next one.
  if (designatedTask.startsWith('work for faction')) {
    const faction = args[1];
    const workOptions = getFactionWorkOptions(faction, factionWorkTypes);
    const currentIndex = Math.max(0, workOptions.indexOf(args[2]));
    let nextWorkIndex = currentIndex + 1;
    factionWorkFailureCount[faction] = (Number(factionWorkFailureCount[faction]) || 0) + 1;
    if (nextWorkIndex >= workOptions.length) {
      nextWorkIndex = 0;
      if (factionWorkFailureCount[faction] >= Math.max(2, workOptions.length * 2)) {
        factionWorkUnavailableUntil[faction] = Date.now() + factionWorkRetryInterval;
        factionPlanRefreshedAt = 0;
        log(ns, `WARN: Failed to ${strAction}${suffix}. Temporarily removing ${faction} from sleeve routes ` +
`for ${formatDuration(factionWorkRetryInterval)}.`, true, 'warning');
      } else {
        log(ns, `WARN: Failed to ${strAction}${suffix}. Retrying the supported work types.`, true, 'warning');
      }
    } else {
      log(ns, `INFO: Failed to ${strAction}${suffix} - trying ${workOptions[nextWorkIndex]} work next.`);
    }
    workByFaction[faction] = nextWorkIndex;
  } else if (designatedTask.startsWith('Bladeburner')) { // Bladeburner action may be out of operations
    bladeburnerCooldown[i] = Date.now(); // There will be a cooldown before this task is assigned again.
  } else
    log(ns, `ERROR: Failed to ${strAction}${suffix}`, true, 'error');
  return false;
}

/** @param {NS} ns
 * @param {SleevePerson} sleeve
 * Calculate the chance a sleeve has of committing homicide successfully. */
async function calculateCrimeChance(ns, sleeve, crimeName) {
  // If not in the cache, retrieve this crime's stats
  const crimeStats = cachedCrimeStats[crimeName] ?? (cachedCrimeStats[crimeName] = (4 in ownedSourceFiles ?
    await singRun(ns, 'getCrimeStats', crimeName) :
    // Hack: To support players without SF4, hard-code values as of the current release
    crimeName == "Homicide" ? { difficulty: 1, strength_success_weight: 2, defense_success_weight: 2, dexterity_success_weight: 0.5, agility_success_weight: 0.5 } :
      crimeName == "Mug" ? { difficulty: 0.2, strength_success_weight: 1.5, defense_success_weight: 0.5, dexterity_success_weight: 1.5, agility_success_weight: 0.5, } :
        undefined));
  let chance =
    (crimeStats.hacking_success_weight || 0) * sleeve.skills.hacking +
    (crimeStats.strength_success_weight || 0) * sleeve.skills.strength +
    (crimeStats.defense_success_weight || 0) * sleeve.skills.defense +
    (crimeStats.dexterity_success_weight || 0) * sleeve.skills.dexterity +
    (crimeStats.agility_success_weight || 0) * sleeve.skills.agility +
    (crimeStats.charisma_success_weight || 0) * sleeve.skills.charisma;
  chance /= 975;
  chance /= crimeStats.difficulty;
  return Math.min(chance, 1);
}