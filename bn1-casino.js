import {main as coinflip} from './coinflip.js';
import {firstBn1} from './bn1-policy.js';
export async function main(ns) {
    // Direct player reads avoid an overlapping home RPC on the initial 8 GB machine.
    ns.ramOverride(6.5);
    if (ns.getHostname() !== 'home' || !firstBn1(ns.getResetInfo())) return;
    await coinflip(ns, async n => n.getPlayer());
    if (ns.getMoneySources().sinceInstall.casino >= 10e9)
        ns.spawn('bn1-auto.js', {threads: 1, spawnDelay: 0});
    else ns.tprint('BN1 casino stopped before completion. Resolve the casino screen, then run bn1-auto.js.');
}
