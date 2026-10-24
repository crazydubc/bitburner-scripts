// Non-modal BN1.1 guidance that keeps autopilot running when RAM permits. No Singularity calls.
import { isScriptRunning } from './utils.js';
import { SOA_WKS, SOA_AUGS, INFILTRATION_PROGRESS } from './infiltration-policy.js';

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
const darknetWorkTip = 'Darknet raises Charisma. In Sector-12, The Black Hand, or Daedalus, try Field Work as well as Hacking Contracts; keep the job with the higher reputation gain.';
const shops = {Aevum: 'NetLink Technologies', 'Sector-12': 'Alpha Enterprises',
  Ishima: 'Omega Software', Volhaven: 'CompuTek'};
const universities = {Aevum: 'Summit University', 'Sector-12': 'Rothman University',
  Volhaven: 'ZB Institute of Technology'};
const shopDirections = city => shops[city] ? `Click City > ${shops[city]}.`
  : 'Click Travel > Aevum and confirm. Then click City > NetLink Technologies.';
const universityDirections = city => universities[city] ? `Click City > ${universities[city]} > Take Algorithms course.`
  : 'Click Travel > Aevum and confirm. Then click City > Summit University > Take Algorithms course.';
const factionTargets = {
  CyberSec: [['Neurotrainer I', '1k'], ['BitWire', '3.75k']],
  'Sector-12': [['CashRoot Starter Kit', '12.5k']],
  NiteSec: [['Neurotrainer II', '10k'], ['CRTX42-AA Gene Modification', '45k']],
  'The Black Hand': [['The Black Hand', '100k']],
  BitRunners: [['BitRunners Neurolink', '875k']],
  'Tian Di Hui': [['Neuroreceptor Management Implant', '75k']],
};
const shareWorkTip = 'Keep doing faction work while your scripts earn money. Spare server memory can boost your reputation gain automatically.';
const installReminder = 'Before installing, leave autopilot running. In Terminal, type "home", then "run stockmaster.js --liquidate". Open Stock Market and verify zero shares held before continuing.';

/** Returns a status for the panel. Launch attempts never wait for RAM. */
export async function maybeStartBn1Autopilot(ns, s) {
  if (s.reset.currentNode !== 1 || s.reset.ownedSF.has(1) || s.reset.ownedSF.has(4) || s.homeRam < 64) return '';
  if (s.autopilotRunning) return '';
  if (!(s.homeFreeRam >= autopilotFreeRam) || s.autopilotRunning === null)
    return `Autopilot needs ${autopilotFreeRam} GB free to start; home has ${(s.homeFreeRam ?? 0).toFixed(1)} GB free. Check Active Scripts or upgrade home RAM.`;
  if (!ns.fileExists('autopilot.js', 'home')) return 'Missing autopilot.js. In Terminal, type "home", then "run git-pull.js --branch testing/bn1-go-audit".';
  let pid;
  try { pid = ns.exec('autopilot.js', 'home', {threads: 1, temporary: true, preventDuplicates: true}); }
  catch (error) { return `Autopilot could not start: ${String(error)}. Check Active Scripts and free home RAM.`; }
  if (!pid) return 'Autopilot could not start. Free home RAM or upgrade it; the guide will try again.';
  s.autopilotRunning = true;
  ns.tprint(`BN1.1: Started autopilot.js (PID ${pid}). Wait for coinflip to finish earning $10 billion before spending the casino money.`);
  return 'Autopilot is running. Follow the next steps below.';
}

function factionWorkAdvice(s) {
  for (const [faction, targets] of Object.entries(factionTargets)) {
    if (!s.player.factions.includes(faction)) continue;
    const missing = targets.filter(([name]) => !s.reset.ownedAugs.has(name));
    if (missing.length) return `Click Factions > ${faction} > Details > Hacking Contracts. Aim for ${missing.map(([name, rep]) => `${name} (${rep} reputation)`).join(', ')}.` +
      (['Sector-12', 'The Black Hand'].includes(faction) ? ' Also try Field Work and compare reputation gain.' : '');
  }
  return 'Click Factions > a faction you joined > Augments. Choose an unowned hacking or reputation upgrade, then click Details > Hacking Contracts to earn its required reputation.';
}

/** Advisory manual checklist: this never trades, stops scripts, or installs augmentations. */
export function getBn1InstallGuidance() {
  return action('install-checklist', 'Before installing augmentations',
    'Open Augmentations and look under Purchased Augmentations to see what you have already bought.',
    'Leave autopilot running. In Terminal, type "home", then "run stockmaster.js --liquidate". Wait for the sale summary; leave this script running until you install.',
    'Open Stock Market and verify zero positions. If automatic selling is unavailable, select Market Order and use Sell ALL for each held Long or Short position. If holdings cannot be checked, wait before installing.',
    'Click Factions > your faction > Augments. Buy the useful upgrades you can afford, starting with expensive ones and buying required earlier upgrades first. Use suitable leftovers for NeuroFlux Governor.',
    'Optional: in Aevum, click City > NetLink Technologies > Upgrade \'home\' RAM to spend spare cash on memory that survives installation.',
    'Click Augmentations > Install Augmentations, then confirm.',
    'After waking up, open Terminal and type "run bn1-guide.js". The guide will restart autopilot when there is enough memory.',
    'If you decide not to install, open Active Scripts and stop the stockmaster.js process with --liquidate. Autopilot can then resume stock trading.');
}

/** A suggested route, not a requirement to buy every listed augmentation. */
export function getBn1FactionRoadmap(s) {
  const targetsFor = faction => factionTargets[faction].map(([name, rep]) =>
    `${name} (${s.reset.ownedAugs.has(name) ? 'installed' : `${rep} rep`})`).join(', ');
  const factionSteps = BN1_FACTION_SERVERS.map(([host, faction], i) => {
    const server = s.servers[host];
    const ports = server?.numOpenPortsRequired ?? i + 1;
    const access = s.player.factions.includes(faction) ? 'joined' : server?.backdoorInstalled
      ? `click Factions > ${faction} > Join! when invited`
      : `needs hacking ${server?.requiredHackingSkill ?? 'shown on server'} and ${ports} port-opening program${ports === 1 ? '' : 's'}; type "run scan.js" in Terminal, then click "backdoor" beside "${host}"`;
    return `${faction}: ${access}. Useful upgrades: ${targetsFor(faction)}.`;
  });
  return action('faction-roadmap', 'Faction roadmap',
    'Follow CyberSec -> NiteSec -> The Black Hand -> BitRunners -> Daedalus. Buy useful upgrades along the way; you do not need every upgrade from each faction.',
    'To unlock faction servers: in Terminal, type "home", then "run Tasks/crack-host.js", then "run scan.js". Click "backdoor" beside the server listed below and wait for it to finish.',
    'When invited, click Factions > the faction > Join!. For reputation, click its Details button > Hacking Contracts. To buy upgrades, click its Augments button > Buy > Purchase.',
    'After coinflip finishes: in Terminal, type "buy DarkscapeNavigator.exe" ($50m; requires TOR). For the cheaper $30m option, click Travel > Chongqing, then City > Shadowed Walkway and buy the navigator there; TOR is included.',
    darknetWorkTip,
    shareWorkTip,
    `Leave Terminal or City open when infiltration is running. Autopilot can join Shadows of Anarchy and buy ${SOA_WKS}; install it with your next useful batch of augmentations to improve infiltration rewards.`,
    'Optional reputation boost after joining CyberSec: in Terminal, type \'run infiltrate.js --single --faction "CyberSec" --soa\'. Replace CyberSec with your current faction. Check Factions afterward to see the reputation earned.',
    ...factionSteps,
    `Sector-12: with $15m cash, click Travel > Sector-12. When invited, click Factions > Sector-12 > Join!. Work toward ${targetsFor('Sector-12')} to start future installations with extra cash and programs.`,
    'Until you have CashRoot Starter Kit, do not join Chongqing, New Tokyo, Ishima, or Volhaven city factions. Visiting these cities is fine.',
    `Optional: Tian Di Hui. With hacking 50 and $1m cash, visit Chongqing, New Tokyo, or Ishima. Join Tian Di Hui when invited and work toward ${targetsFor('Tian Di Hui')}. It lets you earn full work rewards while using other screens.`,
    `Daedalus: install 30 different augmentations, reach hacking 2500, and hold $100b cash. Current installed count: ${s.reset.ownedAugs.size}/30. Click Factions > Daedalus > Join!, then earn 2.5m reputation to buy The Red Pill.`,
    'NeuroFlux improves many stats with every level, but counts as only one of the 30 different augmentations needed for Daedalus.',
    'Check Augmentations > Purchased Augmentations before choosing another target. The reputation and prices shown in your faction screen are the amounts you need.',
    'Before installing, open Terminal and type "run bn1-guide.js --install" for the checklist.');
}

/** Pure decision function: snapshots can be tested without a game or Singularity. */
export function getBn1Guidance(s) {
  const { player, reset } = s;
  if (reset.currentNode !== 1 || reset.ownedSF.has(1) || reset.ownedSF.has(4))
    return action('finished', 'BN1.1 guidance is complete', 'These instructions are for your first run through BitNode 1.');
  const installed = reset.ownedAugs.size;
  const hacking = player.skills.hacking;
  if (reset.ownedAugs.has('The Red Pill') && s.daemon?.hasAdminRights && hacking >= s.daemon.requiredHackingSkill)
    return action('finish-node', 'Finish BN1 and select BN4',
      'Open Terminal and type "home", then "run scan.js". Click "backdoor" beside "w0r1d_d43m0n" and wait for it to finish.',
      'Follow the story prompts. On the Bitverse screen, select BitNode-4: The Singularity, then Enter BN4.1.');
  if (s.casinoEarned < 10e9) {
    if (player.city !== 'Aevum' && player.money < 250_000)
      return action('seed-money', 'Earn $250,000 for travel',
        'Click City > The Slums > Mug. Let the crime repeat until you have $250,000.',
        `Current cash: ${money(player.money)}. The trip costs $200,000; the rest is for betting.`);
    if (player.city !== 'Aevum')
      return action('travel', 'Travel to Aevum', 'Click Travel > Aevum and confirm the trip.',
        'Open Terminal and type "run coinflip.js". If it is already listed in Active Scripts, let it continue.');
    if (player.money < 10_000)
      return action('bet-money', 'Earn $10,000 for betting', 'Click City > The Slums > Mug. Let it repeat until you have $10,000.',
        'Open Terminal and type "run coinflip.js".');
    return action('casino', 'Let coinflip earn $10 billion',
      'If coinflip.js is not listed in Active Scripts, open Terminal and type "run coinflip.js".',
      'Wait for its success message saying the casino has paid $10 billion before spending the money.',
      `Casino earnings: ${money(s.casinoEarned)} / $10,000,000,000.`);
  }
  if (s.homeRam < 64)
    return action('home-ram', 'Upgrade home memory', shopDirections(player.city),
      'Click Upgrade \'home\' RAM until home has at least 64 GB; choose 128 GB if affordable.',
      'Return to Terminal and type "run bn1-guide.js".');
  if (!s.hasTor)
    return action('tor', 'Buy a TOR router', shopDirections(player.city),
      'Click Purchase TOR router ($200,000), close the confirmation, then return to Terminal.');
  const nextCracker = BN1_CRACKERS.find(([file]) => !s.crackers.includes(file));
  if (nextCracker && player.money >= nextCracker[1])
    return action(`buy-${nextCracker[0]}`, `Buy ${nextCracker[0]}`,
      `In Terminal, type "buy ${nextCracker[0]}" (${money(nextCracker[1])}).`,
      'Then type "run Tasks/crack-host.js" to unlock servers for your scripts.');
  if (s.autopilotRunning === null)
    return action('home-headroom', 'Check your running scripts',
      'Open Active Scripts and look for autopilot.js, including on other servers. If it is running, leave it running.',
      'Free some memory on home or upgrade home RAM, then return to this guide.');
  if (!s.autopilotRunning)
    return action('autopilot', 'Start your hacking automation',
      'In Terminal, type "home", then "run autopilot.js" if the guide has not started it yet.',
      'Open Active Scripts and check that autopilot.js and kernel.js are running.');
  if (!s.hasDarknet && player.money >= 50_000_000 && !reset.ownedAugs.has('The Red Pill'))
    return action('darknet', 'Unlock darknet', 'In Terminal, type "buy DarkscapeNavigator.exe" ($50m).',
      'Leave autopilot running; it will start darknet.js. You can check this in Active Scripts.', darknetWorkTip);
  if (reset.ownedAugs.has('The Red Pill'))
    return action('daemon-prep', 'Prepare the final server',
      `Let your hacking scripts run until hacking reaches ${s.daemon?.requiredHackingSkill ?? 3000}. Current level: ${hacking}.`,
      'In Terminal, type "home", then "run Tasks/crack-host.js", then "run scan.js".',
      'When available, click "backdoor" beside "w0r1d_d43m0n".');
  if (player.factions.includes('Daedalus'))
    return action('red-pill', 'Buy and install The Red Pill',
      'Click Factions > Daedalus > Details. Try Hacking Contracts and Field Work; keep the one with the higher reputation gain until you reach 2.5m reputation.',
      installReminder, 'Click Factions > Daedalus > Augments. Find The Red Pill, then click Buy > Purchase.',
      'In Terminal, type "run bn1-guide.js --install" and follow the checklist.');
  if (installed >= 30 && hacking >= 2500)
    return action('daedalus', 'Join Daedalus',
      `${installed}/30 different augmentations installed; hacking ${hacking}/2500.`,
      'In Terminal, type "home", then "run stockmaster.js --liquidate". Leave it running while saving $100 billion cash.',
      `Current cash: ${money(player.money)}. Once invited, click Factions > Daedalus > Join!.`);
  for (const [host, faction] of BN1_FACTION_SERVERS) {
    const server = s.servers[host];
    if (player.factions.includes(faction) || !server) continue;
    if (server.backdoorInstalled)
      return action(`join-${faction}`, `Join ${faction}`, `Click Factions > ${faction} > Join! when the invitation appears.`,
        `Then click ${faction} > Details > Hacking Contracts.`);
    if (hacking >= server.requiredHackingSkill && s.crackers.length >= server.numOpenPortsRequired)
      return action(`backdoor-${host}`, `Backdoor ${host} for ${faction}`,
        ...(server.hasAdminRights ? [] : ['In Terminal, type "home", then "run Tasks/crack-host.js".']),
        `Open Terminal and type "home", then "run scan.js". Click "backdoor" beside "${host}" and wait for it to finish.`,
        `When invited, click Factions > ${faction} > Join!.`);
  }
  if (!player.factions.includes('CyberSec'))
    return action('train-hacking', 'Study to unlock CyberSec', universityDirections(player.city),
      `Study until hacking reaches ${s.servers.CSEC?.requiredHackingSkill ?? 'the level shown for CSEC'}. Current level: ${hacking}.`,
      'If money runs low, choose Study Computer Science (free). Leave your hacking scripts running.');
  return action('augmentations', 'Work, buy a useful bundle, then install',
    factionWorkAdvice(s),
    'Click your faction\'s Augments button to buy upgrades. Check Augmentations > Purchased Augmentations and skip targets you have already bought.',
    'When the next useful upgrade is still a long wait, install the upgrades you have. In Terminal, type "run bn1-guide.js --install" for the steps.',
    installReminder,
    `${installed}/30 different augmentations installed toward Daedalus. Each NeuroFlux level boosts your stats, but NeuroFlux counts only once toward 30.`);
}

/** @param {NS} ns */
export async function readBn1Snapshot(ns, checkAutopilot = true) {
  const reset = ns.getResetInfo();
  const home = ns.getServer('home');
  const homeRam = home.maxRam;
  const homeFreeRam = Math.max(0, homeRam - home.ramUsed);
  let daemon = null;
  if (reset.ownedAugs.has('The Red Pill')) {
    try { daemon = ns.getServer('w0r1d_d43m0n'); } catch { /* Not available yet. */ }
  }
  let infiltrationProgress = null;
  try { infiltrationProgress = JSON.parse(ns.read(INFILTRATION_PROGRESS) || 'null'); } catch { /* Optional status only. */ }
  return {
    reset, player: ns.getPlayer(), homeRam, homeFreeRam, hasTor: ns.hasTorRouter(), infiltrationProgress,
    hasDarknet: ns.fileExists('DarkscapeNavigator.exe', 'home'),
    casinoEarned: ns.getMoneySources().sinceInstall.casino ?? 0,
    crackers: BN1_CRACKERS.map(([file]) => file).filter(file => ns.fileExists(file, 'home')),
    // Autopilot can be offloaded. Process lookup scans directly and needs no home helper.
    autopilotRunning: checkAutopilot && homeRam >= 64
      ? await isScriptRunning(ns, 'autopilot.js') : null,
    servers: Object.fromEntries(BN1_FACTION_SERVERS.map(([host]) => [host, ns.getServer(host)])),
    daemon,
  };
}

export function getSoaGuidance(progress, reset, now = Date.now()) {
  if (!progress || progress.lastAugReset !== reset.lastAugReset || progress.lastNodeReset !== reset.lastNodeReset ||
    now < progress.updatedAt || now - progress.updatedAt > 600_000 || !Array.isArray(progress.owned)) return '';
  const queued = progress.owned.filter(name => SOA_AUGS.includes(name) && !reset.ownedAugs.has(name));
  if (!queued.length) return '';
  return `${queued.length} Shadows of Anarchy upgrade(s) waiting to be installed. ` +
    (queued.includes(SOA_WKS) ? `Install ${SOA_WKS} to improve infiltration rewards. ` : '') +
    'Include them in your next installation. For the steps, type "run bn1-guide.js --install" in Terminal.';
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
    for (const [index, step] of next.steps.entries()) ns.print(`${index + 1}. ${step}`);
    if (snapshot) {
      const soaGuidance = getSoaGuidance(snapshot.infiltrationProgress, snapshot.reset);
      if (soaGuidance) ns.print(`\n${soaGuidance}`);
    }
    if (referenceView) {
      ns.print('\nThis checklist stays in the log. Scroll to read the remaining steps.');
      return;
    }
    ns.print('\nIn Terminal, type "home" first. Faction route: run bn1-guide.js --roadmap | Install steps: run bn1-guide.js --install');
    if (snapshot.homeRam < 64) {
      ns.print('\nThe guide closes now to free memory. After this step, type "run bn1-guide.js" in Terminal to see what is next.');
      ns.tprint(`BN1.1: ${next.title}. Follow the steps in the guide window, then type "run bn1-guide.js" again.`);
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
