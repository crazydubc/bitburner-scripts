const BRIBE_MANAGER_SCRIPT = "corporation-bribes.js";
const BRIBE_MANAGER_LAUNCHER = "bin/startCorporationBribes.js";

export function shouldStartCorporationBribeManager(fn, response) {
  return fn === "getInvestmentOffer" && Number(response?.round) >= 5;
}

function ensureCorporationBribeManager(ns, fn, response) {
  if (!shouldStartCorporationBribeManager(fn, response)) return;
  if (!ns.fileExists(BRIBE_MANAGER_SCRIPT, "home") ||
    !ns.fileExists(BRIBE_MANAGER_LAUNCHER, "home")) return;
  if (ns.isRunning(BRIBE_MANAGER_SCRIPT, "home") ||
    ns.isRunning(BRIBE_MANAGER_LAUNCHER, "home")) return;

  const pid = ns.exec(BRIBE_MANAGER_LAUNCHER, "home", { threads: 1, temporary: true });
  if (pid === 0)
    ns.print(`Unable to start ${BRIBE_MANAGER_LAUNCHER}; retrying on the next investment-offer read.`);
}

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(23.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from corporation.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const f = ns.corporation?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid corporation function: ${String(fn)}`);

    response = await f(...args);
  } catch {
    // Preserve the existing corpRun contract: corporation API errors return undefined.
    response = undefined;
  }

  try {
    ensureCorporationBribeManager(ns, fn, response);
  } catch (error) {
    ns.print(`Unable to evaluate ${BRIBE_MANAGER_SCRIPT} startup: ${String(error?.stack ?? error)}`);
  }
}
