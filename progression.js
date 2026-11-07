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

/** Opt-in timing experiment: obtain sleeves and Bladeburner before repeating BN3/BN10. */
export const EARLY_UNLOCK_ROUTE = Object.freeze([
  ...BN_ROUTE.slice(0, 4), {node: 3, targetLevel: 1}, {node: 10, targetLevel: 1},
  {node: 6, targetLevel: 1}, {node: 7, targetLevel: 3},
  {node: 3, targetLevel: 3}, {node: 10, targetLevel: 3}, ...BN_ROUTE.slice(8),
].map(Object.freeze));

export function sourceFileLevel(sourceFiles, node) {
  const level = Number(sourceFiles instanceof Map ? sourceFiles.get(node) : sourceFiles?.[node]);
  return Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
}

/** Select the next node after crediting the run that is about to finish. */
export function selectNextBitNode(sourceFiles, currentNode, route = BN_ROUTE) {
  return route.find(({node, targetLevel, repeat}) => repeat ||
    sourceFileLevel(sourceFiles, node) + (Number(currentNode) === node ? 1 : 0) < targetLevel);
}

export function hasBladeburnerAccess(sourceFiles) {
  return sourceFileLevel(sourceFiles, 6) > 0 || sourceFileLevel(sourceFiles, 7) > 0;
}

/** null is the official all-BlackOps-complete result; undefined/errors must never qualify. */
export async function hasCompletedBladeburner(ns, sourceFiles) {
  if (!hasBladeburnerAccess(sourceFiles)) return false;
  try {
    if (await bbRun(ns, 'inBladeburner') !== true) return false;
    return await bbRun(ns, 'getNextBlackOp') === null;
  } catch (error) {
    ns.print(`Bladeburner completion unavailable; keeping this BN active: ${String(error)}`);
    return false;
  }
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

export async function intelFarmState(ns, patch, owner = 'player') {
  const args = patch === undefined ? ['read'] : ['update', JSON.stringify(patch)];
  if (owner === 'sleeves' || owner === 'bn10-final') {
    if (patch === undefined) args.push('');
    args.push(owner);
  }
  const result = await runScriptLocal(ns, getFilePath('bin/intel-farm-state.js'), false,
    args);
  if (!result || typeof result !== 'object' || !['prepare', 'farming', 'complete'].includes(result.status))
    throw new Error(`Could not read/write intelligence-farm state on home: ${String(result)}`);
  return result;
}

// The third run starts with earned SF10.2; the effective level inside BN10 is not the run number.
export function bn103StudyNode(reset) {
  const overrides = reset?.bitNodeOptions?.sourceFileOverrides;
  return reset?.currentNode === 10 && sourceFileLevel(reset.ownedSF, 10) === 2 &&
    !(overrides instanceof Map ? overrides.has(10) : Object.hasOwn(overrides ?? {}, 10));
}

export function canStudySleeveInt(reset, player) {
  const overrides = reset?.bitNodeOptions?.sourceFileOverrides;
  const sf5Override = overrides instanceof Map ? overrides.has(5) : Object.hasOwn(overrides ?? {}, 5);
  return !reset?.bitNodeOptions?.disableSleeveExpAndAugmentation && (player?.skills?.intelligence > 0 ||
    (!sf5Override && sourceFileLevel(reset?.ownedSF, 5) > 0));
}

export const FINAL_STUDY_WINDOW = 5 * 60000;
export const FINAL_STUDY_WINDOWS = 2;
const levelAtXp = xp => 32 * Math.log(xp + 534.6) - 200;
const intBonus = level => 1 + Math.max(0, level) ** 0.8 / 600;

// Only call with a fresh verified fleet/task snapshot. A pause, reset, helper outage, or change of
// policy starts a new window; elapsed offline time is never counted as unproductive study.
export function sampleFinalStudy(prev, now, xp, augReset, rule) {
  if (!Number.isFinite(xp) || xp < 0 || !Number.isFinite(now) || !Number.isFinite(augReset)) return {next: null};
  const fresh = low => ({at: now, xp, seen: now, lastXp: xp, augReset, low,
    minRate: rule.minRate, minReturn: rule.minReturn});
  if (!prev || prev.augReset !== augReset || prev.minRate !== rule.minRate || prev.minReturn !== rule.minReturn ||
      now <= prev.seen || now - prev.seen > 60000 || xp < prev.lastXp) return {next: fresh(0)};
  if (xp === prev.lastXp) return {next: fresh(0), stalled: true}; // Time during a paused game is not an active study sample.
  const ms = now - prev.at;
  if (ms < FINAL_STUDY_WINDOW) return {next: {...prev, seen: now, lastXp: xp}};
  const hours = ms / 3600000, level = levelAtXp(xp), xpPerHour = (xp - prev.xp) / hours;
  const levelsPerHour = (level - levelAtXp(prev.xp)) / hours;
  const returnPercent = 100 * (intBonus(levelAtXp(xp + xpPerHour)) / intBonus(level) - 1);
  const low = levelsPerHour < rule.minRate && returnPercent < rule.minReturn ? prev.low + 1 : 0;
  return {next: fresh(low), report: {levelsPerHour, returnPercent, level, xpPerHour, low,
    minRate: rule.minRate, minReturn: rule.minReturn, augReset}};
}

export function finalStudyProof(report, minRate, minReturn, augReset) {
  return !!report && minRate > 0 && minReturn > 0 && report.minRate === minRate && report.minReturn === minReturn &&
    report.augReset === augReset && Number.isFinite(augReset) && Number.isInteger(report.low) && report.low >= FINAL_STUDY_WINDOWS &&
    Number.isFinite(report.level) && report.level >= 0 && Number.isFinite(report.xpPerHour) && report.xpPerHour > 0 &&
    Number.isFinite(report.levelsPerHour) && report.levelsPerHour > 0 && report.levelsPerHour < minRate &&
    Number.isFinite(report.returnPercent) && report.returnPercent >= 0 && report.returnPercent < minReturn;
}
