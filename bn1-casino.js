import {main as coinflip} from './coinflip.js';
import {firstBn1, BN1_SESSION} from './bn1-policy.js';
export async function main(ns) {
    // Direct player reads avoid an overlapping home RPC on the initial 8 GB machine.
    ns.ramOverride(6.5);
    if (ns.getHostname() !== 'home' && ns.ramOverride(16) < 16) return ns.tprint('Free 16 GB for the remote BN1 casino/controller handoff.');
    const reset = ns.getResetInfo();
    if (!firstBn1(reset)) return;
    const wnd = globalThis['window'];
    const session = {pid: ns.pid, stop: false, expires: 0, lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset};
    if (wnd) wnd[BN1_SESSION] = session;
    ns.atExit(() => { session.stop = true; if (!session.handoff) session.paused = true; }, 'bn1-casino');
    await coinflip(ns, async n => n.getPlayer());
    if (ns.getMoneySources().sinceInstall.casino >= 10e9 && !session.stop) {
        session.handoff = Date.now() + 5000;
        ns.spawn('bn1-auto.js', {threads: 1, spawnDelay: 0, ramOverride: ns.getHostname() === 'home' ? 8 : 16});
    } else {
        session.paused = true;
        ns.tprint('BN1 casino stopped before completion. Resolve the casino screen, then run bn1-auto.js.');
    }
}
