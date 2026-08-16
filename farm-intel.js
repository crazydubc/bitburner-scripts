import {
  log, formatNumber, getPlayerInfo, singRun, bitflume
} from './utils.js'

const STATS_FILE = "/Temp/intFarmStats.txt";
const FORECAST_HOURS = 1;
const INVITE_CHECK_INTERVAL = 15_000;
const COMPANY_FACTIONS = [
  "Bachman & Associates", "ECorp", "Clarke Incorporated", "OmniTek Incorporated", "NWO",
  "Blade Industries", "MegaCorp", "KuaiGong International", "Fulcrum Secret Technologies", "Four Sigma"
];

function intBonus(intel) {
  return 1 + Math.pow(intel, 0.8) / 600;
}
/** @param {NS} ns */
function getFileData(ns, file) {
  let prev = null;
  const raw = ns.read(file);
  if (raw) {
    try {
      prev = JSON.parse(raw);
    } catch {
      // corrupt file, ignore
    }
  }
  return prev;
}

/** @param {NS} ns */
async function waitForCompanyAccess(ns) {
  let lastStatus = "";
  while (true) {
    const invitations = await singRun(ns, 'checkFactionInvitations');
    const player = await getPlayerInfo(ns);
    const available = new Set([
      ...(Array.isArray(player?.factions) ? player.factions : []),
      ...(Array.isArray(invitations) ? invitations : []),
    ]);
    const missing = COMPANY_FACTIONS.filter(faction => !available.has(faction));
    if (missing.length === 0) return;

    const status = missing.join('|');
    if (status !== lastStatus) {
      lastStatus = status;
      log(ns, `Waiting for corporate faction access before INT farming: ` +
        `${COMPANY_FACTIONS.length - missing.length}/${COMPANY_FACTIONS.length} ready; ` +
        `missing [${missing.join(', ')}].`, true, 'info');
    }
    await ns.sleep(INVITE_CHECK_INTERVAL);
  }
}

/** @param {NS} ns */
export async function main(ns) {
  /*const timeSinceLastAug = Date.now() - (await getReset(ns)).lastAugReset;
  while (timeSinceLastAug > 20 * 60 * 1000) {
    await ns.sleep(10000); //sleep till the next reset.
  }*/
  await waitForCompanyAccess(ns);
  const player = await getPlayerInfo(ns);
  const intel = player.skills.intelligence; //0.5% bonus per hour
  let MIN_PERCENT_BONUS_PER_HOUR = 0.5;

  //Load previous stats (if any)
  let prev = getFileData(ns, STATS_FILE);

  const now = Date.now();
  let stopForLowROI = false;

  if (prev && typeof prev.intel === "number" && typeof prev.time === "number") {
    const dInt = intel - prev.intel;

    // Do rate/forecast math when INT increased
    if (dInt > 0) {
      const dtSec = (now - prev.time) / 1000;
      const intPerHour = dInt / dtSec * 3600;

      const I_now = intel;
      const I_future = I_now + intPerHour * FORECAST_HOURS;

      const bonusNow = intBonus(I_now);
      const bonusFuture = intBonus(I_future);
      const bonusGainPct = (bonusFuture - bonusNow) / bonusNow * 100;

      log(ns,
        `INT ${prev.intel}→${intel} in ${formatNumber(dtSec)}s `
        + `(${formatNumber(intPerHour)} INT/hr). `
        + `Forecast Δbonus≈${bonusGainPct.toFixed(3)}% in next ${FORECAST_HOURS}h`,
        true,
        "info"
      );

      if (bonusGainPct < MIN_PERCENT_BONUS_PER_HOUR) {
        stopForLowROI = true;
      }

      // Reset baseline to this INT level and time
      ns.write(STATS_FILE, JSON.stringify({ intel, time: now }), "w");
    }
  } else {
    // First time / no previous data: initialize baseline
    ns.write(STATS_FILE, JSON.stringify({ intel, time: now }), "w");
  }
  //Normal farming
  for (const loc of ['Chongqing', 'New Tokyo', 'Ishima']) {
    await singRun(ns, 'travelToCity', loc);
    const invs = await singRun(ns, 'checkFactionInvitations');
    for (const inv of invs) {
      await singRun(ns, 'joinFaction', inv);
    }
  }

  //If ROI is bad, bail out to your desired bitnode ---
  if (stopForLowROI) {
    log(ns, `ROI threshold reached, resetting...`, true, 'info');
    return await singRun(ns, 'softReset', 'autopilot.js');
  }

  // Soft reset back into this script to keep farming
  await singRun(ns, 'softReset', ns.getScriptName());
}