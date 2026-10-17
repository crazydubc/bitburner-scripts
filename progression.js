import { bbRun, runScriptLocal, getFilePath } from './utils.js';

// Targets are integer levels, not decimal BN labels. BN1.1 is the mandatory initial run.
export const BN_ROUTE = Object.freeze([
  { node: 4, targetLevel: 3 }, { node: 1, targetLevel: 3 },
  { node: 5, targetLevel: 1 }, { node: 2, targetLevel: 1 },
  { node: 3, targetLevel: 3 }, { node: 10, targetLevel: 3 },
  { node: 6, targetLevel: 1 }, { node: 7, targetLevel: 3 },
  { node: 9, targetLevel: 3 }, { node: 13, targetLevel: 3 },
  { node: 14, targetLevel: 3 }, { node: 15, targetLevel: 3 },
  { node: 5, targetLevel: 3 }, { node: 2, targetLevel: 3 },
  { node: 6, targetLevel: 3 }, { node: 11, targetLevel: 3 },
  { node: 8, targetLevel: 3 }, { node: 12, repeat: true },
].map(Object.freeze));

export function sourceFileLevel(sourceFiles, node) {
  const level = Number(sourceFiles instanceof Map ? sourceFiles.get(node) : sourceFiles?.[node]);
  return Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
}

/** Select the next node after crediting the run that is about to finish. */
export function selectNextBitNode(sourceFiles, currentNode) {
  return BN_ROUTE.find(({node, targetLevel, repeat}) => repeat ||
    sourceFileLevel(sourceFiles, node) + (Number(currentNode) === node ? 1 : 0) < targetLevel);
}

export function hasBladeburnerAccess(sourceFiles) {
  return sourceFileLevel(sourceFiles, 6) > 0 || sourceFileLevel(sourceFiles, 7) > 0;
}

/** null is the official all-BlackOps-complete result; undefined/errors must never qualify. */
export async function hasCompletedBladeburner(ns, sourceFiles) {
  if (!hasBladeburnerAccess(sourceFiles) || await bbRun(ns, 'inBladeburner') !== true) return false;
  return await bbRun(ns, 'getNextBlackOp') === null;
}

export const INTEL_FARM_FILE = '/data/intel-farm-state.json';
export const INTEL_FARM_TARGET = 230;
export const INTEL_FARM_MAX_MS = 60 * 60 * 1000;
export const COMPANY_FACTIONS = Object.freeze([
  'Bachman & Associates', 'ECorp', 'Clarke Incorporated', 'OmniTek Incorporated', 'NWO',
  'Blade Industries', 'MegaCorp', 'KuaiGong International', 'Fulcrum Secret Technologies', 'Four Sigma',
]);

export function getIntelFarmReadiness(player, installedAugs, invitations, sourceFiles, state) {
  const intel = Number(player?.skills?.intelligence);
  const needed = sourceFileLevel(sourceFiles, 4) > 0 && sourceFileLevel(sourceFiles, 5) > 0 &&
    Number.isFinite(intel) && intel >= 1 && intel < INTEL_FARM_TARGET && state?.status !== 'complete';
  const available = new Set([...(player?.factions ?? []), ...(Array.isArray(invitations) ? invitations : [])]);
  const missing = COMPANY_FACTIONS.filter(faction => !available.has(faction));
  return { needed, ready: needed && installedAugs.includes('CashRoot Starter Kit') && missing.length === 0, missing };
}

/** Preserve the old 0.5%/hour ROI policy, with a minimum sample and an absolute one-hour farm budget. */
export function getIntelFarmStopReason(state, intelligence, now) {
  if (state?.status === 'complete') return state.reason || 'complete';
  if (intelligence >= INTEL_FARM_TARGET) return 'target';
  if (state?.status !== 'farming' || !Number.isFinite(state.startedAt)) return null;
  if (now - state.startedAt >= INTEL_FARM_MAX_MS) return 'time-budget';
  const elapsed = now - state.baselineAt;
  if (!Number.isFinite(state.baselineIntel) || !Number.isFinite(state.baselineAt) || elapsed < 60_000) return null;
  const gained = intelligence - state.baselineIntel;
  if (gained <= 0) return elapsed >= 5 * 60_000 ? 'no-progress' : null;
  const bonus = intel => 1 + Math.pow(intel, 0.8) / 600;
  const projected = intelligence + gained * 3_600_000 / elapsed;
  return (bonus(projected) / bonus(intelligence) - 1) * 100 < 0.5 ? 'low-roi' : null;
}

export async function intelFarmState(ns, patch) {
  const result = await runScriptLocal(ns, getFilePath('bin/intel-farm-state.js'), false,
    patch === undefined ? ['read'] : ['update', JSON.stringify(patch)]);
  if (!result || typeof result !== 'object' || !['prepare', 'farming', 'complete'].includes(result.status))
    throw new Error(`Could not read/write intelligence-farm state on home: ${String(result)}`);
  return result;
}
