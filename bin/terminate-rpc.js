/** Only terminate the exact child PID that its waiting parent declared unresponsive. */
export function main(ns) {
  const pid = Number(ns.args[0]);
  if (Number.isInteger(pid) && pid > 0) ns.kill(pid);
}
