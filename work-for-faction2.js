import {
  findPids, getActiveSourceFiles, getReset, gangRun, singRun, log, getBNMults, getPlayerInfo,
  getOwnedAugs, getErrorInfo, bbRun, addRepToFavor, favorToRep, formatDuration, getServ
} from './utils.js';
import {
  DEFAULT_PRIORITY_AUGS, DEFAULT_DESIRED_AUGS, getDefaultDesiredStats, buildDesiredAugSet,
  buildAugUtilityMap, getUsefulAugsForFaction, planBestFactionRepRoute,
  rankFactionInviteRoutes, selectBestExclusiveFactionGroup, chooseBestRoute
} from './faction-route-planner.js';
import {CASHROOT_AUG, CORPORATE_FACTIONS} from './intel-farm.js';

const LOOP_SLEEP = 30000;
const REPLAN_INTERVAL = 60 * 1000;
const RATE_CACHE_TIME = 15 * 60 * 1000;
const PROGRESS_CHECK_INTERVAL = 5 * 1000;
const INVITE_REPLAN_INTERVAL = 15 * 1000;
const GANG_KARMA_REQUIREMENT = -54_000;
const COMPANY_FACTION_REP = 400_000;

const FACTIONS = [
  "Illuminati", "Daedalus", "The Covenant", "ECorp", "MegaCorp", "Bachman & Associates", "Blade Industries", "NWO",
  "Clarke Incorporated", "OmniTek Incorporated", "Four Sigma", "KuaiGong International", "Fulcrum Secret Technologies",
  "BitRunners", "The Black Hand", "NiteSec", "Aevum", "Chongqing", "Ishima", "New Tokyo", "Sector-12", "Volhaven",
  "Speakers for the Dead", "The Dark Army", "The Syndicate", "Silhouette", "Tetrads", "Slum Snakes", "Netburners",
  "Tian Di Hui", "CyberSec"
];
const PREFERRED_EARLY_FACTIONS = [
  "Netburners", "Tian Di Hui", "Aevum", "CyberSec", "NiteSec", "Tetrads", "Bachman & Associates", "BitRunners",
  "Fulcrum Secret Technologies", "ECorp", "The Black Hand", "The Dark Army", "Clarke Incorporated",
  "OmniTek Incorporated", "NWO", "Chongqing"
];
const COMPANY_FACTIONS = CORPORATE_FACTIONS;
const ROUTE_ORDER = [...new Set([...PREFERRED_EARLY_FACTIONS, ...COMPANY_FACTIONS, ...FACTIONS])];
const COMPANY_NAME_BY_FACTION = { "Fulcrum Secret Technologies": "Fulcrum Technologies" };
const COMPANY_SERVER_BY_FACTION = {
  "Bachman & Associates": "b-and-a", ECorp: "ecorp", "Clarke Incorporated": "clarkinc",
  "OmniTek Incorporated": "omnitek", NWO: "nwo", "Blade Industries": "blade", MegaCorp: "megacorp",
  "KuaiGong International": "kuai-gong", "Fulcrum Secret Technologies": "fulcrumtech", "Four Sigma": "4sigma"
};
const REQUIRED_MONEY = {
  "Tian Di Hui": 1e6, "Sector-12": 15e6, "Chongqing": 20e6, "New Tokyo": 20e6, "Ishima": 30e6,
  "Aevum": 40e6, "Volhaven": 50e6, "Slum Snakes": 1e6, "Silhouette": 15e6, "The Syndicate": 10e6,
  "The Covenant": 75e9, "Daedalus": 100e9, "Illuminati": 150e9
};
const REQUIRED_HACK = {
  "Tian Di Hui": 50, "Netburners": 80, "Speakers for the Dead": 100, "The Syndicate": 200,
  "The Dark Army": 300, "The Covenant": 850, "Daedalus": 2500, "Illuminati": 1500
};
const REQUIRED_COMBAT = {
  "Slum Snakes": 30, "Tetrads": 75, "Speakers for the Dead": 300, "The Syndicate": 200,
  "The Dark Army": 300, "The Covenant": 850, "Daedalus": 1500, "Illuminati": 1200
};
const REQUIRED_KARMA = {
  "Slum Snakes": 9, "Tetrads": 18, "Silhouette": 22, "Speakers for the Dead": 45,
  "The Dark Army": 45, "The Syndicate": 90
};
const REQUIRED_KILLS = { "Speakers for the Dead": 30, "The Dark Army": 5 };
const REQUIRED_AUGS = { "The Covenant": 20, "Illuminati": 30 };
const BACKDOOR_FACTIONS = new Set(["CyberSec", "NiteSec", "The Black Hand", "BitRunners", "Fulcrum Secret Technologies"]);
const PASSIVE_INVITE_FACTIONS = new Set(["Netburners", "Silhouette"]);
const CANNOT_DONATE = new Set(["Bladeburners", "Church of the Machine God", "Shadows of Anarchy"]);
const GANG_FACTIONS = ["Slum Snakes", "The Syndicate", "The Dark Army", "Speakers for the Dead", "Tetrads", "The Black Hand"];
const CITY_GROUPS = {
  west: ["Aevum", "Sector-12"],
  east: ["Chongqing", "New Tokyo", "Ishima"],
  volhaven: ["Volhaven"]
};
const CITY_FACTIONS = new Set(Object.values(CITY_GROUPS).flat());
const COMBAT_STATS = ["strength", "defense", "dexterity", "agility"];
const COMBAT_LEVEL_MULTIPLIERS = {
  strength: "StrengthLevelMultiplier", defense: "DefenseLevelMultiplier",
  dexterity: "DexterityLevelMultiplier", agility: "AgilityLevelMultiplier"
};

function getFlagValues(args, names, replaceUnderscores = false) {
  const wanted = new Set(Array.isArray(names) ? names : [names]);
  const values = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (!wanted.has(String(args[i]))) continue;
    const value = String(args[i + 1]);
    if (value.startsWith("--")) continue;
    values.push(replaceUnderscores ? value.replaceAll("_", " ") : value);
  }
  return values;
}

function getNumericFlag(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function asArray(value) { return Array.isArray(value) ? value : []; }
function isTrue(value) { return value === true; }
function isApiError(value) { return typeof value === "string" && value.startsWith("ERROR:"); }
export function isCompanyApplicationSuccessful(value) {
  return typeof value === "string" && value.length > 0 && !isApiError(value);
}
function requireArray(value, label) {
  if (isApiError(value) || !Array.isArray(value)) throw new Error(`${label} returned ${String(value)}`);
  return value;
}
function requireObject(value, label) {
  if (isApiError(value) || !value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} returned ${String(value)}`);
  return value;
}
function median(values, fallback = 1) {
  const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return fallback;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param {NS} ns */
export async function main(ns) {
  const sourceFiles = await getActiveSourceFiles(ns, true);
  if ((await findPids(ns, ns.getScriptName())).length > 1) return;
  if (!(4 in sourceFiles)) return log(ns, "ERROR: work-for-faction2.js requires Singularity access.", true, "error");

  const resetInfo = await getReset(ns);
  const bitNodeMults = await getBNMults(ns);
  const favorToDonate = ns.getFavorToDonate();
  const crimeFocused = ns.args.includes("--crime-focus");
  const fastCrimesOnly = ns.args.includes("--fast-crimes-only");
  const prioritizeInvites = ns.args.includes("--prioritize-invites");
  const collectAllCompanyInvites = ns.args.includes("--all-company-invites");
  const trainingStatPerMultiThreshold = getNumericFlag(ns.args, "--training-stat-per-multi-threshold", 100);
  const desiredStatOverrides = [
    ...getFlagValues(ns.args, "--desired-stats"),
    ...getFlagValues(ns.args, "--stat-desired")
  ];
  const priorityAugOverrides = [
    ...getFlagValues(ns.args, "--priority-augs", true),
    ...getFlagValues(ns.args, "--priority-aug", true)
  ];
  const desiredAugOverrides = [
    ...getFlagValues(ns.args, "--desired-augs", true),
    ...getFlagValues(ns.args, "--aug-desired", true)
  ];
  const priorityAugs = priorityAugOverrides.length ? priorityAugOverrides : DEFAULT_PRIORITY_AUGS.slice();
  const namedDesiredAugs = [...new Set([...priorityAugs, ...DEFAULT_DESIRED_AUGS, ...desiredAugOverrides])];
  const collectCashRoot = priorityAugs.includes(CASHROOT_AUG);

  let playerInfo = null;
  let currentWork = {};
  let pendingInvites = [];
  let ownedAugs = [];
  let installedAugs = [];
  let factionAugs = {};
  let factionRep = {};
  let factionFavor = {};
  let augRepReqs = {};
  let augStats = {};
  let augPrereqs = {};
  let augmentationNames = [];
  let staticFactionKey = "";
  let staticGangFaction;
  let desiredAugSet = new Set();
  let augUtility = {};
  let donationFactions = new Set();
  let gangFaction = null;
  let gangAugs = new Set();
  let playerInGang = false;
  let lastTravel = 0;
  let lastPlan = "";
  let waitingForGangLogged = false;
  let activePlan = null;
  let requestedReplanDelay = REPLAN_INTERVAL;
  const workCache = {};
  const repRateCache = {};
  const repRateMeasuredAt = {};
  const skippedCombatFactions = new Set();
  const companyFactionRepRequirementCache = {};
  const companyFieldCache = {};
  const companyRepRateCache = {};
  const companyRepRateMeasuredAt = {};

  function hasCompanyJob(company) {
    return typeof playerInfo.jobs?.[company] === "string" && playerInfo.jobs[company].length > 0;
  }

  async function applyForCompanyField(company, field) {
    const result = await singRun(ns, "applyToCompany", company, field);
    if (isApiError(result)) return false;
    if (isCompanyApplicationSuccessful(result)) {
      playerInfo.jobs ??= {};
      playerInfo.jobs[company] = result;
      return true;
    }
    // applyToCompany returns null when no promotion is available. An existing job is still valid work.
    return hasCompanyJob(company);
  }

  function combatTrainingHeuristic(stat) {
    return Math.sqrt(
      (playerInfo.mults?.[stat] ?? 1) *
      (playerInfo.mults?.[`${stat}_exp`] ?? 1) *
      (bitNodeMults[COMBAT_LEVEL_MULTIPLIERS[stat]] ?? 1) *
      (bitNodeMults.CrimeExpGain ?? 1)
    );
  }

  function canTrainCombatInReasonableTime(requirement) {
    if (crimeFocused) return true;
    const requiredHeuristic = requirement / trainingStatPerMultiThreshold;
    return COMBAT_STATS.filter(stat => playerInfo.skills[stat] < requirement)
      .every(stat => combatTrainingHeuristic(stat) >= requiredHeuristic);
  }

  async function buildLibSing(fn, items) {
    const result = {};
    for (const item of items) {
      const value = await singRun(ns, fn, item);
      if (isApiError(value)) throw new Error(`${fn}(${String(item)}) failed: ${value}`);
      result[item] = value;
    }
    return result;
  }

  function usefulAugs(faction) {
    return getUsefulAugsForFaction({
      faction, factionAugs, desiredAugSet, ownedAugs, augRepReqs,
      joinedFactions: playerInfo.factions, factionRep, donationFactions, gangAugs
    });
  }

  function factionUtility(faction) {
    return usefulAugs(faction).reduce((sum, aug) => sum + (augUtility[aug] ?? 0.25), 0);
  }

  function groupUtility(groupFactions) {
    const augs = new Set();
    for (const faction of groupFactions)
      for (const aug of usefulAugs(faction)) augs.add(aug);
    return [...augs].reduce((sum, aug) => sum + (augUtility[aug] ?? 0.25), 0);
  }

  function joinedCityGroup() {
    for (const [group, groupFactions] of Object.entries(CITY_GROUPS))
      if (groupFactions.some(faction => playerInfo.factions.includes(faction))) return group;
    return null;
  }

  function refreshDonationFactions() {
    donationFactions = new Set(playerInfo.factions.filter(faction => faction !== gangFaction && !CANNOT_DONATE.has(faction) &&
      (favorToDonate === 0 || (factionFavor[faction] ?? 0) >= favorToDonate)));
  }

  async function joinFaction(faction) {
    if (playerInfo.factions.includes(faction)) return true;
    if (!isTrue(await singRun(ns, "joinFaction", faction))) return false;
    playerInfo.factions.push(faction);
    pendingInvites = pendingInvites.filter(invite => invite !== faction);
    refreshDonationFactions();
    log(ns, `Joined productive faction "${faction}".`, false, "success");
    return true;
  }

  async function joinUsefulInvitations() {
    if (pendingInvites.length === 0) return false;
    let joined = false;
    // Non-city factions have no mutually-exclusive downside, so accept useful invitations immediately.
    // City invitations are deferred until the route planner compares all exclusive city groups.
    for (const faction of pendingInvites.filter(faction => !CITY_FACTIONS.has(faction))) {
      const forceGangFaction = crimeFocused && GANG_FACTIONS.includes(faction) && !playerInGang;
      const forceCompanyFaction = collectAllCompanyInvites && COMPANY_FACTIONS.includes(faction);
      if (!forceGangFaction && !forceCompanyFaction && factionUtility(faction) <= 0) continue;
      joined = await joinFaction(faction) || joined;
    }
    return joined;
  }

  async function loadData() {
    pendingInvites = requireArray(await singRun(ns, "checkFactionInvitations"), "checkFactionInvitations");
    playerInfo = requireObject(await getPlayerInfo(ns), "getPlayerInfo");
    const gangStatus = await gangRun(ns, "inGang");
    if (isApiError(gangStatus)) throw new Error(gangStatus);
    playerInGang = isTrue(gangStatus);
    const gangInfo = playerInGang ? requireObject(await gangRun(ns, "getGangInformation"), "getGangInformation") : null;
    const nextGangFaction = gangInfo?.faction ?? null;
    const allKnownFactions = [...new Set([...FACTIONS, ...(playerInfo.factions ?? []), ...pendingInvites])];
    const nextStaticKey = allKnownFactions.slice().sort().join("|");

    // Faction offerings and augmentation metadata are static during an install. Refresh only if a new
    // faction appears or gang membership changes the gang faction's available augmentations.
    if (nextStaticKey !== staticFactionKey || nextGangFaction !== staticGangFaction) {
      factionAugs = await buildLibSing("getAugmentationsFromFaction", allKnownFactions);
      factionFavor = await buildLibSing("getFactionFavor", allKnownFactions);
      for (const faction of allKnownFactions) {
        factionAugs[faction] = asArray(factionAugs[faction]);
        factionFavor[faction] = Number(factionFavor[faction]) || 0;
      }
      // The game can report The Red Pill as a gang augmentation outside BN2 even though it cannot be bought there.
      if (nextGangFaction && resetInfo.currentNode !== 2)
        factionAugs[nextGangFaction] = factionAugs[nextGangFaction].filter(aug => aug !== "The Red Pill");
      augmentationNames = [...new Set(Object.values(factionAugs).flat())];
      augRepReqs = await buildLibSing("getAugmentationRepReq", augmentationNames);
      augStats = await buildLibSing("getAugmentationStats", augmentationNames);
      augPrereqs = await buildLibSing("getAugmentationPrereq", augmentationNames);
      for (const aug of augmentationNames) {
        const repRequirement = Number(augRepReqs[aug]);
        augRepReqs[aug] = Number.isFinite(repRequirement) ? repRequirement : Infinity;
        if (!augStats[aug] || typeof augStats[aug] !== "object" || Array.isArray(augStats[aug])) augStats[aug] = {};
        augPrereqs[aug] = asArray(augPrereqs[aug]);
      }
      staticFactionKey = nextStaticKey;
      staticGangFaction = nextGangFaction;
    }

    factionRep = Object.fromEntries(allKnownFactions.map(faction => [faction, 0]));
    const joinedFactions = playerInfo.factions ?? [];
    const joinedRep = await buildLibSing("getFactionRep", joinedFactions);
    for (const faction of joinedFactions) factionRep[faction] = Number(joinedRep[faction]) || 0;
    ownedAugs = requireArray(await getOwnedAugs(ns, true), "getOwnedAugs(true)");
    installedAugs = requireArray(await getOwnedAugs(ns, false), "getOwnedAugs(false)");

    gangFaction = nextGangFaction;
    // Treat the gang as an alternate provider only after its current reputation actually unlocks the augmentation.
    // Until then, another faction can still be the faster route.
    gangAugs = new Set(gangFaction ? (factionAugs[gangFaction] ?? [])
      .filter(aug => (factionRep[gangFaction] ?? 0) >= (augRepReqs[aug] ?? Infinity)) : []);

    const desiredStats = desiredStatOverrides.length ? desiredStatOverrides : getDefaultDesiredStats({
      bitNode: resetInfo.currentNode,
      ownedAugCount: ownedAugs.length,
      factions: playerInfo.factions,
      lastAugReset: resetInfo.lastAugReset,
    });
    desiredAugSet = buildDesiredAugSet({
      augmentationNames, augStats, augPrereqs, ownedAugs, desiredStats,
      desiredAugs: namedDesiredAugs, priorityAugs
    });
    augUtility = buildAugUtilityMap({
      desiredAugSet, augStats, augPrereqs, desiredAugs: namedDesiredAugs, priorityAugs
    });
    refreshDonationFactions();

    await joinUsefulInvitations();
  }

  async function measureRepGainRate(sample) {
    const initial = await sample();
    let next = initial;
    const started = Date.now();
    while (next === initial && Date.now() - started < 1200) {
      await ns.sleep(50);
      next = await sample();
    }
    const elapsed = Date.now() - started;
    return elapsed > 0 && Number.isFinite(next - initial) ? Math.max(0, (next - initial) * 1000 / elapsed) : 0;
  }

  async function detectBestFactionWork(faction) {
    let workTypes = await singRun(ns, "getFactionWorkTypes", faction);
    if (!Array.isArray(workTypes) || workTypes.length === 0) workTypes = Object.values(ns.enums.FactionWorkType);
    let bestWork = null;
    let bestRate = 0;
    for (const work of workTypes) {
      if (!isTrue(await singRun(ns, "workForFaction", faction, work, !installedAugs.includes("Neuroreceptor Management Implant")))) continue;
      const rate = await measureRepGainRate(async () => Number(await singRun(ns, "getFactionRep", faction)) || 0);
      if (rate > bestRate) {
        bestRate = rate;
        bestWork = work;
      }
    }
    if (bestWork) {
      workCache[faction] = bestWork;
      repRateCache[faction] = bestRate;
      repRateMeasuredAt[faction] = Date.now();
    }
    return bestWork;
  }

  async function ensureFactionRepRates() {
    for (const faction of playerInfo.factions) {
      if (faction === gangFaction || donationFactions.has(faction) || usefulAugs(faction).length === 0) continue;
      if (repRateCache[faction] > 0 && Date.now() - (repRateMeasuredAt[faction] ?? 0) < RATE_CACHE_TIME) continue;
      await detectBestFactionWork(faction);
    }
  }

  async function travelToCity(city) {
    if (playerInfo.city === city) return true;
    if (Date.now() - lastTravel < 60_000) return false;
    if (!isTrue(await singRun(ns, "travelToCity", city))) return false;
    lastTravel = Date.now();
    playerInfo.city = city;
    return true;
  }

  async function trainCombatStat(stat) {
    if (!(await travelToCity(ns.enums.CityName.Sector12))) return false;
    return isTrue(await singRun(ns, "gymWorkout", "Powerhouse Gym", stat, !installedAugs.includes("Neuroreceptor Management Implant")));
  }

  async function doBestCrimePossible(fastOnly = fastCrimesOnly) {
    const crimes = ["Heist", "Assassination", "Homicide", "Mug"];
    const thresholds = [0.75, 0.9, 0.5, 0];
    const chances = await buildLibSing("getCrimeChance", crimes);
    let crime = "Mug";
    for (let i = 0; i < crimes.length; i++) {
      if (fastOnly && i < 2) continue;
      if ((Number(chances[crimes[i]]) || 0) >= thresholds[i]) { crime = crimes[i]; break; }
    }
    if (currentWork?.type === "CRIME" && currentWork?.crimeType === crime) return true;
    const result = await singRun(ns, "commitCrime", crime, !installedAugs.includes("Neuroreceptor Management Implant"));
    return typeof result === "number" && result >= 0;
  }

  async function canObtainFulcrumInvite() {
    const server = await getServ(ns, "fulcrumassets");
    if (!server || typeof server !== "object") return false;
    return server.backdoorInstalled || playerInfo.skills.hacking >= (server.requiredHackingSkill ?? Infinity);
  }

  async function companyFactionRepRequirement(faction) {
    const cached = companyFactionRepRequirementCache[faction];
    if (cached?.backdoored || (cached && Date.now() - cached.checkedAt < REPLAN_INTERVAL)) return cached.requirement;
    const serverName = COMPANY_SERVER_BY_FACTION[faction];
    const server = serverName ? await getServ(ns, serverName) : null;
    const backdoored = server?.backdoorInstalled === true;
    const requirement = COMPANY_FACTION_REP * (backdoored ? 0.75 : 1);
    companyFactionRepRequirementCache[faction] = { requirement, backdoored, checkedAt: Date.now() };
    return requirement;
  }

  async function workForCompanyFactionInvite(faction) {
    if (faction === "Fulcrum Secret Technologies" && !(await canObtainFulcrumInvite())) return false;
    const company = COMPANY_NAME_BY_FACTION[faction] ?? faction;
    const companyRep = Number(await singRun(ns, "getCompanyRep", company)) || 0;
    const requiredRep = await companyFactionRepRequirement(faction);
    if (companyRep >= requiredRep) return false;
    const focus = !installedAugs.includes("Neuroreceptor Management Implant");
    const cachedField = companyFieldCache[company];
    const cachedRateIsFresh = companyRepRateCache[company] > 0 &&
      Date.now() - (companyRepRateMeasuredAt[company] ?? 0) < RATE_CACHE_TIME;
    if (cachedField && cachedRateIsFresh && await applyForCompanyField(company, cachedField))
      return isTrue(await singRun(ns, "workForCompany", company, focus));

    const positions = asArray(await singRun(ns, "getCompanyPositions", company));
    const hack = playerInfo.skills.hacking;
    const charisma = playerInfo.skills.charisma;
    const combatAverage = COMBAT_STATS.reduce((sum, stat) => sum + playerInfo.skills[stat], 0) / COMBAT_STATS.length;
    const fieldScore = field => {
      switch (field) {
        case ns.enums.JobField.software: return hack * 3;
        case ns.enums.JobField.it: return hack * 2.5;
        case ns.enums.JobField.business: return charisma * 3;
        case ns.enums.JobField.security: return combatAverage * 3;
        default: return 0;
      }
    };
    const eligibleFields = new Set();
    for (const position of positions) {
      const info = await singRun(ns, "getCompanyPositionInfo", company, position);
      if (!info || typeof info !== "object" || companyRep < (info.requiredReputation ?? 0)) continue;
      const lacksSkill = Object.entries(info.requiredSkills ?? {})
        .some(([skill, requirement]) => (playerInfo.skills?.[skill] ?? 0) < (requirement ?? 0));
      if (!lacksSkill) eligibleFields.add(info.field);
    }

    let bestField = null;
    let bestRate = 0;
    for (const field of eligibleFields) {
      if (!await applyForCompanyField(company, field) ||
        !isTrue(await singRun(ns, "workForCompany", company, focus))) continue;
      const rate = await measureRepGainRate(async () => Number(await singRun(ns, "getCompanyRep", company)) || 0);
      if (rate > bestRate || (rate === bestRate && fieldScore(field) > fieldScore(bestField))) {
        bestRate = rate;
        bestField = field;
      }
    }
    if (!bestField && eligibleFields.size)
      bestField = [...eligibleFields].sort((a, b) => fieldScore(b) - fieldScore(a))[0];
    if (!bestField || !await applyForCompanyField(company, bestField)) return false;
    companyFieldCache[company] = bestField;
    if (bestRate > 0) {
      companyRepRateCache[company] = bestRate;
      companyRepRateMeasuredAt[company] = Date.now();
    }
    return isTrue(await singRun(ns, "workForCompany", company, focus));
  }

  function hasLateGameAugRequirement(faction) {
    const required = faction === "Daedalus" ? (bitNodeMults.DaedalusAugsRequirement ?? 30) : REQUIRED_AUGS[faction];
    return !required || installedAugs.length >= required;
  }

  async function workForFactionInvite(faction) {
    if (pendingInvites.includes(faction)) return await joinFaction(faction);
    if (COMPANY_FACTIONS.includes(faction)) return await workForCompanyFactionInvite(faction);
    if (BACKDOOR_FACTIONS.has(faction) || PASSIVE_INVITE_FACTIONS.has(faction)) return false;
    if (!hasLateGameAugRequirement(faction)) return false;

    let combatRequirement = REQUIRED_COMBAT[faction] ?? 0;
    if (faction === "Daedalus" && playerInfo.skills.hacking >= (REQUIRED_HACK.Daedalus ?? 2500)) combatRequirement = 0;
    if (combatRequirement && !canTrainCombatInReasonableTime(combatRequirement)) {
      if (!skippedCombatFactions.has(faction)) {
        skippedCombatFactions.add(faction);
        log(ns, `Skipping ${faction}: combat ${combatRequirement} is not practical at current multipliers.`, false, "info");
      }
      return false;
    }
    if (combatRequirement) {
      const deficient = COMBAT_STATS.filter(stat => playerInfo.skills[stat] < combatRequirement);
      if (deficient.length === COMBAT_STATS.length) return await doBestCrimePossible();
      if (deficient.length) {
        const short = { strength: "str", defense: "def", dexterity: "dex", agility: "agi" };
        return await trainCombatStat(short[deficient[0]]);
      }
    }

    if (-ns.heart.break() < (REQUIRED_KARMA[faction] ?? 0) || playerInfo.numPeopleKilled < (REQUIRED_KILLS[faction] ?? 0))
      return await doBestCrimePossible(true);
    if (playerInfo.money < (REQUIRED_MONEY[faction] ?? 0)) return false;
    if (faction !== "Daedalus" && playerInfo.skills.hacking < (REQUIRED_HACK[faction] ?? 0)) return false;

    if (["Tian Di Hui", "Tetrads", "The Dark Army"].includes(faction)) return await travelToCity("Chongqing");
    if (faction === "The Syndicate") return await travelToCity("Sector-12");
    if (CITY_FACTIONS.has(faction)) return await travelToCity(faction);
    return false;
  }

  async function estimateInviteEfforts(candidateFactions, estimatedWorkRate) {
    const efforts = {};
    for (const faction of candidateFactions) {
      if (pendingInvites.includes(faction)) { efforts[faction] = 1; continue; }
      if (PASSIVE_INVITE_FACTIONS.has(faction) || !hasLateGameAugRequirement(faction)) {
        efforts[faction] = Infinity;
        continue;
      }
      if (playerInfo.money < (REQUIRED_MONEY[faction] ?? 0)) { efforts[faction] = Infinity; continue; }
      if (faction !== "Daedalus" && playerInfo.skills.hacking < (REQUIRED_HACK[faction] ?? 0)) {
        efforts[faction] = Infinity;
        continue;
      }
      if (COMPANY_FACTIONS.includes(faction)) {
        if (playerInfo.skills.hacking < 225 ||
          (faction === "Fulcrum Secret Technologies" && !(await canObtainFulcrumInvite()))) {
          efforts[faction] = Infinity;
          continue;
        }
        const company = COMPANY_NAME_BY_FACTION[faction] ?? faction;
        const rep = Number(await singRun(ns, "getCompanyRep", company)) || 0;
        const requiredRep = await companyFactionRepRequirement(faction);
        const companyRate = companyRepRateCache[company] > 0 &&
          Date.now() - (companyRepRateMeasuredAt[company] ?? 0) < RATE_CACHE_TIME
          ? companyRepRateCache[company] : estimatedWorkRate;
        efforts[faction] = 60 + Math.max(0, requiredRep - rep) / Math.max(companyRate, 0.1);
        continue;
      }
      if (BACKDOOR_FACTIONS.has(faction)) {
        efforts[faction] = Infinity;
        continue;
      }
      let combatRequirement = REQUIRED_COMBAT[faction] ?? 0;
      if (faction === "Daedalus" && playerInfo.skills.hacking >= (REQUIRED_HACK.Daedalus ?? 2500)) combatRequirement = 0;
      if (combatRequirement && !canTrainCombatInReasonableTime(combatRequirement)) {
        efforts[faction] = Infinity;
        continue;
      }
      const combatGap = COMBAT_STATS.reduce((sum, stat) => sum + Math.max(0, combatRequirement - playerInfo.skills[stat]), 0);
      const combatHeuristic = median(COMBAT_STATS.map(combatTrainingHeuristic), 1);
      const karmaGap = Math.max(0, (REQUIRED_KARMA[faction] ?? 0) + ns.heart.break());
      const killGap = Math.max(0, (REQUIRED_KILLS[faction] ?? 0) - playerInfo.numPeopleKilled);
      efforts[faction] = 30 + combatGap * 20 / Math.max(combatHeuristic, 0.1) + karmaGap * 3 + killGap * 5;
    }
    return efforts;
  }

  function planDonationUnlock() {
    if (!(favorToDonate > 0)) return null;
    let best = null;
    for (const faction of playerInfo.factions) {
      if (faction === gangFaction || donationFactions.has(faction)) continue;
      const remainingAugs = usefulAugs(faction);
      if (remainingAugs.length === 0 || !(repRateCache[faction] > 0)) continue;
      const expectedFavor = addRepToFavor(factionFavor[faction] ?? 0, factionRep[faction] ?? 0);
      if (expectedFavor < favorToDonate * 0.9 || expectedFavor >= favorToDonate) continue;
      const targetRep = Math.max(0, favorToRep(favorToDonate) - favorToRep(factionFavor[faction] ?? 0));
      const eta = Math.max(0, targetRep - (factionRep[faction] ?? 0)) / repRateCache[faction];
      const utility = remainingAugs.reduce((sum, aug) => sum + (augUtility[aug] ?? 0.25), 0) * 0.2;
      const score = utility / Math.max(eta, 30);
      const priorityCount = remainingAugs.filter(aug => priorityAugs.includes(aug)).length;
      const candidate = { kind: "donation-unlock", faction, targetRep, eta, utility, score, unlockedAugs: remainingAugs, priorityCount };
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }

  async function isBladeburnerInterruption() {
    if (!(7 in sourceFiles) || installedAugs.includes("The Blade's Simulacrum")) return false;
    if (!isTrue(await bbRun(ns, "inBladeburner"))) return false;
    if (currentWork?.type) await singRun(ns, "stopAction");
    return true;
  }

  function logPlan(plan) {
    if (!plan) return;
    const signature = `${plan.kind}:${plan.faction}:${Math.round(plan.targetRep ?? 0)}:${plan.unlockedAugs?.join("|")}`;
    if (signature === lastPlan) return;
    lastPlan = signature;
    log(ns, `Selected ${plan.kind} route via ${plan.faction}: target ${Math.round(plan.targetRep ?? 0).toLocaleString()} rep, ` +
      `ETA ${formatDuration((plan.eta ?? 0) * 1000)}, unlocks [${(plan.unlockedAugs ?? []).join(", ")}].`, false, "info");
  }

  async function executeRepPlan(plan) {
    const work = workCache[plan.faction] ?? await detectBestFactionWork(plan.faction);
    if (!work) return false;
    currentWork = (await singRun(ns, "getCurrentWork")) ?? {};
    if (currentWork.type === "FACTION" && currentWork.factionName === plan.faction && currentWork.factionWorkType === work) return true;
    return isTrue(await singRun(ns, "workForFaction", plan.faction, work, !installedAugs.includes("Neuroreceptor Management Implant")));
  }

  async function workTowardGang() {
    const hasGangFaction = GANG_FACTIONS.some(faction => playerInfo.factions.includes(faction));
    if (!hasGangFaction && await workForFactionInvite("Slum Snakes")) return true;
    if (ns.heart.break() > GANG_KARMA_REQUIREMENT || !hasGangFaction) return await doBestCrimePossible(true);
    if (currentWork?.type === "CRIME") await singRun(ns, "stopAction");
    if (!waitingForGangLogged) {
      waitingForGangLogged = true;
      log(ns, "Gang karma requirement reached; waiting for gangs.js to create the gang.", false, "info");
    }
    return true;
  }

  async function collectCorporateInvites() {
    // Corporate preparation owns the player action. Do not leave a prior crime/faction task running
    // when company work is temporarily unavailable or an API call needs to be retried.
    if (currentWork?.type && currentWork.type !== "COMPANY") {
      await singRun(ns, "stopAction");
      currentWork = {};
    }
    const missing = COMPANY_FACTIONS.filter(faction => !playerInfo.factions.includes(faction));
    if (missing.length === 0) {
      if (currentWork?.type === "COMPANY") await singRun(ns, "stopAction");
      if (lastPlan !== "company-invites:complete") {
        lastPlan = "company-invites:complete";
        log(ns, "All corporate faction invitations are secured for intelligence farming.", false, "success");
      }
      activePlan = null;
      requestedReplanDelay = INVITE_REPLAN_INTERVAL;
      return { handled: true, completed: true };
    }

    const estimatedWorkRate = median([
      ...Object.values(companyRepRateCache),
      ...Object.values(repRateCache),
    ], 1);
    const efforts = await estimateInviteEfforts(missing, estimatedWorkRate);
    const reachable = missing.filter(faction => Number.isFinite(efforts[faction]))
      .sort((left, right) => efforts[left] - efforts[right] ||
        COMPANY_FACTIONS.indexOf(left) - COMPANY_FACTIONS.indexOf(right));
    requestedReplanDelay = INVITE_REPLAN_INTERVAL;

    if (reachable.length === 0) {
      const signature = `company-invites:waiting:${missing.join("|")}`;
      if (lastPlan !== signature) {
        lastPlan = signature;
        log(ns, `Waiting for hacking levels, job qualifications, or the Fulcrum backdoor before ` +
          `continuing the corporate invitation farm. Missing: [${missing.join(", ")}].`, false, "info");
      }
      return { handled: true, completed: false };
    }

    const faction = reachable[0];
    const company = COMPANY_NAME_BY_FACTION[faction] ?? faction;
    const currentRep = Number(await singRun(ns, "getCompanyRep", company)) || 0;
    const targetRep = await companyFactionRepRequirement(faction);
    const signature = `company-invite:${faction}:${Math.round(targetRep)}`;
    if (lastPlan !== signature) {
      lastPlan = signature;
      log(ns, `Collecting corporate invite ${faction}: ${Math.round(currentRep).toLocaleString()}/` +
        `${Math.round(targetRep).toLocaleString()} company rep, ETA ` +
        `${formatDuration(Math.max(0, efforts[faction]) * 1000)}.`, false, "info");
    }

    activePlan = {
      kind: "company-invite",
      faction,
      targetRep,
      eta: efforts[faction],
      utility: 0,
      score: Number.POSITIVE_INFINITY,
      unlockedAugs: [],
      priorityCount: 1,
    };

    // Invitation generation can lag the rep threshold by a planner cycle. Hold completed company work instead
    // of letting a normal route overwrite it while checkFactionInvitations catches up.
    if (currentRep >= targetRep) {
      if (currentWork?.type === "COMPANY" && currentWork.companyName === company)
        await singRun(ns, "stopAction");
      return { handled: true, completed: false };
    }
    await workForFactionInvite(faction);
    return { handled: true, completed: false };
  }

  async function planAndAct() {
    activePlan = null;
    requestedReplanDelay = REPLAN_INTERVAL;
    await loadData();
    currentWork = (await singRun(ns, "getCurrentWork")) ?? {};
    if (!collectCashRoot && !collectAllCompanyInvites && await isBladeburnerInterruption()) return true;
    if (collectAllCompanyInvites) {
      await collectCorporateInvites();
      return true;
    }
    if (crimeFocused && !playerInGang) {
      requestedReplanDelay = INVITE_REPLAN_INTERVAL;
      return await workTowardGang();
    }

    await ensureFactionRepRates();
    const repRoute = planBestFactionRepRoute({
      joinedFactions: playerInfo.factions, factionAugs, factionRep, factionRepRate: repRateCache,
      donationFactions, gangFaction, gangAugs, desiredAugSet, augUtility, augRepReqs, augPrereqs,
      ownedAugs, priorityAugs
    });

    const activeCityGroup = joinedCityGroup();
    const inviteCandidates = ROUTE_ORDER.filter(faction => !playerInfo.factions.includes(faction) && factionUtility(faction) > 0 &&
      (!CITY_FACTIONS.has(faction) || !activeCityGroup || CITY_GROUPS[activeCityGroup]?.includes(faction)));
    const estimatedWorkRate = median(Object.values(repRateCache), 1);
    const inviteEffort = await estimateInviteEfforts(inviteCandidates, estimatedWorkRate);
    const donationAfterInviteFactions = inviteCandidates.filter(faction => !CANNOT_DONATE.has(faction) &&
      (favorToDonate === 0 || (factionFavor[faction] ?? 0) >= favorToDonate));
    let inviteRoutes = rankFactionInviteRoutes({
      candidateFactions: inviteCandidates, factionAugs, desiredAugSet, ownedAugs, augRepReqs, augUtility,
      joinedFactions: playerInfo.factions, factionRep, donationFactions, gangAugs, inviteEffort,
      donationAfterInviteFactions, estimatedFactionRepRate: estimatedWorkRate, staticOrder: ROUTE_ORDER,
      augPrereqs, priorityAugs
    });
    if (!activeCityGroup) {
      const groupUtilityByName = Object.fromEntries(Object.entries(CITY_GROUPS)
        .map(([group, groupFactions]) => [group, groupUtility(groupFactions)]));
      const selectedCityGroup = selectBestExclusiveFactionGroup({
        groups: CITY_GROUPS, routes: inviteRoutes, groupUtility: groupUtilityByName
      });
      if (selectedCityGroup)
        inviteRoutes = inviteRoutes.filter(route => !CITY_FACTIONS.has(route.faction) || CITY_GROUPS[selectedCityGroup].includes(route.faction));
      else
        inviteRoutes = inviteRoutes.filter(route => !CITY_FACTIONS.has(route.faction));
    }
    if (prioritizeInvites) for (const inviteRoute of inviteRoutes) inviteRoute.score *= 1.5;

    const donationRoute = planDonationUnlock();
    let route = chooseBestRoute(repRoute, inviteRoutes);
    route = chooseBestRoute(route, donationRoute);
    if (route) {
      activePlan = route;
      logPlan(route);
      if (route.kind === "faction-rep" || route.kind === "donation-unlock") return await executeRepPlan(route);
      if (route.kind === "faction-invite") {
        requestedReplanDelay = INVITE_REPLAN_INTERVAL;
        return await workForFactionInvite(route.faction);
      }
    }

    activePlan = null;
    requestedReplanDelay = 30_000;
    lastPlan = "fallback-crime";
    return await doBestCrimePossible();
  }

  let nextPlan = 0;
  let nextProgressCheck = 0;
  while (true) {
    try {
      const now = Date.now();
      if (activePlan && ["faction-rep", "donation-unlock"].includes(activePlan.kind) && now >= nextProgressCheck) {
        nextProgressCheck = now + PROGRESS_CHECK_INTERVAL;
        const rep = Number(await singRun(ns, "getFactionRep", activePlan.faction)) || 0;
        const work = (await singRun(ns, "getCurrentWork")) ?? {};
        if (rep >= activePlan.targetRep || work.type !== "FACTION" || work.factionName !== activePlan.faction) {
          activePlan = null;
          nextPlan = 0;
        }
      }
      if (now >= nextPlan) {
        await planAndAct();
        nextPlan = Date.now() + requestedReplanDelay;
        nextProgressCheck = Date.now() + PROGRESS_CHECK_INTERVAL;
      }
    } catch (error) {
      log(ns, `WARNING: work-for-faction2.js planner failed; retrying.\n${getErrorInfo(error)}`, false, "warning");
      nextPlan = Date.now() + 10_000;
    }
    await ns.sleep(LOOP_SLEEP);
  }
}
