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
const factionTargets = {
  CyberSec: [['Neurotrainer I', '1k'], ['BitWire', '3.75k']],
  'Sector-12': [['CashRoot Starter Kit', '12.5k']],
  NiteSec: [['Neurotrainer II', '10k'], ['CRTX42-AA Gene Modification', '45k']],
  'The Black Hand': [['The Black Hand', '100k']],
  BitRunners: [['BitRunners Neurolink', '875k']],
  'Tian Di Hui': [['Neuroreceptor Management Implant', '75k']],
};
const installReminder = 'Before final purchases/install: stop every autopilot.js instance in Active Scripts (including remote hosts), then run stockmaster.js --liquidate on home. Verify all stock positions are zero; keep autopilot stopped until installation.';

function factionWorkAdvice(s) {
  for (const [faction, targets] of Object.entries(factionTargets)) {
    if (!s.player.factions.includes(faction)) continue;
    const missing = targets.filter(([name]) => !s.reset.ownedAugs.has(name));
    if (missing.length) return `Suggested work: Factions > ${faction} > Hacking Contracts. Targets: ${missing.map(([name, rep]) => `${name} (${rep} rep)`).join(', ')}.`;
  }
  return 'Work for a joined faction with a useful unowned hacking/faction-reputation augmentation; use the roadmap to compare your next target.';
}

/** Advisory manual checklist: this never trades, stops scripts, or installs augmentations. */
export function getBn1InstallGuidance() {
  return action('install-checklist', 'Before installing augmentations',
    'First check your desired bundle, reputation, prerequisites, and queued purchases in the faction/Augmentations screens.',
    'Stop every autopilot.js instance using Active Scripts, including any offloaded instance. Otherwise it can restart stock trading. Keep it stopped until installation.',
    'On home, run stockmaster.js --liquidate (short form: run stockmaster.js -l). This stops other stockmaster instances and sells long and short positions.',
    'Wait for the sale summary and verify zero positions on the Stock Market screen. Without TIX API access, sell manually there; skip selling if you hold no stocks.',
    'Pause other spending scripts if they compete for cash. Buy desired expensive augmentations first where prerequisites allow, then NeuroFlux with suitable leftovers.',
    'Spend suitable remaining cash on home RAM/cores, then use the Augmentations screen to install. Do not install while stocks remain held.',
    'After installation, run bn1-guide.js again. If you cancel the installation, restart autopilot.js when ready to resume automation.',
    'This checklist stays in its log after exiting. The normal guide may still suggest starting automation; leave it stopped while finishing this checklist.');
}

/** A suggested route, not a requirement to buy every listed augmentation. */
export function getBn1FactionRoadmap(s) {
  const targetsFor = faction => factionTargets[faction].map(([name, rep]) =>
    `${name} (${s.reset.ownedAugs.has(name) ? 'installed' : `${rep} rep`})`).join(', ');
  const factionSteps = BN1_FACTION_SERVERS.map(([host, faction], i) => {
    const server = s.servers[host];
    const ports = server?.numOpenPortsRequired ?? i + 1;
    const access = s.player.factions.includes(faction) ? 'joined' : server?.backdoorInstalled
      ? 'backdoor installed; accept the invitation in Factions'
      : `backdoor ${host}: hacking ${server?.requiredHackingSkill ?? 'shown on server'}, ${ports} port${ports === 1 ? '' : 's'}`;
    return `${i + 1}. ${faction} [${access}]. Example targets: ${targetsFor(faction)}.`;
  });
  return action('faction-roadmap', 'Faction roadmap',
    'Main route: CyberSec -> NiteSec -> The Black Hand -> BitRunners -> Daedalus. Take productive bundles along the way; do not wait to buy every augmentation in a faction.',
    'How: root/backdoor the server using Tasks/crack-host.js and scan.js, accept its invitation in Factions, then choose Hacking Contracts. Focus when practical; check the displayed reputation gain when comparing work types.',
    ...factionSteps,
    `Early side stop: Sector-12. Visit with $15m cash and accept its invitation; choose Hacking Contracts for ${targetsFor('Sector-12')}. CashRoot speeds up future restarts.`,
    'Keep Sector-12 available until you have CashRoot: do not join Chongqing, New Tokyo, Ishima, or Volhaven city factions first. Visiting those cities is fine; if already locked out this installation, return after a reset.',
    `Optional for unattended work: Tian Di Hui. Hacking 50, $1m cash, and visit Chongqing/New Tokyo/Ishima; accept Tian Di Hui, then choose Hacking Contracts for ${targetsFor('Tian Di Hui')}. Installing it removes the unfocused-work penalty; do not make this a mandatory detour.`,
    `5. Daedalus: 30 distinct installed augmentations, hacking 2500, and $100b cash. Current installed count: ${s.reset.ownedAugs.size}/30. Join, choose Hacking Contracts, and earn 2.5m rep for The Red Pill.`,
    'While building toward 30, add affordable distinct augmentations from joined factions. Repeated NeuroFlux levels count once. Prioritize useful upgrades before buying count-only additions.',
    'Rep targets are BN1 reference values; check current requirements/prices in game. The guide sees installed augmentations, not queued purchases or faction reputation: skip already purchased targets and compare the next useful upgrade.',
    'Before installing any bundle, run bn1-guide.js --install for the stock-liquidation checklist.');
}

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
      return action('seed-money', 'Earn travel money', 'Go to city->slums->mug to earn money for travel.', `Aim for $250,000: $200,000 travel plus a betting cushion. Current cash: ${money(player.money)}.`);
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
    return action('autopilot', 'Start your hacking automation', 'Run autopilot.js on home if it is not already running on another server.', 'Watch its log and Active Scripts for a running kernel and advancing preparation.', 'If you stopped it to prepare an augmentation install, keep it stopped and follow run bn1-guide.js --install instead.');
  if (reset.ownedAugs.has('The Red Pill'))
    return action('daemon-prep', 'Prepare the final server', `Reach hacking ${s.daemon?.requiredHackingSkill ?? 3000}; current level ${hacking}.`, 'Buy all five port crackers, run Tasks/crack-host.js, then use scan.js to connect/backdoor w0r1d_d43m0n.');
  if (player.factions.includes('Daedalus'))
    return action('red-pill', 'Work toward The Red Pill', 'In Factions > Daedalus, choose Hacking Contracts until you can buy The Red Pill (2.5m reputation in BN1).', installReminder, 'Run bn1-guide.js --install for the full checklist, then buy The Red Pill if needed and install from the Augmentations screen.', 'After installation, run bn1-guide.js again.');
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
  return action('augmentations', 'Work, buy a useful bundle, then install',
    factionWorkAdvice(s),
    'Focus work when practical. If a target is already purchased, choose the next useful target; the guide cannot see queued purchases or faction reputation.',
    'For faction access, targets, and optional side stops: run bn1-guide.js --roadmap.',
    installReminder,
    'Run bn1-guide.js --install for the full checklist, including manual selling if you lack TIX API access.',
    'Buy expensive desired augmentations first where prerequisites allow; buy NeuroFlux with leftovers.',
    'Install when the new bundle will accelerate progress more than waiting. There is no mandatory four-hour wait.',
    `${installed}/30 distinct installed augmentations toward Daedalus; repeated NeuroFlux levels count once.`,
    'Spend suitable leftovers on home RAM. After installation, run bn1-guide.js again.');
}

/** @param {NS} ns */
export async function readBn1Snapshot(ns, checkAutopilot = true) {
  const reset = ns.getResetInfo();
  const homeRam = ns.getServerMaxRam('home');
  return {
    reset, player: ns.getPlayer(), homeRam, hasTor: ns.hasTorRouter(),
    casinoEarned: ns.getMoneySources().sinceInstall.casino ?? 0,
    crackers: BN1_CRACKERS.map(([file]) => file).filter(file => ns.fileExists(file, 'home')),
    // Autopilot can be offloaded. The lookup uses a home helper, so skip it in
    // low-RAM mode, where casino/RAM guidance takes priority over automation.
    autopilotRunning: checkAutopilot && homeRam >= 64 && await isScriptRunning(ns, 'autopilot.js'),
    servers: Object.fromEntries(BN1_FACTION_SERVERS.map(([host]) => [host, ns.getServer(host)])),
    daemon: reset.ownedAugs.has('The Red Pill') && ns.serverExists('w0r1d_d43m0n') ? ns.getServer('w0r1d_d43m0n') : null,
  };
}

/** Run directly on fresh 8 GB home, or automatically from autopilot after upgrading home. @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([['no-tail', false], ['once', false], ['install', false], ['roadmap', false]]);
  if (ns.getHostname() !== 'home') { ns.tprint('Run bn1-guide.js on home.'); return; }
  const referenceView = options.install || options.roadmap;
  if (!referenceView && ns.ps('home').some(p => p.filename === ns.getScriptName() && p.pid !== ns.pid)) return;
  ns.disableLog('ALL');
  if (!options['no-tail']) { ns.ui.openTail(); ns.ui.resizeTail(900, 650); }
  ns.ui.setTailTitle(`BN1.1 — ${options.install ? 'Install checklist' : options.roadmap ? 'Faction roadmap' : 'Next action'}`);
  let previous = '', lastToast = -Infinity;
  while (true) {
    // Reference views also work alongside the normal panel, then exit to free RAM.
    // The install checklist needs no snapshot; the roadmap needs no helper process.
    const snapshot = options.install ? null : await readBn1Snapshot(ns, !options.roadmap);
    const next = options.install ? getBn1InstallGuidance() : options.roadmap
      ? getBn1FactionRoadmap(snapshot) : getBn1Guidance(snapshot);
    ns.clearLog();
    ns.print(`BN1.1 — ${next.title}\n`);
    for (const step of next.steps) ns.print(`• ${step}`);
    ns.print('\nManual steps are needed until SF4. This panel does not spend money or change your work.');
    if (referenceView) {
      ns.print('\nReference view exits now; its log remains available. Scroll for the full checklist.');
      return;
    }
    ns.print('\nMore help: run bn1-guide.js --roadmap | run bn1-guide.js --install');
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
