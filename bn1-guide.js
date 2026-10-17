// A read-only, non-modal guide for the first BN1 run. No Singularity calls.
import { isScriptRunning } from './utils.js';

export const BN1_CRACKERS = [
  ['BruteSSH.exe', 500_000], ['FTPCrack.exe', 1_500_000],
  ['relaySMTP.exe', 5_000_000], ['HTTPWorm.exe', 30_000_000], ['SQLInject.exe', 250_000_000],
];
export const BN1_FACTION_SERVERS = [
  ['CSEC', 'CyberSec'], ['avmnite-02h', 'NiteSec'],
  ['I.I.I.I', 'The Black Hand'], ['run4theh111z', 'BitRunners'],
];

const action = (id, title, ...steps) => ({ id, title, steps });
const money = value => '$' + Math.floor(value).toLocaleString('en-US');

/** Pure decision function: snapshots can be tested without a game or Singularity. */
export function getBn1Guidance(s) {
  const { player, reset } = s;
  if (reset.currentNode !== 1 || reset.ownedSF.has(1) || reset.ownedSF.has(4))
    return action('finished', 'BN1.1 guidance is complete', 'This guide is for your first BN1 run, before Singularity automation.');
  const installed = reset.ownedAugs.size;
  const hacking = player.skills.hacking;
  if (reset.ownedAugs.has('The Red Pill') && s.daemon?.hasAdminRights && hacking >= s.daemon.requiredHackingSkill)
    return action('finish-node', 'Finish BN1 and select BN4', 'Run scan.js with the terminal visible; connect to w0r1d_d43m0n and backdoor it.', 'Select BN4 next, then complete BN4 three times for full Singularity automation.');
  if (s.casinoEarned < 10e9) {
    if (player.city !== 'Aevum' && player.money < 250_000)
      return action('seed-money', 'Earn travel money', 'At the Slums, repeat a reliable short crime such as shoplifting or mugging.', `Aim for $250,000: $200,000 travel plus a betting cushion. Current cash: ${money(player.money)}.`);
    if (player.city !== 'Aevum')
      return action('travel', 'Travel to Aevum', 'Use the Travel screen, then return to the terminal.', 'Run coinflip.js once you arrive.');
    if (player.money < 10_000)
      return action('bet-money', 'Earn a betting cushion', 'Use a reliable short crime to reach $10,000, then run coinflip.js.');
    return action('casino', 'Finish the coinflipper', 'Run coinflip.js if it is not already running.', 'Wait for its success message confirming $10 billion earned from the casino.', `Casino earnings this installation: ${money(s.casinoEarned)} / $10,000,000,000.`, '"You can do something else now" only ends sampling. Keep the $8b reserve and wait before buying stocks.');
  }
  if (s.homeRam < 64)
    return action('home-ram', 'Upgrade home RAM', 'At a computer store, upgrade home to at least 64 GB; 128 GB gives more helper headroom.', 'Then run bn1-guide.js again. Home RAM survives augmentation installations.');
  if (!s.hasTor)
    return action('tor', 'Buy a TOR router', 'Visit a technology store such as Alpha Enterprises and buy the $200,000 TOR router.');
  const nextCracker = BN1_CRACKERS.find(([file]) => !s.crackers.includes(file));
  if (nextCracker && player.money >= nextCracker[1])
    return action(`buy-${nextCracker[0]}`, `Buy ${nextCracker[0]}`, `In the terminal: buy ${nextCracker[0]}`, 'Then run Tasks/crack-host.js to open more worker servers.', 'Buy the port crackers individually. buy -a also buys expensive optional programs.');
  if (!s.autopilotRunning)
    return action('autopilot', 'Start your hacking automation', 'Run autopilot.js on home if it is not already running on another server.', 'Watch its log and Active Scripts for a running kernel and advancing preparation.');
  if (reset.ownedAugs.has('The Red Pill'))
    return action('daemon-prep', 'Prepare the final server', `Reach hacking ${s.daemon?.requiredHackingSkill ?? 3000}; current level ${hacking}.`, 'Buy all five port crackers, run Tasks/crack-host.js, then use scan.js to connect/backdoor w0r1d_d43m0n.');
  if (player.factions.includes('Daedalus'))
    return action('red-pill', 'Work toward The Red Pill', 'Work for Daedalus until you can buy The Red Pill (2.5m reputation in BN1).', 'If it is already purchased, install it from the Augmentations screen.', 'After installation, run bn1-guide.js again.');
  if (installed >= 30 && hacking >= 2500)
    return action('daedalus', 'Secure the Daedalus invitation', `${installed}/30 distinct installed augmentations; hacking ${hacking}/2500.`, `Hold $100b in cash until invited. Current cash: ${money(player.money)}. Stocks do not count as cash.`, 'Check Factions for the invitation and join Daedalus.');
  for (const [host, faction] of BN1_FACTION_SERVERS) {
    const server = s.servers[host];
    if (player.factions.includes(faction) || !server) continue;
    if (server.backdoorInstalled)
      return action(`join-${faction}`, `Join ${faction}`, 'Open Factions and accept the invitation when it arrives.', `Then select hacking work for ${faction}.`);
    if (hacking >= server.requiredHackingSkill && s.crackers.length >= server.numOpenPortsRequired)
      return action(`backdoor-${host}`, `Backdoor ${host} for ${faction}`, ...(server.hasAdminRights ? [] : ['Run Tasks/crack-host.js first.']), 'With the terminal visible, run scan.js and use its backdoor link.', 'Return to Factions and accept the invitation.');
  }
  if (!player.factions.includes('CyberSec'))
    return action('train-hacking', 'Study for CyberSec access', `Study Algorithms until hacking ${s.servers.CSEC?.requiredHackingSkill ?? 'meets CSEC\'s displayed requirement'}.`, 'Buy BruteSSH.exe when affordable, then run Tasks/crack-host.js.', 'Your hacking scripts can earn while you study.');
  const cashRoot = reset.ownedAugs.has('CashRoot Starter Kit');
  return action('augmentations', 'Work, buy a useful bundle, then install',
    'Manually work for your next useful hacking/faction augmentation. Focus work when practical.',
    'Buy expensive desired augmentations first where prerequisites allow; buy NeuroFlux with leftovers.',
    ...(cashRoot ? [] : ['For faster restarts: join Sector-12 with $15m cash; CashRoot costs 12.5k rep / $125m base. Avoid conflicting city factions until acquired.']),
    'Install when the new bundle will accelerate progress more than waiting. There is no mandatory four-hour wait.',
    `${installed}/30 distinct installed augmentations toward Daedalus; repeated NeuroFlux levels count once.`,
    'Spend suitable leftovers on home RAM. After installation, run bn1-guide.js again.');
}

/** @param {NS} ns */
export async function readBn1Snapshot(ns) {
  const reset = ns.getResetInfo();
  const homeRam = ns.getServerMaxRam('home');
  return {
    reset, player: ns.getPlayer(), homeRam, hasTor: ns.hasTorRouter(),
    casinoEarned: ns.getMoneySources().sinceInstall.casino ?? 0,
    crackers: BN1_CRACKERS.map(([file]) => file).filter(file => ns.fileExists(file, 'home')),
    // Autopilot can be offloaded. The lookup uses a home helper, so skip it in
    // low-RAM mode, where casino/RAM guidance takes priority over automation.
    autopilotRunning: homeRam >= 64 && await isScriptRunning(ns, 'autopilot.js'),
    servers: Object.fromEntries(BN1_FACTION_SERVERS.map(([host]) => [host, ns.getServer(host)])),
    daemon: reset.ownedAugs.has('The Red Pill') && ns.serverExists('w0r1d_d43m0n') ? ns.getServer('w0r1d_d43m0n') : null,
  };
}

/** Run directly on fresh 8 GB home, or automatically from autopilot after upgrading home. @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([['no-tail', false], ['once', false]]);
  if (ns.getHostname() !== 'home') { ns.tprint('Run bn1-guide.js on home.'); return; }
  if (ns.ps('home').some(p => p.filename === ns.getScriptName() && p.pid !== ns.pid)) return;
  ns.disableLog('ALL');
  if (!options['no-tail']) { ns.ui.openTail(); ns.ui.resizeTail(740, 440); }
  ns.ui.setTailTitle('BN1.1 — Next action');
  let previous = '', lastToast = -Infinity;
  while (true) {
    const snapshot = await readBn1Snapshot(ns);
    const next = getBn1Guidance(snapshot);
    ns.clearLog();
    ns.print(`BN1.1 — ${next.title}\n`);
    for (const step of next.steps) ns.print(`• ${step}`);
    ns.print('\nManual steps are needed until SF4. This panel does not spend money or change your work.');
    if (snapshot.homeRam < 64) {
      ns.print('\nLow-RAM mode: this guide exits now to free room for coinflip and its helpers.');
      ns.print('After casino completion, upgrade home RAM and run bn1-guide.js again.');
      ns.tprint(`BN1.1: ${next.title}. See the guide log for your next steps; rerun bn1-guide.js after this step.`);
      return;
    }
    if (next.id === 'finished' || options.once) return;
    const key = `${snapshot.reset.lastAugReset}:${next.id}`;
    if (key !== previous && Date.now() - lastToast >= 15_000) {
      ns.toast(`BN1.1: ${next.title} — see bn1-guide.js`, 'info', 6000);
      previous = key;
      lastToast = Date.now();
    }
    await ns.sleep(5000);
  }
}
