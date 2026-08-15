import assert from "node:assert/strict";
import fs from "node:fs";
import {
  INTEL_FARM_ASCENDING_PHASE,
  INTEL_FARM_READY_PHASE,
  didIntelFarmAscendComplete,
  isIntelFarmStateForCurrentRun,
} from "../intel-farm.js";

const reset = { currentNode: 4, lastNodeReset: 1_000, lastAugReset: 2_000 };
const ascending = {
  phase: INTEL_FARM_ASCENDING_PHASE,
  currentNode: 4,
  lastNodeReset: 1_000,
  lastAugResetBeforeAscend: 1_500,
};
assert.equal(isIntelFarmStateForCurrentRun(ascending, reset), true);
assert.equal(didIntelFarmAscendComplete(ascending, reset), true);
assert.equal(didIntelFarmAscendComplete({ ...ascending, lastAugResetBeforeAscend: 2_000 }, reset), false);
assert.equal(didIntelFarmAscendComplete({ ...ascending, currentNode: 5 }, reset), false);
assert.equal(didIntelFarmAscendComplete({ ...ascending, lastNodeReset: 999 }, reset), false);
assert.equal(INTEL_FARM_READY_PHASE, "farm-ready");

const autopilot = fs.readFileSync(new URL("../autopilot.js", import.meta.url), "utf8");
assert.doesNotMatch(autopilot, /singRun\(ns, "softReset", "farm-intel\.js"\)/);
assert.match(autopilot, /buildAscendArgs\(ns\.getScriptName\(\), true\)/);
assert.match(autopilot, /phase: INTEL_FARM_ASCENDING_PHASE[\s\S]*lastAugResetBeforeAscend/);
assert.match(autopilot, /didIntelFarmAscendComplete\(state, resetInfo\)/);
assert.match(autopilot, /ns\.spawn\("farm-intel\.js"/);
assert.match(autopilot, /ns\.exec\("farm-intel\.js", "home"/);
assert.match(autopilot, /getMissingCorporateFactions\(player\.factions, pendingInvites\)/);

console.log("intelligence farm ascend handoff tests passed");
