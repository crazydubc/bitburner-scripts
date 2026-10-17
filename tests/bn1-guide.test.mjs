import assert from 'node:assert/strict';
import {getBn1Guidance, main, BN1_CRACKERS, BN1_FACTION_SERVERS} from '../bn1-guide.js';
import {filesExist, getPortCrackers} from '../utils.js';

function snapshot() {
  return {
    reset: {currentNode: 1, lastAugReset: 100, ownedSF: new Map(), ownedAugs: new Map()},
    player: {money: 10e9, city: 'Aevum', skills: {hacking: 60}, factions: []},
    homeRam: 64, casinoEarned: 10e9, hasTor: true, autopilotRunning: true,
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

// The low-RAM panel must release its RAM without starting scripts or blocking on a modal.
const low = snapshot(); low.homeRam = 8; low.casinoEarned = 0;
const messages = [];
await main({
  pid: 1, flags: () => ({'no-tail': true, once: false}), getHostname: () => 'home',
  getScriptName: () => 'bn1-guide.js', ps: () => [{pid: 1, filename: 'bn1-guide.js'}],
  getResetInfo: () => low.reset, getPlayer: () => low.player, getServerMaxRam: () => low.homeRam,
  hasTorRouter: () => low.hasTor, getMoneySources: () => ({sinceInstall: {casino: 0}}),
  fileExists: () => true, getServer: host => low.servers[host],
  disableLog() {}, clearLog() {}, ui: {setTailTitle() {}},
  print: m => messages.push(m), tprint: m => messages.push(m),
  sleep: () => {throw Error('Low-RAM guide should exit rather than occupy home');},
});
assert(messages.some(message => message.includes('guide exits now')));
assert(messages.some(message => message.includes('$8b reserve')));

// B03: preserve input-to-result correspondence for all single-cracker inventories.
const names = BN1_CRACKERS.map(([file]) => file);
for (const owned of [[], ...names.map(file => [file]), names]) {
  const ns = {print() {}, fileExists: (file, host) => host === 'home' && owned.includes(file)};
  assert.deepEqual(await filesExist(ns, names), names.map(name => owned.includes(name)));
  assert.deepEqual(await getPortCrackers(ns), owned);
}
console.log('BN1 guidance transitions, low-RAM exit, and cracker detection checks passed');
