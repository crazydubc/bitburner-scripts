import { INTEL_FARM_FILE } from '../progression.js';

/** Authoritative state survives augmentation resets and is scoped to one actual BN run. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result;
  ns.atExit(() => port.write(result));
  try {
    if (ns.getHostname() !== 'home') throw new Error('Intel-farm state must run on home');
    const reset = ns.getResetInfo();
    const raw = ns.read(INTEL_FARM_FILE);
    let state = raw ? JSON.parse(raw) : null;
    if (!state || state.currentNode !== reset.currentNode || state.lastNodeReset !== reset.lastNodeReset)
      state = {currentNode: reset.currentNode, lastNodeReset: reset.lastNodeReset, status: 'prepare'};
    if (ns.args[0] === 'update') {
      const patch = JSON.parse(ns.args[1]);
      const keys = ['status', 'reason', 'startedAt', 'baselineAt', 'baselineIntel', 'completedAt', 'primed'];
      if (!patch || typeof patch !== 'object' || Object.keys(patch).some(key => !keys.includes(key)))
        throw new Error('Invalid intelligence-farm state update');
      state = {...state, ...patch};
      if (!['prepare', 'farming', 'complete'].includes(state.status)) throw new Error('Invalid farm phase');
      await ns.write(INTEL_FARM_FILE, JSON.stringify(state), 'w');
    } else if (ns.args[0] !== 'read') throw new Error('Unknown intelligence-farm state operation');
    result = state;
  } catch (error) { result = `ERROR:${String(error)}`; }
}
