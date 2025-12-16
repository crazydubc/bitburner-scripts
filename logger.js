const RUNLOG_FILE = "/data/bn-run-log.json";

function loadLog(ns) {
  const raw = ns.read(RUNLOG_FILE);
  if (!raw) return { runs: [] };
  try { return JSON.parse(raw); } catch { return { runs: [] }; }
}

function saveLog(ns, log) {
  ns.write(RUNLOG_FILE, JSON.stringify(log, null, 2), "w");
}

function nowIso() {
  return new Date().toISOString();
}

function closeRun(run, endReason, extra = {}) {
  run.endTime = Date.now();
  run.endIso = nowIso();
  run.durationMs = run.endTime - run.startTime;
  run.endReason = endReason;
  Object.assign(run, extra);
}

/** Call once early in your main script */
export function recordBnStart(ns, extra = {}) {
  const r = ns.getResetInfo();
  const currentNode = r.currentNode;
  const currentLevel = r.currentNodeLevel ?? null;

  const log = loadLog(ns);
  const last = log.runs.length ? log.runs[log.runs.length - 1] : null;

  // 1) If the previous run is still open but we are now in a different BN,
  // auto-close it.
  if (last && !last.endTime && last.bn !== currentNode) {
    closeRun(last, "detected_new_bn", { autoClosed: true });
  }

  // 2) If we already have an open run for this BN, do nothing
  const last2 = log.runs.length ? log.runs[log.runs.length - 1] : null;
  if (last2 && !last2.endTime && last2.bn === currentNode) {
    // Still merge in any extra metadata if you want
    Object.assign(last2, extra);
    saveLog(ns, log);
    return;
  }

  // 3) Start a new run entry
  log.runs.push({
    bn: currentNode,
    level: currentLevel,
    startTime: Date.now(),
    startIso: nowIso(),
    endTime: null,
    endIso: null,
    durationMs: null,
    ...extra,
  });

  saveLog(ns, log);
}


function formatDuration(ms) {
  if (ms == null) return "-";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}

//Print summary; call when you want (e.g. at start of autopilot or on demand)
export function printBnRunSummary(ns, lastN = 10) {
  const log = loadLog(ns);
  const runs = log.runs.slice(-lastN);

  ns.tprint(`\n=== Bitnode Run Summary (last ${runs.length}) ===`);
  for (const r of runs) {
    const dur = formatDuration(r.durationMs ?? (r.startTime ? (Date.now() - r.startTime) : null));
    const status = r.endTime ? "DONE" : "IN-PROGRESS";
    ns.tprint(
      `BN${r.bn}${r.level != null ? `.${r.level}` : ""} | ${status} | `
      + `${r.startIso} → ${r.endIso ?? "(now)"} | ${dur}`
      + (r.nextBn != null ? ` | next: BN${r.nextBn}` : "")
    );
  }
}