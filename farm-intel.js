import {
  log, formatNumber, getPlayerInfo, getReset, runScriptSomewhere, singRun
} from './utils.js';
import {
  INTEL_FARM_STATS_FILE, getMissingCorporateFactions, writeIntelFarmState
} from './intel-farm.js';

const FORECAST_HOURS = 1;
const MIN_PERCENT_BONUS_PER_HOUR = 0.5;

function intBonus(intelligence) {
  return 1 + Math.pow(intelligence, 0.8) / 600;
}

/** @param {NS} ns */
function getFileData(ns, file) {
  const raw = ns.read(file);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getInvitations(ns) {
  const invitations = await singRun(ns, 'checkFactionInvitations');
  if (!Array.isArray(invitations)) throw new Error(`checkFactionInvitations returned ${String(invitations)}`);
  return invitations;
}

async function joinInvitations(ns, invitations) {
  for (const invitation of invitations) await singRun(ns, 'joinFaction', invitation);
}

/** @param {NS} ns */
export async function main(ns) {
  const resetInfo = await getReset(ns);
  let player = await getPlayerInfo(ns);
  let invitations = await getInvitations(ns);
  const missingCorporateFactions = getMissingCorporateFactions(player.factions, invitations);

  // Do not reset here: an unexpected missing company invite means autopilot must resume the company-reputation grind
  // without erasing partial company reputation.
  if (missingCorporateFactions.length > 0) {
    writeIntelFarmState(ns, {
      phase: "corporate-invites",
      currentNode: resetInfo.currentNode,
      lastNodeReset: resetInfo.lastNodeReset,
      missingCorporateFactions,
    });
    log(ns, `WARNING: Intelligence farming paused because corporate access is incomplete: ` +
      `${missingCorporateFactions.join(', ')}. Returning control to autopilot without resetting.`, true, 'warning');
    await runScriptSomewhere(ns, 'autopilot.js', true, []);
    return;
  }

  writeIntelFarmState(ns, {
    phase: "running",
    currentNode: resetInfo.currentNode,
    lastNodeReset: resetInfo.lastNodeReset,
    missingCorporateFactions: [],
    startedAt: Date.now(),
  });

  // Corporate invitations survive augmentation installs. Joining every invitation first earns the Singularity INT
  // reward from all preserved corporate factions on each cycle.
  await joinInvitations(ns, invitations);
  for (const city of ['Chongqing', 'New Tokyo', 'Ishima']) {
    await singRun(ns, 'travelToCity', city);
    invitations = await getInvitations(ns);
    await joinInvitations(ns, invitations);
  }

  player = await getPlayerInfo(ns);
  const intelligence = Number(player.skills.intelligence) || 0;
  const now = Date.now();
  const previous = getFileData(ns, INTEL_FARM_STATS_FILE);
  let stopForLowROI = false;

  if (previous?.lastNodeReset === resetInfo.lastNodeReset &&
    Number.isFinite(previous.intelligence) && Number.isFinite(previous.time)) {
    const gainedIntelligence = intelligence - previous.intelligence;
    if (gainedIntelligence > 0) {
      const elapsedSeconds = Math.max((now - previous.time) / 1000, Number.EPSILON);
      const intelligencePerHour = gainedIntelligence / elapsedSeconds * 3600;
      const futureIntelligence = intelligence + intelligencePerHour * FORECAST_HOURS;
      const bonusNow = intBonus(intelligence);
      const bonusFuture = intBonus(futureIntelligence);
      const bonusGainPercent = (bonusFuture - bonusNow) / bonusNow * 100;

      log(ns,
        `INT ${previous.intelligence}→${intelligence} in ${formatNumber(elapsedSeconds)}s ` +
        `(${formatNumber(intelligencePerHour)} INT/hr). ` +
        `Forecast Δbonus≈${bonusGainPercent.toFixed(3)}% in next ${FORECAST_HOURS}h`,
        true,
        "info"
      );
      stopForLowROI = bonusGainPercent < MIN_PERCENT_BONUS_PER_HOUR;
      ns.write(INTEL_FARM_STATS_FILE,
        JSON.stringify({ intelligence, time: now, lastNodeReset: resetInfo.lastNodeReset }), "w");
    }
  } else {
    ns.write(INTEL_FARM_STATS_FILE,
      JSON.stringify({ intelligence, time: now, lastNodeReset: resetInfo.lastNodeReset }), "w");
  }

  if (stopForLowROI) {
    writeIntelFarmState(ns, {
      phase: "complete",
      completedAt: now,
      completedIntelligence: intelligence,
      currentNode: resetInfo.currentNode,
      lastNodeReset: resetInfo.lastNodeReset,
      missingCorporateFactions: [],
    });
    log(ns, `ROI threshold reached at ${intelligence} INT. Returning to normal progression in ` +
      `BitNode ${resetInfo.currentNode}.`, true, 'success');
    await singRun(ns, 'softReset', 'autopilot.js');
    return;
  }

  // Stay in this BitNode and repeat. CashRoot supplies the money and BruteSSH.exe needed after every reset.
  await singRun(ns, 'softReset', ns.getScriptName());
}
