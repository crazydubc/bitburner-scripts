export const CASHROOT_AUG = "CashRoot Starter Kit";
export const INTEL_FARM_TARGET = 200;
export const INTEL_FARM_STATE_FILE = "intel-farm-state.txt";
export const INTEL_FARM_STATS_FILE = "intel-farm-stats.txt";

export const CORPORATE_FACTIONS = Object.freeze([
  "Bachman & Associates",
  "ECorp",
  "Clarke Incorporated",
  "OmniTek Incorporated",
  "NWO",
  "Blade Industries",
  "MegaCorp",
  "KuaiGong International",
  "Fulcrum Secret Technologies",
  "Four Sigma",
]);

const INTEL_FARM_STATE_VERSION = 1;

/** @param {NS} ns */
export function readIntelFarmState(ns) {
  const raw = ns.read(INTEL_FARM_STATE_FILE);
  if (!raw) return { version: INTEL_FARM_STATE_VERSION, phase: "pending" };
  try {
    const state = JSON.parse(raw);
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("state is not an object");
    return { version: INTEL_FARM_STATE_VERSION, ...state };
  } catch {
    return { version: INTEL_FARM_STATE_VERSION, phase: "pending" };
  }
}

/** @param {NS} ns */
export function writeIntelFarmState(ns, update) {
  const next = {
    ...readIntelFarmState(ns),
    ...update,
    version: INTEL_FARM_STATE_VERSION,
    updatedAt: Date.now(),
  };
  ns.write(INTEL_FARM_STATE_FILE, JSON.stringify(next), "w");
  return next;
}

export function isIntelFarmComplete(state, intelligence) {
  const completedIntelligence = Number(state?.completedIntelligence);
  return state?.phase === "complete" && Number.isFinite(completedIntelligence) &&
    Number(intelligence) >= completedIntelligence;
}

export function getMissingCorporateFactions(joinedFactions = [], pendingInvites = []) {
  const accessible = new Set([...(joinedFactions ?? []), ...(pendingInvites ?? [])]);
  return CORPORATE_FACTIONS.filter(faction => !accessible.has(faction));
}
