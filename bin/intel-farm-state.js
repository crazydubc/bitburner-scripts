import { INTEL_FARM_FILE, bn103StudyNode, finalStudyProof } from '../progression.js';

/** Authoritative state survives augmentation resets and is scoped to one actual BN run. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result;
  ns.atExit(() => port.write(result));
  try {
    if (ns.getHostname() !== 'home') throw new Error('Intel-farm state must run on home');
    const reset = ns.getResetInfo();
    const sleeves = ns.args[2] === 'sleeves';
    const final = ns.args[2] === 'bn10-final';
    if (final && !bn103StudyNode(reset)) throw new Error('Final sleeve study is only available in BN10.3');
    const file = final ? '/data/bn10-final-sleeve-intel.json' : sleeves ? '/data/sleeve-intel-farm-state.json' : INTEL_FARM_FILE;
    const raw = ns.read(file);
    let state = raw ? JSON.parse(raw) : null;
    if (!state || state.currentNode !== reset.currentNode || state.lastNodeReset !== reset.lastNodeReset)
      state = {currentNode: reset.currentNode, lastNodeReset: reset.lastNodeReset, status: 'prepare'};
    if (ns.args[0] === 'update') {
      const patch = JSON.parse(ns.args[1]);
      const keys = final ? ['status', 'minRate', 'minReturn', 'report'] : sleeves ? ['status', 'target'] : ['status', 'reason', 'startedAt', 'baselineAt', 'baselineIntel', 'completedAt', 'primed'];
      if (!patch || typeof patch !== 'object' || Object.keys(patch).some(key => !keys.includes(key)))
        throw new Error('Invalid intelligence-farm state update');
      if (final) {
        if (![patch.minRate, patch.minReturn].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid final-study thresholds');
        if (patch.status === 'complete') {
          if (state.status !== 'farming' || state.minRate !== patch.minRate || state.minReturn !== patch.minReturn ||
              !finalStudyProof(patch.report, state.minRate, state.minReturn, reset.lastAugReset)) throw new Error('Unconfirmed final study result');
        } else if (patch.status !== 'farming') throw new Error('Invalid final study request');
        if (patch.status === 'farming') delete state.report;
      }
      state = {...state, ...patch};
      if (!['prepare', 'farming', 'complete'].includes(state.status)) throw new Error('Invalid farm phase');
      if (sleeves && (!Number.isSafeInteger(state.target) || state.target <= 0)) throw new Error('Invalid sleeve INT target');
      await ns.write(file, JSON.stringify(state), 'w');
    } else if (ns.args[0] !== 'read') throw new Error('Unknown intelligence-farm state operation');
    result = state;
  } catch (error) { result = `ERROR:${String(error)}`; }
}
