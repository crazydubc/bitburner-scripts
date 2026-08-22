const BRIBE_MANAGER_SCRIPT = "corporation-bribes.js";
const START_RETRY_INTERVAL = 250;
const START_TIMEOUT = 30_000;

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(2);
  if (!ns.fileExists(BRIBE_MANAGER_SCRIPT, "home")) return;

  const deadline = Date.now() + START_TIMEOUT;
  while (Date.now() < deadline) {
    if (ns.isRunning(BRIBE_MANAGER_SCRIPT, "home")) return;
    const pid = ns.exec(BRIBE_MANAGER_SCRIPT, "home", { threads: 1, temporary: true });
    if (pid > 0) return;
    await ns.sleep(START_RETRY_INTERVAL);
  }

  ns.print(`Unable to start ${BRIBE_MANAGER_SCRIPT} within ${START_TIMEOUT}ms; ` +
    `the next round-5 investment-offer read will retry.`);
}
