import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../faction-route-planner.js", import.meta.url), "utf8");
const { rankFactionInviteRoutes } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const route = rankFactionInviteRoutes({
  candidateFactions: ["DonationReady"],
  factionAugs: { DonationReady: ["Useful Aug"] },
  desiredAugSet: new Set(["Useful Aug"]),
  ownedAugs: [],
  augRepReqs: { "Useful Aug": 2_000 },
  augUtility: { "Useful Aug": 5 },
  joinedFactions: [],
  factionRep: {},
  donationFactions: [],
  gangAugs: [],
  inviteEffort: { DonationReady: 10 },
  donationAfterInviteFactions: ["DonationReady"],
  estimatedFactionRepRate: 1,
  augPrereqs: { "Useful Aug": [] },
})[0];

assert.equal(route.eta, 10, "A donation-ready rejoin must not include a reputation-work estimate");
console.log("donation-ready route test passed");
