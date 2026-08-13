import {log, formatNumber, getPlayerInfo, getReset, singRun} from './utils.js';
import {
  CORPORATE_FACTIONS, INTEL_FARM_MAX_INT, INTEL_FARM_STATS_FILE, IntelFarmPhase,
  readIntelFarmState, stateMatchesCurrentBitNode, writeIntelFarmState
} from './intel-farm-state.js';

const FORECAST_HOURS = 1;
const MIN_PERCENT_BONUS_PER_HOUR = 0.5;

function intBonus(intel) {
  return 1 + Math.pow(intel, 0.8) / 600;
}

function readStats(ns) {
  try {
    const raw = ns.read(INTEL_FARM_STATS_FILE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function joinInvitations(ns, invitations) {
  let joined = 0;
  for (const faction of invitations)
    if (await singRun(ns, 'joinFaction', faction)) joined++;
  return joined;
}

async function waitForCorporateInvitations(ns) {
  let player;
  let invitations = [];
  let missing = CORPORATE_FACTIONS.slice();
  for (let attempt = 0; attempt < 10; attempt++) {
    player = await getPlayerInfo(ns);
    invitations = await singRun(ns, 'checkFactionInvitations');
    if (!Array.isArray(invitations)) invitations = [];
    const available = new Set([...(player.factions ?? []), ...invitations]);
    missing = CORPORATE_FACTIONS.filter(faction => !available.has(faction));
    if (missing.length === 0) break;
    await ns.sleep(200);
  }
  return {invitations, missing};
}

/** @param {NS} ns */
export async function main(ns) {
  const resetInfo = await getReset(ns);
  let state = readIntelFarmState(ns);
  if (!state || !stateMatchesCurrentBitNode(state, resetInfo) || state.phase !== IntelFarmPhase.Farming) {
    log(ns, 'INT farm state is missing, stale, or not ready; returning to autopilot in this BitNode.', true, 'warning');
    await singRun(ns, 'softReset', 'autopilot.js');
    return;
  }

  const invitationState = await waitForCorporateInvitations(ns);
  if (invitationState.missing.length > 0) {
    state = writeIntelFarmState(ns, {
      ...state,
      phase: IntelFarmPhase.CorporateFactions,
      repairReason: `Missing maintained invitations: ${invitationState.missing.join(', ')}`,
    });
    log(ns, `Corporate invitation set is incomplete (${invitationState.missing.join(', ')}); returning to preparation.`,
      true, 'warning');
    await singRun(ns, 'softReset', 'autopilot.js');
    return;
  }

  let joinedThisCycle = await joinInvitations(ns, invitationState.invitations);
  for (const city of ['Chongqing', 'New Tokyo', 'Ishima']) {
    if (!(await singRun(ns, 'travelToCity', city))) continue;
    const invitations = await singRun(ns, 'checkFactionInvitations');
    if (Array.isArray(invitations)) joinedThisCycle += await joinInvitations(ns, invitations);
  }

  const player = await getPlayerInfo(ns);
  const intel = Number(player.skills?.intelligence) || 0;
  const now = Date.now();
  const previous = readStats(ns);
  let stop = intel >= INTEL_FARM_MAX_INT;

  if (previous && Number.isFinite(previous.intel) && Number.isFinite(previous.time)) {
    const deltaIntel = intel - previous.intel;
    if (deltaIntel > 0) {
      const seconds = Math.max((now - previous.time) / 1000, Number.EPSILON);
      const intelPerHour = deltaIntel / seconds * 3600;
      const futureIntel = intel + intelPerHour * FORECAST_HOURS;
      const bonusGain = (intBonus(futureIntel) - intBonus(intel)) / intBonus(intel) * 100;
      log(ns, `INT ${previous.intel}→${intel} in ${formatNumber(seconds)}s ` +
        `(${formatNumber(intelPerHour)} INT/hr); forecast Δbonus≈${bonusGain.toFixed(3)}%/h; ` +
        `joined ${joinedThisCycle} invitation(s).`, true, 'info');
      stop ||= bonusGain < MIN_PERCENT_BONUS_PER_HOUR;
      ns.write(INTEL_FARM_STATS_FILE, JSON.stringify({intel, time: now}), 'w');
    }
  } else {
    ns.write(INTEL_FARM_STATS_FILE, JSON.stringify({intel, time: now}), 'w');
    log(ns, `Initialized INT farming at ${intel} INT after joining ${joinedThisCycle} invitation(s).`, true, 'info');
  }

  if (stop) {
    state = writeIntelFarmState(ns, {
      ...state,
      phase: IntelFarmPhase.Complete,
      completedAt: now,
      completedIntelligence: intel,
      completionReason: intel >= INTEL_FARM_MAX_INT ? 'target-intelligence' : 'low-roi',
    });
    log(ns, `INT farming complete at ${intel}. Continuing BN${state.originNode} with autopilot.`, true, 'success');
    await singRun(ns, 'softReset', 'autopilot.js');
    return;
  }

  writeIntelFarmState(ns, {
    ...state,
    cycles: (Number(state.cycles) || 0) + 1,
    lastCycleAt: now,
    lastCycleIntelligence: intel,
    lastCycleInvitations: joinedThisCycle,
  });
  await singRun(ns, 'softReset', ns.getScriptName());
}
