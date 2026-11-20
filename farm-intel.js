import { log, getPlayerInfo, getReset, singRun, runScriptLocal, getFilePath, isScriptRunning } from './utils.js';
import { getIntelFarmReadiness, getIntelFarmStopReason, intelFarmState } from './progression.js';

async function resumeAutopilot(ns) {
  if (!await isScriptRunning(ns, getFilePath('autopilot.js')))
    await runScriptLocal(ns, getFilePath('autopilot.js'), true, []);
}

/** Farm within this BN only; progress and completion always live on home. */
export async function main(ns) {
  try {
    await farmWithinNode(ns);
  } catch (error) {
    log(ns, `WARNING: Intelligence farm interrupted: ${String(error)}. Resuming autopilot in this BN.`, true, 'warning');
    try { await resumeAutopilot(ns); }
    catch (resumeError) { log(ns, `ERROR: Could not restart autopilot: ${String(resumeError)}. Free home RAM and run autopilot.js.`, true, 'error'); }
  }
}

async function farmWithinNode(ns) {
  if (ns.getHostname() !== 'home') {
    if (!ns.ps('home').some(process => process.filename === getFilePath('farm-intel.js')))
      await runScriptLocal(ns, getFilePath('farm-intel.js'), true, []);
    return;
  }
  const player = await getPlayerInfo(ns);
  const reset = await getReset(ns);
  let state = await intelFarmState(ns);
  const intel = Number(player.skills.intelligence);
  const now = Date.now();
  const reason = getIntelFarmStopReason(state, intel, now);
  const installed = [...(reset.ownedAugs instanceof Map ? reset.ownedAugs.keys() : Object.keys(reset.ownedAugs ?? {}))];

  // Check completion before doing any more travel, joins, or resets.
  if (reason) {
    if (state.status !== 'complete') await intelFarmState(ns, {status: 'complete', reason, completedAt: now});
    log(ns, `Intelligence farming complete (${reason}, INT ${intel}). Resuming this BN.`, true, 'info');
    await resumeAutopilot(ns);
    return;
  }
  if (!getIntelFarmReadiness(player, installed, [], reset.ownedSF, state).needed) {
    log(ns, 'Intelligence farming requires unlocked SF4/SF5 and a valid intelligence level. Resuming this BN.', true, 'warning');
    await resumeAutopilot(ns);
    return;
  }
  const invitations = await singRun(ns, 'checkFactionInvitations');
  const readiness = getIntelFarmReadiness(player, installed, invitations, reset.ownedSF, state);
  if (!readiness.ready) {
    log(ns, 'Intelligence farming paused: requires SF4/SF5, installed CashRoot and all ten company factions/invitations. Resuming preparation in this BN.', true, 'warning');
    await resumeAutopilot(ns);
    return;
  }
  if (state.status !== 'farming') {
    state = await intelFarmState(ns, {status: 'farming', startedAt: now, baselineAt: now, baselineIntel: intel});
  } else if (intel > state.baselineIntel && now - state.baselineAt >= 60_000) {
    // A full sample passed the ROI check above; begin the next observation window.
    await intelFarmState(ns, {baselineAt: now, baselineIntel: intel});
  }
  let joins = 0;
  for (const city of ['Chongqing', 'New Tokyo', 'Ishima']) {
    await singRun(ns, 'travelToCity', city);
    const invites = await singRun(ns, 'checkFactionInvitations');
    if (!Array.isArray(invites)) throw new Error('Could not read faction invitations for intelligence farming');
    for (const faction of invites) if (await singRun(ns, 'joinFaction', faction) === true) joins++;
  }
  // One initial reset may be needed when the ten company factions are already joined.
  // Their invitations survive installation. Never repeat empty resets after that priming cycle.
  if (!joins && state.primed) {
    await intelFarmState(ns, {status: 'complete', reason: 'no-joins', completedAt: Date.now()});
    log(ns, 'No faction joins succeeded; ending the farm and resuming this BN.', true, 'warning');
    await resumeAutopilot(ns);
    return;
  }
  if (!state.primed) await intelFarmState(ns, {primed: true});
  await singRun(ns, 'softReset', getFilePath('farm-intel.js'));
}
