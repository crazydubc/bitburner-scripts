import { INFILTRATION_TARGET, INFILTRATION_LEASE, INFILTRATION_ACK } from '../infiltration-policy.js';

/** Home-owned coordination; target and lease have different writers/files. No game actions. */
export async function main(ns) {
  let result = 'ERROR:Infiltration control unavailable';
  const port = ns.getPortHandle(ns.pid);
  ns.atExit(() => port.write(result));
  try {
    const action = ns.args[0];
    if (action === 'target') {
      await ns.write(INFILTRATION_TARGET, ns.args[1], 'w');
      result = true;
    } else if (action === 'lease') {
      const lease = JSON.parse(ns.read(INFILTRATION_LEASE) || 'null');
      result = !!lease && lease.expires > Date.now() && Number.isInteger(lease.pid) && ns.isRunning(lease.pid);
      if (result && Number.isInteger(ns.args[1]))
        await ns.write(INFILTRATION_ACK, JSON.stringify({pid: lease.pid, workerPid: ns.args[1], at: Date.now()}), 'w');
    } else throw new Error('Unknown infiltration control action');
  } catch (error) { result = `ERROR:${String(error)}`; }
}
