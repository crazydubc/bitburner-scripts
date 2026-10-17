// Non-modal BN1.1 guidance that keeps autopilot running when RAM permits. No Singularity calls.
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
const autopilotFreeRam = 48; // Autopilot, coinflip, and home RPC helpers need room together.
const darknetWorkTip = 'Darknet trains Charisma. Compare Field Work with Hacking Contracts where offered (Sector-12, The Black Hand, Daedalus) and use the higher displayed rep/sec. CyberSec, NiteSec, and BitRunners offer hacking work only.';
const factionTargets = {
  CyberSec: [['Neurotrainer I', '1k'], ['BitWire', '3.75k']],
  'Sector-12': [['CashRoot Starter Kit', '12.5k']],
  NiteSec: [['Neurotrainer II', '10k'], ['CRTX42-AA Gene Modification', '45k']],
  'The Black Hand': [['The Black Hand', '100k']],
  BitRunners: [['BitRunners Neurolink', '875k']],
  'Tian Di Hui': [['Neuroreceptor Management Implant', '75k']],
};
const installReminder = 'Before final purchases/install: leave autopilot running and run stockmaster.js --liquidate on home. Stockmaster sells your positions and stays running without buying. Verify all stock positions are zero; leave the liquidator running until installation.';

/** Returns a status for the panel. Launch attempts never wait for RAM. */
export async function maybeStartBn1Autopilot(ns, s) {
  if (s.reset.currentNode !== 1 || s.reset.ownedSF.has(1) || s.reset.ownedSF.has(4) || s.homeRam < 64) return '';
  if (s.autopilotRunning) return '';
  if (!(s.homeFreeRam >= autopilotFreeRam) || s.autopilotRunning === null)
    return `Automatic startup waiting for ${autopilotFreeRam} GB free on home (currently ${(s.homeFreeRam ?? 0).toFixed(1)} GB).`;
  if (!ns.fileExists('autopilot.js', 'home')) return 'Cannot start autopilot.js: pull the complete script bundle onto home.';
  let pid;
  try { pid = ns.exec('autopilot.js', 'home', {threads: 1, temporary: true, preventDuplicates: true}); }
  catch (error) { return `Autopilot launch failed: ${String(error)}. Check its files and RAM.`; }
  if (!pid) return 'Autopilot could not start. Check home RAM/files; the guide will retry on its next refresh.';
  s.autopilotRunning = true;
  ns.tprint(`BN1.1: Started autopilot.js (PID ${pid}). It handles hacking and coinflip; keep the $8b reserve.`);
  return 'Started autopilot.js. It handles hacking and coinflip; watch its log for progress.';
}

function factionWorkAdvice(s) {
  for (const [faction, targets] of Object.entries(factionTargets)) {
    if (!s.player.factions.includes(faction)) continue;
    const missing = targets.filter(([name]) => !s.reset.ownedAugs.has(name));
    if (missing.length) return `Suggested work: Factions > ${faction} > Hacking Contracts. Targets: ${missing.map(([name, rep]) => `${name} (${rep} rep)`).join(', ')}.` +
      (['Sector-12', 'The Black Hand'].includes(faction) ? ' Also compare Field Work as darknet raises Charisma; choose the higher rep/sec.' : '');
  }
  return 'Work for a joined faction with a useful unowned hacking/faction-reputation augmentation; use the roadmap to compare your next target.';
}

/** Advisory manual checklist: this never trades, stops scripts, or installs augmentations. */
export function getBn1InstallGuidance() {
  return action('install-checklist', 'Before installing augmentations',
    'First check your desired bundle, reputation, prerequisites, and queued purchases in the faction/Augmentations screens.',
    'Leave autopilot running. On home, run stockmaster.js --liquidate (short form: run stockmaster.js -l). This stops other stockmaster instances, sells long and short positions, and stays running without buying.',
    'Wait for the sale summary and verify zero positions on the Stock Market screen. Without TIX API access, sell manually there; the liquidator still holds trading paused. Leave it running until installation.',
    'Pause other spending scripts if they compete for cash. Buy desired expensive augmentations first where prerequisites allow, then NeuroFlux with suitable leftovers.',
    'Spend suitable remaining cash on home RAM/cores, then use the Augmentations screen to install. Do not install while stocks remain held.',
    'After installation, run bn1-guide.js again. At 64+ GB home RAM it keeps autopilot running whenever 48 GB free RAM is available to start it. Use --manual for prompts only.',
    'If you cancel the installation, stop only stockmaster.js --liquidate in Active Scripts, then let autopilot restart normal trading when eligible (or run stockmaster.js yourself).',
    'This checklist stays in its log after exiting. Opening it does not change automation or trade stocks.');
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
    'Early parallel setup after coinflip: buy DarkscapeNavigator.exe for $50m through TOR. The $30m option is Chongqing > Shadowed Walkway and includes TOR. Autopilot starts darknet.js after purchase; watch Active Scripts for its workers.',
    darknetWorkTip,
    ...factionSteps,
    `Early side stop: Sector-12. Visit with $15m cash and accept its invitation; compare Hacking Contracts/Field Work for ${targetsFor('Sector-12')}. CashRoot speeds up future restarts.`,
    'Keep Sector-12 available until you have CashRoot: do not join Chongqing, New Tokyo, Ishima, or Volhaven city factions first. Visiting those cities is fine; if already locked out this installation, return after a reset.',
    `Optional for unattended work: Tian Di Hui. Hacking 50, $1m cash, and visit Chongqing/New Tokyo/Ishima; accept Tian Di Hui, then choose Hacking Contracts for ${targetsFor('Tian Di Hui')}. Installing it removes the unfocused-work penalty; do not make this a mandatory detour.`,
    `5. Daedalus: 30 distinct installed augmentations, hacking 2500, and $100b cash. Current installed count: ${s.reset.ownedAugs.size}/30. Join, compare Hacking Contracts/Field Work, and earn 2.5m rep for The Red Pill.`,
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
    return action('tor', 'Get TOR and prepare darknet', 'Visit a technology store such as Alpha Enterprises and buy the $200,000 TOR router.', 'Alternative after the casino: travel to Chongqing > Shadowed Walkway and buy DarkscapeNavigator.exe for $30m. It includes TOR and unlocks darknet Charisma training. Visiting does not join the city faction.');
  const nextCracker = BN1_CRACKERS.find(([file]) => !s.crackers.includes(file));
  if (nextCracker && player.money >= nextCracker[1])
    return action(`buy-${nextCracker[0]}`, `Buy ${nextCracker[0]}`, `In the terminal: buy ${nextCracker[0]}`, 'Then run Tasks/crack-host.js to open more worker servers.', 'Buy the port crackers individually. buy -a also buys expensive optional programs.');
  if (s.autopilotRunning === null)
    return action('home-headroom', 'Free home RAM for status checks', 'The guide could not check other servers because its home helper needs about 4 GB free.', 'Check Active Scripts for autopilot before starting another copy. Keep extra home headroom for automation helpers.');
  if (!s.autopilotRunning)
    return action('autopilot', 'Start your hacking automation', 'The guide restarts autopilot whenever it is missing and home has 64+ GB RAM with 48 GB free. In --manual mode, run autopilot.js yourself.', 'Watch its log and Active Scripts for a running kernel and advancing preparation.', 'Stock liquidation does not require stopping autopilot. To keep autopilot stopped, stop the normal guide or use --manual.');
  if (!s.hasDarknet && player.money >= 50_000_000 && !reset.ownedAugs.has('The Red Pill'))
    return action('darknet', 'Unlock darknet for Charisma training', 'In the terminal: buy DarkscapeNavigator.exe ($50m through TOR).', 'Cheaper option: travel to Chongqing, visit Shadowed Walkway, and buy it for $30m; that purchase also includes TOR. Visiting Chongqing does not join its city faction.', 'Autopilot detects the program and starts darknet.js when RAM is available. Check Active Scripts/logs for darknet workers.', darknetWorkTip);
  if (reset.ownedAugs.has('The Red Pill'))
    return action('daemon-prep', 'Prepare the final server', `Reach hacking ${s.daemon?.requiredHackingSkill ?? 3000}; current level ${hacking}.`, 'Buy all five port crackers, run Tasks/crack-host.js, then use scan.js to connect/backdoor w0r1d_d43m0n.');
  if (player.factions.includes('Daedalus'))
    return action('red-pill', 'Work toward The Red Pill', 'In Factions > Daedalus, compare Hacking Contracts and Field Work; use the higher rep/sec until you can buy The Red Pill (2.5m reputation in BN1). Darknet-trained Charisma helps Field Work.', installReminder, 'Run bn1-guide.js --install for the full checklist, then buy The Red Pill if needed and install from the Augmentations screen.', 'After installation, run bn1-guide.js again; it can restart autopilot on the new cycle.');
  if (installed >= 30 && hacking >= 2500)
    return action('daedalus', 'Secure the Daedalus invitation', `${installed}/30 distinct installed augmentations; hacking ${hacking}/2500.`, `Hold $100b in cash until invited. Current cash: ${money(player.money)}. Stocks do not count as cash.`, 'Check Factions for the invitation and join Daedalus.');
  for (const [host, faction] of BN1_FACTION_SERVERS) {
    const server = s.servers[host];
    if (player.factions.includes(faction) || !server) continue;
    if (server.backdoorInstalled)
      return action(`join-${faction}`, `Join ${faction}`, 'Open Factions and accept the invitation when it arrives.', faction === 'The Black Hand'
        ? 'Compare Hacking Contracts and Field Work; darknet-trained Charisma can make Field Work faster.' : `Then select Hacking Contracts for ${faction}.`);
    if (hacking >= server.requiredHackingSkill && s.crackers.length >= server.numOpenPortsRequired)
      return action(`backdoor-${host}`, `Backdoor ${host} for ${faction}`, ...(server.hasAdminRights ? [] : ['Run Tasks/crack-host.js first.']), 'With the terminal visible, run scan.js and use its backdoor link.', 'Return to Factions and accept the invitation.');
  }
  if (!player.factions.includes('CyberSec'))
    return action('train-hacking', 'Study for CyberSec access', `Study Algorithms until hacking ${s.servers.CSEC?.requiredHackingSkill ?? 'meets CSEC\'s displayed requirement'}.`, 'Buy BruteSSH.exe when affordable, then run Tasks/crack-host.js.', 'Your hacking scripts can earn while you study.');
  return action('augmentations', 'Work, buy a useful bundle, then install',
    factionWorkAdvice(s),
    darknetWorkTip,
    'Focus work when practical. If a target is already purchased, choose the next useful target; the guide cannot see queued purchases or faction reputation.',
    'For faction access, targets, and optional side stops: run bn1-guide.js --roadmap.',
    installReminder,
    'Run bn1-guide.js --install for the full checklist, including manual selling if you lack TIX API access.',
    'Buy expensive desired augmentations first where prerequisites allow; buy NeuroFlux with leftovers.',
    'Install when the new bundle will accelerate progress more than waiting. There is no mandatory four-hour wait.',
    `${installed}/30 distinct installed augmentations toward Daedalus; repeated NeuroFlux levels count once.`,
    'Spend suitable leftovers on home RAM. After installation, run bn1-guide.js again; it can restart autopilot on the new cycle.');
}

/** @param {NS} ns */
export async function readBn1Snapshot(ns, checkAutopilot = true) {
  const reset = ns.getResetInfo();
  const homeRam = ns.getServerMaxRam('home');
  const homeFreeRam = Math.max(0, homeRam - ns.getServer('home').ramUsed);
  return {
    reset, player: ns.getPlayer(), homeRam, homeFreeRam, hasTor: ns.hasTorRouter(),
    hasDarknet: ns.fileExists('DarkscapeNavigator.exe', 'home'),
    casinoEarned: ns.getMoneySources().sinceInstall.casino ?? 0,
    crackers: BN1_CRACKERS.map(([file]) => file).filter(file => ns.fileExists(file, 'home')),
    // Autopilot can be offloaded. The lookup uses a home helper, so skip it in
    // low-RAM mode, where casino/RAM guidance takes priority over automation.
    autopilotRunning: checkAutopilot && homeRam >= 64 && homeFreeRam >= 4
      ? await isScriptRunning(ns, 'autopilot.js') : null,
    servers: Object.fromEntries(BN1_FACTION_SERVERS.map(([host]) => [host, ns.getServer(host)])),
    daemon: reset.ownedAugs.has('The Red Pill') && ns.serverExists('w0r1d_d43m0n') ? ns.getServer('w0r1d_d43m0n') : null,
  };
}

/** Run directly on fresh 8 GB home, or automatically from autopilot after upgrading home. @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([['no-tail', false], ['once', false], ['install', false], ['roadmap', false], ['manual', false]]);
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
    const startupMessage = !referenceView && !options.once && !options.manual
      ? await maybeStartBn1Autopilot(ns, snapshot) : '';
    const next = options.install ? getBn1InstallGuidance() : options.roadmap
      ? getBn1FactionRoadmap(snapshot) : getBn1Guidance(snapshot);
    ns.clearLog();
    ns.print(`BN1.1 — ${next.title}\n`);
    if (startupMessage) ns.print(`${startupMessage}\n`);
    for (const step of next.steps) ns.print(`• ${step}`);
    ns.print('\nPurchases, faction work, and installs still need manual input until SF4.');
    if (referenceView) {
      ns.print('\nReference view exits now; its log remains available. Scroll for the full checklist.');
      return;
    }
    ns.print(options.manual || options.once ? '\nPrompts only for this run; start autopilot yourself or rerun without --manual/--once.'
      : '\nThe guide checks every 5 seconds and restarts missing autopilot when RAM permits. Use --manual for prompts only.');
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
