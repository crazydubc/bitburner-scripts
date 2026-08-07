import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildAscendArgs,
  buildDonationFavorProgress,
  getFreshDonationFavorProgress,
  NEUROFLUX,
} from "../donation-favor.js";

const base = overrides => ({
  joinedFactions: ["Alpha", "Beta"],
  favorToDonate: 150,
  factionFavor: { Alpha: 100, Beta: 0 },
  factionProjectedFavor: { Alpha: 150, Beta: 0 },
  factionRep: { Alpha: 1_000, Beta: 0 },
  factionAugs: { Alpha: ["Useful Aug"], Beta: [] },
  desiredAugmentations: ["Useful Aug"],
  ownedAugmentations: [],
  augRepRequirements: { "Useful Aug": 5_000 },
  donationFactions: [],
  ...overrides,
});

const exact = buildDonationFavorProgress(base());
assert.equal(exact.length, 1);
assert.equal(exact[0].faction, "Alpha");
assert.equal(exact[0].ready, true, "exactly reaching the threshold should request a reset");

const near = buildDonationFavorProgress(base({ factionProjectedFavor: { Alpha: 140, Beta: 0 } }));
assert.deepEqual(near, [],
  "being merely close to donation favor must not suppress the ordinary augmentation-momentum reset");
assert.deepEqual(buildDonationFavorProgress(base({ factionProjectedFavor: { Alpha: 134.9, Beta: 0 } })), [],
  "progress below the threshold must not request a favor reset");
assert.deepEqual(buildDonationFavorProgress(base({ factionFavor: { Alpha: 150, Beta: 0 } })), [],
  "a faction with donations already unlocked must not create a reset loop");
assert.deepEqual(buildDonationFavorProgress(base({ favorToDonate: 0 })), [],
  "BN8's zero favor requirement must not trigger resets");
assert.deepEqual(buildDonationFavorProgress(base({ gangFaction: "Alpha" })), [],
  "the player's gang faction cannot receive donations");

for (const faction of ["Bladeburners", "Church of the Machine God", "Shadows of Anarchy"]) {
  assert.deepEqual(buildDonationFavorProgress(base({
    joinedFactions: [faction],
    factionFavor: { [faction]: 100 },
    factionProjectedFavor: { [faction]: 150 },
    factionRep: { [faction]: 1_000 },
    factionAugs: { [faction]: ["Useful Aug"] },
  })), [], `${faction} does not support faction donations`);
}

assert.deepEqual(buildDonationFavorProgress(base({
  factionAugs: { Alpha: [NEUROFLUX], Beta: [] },
  desiredAugmentations: [NEUROFLUX],
  augRepRequirements: { [NEUROFLUX]: 5_000 },
})), [], "NeuroFlux alone should not justify a favor-only reset");
assert.deepEqual(buildDonationFavorProgress(base({ desiredAugmentations: [] })), [],
  "irrelevant augmentations must not justify a reset");
assert.deepEqual(buildDonationFavorProgress(base({ factionRep: { Alpha: 5_000, Beta: 0 } })), [],
  "an augmentation already reputation-unlocked in the faction does not need donations");

assert.deepEqual(buildDonationFavorProgress(base({
  factionAugs: { Alpha: ["Useful Aug"], Beta: ["Useful Aug"] },
  factionRep: { Alpha: 1_000, Beta: 5_000 },
})), [], "an augmentation already reputation-accessible from another joined faction is redundant");
assert.deepEqual(buildDonationFavorProgress(base({
  factionAugs: { Alpha: ["Useful Aug"], Beta: ["Useful Aug"] },
  donationFactions: ["Beta"],
})), [], "an augmentation donation-accessible from another joined faction is redundant");
assert.deepEqual(buildDonationFavorProgress(base({ donationFactions: ["Alpha"] })), [],
  "a faction with donations already unlocked must not create a milestone");
assert.deepEqual(buildDonationFavorProgress(base({ ownedAugmentations: ["Useful Aug"] })), [],
  "an already-owned desired augmentation must not justify a reset");

const mixedProvider = buildDonationFavorProgress(base({
  factionAugs: { Alpha: ["Shared Aug", "Unique Aug"], Beta: ["Shared Aug"] },
  desiredAugmentations: ["Shared Aug", "Unique Aug"],
  augRepRequirements: { "Shared Aug": 5_000, "Unique Aug": 6_000 },
  factionRep: { Alpha: 1_000, Beta: 5_000 },
}));
assert.deepEqual(mixedProvider[0].desired_augs, ["Unique Aug"],
  "a duplicate provider should suppress only the redundant augmentation, not a unique one");

assert.deepEqual(buildDonationFavorProgress(base({
  augPrerequisites: { "Useful Aug": ["Missing Prerequisite"] },
  augRepRequirements: { "Useful Aug": 5_000, "Missing Prerequisite": 3_000 },
})), [], "a desired augmentation with no reachable prerequisite must not justify a reset");
const reachablePrerequisite = buildDonationFavorProgress(base({
  factionAugs: { Alpha: ["Useful Aug", "Alpha Prerequisite"], Beta: [] },
  augPrerequisites: { "Useful Aug": ["Alpha Prerequisite"] },
  augRepRequirements: { "Useful Aug": 5_000, "Alpha Prerequisite": 3_000 },
}));
assert.deepEqual(reachablePrerequisite[0].desired_augs, ["Useful Aug"],
  "a prerequisite offered by the soon-to-be donation-ready faction is reachable after reset");

const prereq = buildDonationFavorProgress(base({
  factionAugs: { Alpha: ["Promoted Prerequisite"], Beta: [] },
  desiredAugmentations: ["Promoted Prerequisite"],
  augRepRequirements: { "Promoted Prerequisite": 5_000 },
}));
assert.deepEqual(prereq[0].desired_augs, ["Promoted Prerequisite"],
  "prerequisites promoted by faction-manager's desired policy should count");

const output = {
  generated_at: 2_000,
  current_node: 4,
  last_aug_reset: 1234,
  donation_favor_progress: [{
    faction: "Alpha", current_favor: 100, projected_favor: 150,
    required_favor: 150, desired_augs: ["Useful Aug"], ready: false,
  }],
};
const snapshotOptions = { now: 2_000 };
const fresh = getFreshDonationFavorProgress(output, { currentNode: 4, lastAugReset: 1234 }, snapshotOptions);
assert.equal(fresh.length, 1);
assert.equal(fresh[0].ready, true, "the consumer should derive readiness from numeric favor, not trust stale booleans");
assert.deepEqual(getFreshDonationFavorProgress(output, { currentNode: 5, lastAugReset: 1234 }, snapshotOptions), []);
assert.deepEqual(getFreshDonationFavorProgress(output, { currentNode: 4, lastAugReset: 9999 }, snapshotOptions), []);
assert.deepEqual(getFreshDonationFavorProgress(output, { currentNode: 4, lastAugReset: 1234 }, { now: 100_000 }), [],
  "an hours-old same-reset snapshot cannot delay or trigger an install");
assert.deepEqual(getFreshDonationFavorProgress({}, { currentNode: 4, lastAugReset: 1234 }, snapshotOptions), [],
  "old faction-manager snapshots remain backward-compatible and do not trigger a reset");
assert.deepEqual(getFreshDonationFavorProgress({
  ...output,
  donation_favor_progress: [{ ...output.donation_favor_progress[0], desired_augs: [] }],
}, { currentNode: 4, lastAugReset: 1234 }, snapshotOptions), [], "a malformed snapshot cannot request an irrelevant reset");

assert.deepEqual(buildAscendArgs("autopilot.js"), [
  "--install-augmentations", true, "--on-reset-script", "autopilot.js",
]);
assert.deepEqual(buildAscendArgs("autopilot.js", true), [
  "--install-augmentations", true, "--on-reset-script", "autopilot.js", "--allow-soft-reset", true,
]);

const autopilotSource = fs.readFileSync(new URL("../autopilot.js", import.meta.url), "utf8");
const readyFavorIndex = autopilotSource.indexOf("if (readyDonationFavor.length > 0)");
assert.ok(readyFavorIndex >= 0 && readyFavorIndex <
  autopilotSource.indexOf("if (!(pendingAugInclNfCount > 0", readyFavorIndex),
"the donation-favor milestone must run before the ordinary momentum gate");
assert.equal((autopilotSource.match(/installAugs\(ns, true\)/g) ?? []).length, 1,
  "only the completed donation-favor milestone may request a soft reset");
assert.match(autopilotSource, /shouldDelayInstall\(ns, player, facman, \{ favorMilestoneReady: true \}\)/,
  "the ready milestone should bypass ordinary install optimizations while retaining safety blockers");
assert.doesNotMatch(autopilotSource, /getActiveNearDonationFavorProgress|updateDonationFavorDelayState/,
  "near-favor work must not override the existing diminishing-return reset");
assert.match(autopilotSource,
  /function markDaedalusJoined\(\)[\s\S]*?reservingMoneyForDaedalus = false;[\s\S]*?disableStockmasterForDaedalus = false;/,
  "joining Daedalus must clear the reservation state that otherwise blocks every later ascend");
assert.match(autopilotSource, /return joined \? markDaedalusJoined\(\) : false;/,
  "the direct Daedalus join path must clear its reservation immediately");

console.log("donation favor milestone tests passed");
