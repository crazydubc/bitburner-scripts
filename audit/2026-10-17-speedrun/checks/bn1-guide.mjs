import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getBn1Guidance, getBn1InstallGuidance, getBn1FactionRoadmap, readBn1Snapshot, maybeStartBn1Autopilot, main, BN1_CRACKERS, BN1_FACTION_SERVERS} from '../../../bn1-guide.js';
import {filesExist, getPortCrackers} from '../../../utils.js';

function snapshot() {
  return {
    reset: {currentNode: 1, lastNodeReset: 1, lastAugReset: 100, ownedSF: new Map(), ownedAugs: new Map()},
    player: {money: 10e9, city: 'Aevum', skills: {hacking: 60}, factions: []},
    homeRam: 64, homeFreeRam: 56, casinoEarned: 10e9, hasTor: true, hasDarknet: true, autopilotRunning: true, coinflipRunning: false,
    crackers: BN1_CRACKERS.map(([file]) => file), daemon: null,
    servers: Object.fromEntries(BN1_FACTION_SERVERS.map(([host], i) => [host, {
      requiredHackingSkill: [55, 210, 350, 530][i], numOpenPortsRequired: i + 1,
      backdoorInstalled: false, hasAdminRights: true,
    }])),
  };
}

const s = snapshot();
s.casinoEarned = 0;
s.player.money = 12e9;
assert.equal(getBn1Guidance(s).id, 'casino', 'Unrelated income must not imply casino completion');
s.player.city = 'Sector-12'; s.player.money = 100;
assert.equal(getBn1Guidance(s).id, 'seed-money');
s.player.money = 250_000;
assert.equal(getBn1Guidance(s).id, 'travel');
s.player.city = 'Aevum'; s.casinoEarned = 10e9; s.homeRam = 8;
assert.equal(getBn1Guidance(s).id, 'home-ram');
s.homeRam = 64; s.hasTor = false;
assert.equal(getBn1Guidance(s).id, 'tor');
s.hasTor = true; s.crackers = []; s.player.money = 500_000;
assert.equal(getBn1Guidance(s).id, 'buy-BruteSSH.exe');
s.player.money = 0; s.autopilotRunning = false;
assert.equal(getBn1Guidance(s).id, 'autopilot', 'Do not wait for an unaffordable program before earning income');
s.autopilotRunning = true; s.crackers = ['BruteSSH.exe'];
assert.equal(getBn1Guidance(s).id, 'backdoor-CSEC');
s.servers.CSEC.backdoorInstalled = true;
assert.equal(getBn1Guidance(s).id, 'join-CyberSec');
s.player.factions = ['CyberSec'];
assert.equal(getBn1Guidance(s).id, 'augmentations');
s.reset.ownedAugs = new Map([['NeuroFlux Governor', 100]]);
assert(getBn1Guidance(s).steps.some(step => step.startsWith('1/30')));
s.reset.ownedAugs = new Map(Array.from({length: 30}, (_, i) => [`Aug ${i}`, 1]));
s.player.skills.hacking = 2500;
assert.equal(getBn1Guidance(s).id, 'daedalus');
s.player.factions.push('Daedalus');
assert.equal(getBn1Guidance(s).id, 'red-pill');
s.reset.ownedAugs.set('The Red Pill', 1);
s.daemon = {hasAdminRights: true, requiredHackingSkill: 3000};
s.player.skills.hacking = 3000;
s.casinoEarned = 0;
assert.equal(getBn1Guidance(s).id, 'finish-node', 'Do not force another casino cycle when the BN can already finish');
s.reset.ownedSF.set(1, 1);
assert.equal(getBn1Guidance(s).id, 'finished');

// Darknet is an early post-casino purchase, not a blocker when cash is short.
const dark = snapshot(); dark.hasDarknet = false;
assert.equal(getBn1Guidance(dark).id, 'darknet');
assert(getBn1Guidance(dark).steps.some(step => step.includes('buy DarkscapeNavigator.exe')));
assert(getBn1Guidance(dark).steps.some(step => step.includes('Field Work')));
dark.player.money = 0;
assert.equal(getBn1Guidance(dark).id, 'backdoor-CSEC');
dark.casinoEarned = 0; dark.player.money = 10e9;
assert.equal(getBn1Guidance(dark).id, 'casino', 'Do not recommend darknet purchases before the casino is finished');

// Work suggestions advance past installed targets without requiring Singularity.
const progress = snapshot();
progress.player.factions = ['CyberSec', 'Sector-12', 'NiteSec'];
assert(getBn1Guidance(progress).steps.some(step => step.includes('Factions > CyberSec > Details > Hacking Contracts')));
progress.reset.ownedAugs.set('Neurotrainer I', 1);
progress.reset.ownedAugs.set('BitWire', 1);
assert(getBn1Guidance(progress).steps.some(step => step.includes('Factions > Sector-12 > Details > Hacking Contracts')));
progress.reset.ownedAugs.set('CashRoot Starter Kit', 1);
assert(getBn1Guidance(progress).steps.some(step => step.includes('Factions > NiteSec > Details > Hacking Contracts')));
const roadmap = getBn1FactionRoadmap(snapshot()).steps.join('\n');
assert(roadmap.includes('needs hacking 55 and 1 port-opening program'), 'Use actual server hacking requirements');
assert(roadmap.includes('"backdoor" beside "CSEC"'));
assert(roadmap.includes('needs hacking 210 and 2 port-opening programs'));
assert(roadmap.includes('"backdoor" beside "avmnite-02h"'));
assert(roadmap.includes('Hacking Contracts'));
assert(roadmap.includes('do not join Chongqing, New Tokyo, Ishima, or Volhaven'));
assert(roadmap.includes('Optional: Tian Di Hui'));
assert(getBn1FactionRoadmap(progress).steps.some(step => step.includes('CashRoot Starter Kit (installed)')));

// Every install path keeps autopilot active and asks the user to liquidate;
// the expanded checklist must verify positions before purchases/installation.
for (const factions of [['CyberSec'], ['Daedalus']]) {
  const ready = snapshot(); ready.player.factions = factions;
  const text = getBn1Guidance(ready).steps.join('\n');
  assert(text.includes('leave autopilot running'));
  assert(text.includes('run stockmaster.js --liquidate'));
  assert(text.includes('verify zero shares held'));
}
const installSteps = getBn1InstallGuidance().steps;
const sellAt = installSteps.findIndex(step => step.includes('run stockmaster.js --liquidate'));
const verifyAt = installSteps.findIndex(step => step.includes('verify zero positions'));
const buyAt = installSteps.findIndex(step => step.includes('Buy the useful upgrades'));
assert(sellAt >= 0 && sellAt < verifyAt && verifyAt < buyAt);
assert(installSteps.some(step => step.includes('Leave autopilot running')));
assert(!installSteps.some(step => /stop every autopilot|keep autopilot stopped|pauses the guide/i.test(step)));
assert(installSteps.some(step => step.includes('Sell ALL') && step.includes('Long or Short')));

// Reference panels never launch helpers, alter startup state, trade, or stop scripts.
for (const mode of ['install', 'roadmap']) {
  const live = snapshot(), rendered = [], writes = new Map();
  await main({
    pid: 1, flags: () => ({'no-tail': true, [mode]: true}), getHostname: () => 'home',
    getScriptName: () => 'bn1-guide.js', ps: () => [{pid: 2, filename: 'bn1-guide.js'}],
    getResetInfo: () => { assert.notEqual(mode, 'install'); return live.reset; },
    getPlayer: () => { assert.notEqual(mode, 'install'); return live.player; }, getServerMaxRam: () => live.homeRam,
    hasTorRouter: () => live.hasTor, getMoneySources: () => ({sinceInstall: {casino: live.casinoEarned}}),
    fileExists: file => live.crackers.includes(file) || (file === 'DarkscapeNavigator.exe' && live.hasDarknet),
    getServer: host => host === 'home' ? {maxRam: live.homeRam, ramUsed: 8} : live.servers[host],
    write: async (file, value) => writes.set(file, value),
    exec: () => {throw Error('Reference panels must not launch helpers or automate actions');},
    sleep: () => {throw Error('Reference panels should exit after rendering');},
    disableLog() {}, clearLog() {}, ui: {setTailTitle() {}}, print: message => rendered.push(message),
  });
  assert(rendered.some(message => message.includes(mode === 'install'
    ? 'run stockmaster.js --liquidate' : 'Faction roadmap')));
  assert(rendered.some(message => message.includes('checklist stays in the log')));
  assert.equal(writes.size, 0);
}

// Use the real shared lookup with a mocked helper transport. An offloaded
// autopilot must advance the panel just like one running on home.
for (const runningOn of ['home', 'n00dles', null]) {
  const live = snapshot();
  const messages = [];
  const ns = {
    pid: 1, flags: () => ({'no-tail': true, once: true}), getHostname: () => 'home',
    getScriptName: () => 'bn1-guide.js',
    ps: host => host === runningOn ? [{pid: 2, filename: 'autopilot.js'}] : [],
    scan: host => host === 'home' ? ['n00dles'] : ['home'],
    getResetInfo: () => live.reset, getPlayer: () => live.player,
    getServerMaxRam: () => live.homeRam, hasTorRouter: () => live.hasTor,
    getMoneySources: () => ({sinceInstall: {casino: live.casinoEarned}}),
    fileExists: file => live.crackers.includes(file) || (file === 'DarkscapeNavigator.exe' && live.hasDarknet),
    getServer: host => host === 'home' ? {maxRam: live.homeRam, ramUsed: 8} : live.servers[host],
    exec: (file, host) => {
      assert.equal(file, 'bin/getServers.js'); assert.equal(host, 'home');
      return 42;
    },
    getScriptRam: () => 1.6,
    getPortHandle: pid => { assert.equal(pid, 42); return {empty: () => false,
      read: () => [{hostname: 'home'}, {hostname: 'n00dles'}]}; },
    disableLog() {}, clearLog() {}, ui: {setTailTitle() {}},
    print: message => messages.push(message),
  };
  const current = await readBn1Snapshot(ns);
  assert.equal(current.autopilotRunning, runningOn !== null);
  assert.equal(getBn1Guidance(current).id, runningOn === null ? 'autopilot' : 'backdoor-CSEC');
  await main(ns);
  assert(messages.some(message => message.includes(runningOn === null
    ? 'Start your hacking automation' : 'Backdoor CSEC')));
}

// The low-RAM panel must release its RAM without starting scripts or blocking on a modal.
const low = snapshot(); low.homeRam = 8; low.casinoEarned = 0;
const messages = [];
await main({
  pid: 1, flags: () => ({'no-tail': true, once: false}), getHostname: () => 'home',
  getScriptName: () => 'bn1-guide.js', ps: () => [{pid: 1, filename: 'bn1-guide.js'}],
  getResetInfo: () => low.reset, getPlayer: () => low.player, getServerMaxRam: () => low.homeRam,
  hasTorRouter: () => low.hasTor, getMoneySources: () => ({sinceInstall: {casino: 0}}),
  fileExists: () => true, getServer: host => host === 'home' ? {maxRam: low.homeRam, ramUsed: 0} : low.servers[host],
  exec: () => {throw Error('Low-RAM guide must not launch a server lookup helper');},
  disableLog() {}, clearLog() {}, ui: {setTailTitle() {}},
  print: m => messages.push(m), tprint: m => messages.push(m),
  sleep: () => {throw Error('Low-RAM guide should exit rather than occupy home');},
});
assert(messages.some(message => message.includes('guide closes now')));
assert(messages.some(message => message.includes('$10 billion before spending')));

// Automatic startup is bounded and keeps supervising throughout the cycle.
// Old persistent markers must not prevent an absent autopilot from restarting.
function handoffHarness() {
  const files = new Map(), launches = [];
  const ns = {
    read: file => files.get(file) ?? '', write: async (file, value) => files.set(file, value),
    fileExists: () => true, exec: (...args) => { launches.push(args); return 7; }, tprint() {},
  };
  return {ns, files, launches};
}
const handoff = handoffHarness(), ready = snapshot(); ready.autopilotRunning = false;
handoff.files.set('bn1-guide-state.txt', JSON.stringify({cycle: JSON.stringify([1, 1, 100]), reason: 'started'}));
await maybeStartBn1Autopilot(handoff.ns, ready);
assert.equal(ready.autopilotRunning, true);
assert.deepEqual(handoff.launches, [['autopilot.js', 'home', {threads: 1, temporary: true, preventDuplicates: true}]]);
await maybeStartBn1Autopilot(handoff.ns, ready);
assert.equal(handoff.launches.length, 1, 'Do not duplicate the running autopilot');
ready.autopilotRunning = false;
await maybeStartBn1Autopilot({...handoff.ns}, ready);
assert.equal(handoff.launches.length, 2, 'Restart a stopped autopilot in the same cycle, even with an old state file');
ready.reset.lastAugReset++;
ready.autopilotRunning = false;
await maybeStartBn1Autopilot(handoff.ns, ready);
assert.equal(handoff.launches.length, 3, 'Keep supervising after an augmentation reset');
const observed = handoffHarness(), remote = snapshot();
await maybeStartBn1Autopilot(observed.ns, remote);
assert.equal(observed.launches.length, 0, 'Do not duplicate a running remote autopilot');
remote.autopilotRunning = false;
await maybeStartBn1Autopilot(observed.ns, remote);
assert.equal(observed.launches.length, 1, 'Replace an offloaded autopilot after it exits');
for (const change of [
  live => { live.homeRam = 8; }, live => { live.homeFreeRam = 47; },
  live => { live.autopilotRunning = null; }, live => { live.reset.currentNode = 4; },
  live => { live.reset.ownedSF.set(1, 1); }, live => { live.reset.ownedSF.set(4, 1); },
]) {
  const harness = handoffHarness(), live = snapshot(); live.autopilotRunning = false; change(live);
  await maybeStartBn1Autopilot(harness.ns, live);
  assert.equal(harness.launches.length, 0);
  assert.equal(harness.files.size, 0);
}
for (const change of [
  live => { live.casinoEarned = 0; live.player.city = 'Sector-12'; },
  live => { live.casinoEarned = 0; live.player.money = 0; },
  live => { live.casinoEarned = 0; live.coinflipRunning = true; },
  live => { live.reset.ownedAugs.set('The Red Pill', 1); live.player.skills.hacking = 3000; live.daemon = {hasAdminRights: true, requiredHackingSkill: 3000}; },
]) {
  const harness = handoffHarness(), live = snapshot(); live.autopilotRunning = false; change(live);
  await maybeStartBn1Autopilot(harness.ns, live);
  assert.equal(harness.launches.length, 1, 'Progression phase must not block autopilot when RAM is available');
  assert.equal(harness.files.size, 0);
}
for (const failedExec of [() => 0, () => { throw Error('missing dependency'); }]) {
  const retry = handoffHarness(), live = snapshot(); live.autopilotRunning = false;
  await maybeStartBn1Autopilot({...retry.ns, exec: failedExec}, live);
  assert.equal(retry.files.size, 0, 'Startup must not persist a launch latch');
  await maybeStartBn1Autopilot(retry.ns, live);
  assert.equal(retry.launches.length, 1);
}

// Exercise the real panel loop and shared lookup with a bounded mock scheduler.
for (const mode of ['automatic', 'manual', 'once']) {
  const live = snapshot(), harness = handoffHarness(), stop = Error('end panel check');
  const launchCounts = [];
  let runningOn = null;
  const ns = {
    ...harness.ns, pid: 1, flags: () => ({'no-tail': true, [mode]: true}),
    getHostname: () => 'home', getScriptName: () => 'bn1-guide.js',
    ps: host => host === runningOn ? [{pid: 7, filename: 'autopilot.js'}] : [],
    scan: host => host === 'home' ? ['n00dles'] : ['home'],
    getResetInfo: () => live.reset, getPlayer: () => live.player,
    getServerMaxRam: () => live.homeRam, getServer: host => host === 'home' ? {maxRam: live.homeRam, ramUsed: 8} : live.servers[host],
    hasTorRouter: () => true, getMoneySources: () => ({sinceInstall: {casino: live.casinoEarned}}),
    exec: (...args) => {
      if (args[0] === 'bin/getServers.js') return 42;
      runningOn = 'home';
      return harness.ns.exec(...args);
    },
    getScriptRam: () => 1.6,
    getPortHandle: () => ({empty: () => false, read: () => [{hostname: 'home'}, {hostname: 'n00dles'}]}),
    disableLog() {}, clearLog() {}, ui: {setTailTitle() {}}, print() {}, toast() {},
    sleep: async ms => {
      assert.equal(ms, 5000);
      launchCounts.push(harness.launches.length);
      if (mode !== 'automatic' || launchCounts.length === 4) throw stop;
      if (launchCounts.length === 2) runningOn = 'n00dles';
      if (launchCounts.length === 3) runningOn = null;
    },
  };
  if (mode === 'once') await main(ns);
  else await assert.rejects(main(ns), error => error === stop);
  assert.equal(harness.launches.length, mode === 'automatic' ? 2 : 0);
  if (mode === 'automatic') assert.deepEqual(launchCounts, [1, 1, 1, 2], 'Keep home/remote autopilot alive, then restart after exit');
  assert.equal(harness.files.size, 0);
}

// A rejected darknet launch must not prevent the next helper from being checked.
const autopilotSource = await readFile(new URL('../../../autopilot.js', import.meta.url), 'utf8');
// Restarting autopilot must reuse any existing coinflipper rather than duplicate it.
const coinflipStartup = autopilotSource.slice(autopilotSource.indexOf('// A restarted autopilot'),
  autopilotSource.indexOf('let startUpRan = false'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const running of ['coinflip.js', 'bn1-casino.js', 'bn1-auto.js', null]) {
  const launches = [];
  await AsyncFunction('ns', 'doSCP', 'RUNLOG_FILE', 'isScriptRunning', 'launchScriptHelper', coinflipStartup)(
    {getHostname: () => 'home'}, async () => {}, 'runlog.txt',
    async (ns, name) => name === running,
    async (ns, name) => { launches.push(name); return 7; });
  assert.deepEqual(launches, running ? [] : ['coinflip.js']);
}
const helperSource = autopilotSource.slice(autopilotSource.indexOf('async function checkOnRunningScripts(ns,'),
  autopilotSource.indexOf('async function runPeriodicScripts(ns,'));
const helperLaunches = [];
const checkHelpers = Function('asynchronousHelpers', 'isScriptRunning', 'runScriptSomewhere',
  'const PERIOD=30000; const log=()=>{}, getErrorInfo=String; ' + helperSource + '; return checkOnRunningScripts;')(
  ['darknet.js', 'next-helper.js'].map(name => ({name, shouldRun: () => true, args: () => []})),
  async () => false, async (ns, file) => helperLaunches.push(file));
await checkHelpers({exec: (file, host, options) => {
  assert.equal(host, 'home'); assert.equal(options.preventDuplicates, true);
  helperLaunches.push(file); return 0;
}});
assert.deepEqual(helperLaunches, ['darknet.js', 'next-helper.js']);

// B03: preserve input-to-result correspondence for all single-cracker inventories.
const names = BN1_CRACKERS.map(([file]) => file);
for (const owned of [[], ...names.map(file => [file]), names]) {
  const ns = {print() {}, fileExists: (file, host) => host === 'home' && owned.includes(file)};
  assert.deepEqual(await filesExist(ns, names), names.map(name => owned.includes(name)));
  assert.deepEqual(await getPortCrackers(ns), owned);
}
console.log('BN1 progression, darknet guidance, install checklist, reference panels, continuous autopilot restart, remote detection, coinflip reuse, low-RAM exit, and cracker checks passed');
