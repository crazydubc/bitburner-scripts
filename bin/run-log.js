import {RUNLOG_FILE, updateRunLog} from '../logger.js';

export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Run log helper exited before reporting';
  ns.atExit(() => port.write(result));
  try {
    const reset = ns.getResetInfo();
    const log = JSON.parse(ns.read(RUNLOG_FILE) || '{"runs":[]}');
    const previous = log.runs?.at(-1);
    const label = ns.args[0] || (previous?.runKey === `${reset.currentNode}:${reset.lastNodeReset}`
      ? previous.currentNode : String(reset.currentNode));
    result = updateRunLog(log, reset, label, JSON.parse(ns.args[1] || '[]'), JSON.parse(ns.args[2] || '{}'));
    await ns.write(RUNLOG_FILE, JSON.stringify(result, null, 2), 'w');
  } catch (error) { result = `ERROR:${String(error)}`; }
}
