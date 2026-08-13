export const INTEL_FARM_STATE_FILE = "/intel-farm-state.txt";
export const INTEL_FARM_STATS_FILE = "/intel-farm-stats.txt";
export const CASHROOT = "CashRoot Starter Kit";
export const CASHROOT_FACTION = "Sector-12";
export const INTEL_FARM_MAX_INT = 200;

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

export const IntelFarmPhase = Object.freeze({
  CashRoot: "cashroot",
  CashRootInstalling: "cashroot-installing",
  CorporateFactions: "corporate-factions",
  Farming: "farming",
  Complete: "complete",
});

const INTEL_FARM_STATE_VERSION = 1;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function readIntelFarmState(ns) {
  const raw = ns.read(INTEL_FARM_STATE_FILE);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    if (!state || state.version !== INTEL_FARM_STATE_VERSION ||
      !Object.values(IntelFarmPhase).includes(state.phase)) return null;
    return state;
  } catch {
    return null;
  }
}

export function writeIntelFarmState(ns, state) {
  const next = {
    version: INTEL_FARM_STATE_VERSION,
    ...state,
    updatedAt: Date.now(),
  };
  ns.write(INTEL_FARM_STATE_FILE, JSON.stringify(next), "w");
  return next;
}

export function createIntelFarmState(resetInfo, intelligence) {
  const now = Date.now();
  return {
    version: INTEL_FARM_STATE_VERSION,
    phase: IntelFarmPhase.CashRoot,
    originNode: finiteNumber(resetInfo?.currentNode),
    originNodeReset: finiteNumber(resetInfo?.lastNodeReset),
    startedAt: now,
    startedIntelligence: finiteNumber(intelligence),
    updatedAt: now,
  };
}

export function stateMatchesCurrentBitNode(state, resetInfo) {
  return !!state && finiteNumber(state.originNode, -1) === finiteNumber(resetInfo?.currentNode, -2) &&
    finiteNumber(state.originNodeReset, -1) === finiteNumber(resetInfo?.lastNodeReset, -2);
}

export function shouldStartIntelFarm({ state, resetInfo, ownedSourceFiles, intelligence }) {
  if (state) return false;
  const intel = finiteNumber(intelligence);
  return finiteNumber(ownedSourceFiles?.[5]) > 0 && finiteNumber(resetInfo?.currentNode) > 0 &&
    intel > 1 && intel < INTEL_FARM_MAX_INT;
}

export function isIntelFarmPrep(state) {
  return !!state && [
    IntelFarmPhase.CashRoot,
    IntelFarmPhase.CashRootInstalling,
    IntelFarmPhase.CorporateFactions,
  ].includes(state.phase);
}

export function isIntelFarmActive(state) {
  return !!state && state.phase !== IntelFarmPhase.Complete;
}

export function missingCorporateFactions(joinedFactions = []) {
  const joined = new Set(joinedFactions);
  return CORPORATE_FACTIONS.filter(faction => !joined.has(faction));
}
