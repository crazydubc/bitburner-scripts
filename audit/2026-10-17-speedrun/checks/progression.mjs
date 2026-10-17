// Focused progression checks. Real modules use mocked Netscript transport; no live reset is performed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BN_ROUTE, selectNextBitNode, hasBladeburnerAccess, hasCompletedBladeburner,
  COMPANY_FACTIONS, getIntelFarmReadiness, getIntelFarmStopReason, INTEL_FARM_MAX_MS,
  INTEL_FARM_FILE} from '../../../progression.js';
import {main as stateMain} from '../../../bin/intel-farm-state.js';
import {main as farmMain} from '../../../farm-intel.js';
import {liquidateHashesForReset, upgradeHomeForReset} from '../../../ascend.js';

const noop = () => {};
const source = file => readFile(new URL('../../../' + file, import.meta.url), 'utf8');
function rpcMock(respond, additions = {}) {
  let nextPid = 10;
  const replies = new Map();
  return {
    print: noop, tprint: noop, toast: noop, sleep: async () => {},
    getScriptRam: () => 1.6, getFunctionRamCost: () => 1.6,
    exec(file, host, options, ...args) {
      assert.equal(host, 'home');
      const pid = nextPid++;
      replies.set(pid, respond(file, args));
      return pid;
    },
    getPortHandle: pid => ({empty: () => !replies.has(pid), read: () => replies.get(pid)}),
    ...additions,
  };
}
async function extract(file, begin, end, bindings) {
  const text = await source(file), start = text.indexOf(begin), stop = end === null ? text.length : text.indexOf(end, start + begin.length);
  assert(start >= 0 && stop > start);
  const code = text.slice(start, stop);
  const name = code.match(/(?:async )?function\s+(\w+)/)[1];
  return Function(...Object.keys(bindings), code + `;return ${name}`)(...Object.values(bindings));
}

// Every route transition credits the current completion once and skips owned targets.
const earned = {};
let current = 1;
const sequence = [1];
for (let i = 0; i < 60; i++) {
  const next = selectNextBitNode(earned, current);
  earned[current] = (earned[current] ?? 0) + 1;
  current = next.node;
  sequence.push(current);
}
const expected = [1, 4, 4, 4, 1, 1, 5, 2, 3, 3, 3, 10, 10, 10, 6, 7, 7, 7, 9, 9, 9,
  13, 13, 13, 14, 14, 14, 15, 15, 15, 5, 5, 2, 2, 6, 6, 11, 11, 11, 8, 8, 8];
assert.deepEqual(sequence.slice(0, expected.length), expected);
assert(sequence.slice(expected.length).every(node => node === 12), 'BN12 repeats must survive level 10 and beyond');
assert.equal(selectNextBitNode(new Map([[1, 3], [4, 3], [5, 3], [2, 3]]), 3).node, 3);
assert.equal(selectNextBitNode({4: 3, 1: 3}, 5).node, 2);
assert(BN_ROUTE.every(entry => Number.isInteger(entry.node) && (entry.repeat || Number.isInteger(entry.targetLevel))));

// BN6 and BN7 both grant access. Only exact membership and null BlackOp results qualify.
for (const files of [{6: 1}, {7: 1}, new Map([[6, 1]])]) assert(hasBladeburnerAccess(files));
for (const files of [{}, {6: 0}, {7: 'ERROR: unavailable'}]) assert(!hasBladeburnerAccess(files));
for (const [member, next, expectedWin] of [[true, null, true], [true, {name: 'Operation Daedalus'}, false],
  [true, undefined, false], [true, 'ERROR: unavailable', false], [false, null, false], ['ERROR: unavailable', null, false]]) {
  assert.equal(await hasCompletedBladeburner(rpcMock((file, [method]) => {
    assert.equal(file, 'bin/bbRun.js');
    return method === 'inBladeburner' ? member : next;
  }), {6: 1}), expectedWin);
}
assert.equal(await hasCompletedBladeburner(rpcMock(() => assert.fail('No Bladeburner calls without access')), {}), false);

// Execute the real autopilot finish gate, preserving intel preparation and BN10 purchases/memory.
async function finishCase(settings = {}) {
  let destroys = 0, caveVisible = settings.visible ?? true;
  const ns = {scan: () => caveVisible ? ['w0r1d_d43m0n'] : [], getServerRequiredHackingLevel: () => 3000,
    hasRootAccess: () => settings.root ?? true, getScriptName: () => 'autopilot.js'};
  const check = await extract('autopilot.js', 'async function checkIfBnIsComplete(ns)', 'function getHardCodedBNMultis', {
    shouldIntelFarm: settings.farm ?? false, resetInfo: {currentNode: settings.node ?? 6},
    sleeveRun: async (_ns, method) => method === 'getSleeveCost' ? settings.sleeveCost ?? Infinity
      : method === 'getNumSleeves' ? settings.count ?? 1 : {memory: settings.memory ?? 100},
    hasCompletedBladeburner: async () => settings.blade ?? false, unlockedSFs: {4: 3, 6: 1},
    wdHack: null, player: {skills: {hacking: settings.hacking ?? 1}}, nextRecommendedBn: 7,
    destroyWD: async (_ns, next, callback) => {assert.equal(next, 7); assert.equal(callback, 'autopilot.js'); destroys++;}, log: noop,
  });
  await check(ns);
  if (settings.reveal) { caveVisible = true; await check(ns); }
  return destroys;
}
assert.equal(await finishCase({blade: true, visible: false}), 1);
assert.equal(await finishCase({blade: false}), 0);
assert.equal(await finishCase({hacking: 3000}), 1);
assert.equal(await finishCase({hacking: 3000, root: false}), 0);
assert.equal(await finishCase({hacking: 3000, visible: false, reveal: true}), 1, 'A daemon missing on the first scan must be checked again');
assert.equal(await finishCase({blade: true, farm: true}), 0);
assert.equal(await finishCase({node: 10, blade: true}), 1);
for (const sleeveCost of [100, 'ERROR: unavailable', NaN])
  assert.equal(await finishCase({node: 10, blade: true, sleeveCost}), 0);
for (const memory of [99, 'ERROR: unavailable', NaN])
  assert.equal(await finishCase({node: 10, blade: true, memory}), 0);
assert.equal(await finishCase({node: 10, blade: true, count: 'ERROR: unavailable'}), 0);

// Home state is retained across augmentations, isolated between actual BN runs, and validates updates.
let raw = '', reset = {currentNode: 2, lastNodeReset: 100, lastAugReset: 200};
async function stateCall(args, host = 'home') {
  let onExit, result;
  await stateMain({pid: 1, args, getHostname: () => host, getResetInfo: () => reset,
    getPortHandle: () => ({write: value => {result = value;}}), atExit: cb => {onExit = cb;},
    read: file => {assert.equal(file, INTEL_FARM_FILE); return raw;},
    write: async (file, value) => {assert.equal(file, INTEL_FARM_FILE); raw = value;},
  });
  onExit(); return result;
}
assert.equal((await stateCall(['read'])).status, 'prepare');
assert.equal((await stateCall(['update', JSON.stringify({status: 'complete', reason: 'low-roi'})])).status, 'complete');
reset.lastAugReset = 300;
assert.equal((await stateCall(['read'])).status, 'complete');
reset.lastNodeReset = 400;
assert.equal((await stateCall(['read'])).status, 'prepare', 'Re-entering the same BN must get a new state');
assert.match(await stateCall(['update', '{"lastNodeReset":9}']), /^ERROR:/);
assert.match(await stateCall(['read'], 'n00dles'), /^ERROR:/);
raw = '{bad json';
assert.match(await stateCall(['read']), /^ERROR:/);

const player = {skills: {intelligence: 10}, factions: []}, augs = ['CashRoot Starter Kit'], files = {4: 3, 5: 1};
assert.equal(getIntelFarmReadiness(player, augs, [], files, {}).ready, false);
assert.equal(getIntelFarmReadiness(player, augs, COMPANY_FACTIONS, files, {}).ready, true, 'Invites arriving after startup must release readiness');
assert.equal(getIntelFarmReadiness({...player, factions: COMPANY_FACTIONS}, augs, [], files, {}).ready, true);
assert.equal(getIntelFarmReadiness(player, [], COMPANY_FACTIONS, files, {}).ready, false);
assert.equal(getIntelFarmReadiness(player, augs, COMPANY_FACTIONS, {4: 3}, {}).needed, false);
assert.equal(getIntelFarmReadiness(player, augs, COMPANY_FACTIONS, files, {status: 'complete'}).needed, false);

// Exercise autopilot's live polling, including an unavailable helper and completion without restart.
const autopilotText = await source('autopilot.js');
const refreshCode = autopilotText.slice(autopilotText.indexOf('async function refreshIntelFarmReadiness'),
  autopilotText.indexOf('function getFactionWorkerArgs'));
const live = {invitations: [], phase: 'prepare', fail: false, reads: 0};
const refresh = Function('getIntelFarmReadiness', 'intelFarmState', 'singRun', 'sourceFileLevel', 'player',
  `let shouldIntelFarm=false, readyToFarmIntel=false, farmState, lastIntelPreparationCheck=-Infinity;
   const dictOwnedSourceFiles={4:3,5:1}, unlockedSFs={4:3,5:1}, installedAugmentations=['CashRoot Starter Kit'];
   const log=()=>{};
   ${refreshCode}
   return async force => {await refreshIntelFarmReadiness({},force);return {needed:shouldIntelFarm,ready:readyToFarmIntel};};`
)(getIntelFarmReadiness, async () => {live.reads++; if (live.fail) throw Error('home full'); return {status: live.phase};},
  async () => live.invitations, (files, id) => files[id] ?? 0, player);
assert.deepEqual(await refresh(true), {needed: true, ready: false});
live.invitations = COMPANY_FACTIONS;
assert.deepEqual(await refresh(true), {needed: true, ready: true});
live.fail = true;
assert.deepEqual(await refresh(true), {needed: true, ready: false});
live.fail = false; live.phase = 'complete';
assert.deepEqual(await refresh(true), {needed: false, ready: false});
live.phase = 'prepare'; await refresh(true);
player.skills.intelligence = 230;
const priorReads = live.reads;
assert.deepEqual(await refresh(false), {needed: false, ready: false});
assert.equal(live.reads, priorReads, 'Live INT target releases the gate between expensive polls');
player.skills.intelligence = 10;

// The auto-created company worker leaves farm preparation; a manually requested collection remains explicit.
const factionText = await source('work-for-faction2.js');
const planPrelude = factionText.slice(factionText.indexOf('async function planAndAct()'),
  factionText.indexOf('    if (await isBladeburnerInterruption())'));
async function workerReleased(automatic) {
  let collected = false;
  const run = Function('getIntelFarmReadiness', 'intelFarmState', 'collectCompanyInvitations', `
    let collectAllCompanyInvites=true, activePlan, requestedReplanDelay, currentWork;
    const REPLAN_INTERVAL=60000, ns={args:${JSON.stringify(['--all-company-invites', ...(automatic ? ['--intel-farm-preparation'] : [])])}},
      playerInfo={skills:{intelligence:10},factions:[]}, installedAugs=[], resetInfo={ownedSF:{4:3,5:1}},
      loadData=async()=>{}, singRun=async()=>null;
    ${planPrelude}
      return 'normal';
    }
    return planAndAct;
  `)(getIntelFarmReadiness, async () => ({status: 'complete'}), async () => {collected = true;});
  const result = await run(); return {collected, result};
}
assert.deepEqual(await workerReleased(true), {collected: false, result: 'normal'});
assert.equal((await workerReleased(false)).collected, true);
const sample = {status: 'farming', startedAt: 0, baselineAt: 0, baselineIntel: 100};
assert.equal(getIntelFarmStopReason(sample, 100, 30_000), null);
assert.equal(getIntelFarmStopReason(sample, 100, 300_000), 'no-progress');
assert.equal(getIntelFarmStopReason({...sample, baselineIntel: 200}, 201, 600_000), 'low-roi');
assert.equal(getIntelFarmStopReason(sample, 110, 60_000), null);
assert.equal(getIntelFarmStopReason(sample, 229, INTEL_FARM_MAX_MS), 'time-budget');
assert.equal(getIntelFarmStopReason(sample, 230, 1), 'target');

// Run actual farm cycles with transport replies. Completion performs no extra reset or BitFlume.
async function farmCase(settings = {}) {
  let state = settings.state ?? {status: 'prepare'}, resets = 0, resumes = 0, joins = 0, travels = 0;
  let invitations = settings.joined ? [] : [...COMPANY_FACTIONS];
  const ns = rpcMock((file, args) => {
    if (file === 'bin/getPlayer.js') return {skills: {intelligence: settings.intel ?? 10}, factions: settings.joined ? COMPANY_FACTIONS : []};
    if (file === 'bin/getResetInfo.js') return {ownedSF: new Map([[4, 3], [5, 1]]), ownedAugs: new Map(settings.noCashRoot ? [] : [['CashRoot Starter Kit', 1]])};
    if (file === 'bin/intel-farm-state.js') {
      if (args[0] === 'update') state = {...state, ...JSON.parse(args[1])};
      return state;
    }
    if (file === 'autopilot.js') {resumes++; return undefined;}
    assert.equal(file, 'bin/singRun.js', `Unexpected helper ${file}`);
    const [method, value] = args;
    if (method === 'checkFactionInvitations') return settings.error ? 'ERROR: temporary' : [...invitations];
    if (method === 'travelToCity') {travels++; return true;}
    if (method === 'joinFaction') {joins++; invitations = invitations.filter(name => name !== value); return true;}
    assert.equal(method, 'softReset'); assert.equal(value, 'farm-intel.js'); resets++;
  }, {getHostname: () => 'home', scan: host => host === 'home' ? ['n00dles'] : ['home'],
    ps: host => settings.autopilotRunning && host === 'n00dles' ? [{filename: 'autopilot.js', pid: 5}] : []});
  await farmMain(ns);
  return {state, resets, resumes, joins, travels};
}
let farm = await farmCase();
assert.equal(farm.joins, 10); assert.equal(farm.resets, 1); assert.equal(farm.resumes, 0); assert.equal(farm.state.primed, true);
farm = await farmCase({joined: true});
assert.equal(farm.resets, 1, 'Already-joined factions need one priming reset to regain their preserved invites');
farm = await farmCase({joined: true, state: farm.state});
assert.equal(farm.resets, 0); assert.equal(farm.state.reason, 'no-joins'); assert.equal(farm.resumes, 1);
farm = await farmCase({state: {...sample, startedAt: Date.now() - INTEL_FARM_MAX_MS}});
assert.equal(farm.state.reason, 'time-budget'); assert.equal(farm.travels, 0); assert.equal(farm.resets, 0); assert.equal(farm.resumes, 1);
farm = await farmCase({state: {status: 'complete', reason: 'low-roi'}, autopilotRunning: true});
assert.equal(farm.resumes, 0, 'An offloaded autopilot must not be duplicated'); assert.equal(farm.travels, 0);
farm = await farmCase({intel: 230}); assert.equal(farm.state.reason, 'target'); assert.equal(farm.resets, 0);
farm = await farmCase({error: true}); assert.equal(farm.resumes, 1, 'Failed farm RPCs must resume automation'); assert.equal(farm.resets, 0);
farm = await farmCase({noCashRoot: true}); assert.equal(farm.resumes, 1); assert.equal(farm.travels, 0);

// Reset spending is finite. Bad optional APIs must not abort augmentation installation.
let calls = [];
const hashesNs = {print: noop, tprint: noop, toast: noop, hacknet: {
  hashCost: () => 4, numHashes: () => 101, spendHashes: (...args) => {calls.push(args); return true;},
}};
liquidateHashesForReset(hashesNs, {}); assert.equal(calls.length, 0);
liquidateHashesForReset(hashesNs, {9: 1}); assert.deepEqual(calls, [['Sell for Money', undefined, 25]]);
hashesNs.hacknet.hashCost = () => {throw Error('unavailable');};
assert.doesNotThrow(() => liquidateHashesForReset(hashesNs, {9: 1}));
async function upgradeCase(failure = false, competingBuyer = false) {
  let cash = 100, spent = 0, attempts = 0;
  const ns = rpcMock((file, [method]) => {
    assert.equal(file, 'bin/singRun.js');
    if (method === 'getUpgradeHomeRamCost') {if (competingBuyer) cash = 10; return 30;}
    assert.equal(method, 'upgradeHomeRam'); attempts++;
    if (failure) return 'ERROR: denied';
    cash -= 30; spent += 30; return true;
  }, {getServerMoneyAvailable: () => cash});
  await upgradeHomeForReset(ns); return {spent, attempts};
}
assert.deepEqual(await upgradeCase(), {spent: 60, attempts: 2});
assert.deepEqual(await upgradeCase(true), {spent: 0, attempts: 1});
assert.deepEqual(await upgradeCase(false, true), {spent: 0, attempts: 0});

// An optional hash-spender launch failure must not stop Bladeburner itself.
let launches = 0;
const membership = await extract('bladeburner.js', 'async function beingInBladeburner(ns)', null, {
  bbRun: async () => true, log: noop, ownedSourceFiles: {9: 1}, options: {}, getFilePath: file => file,
  runScriptLocal: async (_ns, file, persistent, args) => {
    launches++; assert.equal(file, 'spend-hashes.js'); assert.equal(persistent, true);
    assert(args.includes('Exchange_for_Bladeburner_Rank')); throw Error('home full');
  },
});
await membership({ps: () => []}); assert.equal(launches, 1);
await membership({ps: () => [{filename: 'spend-hashes.js', args: ['--spend-on', 'Exchange_for_Bladeburner_Rank',
  '--spend-on', 'Exchange_for_Bladeburner_SP', '--liquidate']}]});
assert.equal(launches, 1, 'A restart must not duplicate the Bladeburner hash spender');

const resetMain = await extract('ascend.js', 'async function main(ns)', null, {
  getConfiguration: () => ({reset: true, 'script-delay': 0}), argsSchema: [],
  getActiveSourceFiles: async () => ({4: 3}), getFilePath: file => file, log: noop,
});
await resetMain({fileExists: (file, host) => {
  assert.equal(file, 'autopilot.js'); assert.equal(host, 'home'); return false;
}, kill: () => assert.fail('Missing callback must abort before stopping scripts')});
console.log('Progression, integer route, intel-farm recovery, and reset spending checks passed.');
