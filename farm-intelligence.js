import {
  log, getNsDataThroughFile, formatNumber, runCmdAsScript
} from './helpers.js'

const STATS_FILE = "/Temp/intFarmStats.txt";
const CONFIG_FILE = "/Temp/intFarmConf.txt";
const FORECAST_HOURS = 1;

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
export async function SaveFarmConfig(ns, nextBN, minPercent) {
  ns.write(CONFIG_FILE, JSON.stringify({ nextBN, minPercent }), "w");
}

/** @param {NS} ns */
export async function main(ns) {
  const player = await getNsDataThroughFile(ns, 'ns.getPlayer()');
  const intel = player.skills.intelligence; //0.5% bonus per hour
  let MIN_PERCENT_BONUS_PER_HOUR = 0.5;
  let next_BN = 2; //default is BN 2

  //Load previous stats (if any)
  let prev = getFileData(ns, STATS_FILE);
  let conf = getFileData(ns, CONFIG_FILE);
  if (conf) {
    next_BN = conf.nextBN;
    MIN_PERCENT_BONUS_PER_HOUR = conf.minPercent;
  }

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
    await runCmdAsScript(ns, `ns.singularity.travelToCity`, [loc]);
    const invs = await runCmdAsScript(ns, `ns.singularity.checkFactionInvitations`);
    for (const inv of invs) {
      await runCmdAsScript(ns, `ns.singularity.joinFaction`, [inv]);
    }
  }

  //If ROI is bad, bail out to your desired bitnode ---
  if (stopForLowROI) {
    log(ns, `ROI threshold reached, resetting to bitnode ${next_BN}...`, true, 'info');
    await ns.sleep(2000);
    await runCmdAsScript(ns, `ns.singularity.b1tflum3`, [next_BN, 'autopilot.js']);
    return;
  }

  // Soft reset back into this script to keep farming
  await runCmdAsScript(ns, `ns.singularity.softReset`, [ns.getScriptName()]);
}