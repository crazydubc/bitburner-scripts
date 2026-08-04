export const NEUROFLUX = "NeuroFlux Governor";
export const DEFAULT_PRIORITY_AUGS = [
  "The Red Pill",
  "The Blade's Simulacrum",
  "Neuroreceptor Management Implant",
];
export const DEFAULT_DESIRED_AUGS = ["CashRoot Starter Kit"];
export const DEFAULT_PRODUCTIVE_STATS = [
  "hacking",
  "faction_rep",
  "company_rep",
  "charisma",
  "hacknet",
  "crime_money",
];

const STAT_WEIGHTS = [
  ["faction_rep", 14],
  ["company_rep", 11],
  ["hacking_money", 10],
  ["hacking_speed", 9],
  ["hacking_grow", 8],
  ["hacking_chance", 7],
  ["hacking_exp", 6],
  ["hacking", 8],
  ["charisma", 4],
  ["hacknet_node_money", 5],
  ["hacknet", 3],
  ["crime_money", 3],
  ["crime_success", 2],
  ["work_money", 1.5],
  ["strength", 1],
  ["defense", 1],
  ["dexterity", 1],
  ["agility", 1],
];

function asSet(values) {
  return values instanceof Set ? values : new Set(values ?? []);
}

export function getDefaultDesiredStats({ bitNode, ownedAugCount = 0, factions = [], lastAugReset = 0, now = Date.now() } = {}) {
  const takeAnyAug = ownedAugCount > 40 || bitNode === 6 || bitNode === 7 || factions.includes("Bladeburners") ||
    now - lastAugReset < 20 * 60 * 1000;
  if (takeAnyAug) return ["*"];
  if (bitNode === 8) return ["hacking_level", "hacking_exp"];
  return DEFAULT_PRODUCTIVE_STATS.slice();
}

export function statMatchesDesiredFilters(statName, desiredFilters = []) {
  return desiredFilters.includes("*") || desiredFilters.includes("_") ||
    desiredFilters.some(filter => statName.includes(filter) || statName === filter.replace("_level", ""));
}

export function buildDesiredAugSet({
  augmentationNames,
  augStats,
  augPrereqs,
  ownedAugs,
  desiredStats,
  desiredAugs = DEFAULT_DESIRED_AUGS,
  priorityAugs = DEFAULT_PRIORITY_AUGS,
}) {
  const owned = asSet(ownedAugs);
  const explicitlyDesired = new Set([...(desiredAugs ?? []), ...(priorityAugs ?? [])]);
  const desired = new Set();

  for (const aug of augmentationNames ?? []) {
    if (aug === NEUROFLUX || owned.has(aug)) continue;
    const stats = augStats?.[aug] ?? {};
    if (explicitlyDesired.has(aug) || Object.keys(stats).some(stat => statMatchesDesiredFilters(stat, desiredStats)))
      desired.add(aug);
  }

  const addPrereqs = (aug, visiting = new Set()) => {
    if (visiting.has(aug)) return;
    visiting.add(aug);
    for (const prereq of augPrereqs?.[aug] ?? []) {
      if (prereq === NEUROFLUX || owned.has(prereq)) continue;
      desired.add(prereq);
      addPrereqs(prereq, visiting);
    }
    visiting.delete(aug);
  };
  [...desired].forEach(aug => addPrereqs(aug));
  return desired;
}

function statWeight(statName) {
  for (const [fragment, weight] of STAT_WEIGHTS)
    if (statName.includes(fragment)) return weight;
  return 1;
}

function baseAugUtility(aug, stats, desiredNames, priorityNames) {
  let utility = desiredNames.has(aug) ? 2 : 0.25;
  if (priorityNames.has(aug)) utility += 100;
  for (const [stat, value] of Object.entries(stats ?? {})) {
    if (!Number.isFinite(value) || value <= 0 || value === 1) continue;
    utility += statWeight(stat) * Math.abs(Math.log(value));
  }
  return Math.max(utility, 0.25);
}

export function buildAugUtilityMap({
  desiredAugSet,
  augStats,
  augPrereqs,
  desiredAugs = DEFAULT_DESIRED_AUGS,
  priorityAugs = DEFAULT_PRIORITY_AUGS,
}) {
  const desired = asSet(desiredAugSet);
  const desiredNames = new Set([...(desiredAugs ?? []), ...(priorityAugs ?? [])]);
  const priorityNames = asSet(priorityAugs);
  const utility = Object.fromEntries([...desired].map(aug => [aug,
    baseAugUtility(aug, augStats?.[aug] ?? {}, desiredNames, priorityNames)
  ]));

  // A prerequisite is valuable because it unlocks the desired aug(s) above it.
  for (const aug of desired) {
    const inherited = utility[aug] ?? 0;
    const visit = (name, value, depth, visiting) => {
      if (depth > 8 || visiting.has(name)) return;
      visiting.add(name);
      for (const prereq of augPrereqs?.[name] ?? []) {
        if (!desired.has(prereq)) continue;
        utility[prereq] = (utility[prereq] ?? 0.25) + value * (0.55 ** depth);
        visit(prereq, value, depth + 1, visiting);
      }
      visiting.delete(name);
    };
    visit(aug, inherited, 1, new Set());
  }
  return utility;
}

export function getUsefulAugsForFaction({
  faction,
  factionAugs,
  desiredAugSet,
  ownedAugs,
  augRepReqs,
  joinedFactions,
  factionRep,
  donationFactions,
  gangAugs,
}) {
  const desired = asSet(desiredAugSet);
  const owned = asSet(ownedAugs);
  const joined = joinedFactions ?? [];
  const donations = asSet(donationFactions);
  const gangProvided = asSet(gangAugs);

  const accessibleElsewhere = aug => {
    if (gangProvided.has(aug)) return true;
    const req = augRepReqs?.[aug] ?? Infinity;
    return joined.some(other => other !== faction &&
      (factionAugs?.[other] ?? []).includes(aug) &&
      ((factionRep?.[other] ?? 0) >= req || donations.has(other)));
  };

  return (factionAugs?.[faction] ?? []).filter(aug =>
    aug !== NEUROFLUX && desired.has(aug) && !owned.has(aug) && !accessibleElsewhere(aug));
}

function prereqsReachableAtThreshold({ aug, threshold, faction, owned, augPrereqs, augRepReqs, factionAugs,
  joinedFactions, factionRep, donationFactions, gangAugs }) {
  const visiting = new Set();
  const check = name => {
    if (owned.has(name)) return true;
    if (gangAugs.has(name)) return true;
    if (visiting.has(name)) return false;
    visiting.add(name);
    const req = augRepReqs?.[name] ?? Infinity;
    const offeredHere = (factionAugs?.[faction] ?? []).includes(name) && req <= threshold;
    const accessibleElsewhere = (joinedFactions ?? []).some(other => other !== faction &&
      (factionAugs?.[other] ?? []).includes(name) &&
      ((factionRep?.[other] ?? 0) >= req || donationFactions.has(other)));
    const reachable = (offeredHere || accessibleElsewhere) &&
      (augPrereqs?.[name] ?? []).every(check);
    visiting.delete(name);
    return reachable;
  };
  return (augPrereqs?.[aug] ?? []).every(check);
}

export function planBestFactionRepRoute({
  joinedFactions,
  factionAugs,
  factionRep,
  factionRepRate,
  donationFactions,
  gangFaction,
  gangAugs,
  desiredAugSet,
  augUtility,
  augRepReqs,
  augPrereqs,
  ownedAugs,
  priorityAugs = DEFAULT_PRIORITY_AUGS,
}) {
  const owned = asSet(ownedAugs);
  const donations = asSet(donationFactions);
  const gangProvided = asSet(gangAugs);
  const priority = asSet(priorityAugs);
  let best = null;

  for (const faction of joinedFactions ?? []) {
    if (faction === gangFaction || donations.has(faction)) continue;
    const rate = factionRepRate?.[faction] ?? 0;
    if (!(rate > 0)) continue;
    const currentRep = factionRep?.[faction] ?? 0;
    const useful = getUsefulAugsForFaction({
      faction, factionAugs, desiredAugSet, ownedAugs: owned, augRepReqs,
      joinedFactions, factionRep, donationFactions: donations, gangAugs: gangProvided,
    }).filter(aug => (augRepReqs?.[aug] ?? Infinity) > currentRep);
    const thresholds = [...new Set(useful.map(aug => augRepReqs?.[aug] ?? Infinity))]
      .filter(Number.isFinite).sort((a, b) => a - b);

    for (const targetRep of thresholds) {
      const unlockedAugs = useful.filter(aug => (augRepReqs?.[aug] ?? Infinity) <= targetRep &&
        prereqsReachableAtThreshold({
          aug, threshold: targetRep, faction, owned, augPrereqs, augRepReqs, factionAugs,
          joinedFactions, factionRep, donationFactions: donations, gangAugs: gangProvided,
        }));
      if (unlockedAugs.length === 0) continue;
      const utility = unlockedAugs.reduce((sum, aug) => sum + (augUtility?.[aug] ?? 0.25), 0);
      const eta = Math.max(0, targetRep - currentRep) / rate;
      const priorityCount = unlockedAugs.filter(aug => priority.has(aug)).length;
      const score = utility / Math.max(eta, 30);
      const candidate = { kind: "faction-rep", faction, targetRep, unlockedAugs, utility, eta, score, priorityCount };
      if (!best || candidate.priorityCount > best.priorityCount ||
        (candidate.priorityCount === best.priorityCount && (candidate.score > best.score ||
          (candidate.score === best.score && candidate.eta < best.eta)))) best = candidate;
    }
  }
  return best;
}

export function rankFactionInviteRoutes({
  candidateFactions,
  factionAugs,
  desiredAugSet,
  ownedAugs,
  augRepReqs,
  augUtility,
  joinedFactions,
  factionRep,
  donationFactions,
  gangAugs,
  inviteEffort,
  estimatedFactionRepRate = 1,
  staticOrder = [],
  augPrereqs = {},
  priorityAugs = DEFAULT_PRIORITY_AUGS,
}) {
  const routes = [];
  const owned = asSet(ownedAugs);
  const donations = asSet(donationFactions);
  const gangProvided = asSet(gangAugs);
  const priority = asSet(priorityAugs);
  const safeRate = Math.max(estimatedFactionRepRate, 0.01);
  for (const faction of candidateFactions ?? []) {
    const useful = getUsefulAugsForFaction({
      faction, factionAugs, desiredAugSet, ownedAugs, augRepReqs,
      joinedFactions, factionRep, donationFactions, gangAugs,
    });
    if (useful.length === 0) continue;
    const effort = inviteEffort?.[faction] ?? Infinity;
    if (!Number.isFinite(effort)) continue;
    const thresholds = [...new Set(useful.map(aug => augRepReqs?.[aug] ?? Infinity))]
      .filter(Number.isFinite).sort((a, b) => a - b);
    let bestForFaction = null;
    for (const targetRep of thresholds) {
      const unlockedAugs = useful.filter(aug => (augRepReqs?.[aug] ?? Infinity) <= targetRep &&
        prereqsReachableAtThreshold({
          aug, threshold: targetRep, faction, owned, augPrereqs, augRepReqs, factionAugs,
          joinedFactions, factionRep, donationFactions: donations, gangAugs: gangProvided,
        }));
      const utility = unlockedAugs.reduce((sum, aug) => sum + (augUtility?.[aug] ?? 0.25), 0);
      const eta = effort + targetRep / safeRate;
      if (unlockedAugs.length === 0) continue;
      const priorityCount = unlockedAugs.filter(aug => priority.has(aug)).length;
      const score = utility / Math.max(eta, 30);
      const route = { kind: "faction-invite", faction, targetRep, unlockedAugs, utility, eta, score, priorityCount };
      if (!bestForFaction || route.priorityCount > bestForFaction.priorityCount ||
        (route.priorityCount === bestForFaction.priorityCount && route.score > bestForFaction.score)) bestForFaction = route;
    }
    if (bestForFaction) routes.push(bestForFaction);
  }
  routes.sort((a, b) => b.priorityCount - a.priorityCount || b.score - a.score || a.eta - b.eta ||
    (staticOrder.indexOf(a.faction) === -1 ? 999 : staticOrder.indexOf(a.faction)) -
    (staticOrder.indexOf(b.faction) === -1 ? 999 : staticOrder.indexOf(b.faction)));
  return routes;
}

export function selectBestExclusiveFactionGroup({ groups, routes, groupUtility = {}, optionWeight = 0.25 }) {
  let best = null;
  for (const [group, factions] of Object.entries(groups ?? {})) {
    const groupRoutes = (routes ?? []).filter(route => factions.includes(route.faction));
    if (groupRoutes.length === 0) continue;
    groupRoutes.sort((a, b) => (b.priorityCount ?? 0) - (a.priorityCount ?? 0) || b.score - a.score || a.eta - b.eta);
    const immediate = groupRoutes[0];
    const optionScore = (groupUtility?.[group] ?? 0) / Math.max(immediate.eta, 30);
    const candidate = {
      group,
      route: immediate,
      priorityCount: immediate.priorityCount ?? 0,
      score: immediate.score + optionWeight * optionScore,
    };
    if (!best || candidate.priorityCount > best.priorityCount ||
      (candidate.priorityCount === best.priorityCount && candidate.score > best.score)) best = candidate;
  }
  return best?.group ?? null;
}

export function chooseBestRoute(repRoute, inviteRoutes) {
  const inviteRoute = Array.isArray(inviteRoutes) ? (inviteRoutes[0] ?? null) : (inviteRoutes ?? null);
  if (!repRoute) return inviteRoute;
  if (!inviteRoute) return repRoute;
  const repPriority = repRoute.priorityCount ?? 0;
  const invitePriority = inviteRoute.priorityCount ?? 0;
  if (invitePriority !== repPriority) return invitePriority > repPriority ? inviteRoute : repRoute;
  if (inviteRoute.score !== repRoute.score) return inviteRoute.score > repRoute.score ? inviteRoute : repRoute;
  return inviteRoute.eta < repRoute.eta ? inviteRoute : repRoute;
}
