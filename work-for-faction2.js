import {
  findPids, getActiveSourceFiles, getReset, gangRun, singRun, log, getBNMults, getPlayerInfo,
  getOwnedAugs, getErrorInfo, bbRun, addRepToFavor, favorToRep
} from './utils.js'

/** @param {NS} ns */
export async function main(ns) {
  const loopSleepInterval = 1000;
  const checkForNewPrioritiesInterval = 1 * 60 * 1000; //1 minute
  let mainLoopStart = 0;
  const strategySwapInterval = 10 * 60 * 1000; // 10 minutes
  let preferAugs = false;
  let nextStrategySwap = 0;
  const breakToMainLoop = () => Date.now() < mainLoopStart + checkForNewPrioritiesInterval;
  const getNumericFlag = (flag, fallback) => {
    const index = ns.args.indexOf(flag);
    if (index < 0 || index + 1 >= ns.args.length) return fallback;
    const value = Number(ns.args[index + 1]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const factions = ["Illuminati", "Daedalus", "The Covenant", "ECorp", "MegaCorp", "Bachman & Associates", "Blade Industries", "NWO", "Clarke Incorporated", "OmniTek Incorporated",
    "Four Sigma", "KuaiGong International", "Fulcrum Secret Technologies", "BitRunners", "The Black Hand", "NiteSec", "Aevum", "Chongqing", "Ishima", "New Tokyo", "Sector-12",
    "Volhaven", "Speakers for the Dead", "The Dark Army", "The Syndicate", "Silhouette", "Tetrads", "Slum Snakes", "Netburners", "Tian Di Hui", "CyberSec"];
  const requiredMoneyByFaction = {
    "Tian Di Hui": 1E6, "Sector-12": 15E6, "Chongqing": 20E6, "New Tokyo": 20E6, "Ishima": 30E6, "Aevum": 40E6, "Volhaven": 50E6,
    "Slum Snakes": 1E6, "Silhouette": 15E6, "The Syndicate": 10E6, "The Covenant": 75E9, "Daedalus": 100E9, "Illuminati": 150E9
  };
  const cannotWorkForFactions = ["Church of the Machine God", "Bladeburners", "Shadows of Anarchy"];
  //backdoors handled automatically by another script
  const requiredBackdoorByFaction = { "CyberSec": "CSEC", "NiteSec": "avmnite-02h", "The Black Hand": "I.I.I.I", "BitRunners": "run4theh111z", "Fulcrum Secret Technologies": "fulcrumassets" };
  const requiredHackByFaction = { "Tian Di Hui": 50, "Netburners": 80, "Speakers for the Dead": 100, "The Syndicate": 200, "The Dark Army": 300, "The Covenant": 850, "Daedalus": 2500, "Illuminati": 1500 };
  const requiredCombatByFaction = { "Slum Snakes": 30, "Tetrads": 75, "Speakers for the Dead": 300, "The Syndicate": 200, "The Dark Army": 300, "The Covenant": 850, "Daedalus": 1500, "Illuminati": 1200 };
  const requiredKarmaByFaction = { "Slum Snakes": 9, "Tetrads": 18, "Silhouette": 22, "Speakers for the Dead": 45, "The Dark Army": 45, "The Syndicate": 90 };
  const requiredKillsByFaction = { "Speakers for the Dead": 30, "The Dark Army": 5 };
  const companySpecificConfigs = [
    { name: "NWO", statModifier: 25 },
    { name: "MegaCorp", statModifier: 25 },
    { name: "Blade Industries", statModifier: 25 },
    { name: "Fulcrum Secret Technologies", companyName: "Fulcrum Technologies" }, // Special snowflake
    { name: "Silhouette", companyName: "TBD", repRequiredForFaction: 1.0e7 } // Hack: 3.2e6 should be enough rep to get the CTO position, but once
    // we hit this rep we might break out of the work loop before getting the final promotion, so we keep working until we get the faction invite.
  ]
  const jobs = [ // Job stat requirements for a company with a base stat modifier of +224 (modifier of all megacorps except the ones above which are 25 higher)
    {
      name: "IT",
      reqRep: [0e0, 7e3, 35e3, 175e3],
      reqHck: [225, 250, 275, 375], // [1, 26, 51, 151] + 224
      reqCha: [0e0, 0e0, 275, 300], // [0,  0, 51,  76] + 224
      repMult: [0.9, 1.1, 1.3, 1.4]
    },
    {
      name: "Software",
      reqRep: [0e0, 8e3, 4e4, 2e5, 4e5, 8e5, 16e5, 32e5],
      reqHck: [225, 275, 475, 625, 725, 725, 825, 975],   // [1, 51, 251, 401, 501, 501, 601, 751] + 224
      reqCha: [0e0, 0e0, 275, 375, 475, 475, 625, 725],   // [0,  0,  51, 151, 251, 251, 401, 501] + 224
      repMult: [0.9, 1.1, 1.3, 1.5, 1.6, 1.6, 1.75, 2.0]
    },
  ]

  // These factions should ideally be completed in this order
  const preferredEarlyFactionOrder = [
    "Netburners", // Improve hash income, which is useful or critical for almost all BNs
    "Tian Di Hui", "Aevum", // These give all the company_rep and faction_rep bonuses early game
    //"Daedalus", // Once we have all faction_rep boosting augs, there's no reason not to work towards Daedalus as soon as it's available/feasible so we can buy Red Pill
    "CyberSec", /* Quick, and NightSec aug depends on an aug from here */ "NiteSec", "Tetrads", // Cha augs to speed up earning company promotions
    "Bachman & Associates", // Boost company/faction rep for future augs
    "BitRunners", // Fast source of some unique hack augs
    "Fulcrum Secret Technologies", // Will be removed if hack level is too low to backdoor their server
    "ECorp", // More cmp_rep augs, and some strong hack ones as well
    "The Black Hand", // Fastest sources of hacking augs after the above companies
    "The Dark Army", // Unique cmp_rep aug TODO: Can it sensibly be gotten before megacorps? Requires 300 all combat stats.
    "Clarke Incorporated", "OmniTek Incorporated", "NWO", // More hack augs from companies
    "Chongqing", // Unique Source of big 1.4x hack exp boost (Can only join if not in e.g. Aevum as well)
  ];
  // This is an approximate order of most useful augmentations left to offer, assuming all early-game factions have been cleaned out
  const preferredCompanyFactionOrder = [
    "Bachman & Associates", // Augs boost company_rep by 1.65, faction_rep by 1.50. Lower rep-requirements than ECorp augs, so should be a priority to speed up future resets
    "ECorp", // Offers 2.26 multi worth of company_rep and major hacking stat boosts (1.51 hack / 1.54 exp / 1.43 success / 3.0 grow / 2.8 money / 1.25 speed), but high rep reqs
    "Clarke Incorporated", // Biggest boost to hacking after above factions (1.38)
    "OmniTek Incorporated", // Next big boost to hacking after above factions (1.20) (NWO is bigger, but this has lower Cha reqs.)
    "NWO", // Biggest boost to hacking after above factions (1.26)
    "Blade Industries", // Mostly redundant after Ecorp - provides remaining hack-related augs (1.10 money, 1.03 speed)
    "MegaCorp", // Offers 1 unique aug boosting all physical traits by 1.35
    "KuaiGong International", // 1.40 to agility, defense, strength
    "Fulcrum Secret Technologies", // Big boosts to company_rep and hacking, but requires high hack level to backdoor their server, so might have to be left until later
    "Four Sigma", // No unique augs, but note that if accessible early on, Fulcrum + Four Sigma is a one-two punch to get all company rep boosting augs in just 2 factions
  ]
  // Order in which to focus on crime factions. Start with the hardest-to-earn invites, assume we will skip to next best if not achievable.
  const preferredCrimeFactionOrder = ["Slum Snakes", "Tetrads", "Speakers for the Dead", "The Syndicate", "The Dark Army", "The Covenant", "Daedalus", "Netburners", "NiteSec", "The Black Hand"];
  // Gang factions in order of ease-of-invite. If gangs are available, as we near 54K Karma to unlock gangs (as per --karma-threshold-for-gang-invites), we will attempt to get into any/all of these.
  const desiredGangFactions = ["Slum Snakes", "The Syndicate", "The Dark Army", "Speakers for the Dead"];
  const gangCreationFactions = ["Speakers for the Dead", "The Dark Army", "The Syndicate", "Tetrads", "Slum Snakes", "The Black Hand"];
  const gangKarmaRequirement = -54_000;
  const dictSourceFiles = await getActiveSourceFiles(ns, true); // Find out what source files the user has unlocked
  const resetInfo = await getReset(ns);
  const currentBitnode = resetInfo.currentNode;
  const bitNodeMults = await getBNMults(ns);
  const favorToDonate = bitNodeMults.FavorToDonateToFaction * 150;
  const daedAugReqs = bitNodeMults.DaedalusAugsRequirement;
  const crimeFocused = ns.args.includes('--crime-focus');
  const trainingStatPerMultiThreshold = getNumericFlag('--training-stat-per-multi-threshold', 100);
  const combatStats = ['strength', 'defense', 'dexterity', 'agility'];
  const combatLevelMultiplierKeys = {
    strength: 'StrengthLevelMultiplier',
    defense: 'DefenseLevelMultiplier',
    dexterity: 'DexterityLevelMultiplier',
    agility: 'AgilityLevelMultiplier'
  };
  //globally required vars
  let dictFactionFavors, mostExpensiveAugByFaction, mostExpensiveDesiredAugByFaction,
    completedFactions, softCompletedFactions, skipFactions, playerInGang, installedAugmentations,
    shouldFocus, currentWork, dictFactionAugs, dictAugRepReqs, dictAugStats, dictFactionRep, playerInfo;
  let dictFacWork = {}, dictFacRep = {};
  let lastTravel = 0, scope = 0;
  let waitingForGangLogged = false;
  const skippedCombatFactions = new Set();

  if ((await findPids(ns, ns.getScriptName())).length > 1) return; //don't run more than one instance
  if (!(4 in dictSourceFiles)) return; //we need signularity to run
  else if (dictSourceFiles[4] < 3)
    log(ns, `WARNING: Singularity functions are much more expensive with lower levels of SF4 (you have SF4.${dictSourceFiles[4]}). ` +
      `You may encounter RAM issues with and have to wait until you have more RAM available to run this script successfully.`, false, 'warning');
  async function buildLibSing(ns, fn, items) {
    let ret = {};
    for (const item of items) {
      const val = await singRun(ns, fn, item);
      ret[item] = val;
    }
    return ret;
  }
  async function loadStartupData(ns) {
    const invites = await singRun(ns, 'checkFactionInvitations');
    for (const invite of invites) {
      if (await singRun(ns, 'joinFaction', invite))
        log(ns, `Joined faction "${invite}"`, false, 'success');
    }
    playerInfo = await getPlayerInfo(ns);
    const allKnownFactions = factions.concat(playerInfo.factions.filter(f => !factions.includes(f)));
    dictFactionFavors = await buildLibSing(ns, 'getFactionFavor', allKnownFactions);
    dictFactionAugs = await buildLibSing(ns, 'getAugmentationsFromFaction', allKnownFactions);
    const augmentationNames = [...new Set(Object.values(dictFactionAugs).flat())];
    dictAugRepReqs = await buildLibSing(ns, 'getAugmentationRepReq', augmentationNames);
    dictAugStats = await buildLibSing(ns, 'getAugmentationStats', augmentationNames);
    dictFactionRep = await buildLibSing(ns, 'getFactionRep', allKnownFactions);
    const ownedAugmentations = await getOwnedAugs(ns, true);
    installedAugmentations = await getOwnedAugs(ns, false);
    shouldFocus = !installedAugmentations.includes("Neuroreceptor Management Implant");
    playerInGang = await gangRun(ns, 'inGang');

    mostExpensiveAugByFaction = Object.fromEntries(allKnownFactions.map(f => [f,
      dictFactionAugs[f]
        .filter(aug => !ownedAugmentations.includes(aug))
        .filter(aug => dictAugRepReqs[aug] > (dictFactionRep[f] || 0))
        .reduce((max, aug) => Math.max(max, dictAugRepReqs[aug]), -1)
    ]));
    mostExpensiveDesiredAugByFaction = Object.fromEntries(allKnownFactions.map(f => [f,
      dictFactionAugs[f]
        .filter(aug => !ownedAugmentations.includes(aug))
        .filter(aug => dictAugRepReqs[aug] > (dictFactionRep[f] || 0))
        .filter(aug => Object.keys(dictAugStats[aug]).length == 0)
        .reduce((max, aug) => Math.max(max, dictAugRepReqs[aug]), -1)
    ]));
    completedFactions = allKnownFactions.filter(fac => mostExpensiveAugByFaction[fac] == -1);
    softCompletedFactions = allKnownFactions.filter(fac => mostExpensiveDesiredAugByFaction[fac] == -1 && !completedFactions.includes(fac));
    skipFactions = cannotWorkForFactions.concat(completedFactions);
  }
  /** Stop whatever focus work we're currently doing
  * @param {NS} ns */
  async function stop(ns) { await singRun(ns, 'stopAction'); }
  async function isValidInterruption(ns) {
    const hasSimulacrum = installedAugmentations?.includes("The Blade's Simulacrum")
    if (7 in dictSourceFiles && !hasSimulacrum) {
      const playerInBB = await bbRun(ns, 'inBladeburner');
      if (currentWork.type && playerInBB) await stop(ns);
      mainLoopStart = 0;
      return true;
    }
    return false;
  }
  /** Measure our rep gain rate (per second)
* @param {NS} ns
 * @param {() => Promise<number>} fnSampleReputation - An async function that samples the reputation at a current point in time */
  async function measureRepGainRate(ns, fnSampleReputation) {
    //return (await getPlayerInfo(ns)).workRepGainRate;
    // The game no longer provides the rep gain rate for a given work type, so we must measure it
    const initialReputation = await fnSampleReputation();
    let nextTickReputation;
    let start = Date.now();
    while (initialReputation == (nextTickReputation = await fnSampleReputation()) && Date.now() - start < 450)
      await ns.sleep(50);
    return (nextTickReputation - initialReputation) * 5; // Assume this rep gain was for a 200 tick
  }
  /** Measure our faction rep gain rate (per second)
 * @param {NS} ns */
  async function measureFactionRepGainRate(ns, factionName) {
    return await measureRepGainRate(ns, async () => await singRun(ns, 'getFactionRep', factionName));
  }
  /** Try all work types and see what gives the best rep gain with this faction!
 * @param {NS} ns
 * @param {string} factionName The name of the faction to work for
 * @returns {Promise<FactionWorkType>} The faction work type measured to give the best reputation gain rate */
  async function detectBestFactionWork(ns, factionName) {
    let bestWork, bestRepRate = -1;
    for (const work of Object.values(ns.enums.FactionWorkType)) {
      if (!(await singRun(ns, 'workForFaction', factionName, work, shouldFocus))) {
        //ns.print(`"${factionName}": "${work}"" work not supported.`);
        continue; // This type of faction work must not be supported
      }
      const currentRepGainRate = await measureFactionRepGainRate(ns, factionName);
      //ns.print(`"${factionName}" work ${work} provides ${formatNumberShort(currentRepGainRate)} rep rate`);
      if (currentRepGainRate > bestRepRate) {
        bestRepRate = currentRepGainRate;
        bestWork = work;
        dictFacWork[factionName] = work;
        dictFacRep[factionName] = currentRepGainRate;
      }
    }
    if (bestWork === undefined)
      return 'hacking';
    return bestWork;
  }
  async function travel2City(ns, cityName) {
    if (Date.now() - lastTravel < 60000) return false; //don't jump around and blow money
    if (playerInfo.city == cityName) {
      return true;
    }
    if (await singRun(ns, 'travelToCity', cityName)) {
      lastTravel = Date.now();
      return true
    }
    return false;
  }
  async function trainCombatStat(ns, stat) {
    //log(ns, `Traveling to ${ns.enums.CityName.Sector12}`, true)
    if (!(await travel2City(ns, ns.enums.CityName.Sector12))) return false
    //log(ns, `I work out!`, true)
    await singRun(ns, "gymWorkout", "Powerhouse Gym", stat, shouldFocus);
    return true;
  }
  async function doBestCrimePossible(ns, fastCrimes = false) {
    const bestCrimesByDifficulty = ["Heist", "Assassination", "Homicide", "Mug"];
    const chanceThresholds = [1.0, 1.0, 0.5, 0];

    const crimeChances = await buildLibSing(ns, 'getCrimeChance', bestCrimesByDifficulty);

    let crime = "Mug";
    for (let i = 0; i < bestCrimesByDifficulty.length; i++) {
      const c = bestCrimesByDifficulty[i];
      if ((crimeChances[c] ?? 0) > chanceThresholds[i] && (i > 1 || !fastCrimes)) { crime = c; break; }
    }

    if (currentWork?.type !== "CRIME" || currentWork?.crimeType !== crime) {
      return await singRun(ns, 'commitCrime', crime, shouldFocus);
    }
  }
  function getRepGapForAug(faction, aug) {
    const repReq = dictAugRepReqs?.[aug] ?? Infinity;
    const repHave = dictFactionRep?.[faction] ?? 0;
    return repReq - repHave;
  }
  async function workTowardClosestAug(ns, ownedAugs) {
    const playerInfo = await getPlayerInfo(ns);
    const myFactions = playerInfo.factions ?? [];

    let best = null; // { faction, aug, repGap, eta }

    for (const fac of myFactions) {
      const work = dictFacWork[fac] ?? await detectBestFactionWork(ns, fac);
      if (!(await singRun(ns, 'workForFaction', fac, work, shouldFocus))) {
        continue; // This type of faction work must not be supported
      }
      const currentRepGainRate = dictFacRep[fac] ?? 1;
      const augs = dictFactionAugs?.[fac] ?? [];
      for (const aug of augs) {
        if (ownedAugs.includes(aug)) continue;
        if (aug === "NeuroFlux Governor") continue; //ignore these

        const repGap = getRepGapForAug(fac, aug);
        if (repGap <= 0) continue; // already have enough rep to buy

        const eta = repGap / Math.max(currentRepGainRate, Number.EPSILON);
        if (!best || eta < best.eta) best = { faction: fac, aug, repGap, eta };
      }
    }

    if (!best) return false;

    // If we’re already working for that faction, keep going
    if (currentWork?.type === "FACTION" && currentWork?.factionName === best.faction) return true;
    const work = dictFacWork[best.faction] ?? await detectBestFactionWork(ns, best.faction);
    await singRun(ns, 'workForFaction', best.faction, work, shouldFocus);
    return true;
  }
  /** @param {NS} ns */
  async function workForCompanyFactionInvite(ns, faction) {
    faction = (faction === "Fulcrum Secret Technologies") ? "Fulcrum Technologies" : faction;
    const positions = await singRun(ns, 'getCompanyPositions', faction);
    const rep = await singRun(ns, 'getCompanyRep', faction);
    //log(ns, `${faction} ${JSON.stringify(positions)} ${rep}`, true); 
    //example output of log 
    //Bachman & Associates ["Software Engineering Intern","Junior Software Engineer","Senior Software Engineer","Lead Software Developer","Head of Software","Head of Engineering","Vice President of Technology","Chief Technology Officer","IT Intern","IT Analyst","IT Manager","Systems Administrator","Security Engineer","Network Engineer","Network Administrator","Business Intern","Business Analyst","Business Manager","Operations Manager","Chief Financial Officer","Chief Executive Officer","Security Guard","Security Officer","Security Supervisor","Head of Security"] 0 
    // Rank fields based on your stats 
    const hack = playerInfo.skills.hacking;
    const cha = playerInfo.skills.charisma;
    const combatAvg = (playerInfo.skills.strength + playerInfo.skills.defense + playerInfo.skills.dexterity + playerInfo.skills.agility) / 4;
    const fieldScore = (f) => {
      switch (f) {
        case ns.enums.JobField.software: return hack * 3;
        case ns.enums.JobField.it: return hack * 2.5;
        case ns.enums.JobField.business: return cha * 3;
        case ns.enums.JobField.security: return combatAvg * 3;
        default: return 0;
      }
    };
    let bestposition;
    let bestRating = -1;
    for (const position of positions) {
      const positionInfo = await singRun(ns, 'getCompanyPositionInfo', faction, position);
      //log(ns, `${faction} ${JSON.stringify(positionInfo)}`, true); 
      //example output of log 
      //Bachman & Associates {"name":"Software Engineering Intern","field":"Software","nextPosition":"Junior Software Engineer","salary":85.8,"requiredReputation":0,"requiredSkills":{"hacking":225,"strength":0,"defense":0,"dexterity":0,"agility":0,"charisma":0,"intelligence":0}} 

      //see if we have the rep for the position and all required skills 
      if (rep < positionInfo.requiredReputation) continue;
      const lacksSkill = Object.entries(positionInfo.requiredSkills ?? {})
        .some(([skill, req]) => (playerInfo.skills?.[skill] ?? 0) < (req ?? 0));
      if (lacksSkill) continue;
      const score = fieldScore(positionInfo.field);
      if (bestRating < score) {
        bestRating = score;
        bestposition = positionInfo.field;
      }
    }
    if (bestposition) {
      //apply to best position? 
      //log(ns, `${faction} ${bestposition}`, true); 
      if (await singRun(ns, 'applyToCompany', faction, bestposition)) {
        if (await singRun(ns, 'workForCompany', faction, shouldFocus)) {
          //log(ns, `Work for company ${faction}`, true);
          return true;
        } else {
          //log(ns, `Unable to work for company ${faction}`, true);
          return false;
        }
      } else {
        //log(ns, `Unable to apply for company ${faction}`, true);
      }
    }
    return false;
  }
  function combatTrainingHeuristic(stat) {
    return Math.sqrt(
      (playerInfo.mults?.[stat] ?? 1) *
      (playerInfo.mults?.[`${stat}_exp`] ?? 1) *
      (bitNodeMults[combatLevelMultiplierKeys[stat]] ?? 1) *
      (bitNodeMults.CrimeExpGain ?? 1)
    );
  }
  function canTrainCombatInReasonableTime(requirement) {
    if (crimeFocused) return true;
    const requiredHeuristic = requirement / trainingStatPerMultiThreshold;
    return combatStats
      .filter(stat => playerInfo.skills[stat] < requirement)
      .every(stat => combatTrainingHeuristic(stat) >= requiredHeuristic);
  }
  /** @param {NS} ns */
  async function workForFactionInvite(ns, faction) {
    if (preferredCompanyFactionOrder.includes(faction)) return workForCompanyFactionInvite(ns, faction);
    const combatReq = requiredCombatByFaction[faction] || 0;
    //log(ns, `${faction} requires combat stats of ${combatReq} of ${JSON.stringify(playerInfo.skills)}`, true);
    if (combatReq && !canTrainCombatInReasonableTime(combatReq)) {
      if (!skippedCombatFactions.has(faction)) {
        skippedCombatFactions.add(faction);
        const weakestHeuristic = Math.min(...combatStats
          .filter(stat => playerInfo.skills[stat] < combatReq)
          .map(combatTrainingHeuristic));
        log(ns, `Skipping ${faction}: combat ${combatReq} is not practical at the current multipliers ` +
          `(${weakestHeuristic.toFixed(2)} < ${(combatReq / trainingStatPerMultiThreshold).toFixed(2)}).`, false, 'info');
      }
      return false;
    }
    if (combatReq) {
      if (playerInfo.skills.strength < combatReq
        && playerInfo.skills.agility < combatReq
        && playerInfo.skills.defense < combatReq
        && playerInfo.skills.dexterity < combatReq) return await doBestCrimePossible(ns); //everything needs to be trained.
      else {
        if (playerInfo.skills.strength < combatReq) {
          log(ns, `Training str ${playerInfo.skills.strength} < ${combatReq}`, true)
          return await trainCombatStat(ns, 'str');
        } else if (playerInfo.skills.agility < combatReq) {
          log(ns, `Training agi ${playerInfo.skills.agility} < ${combatReq}`, true)
          return await trainCombatStat(ns, 'agi');
        } else if (playerInfo.skills.defense < combatReq) {
          log(ns, `Training def ${playerInfo.skills.defense} < ${combatReq}`, true)
          return await trainCombatStat(ns, 'def');
        } else if (playerInfo.skills.dexterity < combatReq) {
          log(ns, `Training dex ${playerInfo.skills.dexterity} < ${combatReq}`, true)
          return await trainCombatStat(ns, 'dex');
        }
      }
    }
    //if we need karma
    if (-ns.heart.break() < (requiredKarmaByFaction[faction] || 0)
      || playerInfo.numPeopleKilled < (requiredKillsByFaction[faction] || 0)) return await doBestCrimePossible(ns, true);
    //handle kills needed
    if (playerInfo.money < requiredMoneyByFaction[faction] || 0) return false; //we get money passively, ignore
    if (playerInfo.skills.hacking < requiredHackByFaction[faction] || 0) return false; //get hacking passively for now
    //if (requiredBackdoorByFaction.includes(faction)) return false; //we will need a backdoor for this.
    if (['Tian Di Hui', 'Tetrads', 'The Dark Army'].includes(faction))
      return await travel2City(ns, 'Chongqing');
    else if (['The Syndicate'].includes(faction))
      return await travel2City(ns, 'Sector-12');
    else if (["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"].includes(faction))
      return await travel2City(ns, faction);
  }
  async function workTowardGang(ns) {
    const hasGangFaction = gangCreationFactions.some(faction => playerInfo.factions.includes(faction));

    if (!hasGangFaction) {
      const targetFaction = desiredGangFactions[0]; // Slum Snakes is the cheapest reliable gang faction.
      if (await workForFactionInvite(ns, targetFaction)) {
        log(ns, `Working toward a ${targetFaction} invite before finishing the gang karma grind.`, false, 'info');
        return true;
      }
    }

    if (ns.heart.break() > gangKarmaRequirement || !hasGangFaction)
      return await doBestCrimePossible(ns, true);

    if (currentWork?.type === "CRIME") await stop(ns);
    if (!waitingForGangLogged) {
      waitingForGangLogged = true;
      log(ns, `Gang karma requirement reached; waiting for gangs.js to create a gang.`, false, 'info');
    }
    return true;
  }
  async function mainLoop(ns) {
    //we run this loop perioidically and check to see if enough time has elapsed to evaluate a new task in priority order.
    if (breakToMainLoop()) return; //break if not enough time has elapsed
    await loadStartupData(ns); //load data needed to make decisions
    if (await isValidInterruption(ns)) return; //see if bladeburner has taken over
    mainLoopStart = Date.now(); //reset the timer flag
    currentWork = (await singRun(ns, 'getCurrentWork')) ?? {};

    // Try to get a faction to 150 favor to unlock donations if they are above 90% favor at next reset. 
    // Exception is BN8 which is unlocked by default (x0 multiplier).
    if (favorToDonate) { //will be a number like 150 or 0 if we are BN 8
      for (const faction in dictFactionFavors) {
        //need to add in current rep...
        const expectedFavor = addRepToFavor(dictFactionFavors[faction], dictFactionRep[faction]);
        if (expectedFavor > favorToDonate * .9 && expectedFavor < favorToDonate) {
          if (currentWork.factionName != faction) {
            const workType = dictFacWork[faction] ?? await detectBestFactionWork(ns, faction);
            if (currentWork.factionWorkType != workType) {
              if (await singRun(ns, 'workForFaction', faction, workType, shouldFocus)) {
                return true;
              } else {
                //log(ns, `Unable to start work for favor on faction ${faction}`, true)
              }
            }
          }
        }
      }
    }
    // Work to gang factions if gangs unlocked. If not created, do crimes till we can start a gang.
    if (crimeFocused && !playerInGang) return await workTowardGang(ns);
    updateStrategyMode();

    const startedPrimary = preferAugs
      ? await tryUnlockAugs(ns)
      : await tryUnlockFactions(ns);

    if (startedPrimary) return true;

    const startedFallback = preferAugs
      ? await tryUnlockFactions(ns)
      : await tryUnlockAugs(ns);

    if (startedFallback) return true;

    // When in doubt, do crimes.
    return await doBestCrimePossible(ns);
  }
  async function tryUnlockAugs(ns) {
    const ownedAugs = await getOwnedAugs(ns, true);
    return await workTowardClosestAug(ns, ownedAugs);
  }
  async function tryUnlockFactions(ns) {
    // Unlock early factions first
    for (const faction of preferredEarlyFactionOrder) {
      if (playerInfo.factions.includes(faction)) continue;
      if (await workForFactionInvite(ns, faction)) {
        return true;
      }
    }

    // Then company factions
    for (const faction of preferredCompanyFactionOrder) {
      if (playerInfo.factions.includes(faction)) continue;
      if (await workForFactionInvite(ns, faction)) {
        return true;
      }
    }

    return false;
  }
  function updateStrategyMode() {
    const now = Date.now();
    if (now >= nextStrategySwap) {
      preferAugs = !preferAugs;
      nextStrategySwap = now + strategySwapInterval;
    }
  }

  while (true) { // After each loop, we will repeat all prevous work "strategies" to see if anything new has been unlocked, and add one more "strategy" to the queue
    try {
      await mainLoop(ns);
    } catch (err) {
      log(ns, 'WARNING: work-for-factions.js caught an unhandled error in its main loop. Trying again in 10 seconds...\n' + getErrorInfo(err), false, 'warning');
    }
    await ns.sleep(loopSleepInterval); // Infinite loop protection in case somehow we loop without doing any meaningful work
  }
}
