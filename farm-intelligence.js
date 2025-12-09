import { log, waitForProcessToComplete, formatDuration, getFilePath } from './helpers.js'

/** @param {NS} ns */
export async function main(ns) {
    if (ns.getPlayer().skills.intelligence >= 255) return;
    let timeSinceLastAug = Date.now() - ns.getResetInfo().lastAugReset;
    while (timeSinceLastAug > 20 * 60 * 1000) {
      await ns.sleep(5000);
      timeSinceLastAug = Date.now() - ns.getResetInfo().lastAugReset;
    }
    if (timeSinceLastAug > 5000) {
        return ns.singularity.softReset(ns.getScriptName());
    }
    let invites = ns.singularity.checkFactionInvitations();
    while (invites.length < 10) {
      await ns.sleep(5000);
      invites = ns.singularity.checkFactionInvitations();
    }
    await waitForProcessToComplete(ns, ns.run(getFilePath('cleanup.js')));
    // Prepare a very small script that will accept all invites in a tight loop.
    const tempFile = '/Temp/farm-intelligence.js';
    ns.write(tempFile, `export async function main(ns) {
        ns.disableLog('ALL');
        ${JSON.stringify(ns.singularity.checkFactionInvitations())}.forEach(f => ns.singularity.joinFaction(f));
        ns.singularity.softReset('${tempFile}');
    }`, "w");
    ns.run(tempFile);
    log(ns, `SUCCESS: Beginning soft-reset loop to boost intellegence to 255.`, true, 'success');
}