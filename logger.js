import {runScriptLocal} from './utils.js';

export const RUNLOG_FILE = '/data/bn-run-log.json';

/** Pure journal update; engine timestamps identify runs across restarts and repeated BNs. */
export function updateRunLog(log, reset, label, events = [], extra = {}, now = Date.now()) {
  if (!log || !Array.isArray(log.runs)) throw new Error('Invalid BN run log');
  const start = Number(reset.lastNodeReset), augReset = Number(reset.lastAugReset), node = Number(reset.currentNode);
  if (![start, augReset, node, now].every(Number.isFinite) || start <= 0 || augReset < start || now < start)
    throw new Error('Invalid reset timestamps');
  const key = `${node}:${start}`;
  let last = log.runs.at(-1);
  if (last && !last.runKey && !last.endTime && last.currentNode === label && last.startTime >= start) {
    last.runKey = key;
    last.observedStartTime = last.startTime;
    last.startTime = start;
    last.startIso = new Date(start).toISOString();
  }
  if (last && last.runKey !== key && !last.endTime) {
    last.endTime = start;
    last.endIso = new Date(start).toISOString();
    last.durationMs = Math.max(0, start - last.startTime);
    last.endReason = 'detected_new_bn';
    last.autoClosed = true;
  }
  if (!last || last.runKey !== key) {
    last = {runKey: key, currentNode: label, node, startTime: start, startIso: new Date(start).toISOString(),
      endTime: null, endIso: null, durationMs: null, milestones: []};
    log.runs.push(last);
  }
  last.currentNode = label;
  Object.assign(last, extra);
  last.milestones ??= [];
  for (const event of [{kind: 'augmentation-cycle', key: String(augReset), at: augReset}, ...events]) {
    if (!event || typeof event.kind !== 'string') continue;
    const id = `${augReset}:${event.kind}:${event.key ?? ''}`;
    if (last.milestones.some(entry => entry.id === id)) continue;
    const at = Number.isFinite(event.at) ? event.at : now;
    last.milestones.push({id, kind: event.kind, at, sinceNodeMs: at - start, sinceAugMs: at - augReset,
      ...(event.data === undefined ? {} : {data: event.data})});
  }
  return log;
}

/** The home helper serializes all writers; offloaded copies never overwrite newer history. */
export async function recordRunEvents(ns, events = [], label = '', extra = {}) {
  try {
    const result = await runScriptLocal(ns, 'bin/run-log.js', false, [label, JSON.stringify(events), JSON.stringify(extra)]);
    if (!result || !Array.isArray(result.runs)) throw new Error(String(result));
    return result;
  } catch (error) {
    ns.print(`WARNING: Run timing could not be recorded: ${String(error)}`);
    return null;
  }
}

export async function recordBnStart(ns, currentNode = '1.1', extra = {}) {
  return recordRunEvents(ns, [{kind: 'automation-start'}], currentNode, extra);
}

function formatDuration(ms) {
  if (ms == null) return '-';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m ${s % 60}s`;
}

export function printBnRunSummary(ns, lastN = 10, log) {
  if (!log) {
    try { log = JSON.parse(ns.read(RUNLOG_FILE) || '{"runs":[]}'); } catch { return; }
  }
  ns.tprint(`\n=== Bitnode Run Summary (last ${lastN}) ===`);
  for (const run of log.runs.slice(-lastN)) {
    const duration = formatDuration(run.durationMs ?? (Date.now() - run.startTime));
    ns.tprint(`BN.${run.currentNode} | ${run.endTime ? 'DONE' : 'IN-PROGRESS'} | ` +
      `${run.startIso} → ${run.endIso ?? '(now)'} | ${duration}`);
  }
}
