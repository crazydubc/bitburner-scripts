import {getHacknetPayoffSeconds} from '../speedrun-policy.js';

/** Home owns faction-manager's output; offloaded buyers must not use stale local copies. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Hacknet horizon unavailable';
  ns.atExit(() => port.write(result));
  try {
    const reset = ns.getResetInfo();
    const file = '/data/hacknet-reset-horizon.json';
    if (ns.args[0] === 'update') {
      const deadline = Number(ns.args[1]);
      if (!Number.isFinite(deadline) || deadline < 0 || Number(ns.args[2]) !== reset.lastAugReset)
        throw new Error('Invalid reset horizon update');
      await ns.write(file, JSON.stringify({deadline, current_node: reset.currentNode, last_aug_reset: reset.lastAugReset}), 'w');
      result = true;
      return;
    }
    let snapshot;
    try { snapshot = JSON.parse(ns.read('/Temp/affordable-augs.txt') || 'null'); } catch { snapshot = null; }
    let planned;
    try { planned = JSON.parse(ns.read(file) || 'null'); } catch { planned = null; }
    result = getHacknetPayoffSeconds(Number(ns.args[0]), snapshot, reset, Date.now(), planned);
  } catch (error) { result = `ERROR:${String(error)}`; }
}
