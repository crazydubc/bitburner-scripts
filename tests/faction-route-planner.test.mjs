import assert from 'node:assert/strict';
import fs from "node:fs";

const plannerSource = fs.readFileSync(new URL("../faction-route-planner.js", import.meta.url), "utf8");
const plannerModule = await import(`data:text/javascript;base64,${Buffer.from(plannerSource).toString("base64")}`);

const {
  getDefaultDesiredStats,
  buildDesiredAugSet,
  buildAugUtilityMap,
  planBestFactionRepRoute,
  rankFactionInviteRoutes,
  selectBestExclusiveFactionGroup,
  chooseBestRoute,
} = plannerModule;

const normalStats = getDefaultDesiredStats({
  bitNode: 4,
  ownedAugCount: 2,
  factions: ['CyberSec'],
  lastAugReset: 0,
  now: 2 * 60 * 60 * 1000,
});
assert.deepEqual(normalStats, ['hacking', 'faction_rep', 'company_rep', 'charisma', 'hacknet', 'crime_money']);
assert.deepEqual(getDefaultDesiredStats({ bitNode: 4, ownedAugCount: 2, lastAugReset: 0, now: 5 * 60 * 1000 }), ['*']);
assert.deepEqual(getDefaultDesiredStats({ bitNode: 8, ownedAugCount: 2, lastAugReset: 0, now: 2 * 60 * 60 * 1000 }), ['hacking_level', 'hacking_exp']);

const augStats = {
  'Tiny Combat': { strength: 1.1 },
  'Rep Booster': { faction_rep: 1.25 },
  'Big Hack': { hacking_money: 2 },
  'Prereq': {},
  'The Red Pill': {},
};
const augPrereqs = { 'Big Hack': ['Prereq'], Prereq: [], 'The Red Pill': [] };
const desired = buildDesiredAugSet({
  augmentationNames: Object.keys(augStats),
  augStats,
  augPrereqs,
  ownedAugs: [],
  desiredStats: normalStats,
  desiredAugs: [],
  priorityAugs: ['The Red Pill'],
});
assert.equal(desired.has('Tiny Combat'), false, 'normal progression should not grind physical-only augs');
assert.equal(desired.has('Rep Booster'), true);
assert.equal(desired.has('Big Hack'), true);
assert.equal(desired.has('Prereq'), true, 'prerequisites must be promoted into the route');
assert.equal(desired.has('The Red Pill'), true, 'priority augs must always be retained');

const utility = buildAugUtilityMap({
  desiredAugSet: desired,
  augStats,
  augPrereqs,
  desiredAugs: [],
  priorityAugs: ['The Red Pill'],
});
assert.ok(utility.Prereq > 0.25, 'prerequisite should inherit utility from its dependent');
assert.ok(utility['The Red Pill'] > utility['Big Hack'], 'priority aug should dominate ordinary utility');

const factionAugs = {
  Fast: ['Prereq'],
  Productive: ['Rep Booster', 'Big Hack'],
  Donation: ['Big Hack'],
  Gang: ['Big Hack'],
  Daedalus: ['The Red Pill'],
};
const augRepReqs = { Prereq: 100, 'Rep Booster': 1000, 'Big Hack': 2000, 'The Red Pill': 2500 };

const prereqRoute = planBestFactionRepRoute({
  joinedFactions: ['Fast', 'Productive'],
  factionAugs,
  factionRep: { Fast: 0, Productive: 0 },
  factionRepRate: { Fast: 10, Productive: 10 },
  donationFactions: [],
  gangFaction: null,
  gangAugs: [],
  desiredAugSet: desired,
  augUtility: utility,
  augRepReqs,
  augPrereqs,
  ownedAugs: [],
  priorityAugs: ['The Red Pill'],
});
assert.equal(prereqRoute.faction, 'Fast', 'unreachable dependents must route through their prerequisite first');

const productiveRoute = planBestFactionRepRoute({
  joinedFactions: ['Fast', 'Productive', 'Donation'],
  factionAugs,
  factionRep: { Fast: 0, Productive: 0, Donation: 0 },
  factionRepRate: { Fast: 10, Productive: 10, Donation: 1000 },
  donationFactions: ['Donation'],
  gangFaction: null,
  gangAugs: [],
  desiredAugSet: desired,
  augUtility: utility,
  augRepReqs,
  augPrereqs,
  ownedAugs: ['Prereq'],
  priorityAugs: ['The Red Pill'],
});
assert.equal(productiveRoute.faction, 'Productive', 'donation-ready factions must not consume player work time');
assert.ok(productiveRoute.unlockedAugs.includes('Rep Booster'), 'route should unlock the highest-value efficient threshold first');

const gangFiltered = planBestFactionRepRoute({
  joinedFactions: ['Productive'],
  factionAugs,
  factionRep: { Productive: 0 },
  factionRepRate: { Productive: 10 },
  donationFactions: [],
  gangFaction: 'Gang',
  gangAugs: ['Big Hack'],
  desiredAugSet: desired,
  augUtility: utility,
  augRepReqs,
  augPrereqs,
  ownedAugs: ['Prereq'],
  priorityAugs: ['The Red Pill'],
});
assert.deepEqual(gangFiltered.unlockedAugs, ['Rep Booster'], 'gang-provided duplicates should be ignored elsewhere');

const priorityRoute = planBestFactionRepRoute({
  joinedFactions: ['Productive', 'Daedalus'],
  factionAugs,
  factionRep: { Productive: 0, Daedalus: 0 },
  factionRepRate: { Productive: 100, Daedalus: 1 },
  donationFactions: [],
  gangFaction: null,
  gangAugs: [],
  desiredAugSet: desired,
  augUtility: utility,
  augRepReqs,
  augPrereqs,
  ownedAugs: ['Prereq'],
  priorityAugs: ['The Red Pill'],
});
assert.equal(priorityRoute.faction, 'Daedalus', 'completion-critical priority augs should override ordinary efficiency');

const invites = rankFactionInviteRoutes({
  candidateFactions: ['Slow', 'Quick'],
  factionAugs: { Slow: ['Big Hack'], Quick: ['Rep Booster'] },
  desiredAugSet: desired,
  ownedAugs: ['Prereq'],
  augRepReqs,
  augUtility: utility,
  joinedFactions: [],
  factionRep: {},
  donationFactions: [],
  gangAugs: [],
  inviteEffort: { Slow: 10000, Quick: 10 },
  estimatedFactionRepRate: 10,
  staticOrder: ['Slow', 'Quick'],
  augPrereqs,
  priorityAugs: ['The Red Pill'],
});
assert.equal(invites[0].faction, 'Quick', 'invite routes should include invitation effort, not just static order');
assert.equal(chooseBestRoute(productiveRoute, invites).kind, 'faction-rep');

const cityGroup = selectBestExclusiveFactionGroup({
  groups: { west: ['Aevum'], east: ['Chongqing'] },
  routes: [
    { faction: 'Aevum', score: 0.05, eta: 100, priorityCount: 0 },
    { faction: 'Chongqing', score: 0.06, eta: 90, priorityCount: 0 },
  ],
  groupUtility: { west: 20, east: 2 },
});
assert.equal(cityGroup, 'west', 'exclusive city selection should balance immediate speed with retained future utility');

const donationCandidate = { kind: 'donation-unlock', faction: 'A', score: 0.5, eta: 50 };
assert.equal(chooseBestRoute(productiveRoute, donationCandidate).kind, 'donation-unlock',
  'generic route comparison should support donation-unlock candidates');

console.log('faction route planner tests passed');
