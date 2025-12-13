import {
  log, runCommand, getNsDataThroughFile, formatNumber
} from './helpers.js'

const STATS_FILE = "/Temp/intFarmStats.txt";
// Stop when extra INT bonus is growing by less than this per hour:
const MIN_PERCENT_BONUS_PER_HOUR = 0.25;
const FORECAST_HOURS = 1;

function intBonus(intel) {
  return 1 + Math.pow(intel, 0.8) / 600;
}

/** @param {NS} ns */
export async function main(ns) {
  const player = await getNsDataThroughFile(ns, 'ns.getPlayer()');
  const intel = player.skills.intelligence;

  //Load previous stats (if any)
  let prev = null;
  const raw = ns.read(STATS_FILE);
  if (raw) {
    try {
      prev = JSON.parse(raw);
    } catch {
      // corrupt file, ignore
    }
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

  //If ROI is bad, bail out to your desired bitnode ---
  if (stopForLowROI) {
    log(ns, `ROI threshold reached, resetting to bitnode 2...`, true, 'info');
    await ns.sleep(5000);
    await runCommand(ns,
      `ns.singularity.b1tflum3(ns.args[0], ns.args[1], { sourceFileOverrides: new Map() })`,
      '/Temp/b1tflum3.js',
      [2, 'autopilot.js']
    );
    return;
  }

  //Normal farming
  for (const loc of ['Chongqing', 'New Tokyo', 'Ishima']) {
    await runCommand(ns,
      `ns.singularity.travelToCity(ns.args[0], { sourceFileOverrides: new Map() })`,
      '/Temp/travelToCity.js',
      [loc]
    );
    const invs = ns.singularity.checkFactionInvitations();
    for (const inv of invs) {
      await runCommand(ns,
        `ns.singularity.joinFaction(ns.args[0], { sourceFileOverrides: new Map() })`,
        '/Temp/joinFaction.js',
        [inv]
      );
    }
  }

  // Soft reset back into this script to keep farming
  await runCommand(ns,
    `ns.singularity.softReset(ns.args[0], { sourceFileOverrides: new Map() })`,
    '/Temp/softReset.js',
    [ns.getScriptName()]
  );
}
