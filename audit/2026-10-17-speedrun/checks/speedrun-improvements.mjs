import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {main as stockSnapshot} from '../../../bin/getStockValue.js';
import {main as goSnapshot} from '../../../bin/getGoSnapshot.js';
import {main as runLogMain} from '../../../bin/run-log.js';
import {main as horizonMain} from '../../../bin/getHacknetPayoff.js';
import {main as goStatsMain} from '../../../bin/go-stats.js';
import {main as bribeMain} from '../../../bin/bribe-faction.js';
import {getStocksValue, getGoSnapshot, getRunningScriptNames, isScriptRunning} from '../../../utils.js';
import {getHacknetPayoffSeconds, getCorporationBribeReserve} from '../../../speedrun-policy.js';
import {getCorporationBribeAmount, normalizeCorporationBribeRequest} from '../../../work-for-faction2.js';
import {updateRunLog, RUNLOG_FILE} from '../../../logger.js';
import {EARLY_UNLOCK_ROUTE, selectNextBitNode} from '../../../progression.js';
import {selectGoOpponent, HIDDEN_GO_OPPONENT} from '../../../go.js';
import {evaluateAugmentationReset} from '../../../augmentation-reset-policy.js';

const noop = () => {};
const source = file => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
const autopilot = source('autopilot.js');
function section(text, begin, end) {
  const start = text.indexOf(begin), stop = text.indexOf(end, start);
  assert(start >= 0 && stop > start, begin);
  return text.slice(start, stop);
}
async function helper(main, ns) {
  let exit, reply;
  await main({pid: 7, args: [], atExit: fn => exit = fn, getPortHandle: () => ({write: value => reply = value}), ...ns});
  exit(); return reply;
}

const positions = {LONG: [10_000, 100, 0, 0], SHORT: [0, 0, 20_000, 200],
  BOTH: [10_000, 100, 10_000, 200], EMPTY: [0, 0, 0, 0]};
const stock = {hasTixApiAccess: () => true, getSymbols: () => Object.keys(positions), getPosition: s => positions[s],
  getBidPrice: s => {assert.notEqual(s, 'EMPTY'); return 100;},
  getAskPrice: s => {assert.notEqual(s, 'EMPTY'); return 180;}};
const expectedValue = 10_000 * 100 + 20_000 * 220 + 10_000 * 100 + 10_000 * 220 - 400_000;
assert.equal(await helper(stockSnapshot, {stock}), expectedValue);
assert.equal(await helper(stockSnapshot, {stock: {hasTixApiAccess: () => false}}), 0);
assert.match(await helper(stockSnapshot, {stock: {...stock, getBidPrice: () => NaN}}), /^ERROR:/);

// Execute the actual RPC client in small- and large-home configurations.
function client(free = 128, tix = true) {
  const calls = [], replies = new Map(); let pid = 0;
  const ns = {print: noop, getScriptRam: name => name === 'bin/getStockValue.js' ? 9.65 : name === 'bin/getGoSnapshot.js' ? 61.6 : 2.6,
    getFunctionRamCost: () => 1, getPortHandle: id => ({empty: () => false, read: () => replies.get(id)}),
    exec(file, host, options, ...args) {
      assert.equal(host, 'home'); calls.push([file, ...args]); let value;
      if (file === 'bin/hasTixApi.js') value = tix;
      else if (file === 'bin/getServerAvailRam.js') value = free;
      else if (file === 'bin/getStockValue.js') value = expectedValue;
      else if (file === 'bin/stockRun.js') value = stock[args[0]](...args.slice(1));
      else if (file === 'bin/getGoSnapshot.js') value = boardSnapshot;
      else {
        const key = {'bin/getBoardState.js': 'board', 'bin/getControlledEmptyNodes.js': 'controlled',
          'bin/goValidMoves.js': 'valid', 'bin/getLiberties.js': 'liberties', 'bin/getChains.js': 'chains'}[file];
        assert(key, file); value = boardSnapshot[key];
      }
      replies.set(++pid, value); return pid;
    }};
  return {ns, calls};
}
let c = client(); assert.equal(await getStocksValue(c.ns), expectedValue);
assert.equal(c.calls.length, 3, 'One access check, one capacity check, one valuation');
c = client(8); assert.equal(await getStocksValue(c.ns), expectedValue);
assert(!c.calls.some(([file]) => file === 'bin/getStockValue.js'));
assert(!c.calls.some(([, method, symbol]) => symbol === 'EMPTY' && /Price/.test(method)));
c = client(8, false); assert.equal(await getStocksValue(c.ns), 0); assert.equal(c.calls.length, 1);
const boardSnapshot = {board: ['.....'], controlled: ['?????'], valid: [[true]], liberties: [[-1]], chains: [[0]]};
assert.deepEqual(await helper(goSnapshot, {go: {getBoardState: () => boardSnapshot.board,
  analysis: {getControlledEmptyNodes: () => boardSnapshot.controlled, getValidMoves: () => boardSnapshot.valid,
    getLiberties: () => boardSnapshot.liberties, getChains: () => boardSnapshot.chains}}}), boardSnapshot);
c = client(); assert.deepEqual(await getGoSnapshot(c.ns), boardSnapshot); assert.equal(c.calls.length, 2);
c = client(24); assert.deepEqual(await getGoSnapshot(c.ns), boardSnapshot); assert.equal(c.calls.length, 6);

let processReads = 0;
const running = getRunningScriptNames({ps: host => {processReads++; return host === 'remote' ? [{filename: '/kernel.js'}] : []; }},
  [{hostname: 'home'}, {hostname: 'remote'}]);
assert(await isScriptRunning({}, 'kernel.js', running));
assert(await isScriptRunning({}, '/kernel.js', running));
assert(!await isScriptRunning({}, 'missing.js', running)); assert.equal(processReads, 2);

// Run the real scheduler bodies with one shared inventory, including duplicate entries and a failed launch.
{
  const launched = [], snapshot = new Set(), entry = name => ({name, shouldRun: () => true, args: () => [], nextRun: 0});
  const definitions = section(autopilot, '  async function checkOnRunningScripts(', '  /** Accept Stanek');
  const functions = Function('isScriptRunning', 'runScriptSomewhere', `
    const asynchronousHelpers=[${JSON.stringify(['kernel.js', 'manager.js'])}.map(name=>({name,shouldRun:()=>true,args:()=>[]}))].flat();
    const periodicScripts=[{name:'manager.js',nextRun:0,shouldRun:()=>true,args:()=>[]},{name:'optional.js',nextRun:0,shouldRun:()=>true,args:()=>[]}];
    const PERIOD=30000, log=()=>{}, getErrorInfo=String;
    ${definitions}
    return {checkOnRunningScripts,runPeriodicScripts};`)(isScriptRunning, async (_ns, file) => {launched.push(file);return 9;});
  const order = section(autopilot, '    await checkOnRunningScripts(ns, runningScripts);', '    await noteMilestones([');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  await AsyncFunction('ns','runningScripts','checkOnRunningScripts','runPeriodicScripts', order)(
    {}, snapshot, functions.checkOnRunningScripts, functions.runPeriodicScripts);
  assert.deepEqual(launched, ['kernel.js', 'manager.js', 'optional.js']);
}

// Real installation decision and momentum: repeat NF must not move a useful bundle's deadline.
function installation() {
  const live = {elapsed: 60_000, names: ['A', 'B', 'C'], installs: 0, deadlines: []};
  const definitions = section(autopilot, '  function updateAugMomentum(', '  /** Retrieves') +
    section(autopilot, '  function getPendingAugmentationCounts(', '  /** Logic to detect') +
    section(autopilot, '  async function maybeInstallAugmentations(', '  /** Logic to detect if it\'s a good time');
  const create = Function('live', 'evaluateAugmentationReset', `
    const ns={getHostname:()=> 'remote'}, NEUROFLUX='NeuroFlux Governor', unlockedSFs={4:3}, MAX_AUGMENTATION_WAIT=14400000;
    const resetInfo={currentNode:1,lastAugReset:1000}, factionManagerOutputFile='queue', playerInstalledAugCount=40;
    const installedAugmentations=[], have4sApi=true, shouldIntelFarm=false, wdHack=null, resetDecisionState={};
    let lastResetDecisionLog='', nextResetDecisionLog=0;
    const bitNodeMults={DaedalusAugsRequirement:30}, augTRP='The Red Pill';
    const augMomentum={lastAugCount:0,bestRate:0,nextExpectedAug:0}, Date={now:()=>1000+live.elapsed};
    let currentMoneyReserve, lastInvestmentDeadline, nextInvestmentDeadlineAttempt=0;
    const getTimeInAug=()=>live.elapsed, getAugmentationCycleStart=()=>1000, formatDuration=String, log=()=>{};
    const doSCP=async()=>{}, resetAugTrackersIfNeeded=()=>{}, warnAboutFactionManagerOutput=()=>{};
    const getFactionManagerOutput=()=>({affordable_augs:live.names,awaiting_install_augs:[],generated_at:Date.now(),
      current_node:1,last_aug_reset:1000,total_rep_cost:0,total_aug_cost:1});
    const getFreshDonationFavorProgress=()=>[], setReserve=async()=>1, shouldDelayInstall=async()=>false;
    const runScriptLocal=async(_ns,file,persistent,args)=>{live.deadlines.push(args);return true;};
    const installAugs=async()=>{live.installs++;};
    ${definitions}
    return {step:()=>maybeInstallAugmentations(ns,{}),momentum:augMomentum};`);
  return {...create(live,evaluateAugmentationReset), live};
}
let install = installation(); await install.step();
const due = install.momentum.nextExpectedAug;
install.live.elapsed = 80_000; install.live.names.push(...Array(30).fill('NeuroFlux Governor'));
await install.step(); assert.equal(install.momentum.nextExpectedAug, due); assert.equal(install.live.installs, 0);
install.live.elapsed = due; await install.step(); assert.equal(install.live.installs, 1);
install = installation(); install.live.names = Array(3).fill('NeuroFlux Governor'); await install.step();
const nfDue = install.momentum.nextExpectedAug;
install.live.names = Array(50).fill('NeuroFlux Governor'); install.live.elapsed += 30_000;
await install.step(); assert.equal(install.momentum.nextExpectedAug, nfDue);
install.live.elapsed = 14_400_000; await install.step(); assert.equal(install.live.installs, 1);

const reset = {currentNode: 1, lastNodeReset: 1000, lastAugReset: 2000};
const now = 3_602_000;
const queue = {current_node: 1, last_aug_reset: 2000, generated_at: now, affordable_augs: ['A'], awaiting_install_augs: []};
assert.equal(getHacknetPayoffSeconds(14_400, queue, reset, now), 10_740);
assert.equal(getHacknetPayoffSeconds(14_400, queue, reset, now,
  {current_node: 1, last_aug_reset: 2000, deadline: now + 600_000}), 540);
assert.equal(getHacknetPayoffSeconds(14_400, {...queue, generated_at: now - 100_000}, reset, now), 14_400);
assert.equal(getHacknetPayoffSeconds(14_400, {...queue, last_aug_reset: 1}, reset, now), 14_400);
assert.equal(getHacknetPayoffSeconds(14_400, {...queue, affordable_augs: []}, reset, now), 14_400);
assert.equal(getHacknetPayoffSeconds(14_400, {...queue, affordable_augs: ['The Red Pill']}, reset, now), 0);

// Actual home helpers preserve current reset identity, reject corrupt history, and merge concurrent writers.
const files = new Map();
const io = {getResetInfo: () => reset, read: file => files.get(file) ?? '',
  write: async (file, value) => {files.set(file, String(value));}};
await Promise.all([helper(runLogMain, {...io, args: ['1.1', '[{"kind":"first-income"}]']}),
  helper(runLogMain, {...io, args: ['1.1', '[{"kind":"faction-joined","key":"CyberSec"}]']})]);
let journal = JSON.parse(files.get(RUNLOG_FILE));
assert.equal(journal.runs.length, 1); assert.equal(journal.runs[0].startTime, 1000);
assert.equal(journal.runs[0].milestones.length, 3);
updateRunLog(journal, {...reset,lastAugReset: 5000}, '1.1', [], {}, 6000);
assert.equal(journal.runs.length, 1);
updateRunLog(journal, {...reset,lastNodeReset: 7000,lastAugReset: 7000}, '1.1', [], {}, 8000);
assert.equal(journal.runs.length, 2); assert.equal(journal.runs[0].endTime, 7000); assert.equal(journal.runs[0].durationMs, 6000);
const legacy = {runs: [{currentNode:'1.1',startTime:3000}]};
updateRunLog(legacy, reset, '1.1', [], {}, 4000); assert.equal(legacy.runs.length, 1); assert.equal(legacy.runs[0].startTime, 1000);
files.set(RUNLOG_FILE, '{corrupt');
assert.match(await helper(runLogMain, {...io, args: ['1.1']}), /^ERROR:/); assert.equal(files.get(RUNLOG_FILE), '{corrupt');
assert.equal(await helper(horizonMain, {...io, args: ['update', now + 600_000, 2000]}), true);
assert.match(await helper(horizonMain, {...io, args: ['update', now, 1]}), /^ERROR:/);

// Bribe the selected milestone well below the former 1e18 reserve; do not raid setup/growth/operating cash.
const corp = {funds: 20e15, expenses: 1e9};
const bribe = reserve => getCorporationBribeAmount({...corp, currentRep: 0, targetRep: 1e6,
  bribeAmountPerReputation: 1e9, minimumReserve: reserve});
assert.equal(bribe(getCorporationBribeReserve(corp, 3)), 1e15);
assert.equal(bribe(getCorporationBribeReserve(corp, 2)), 0);
assert.equal(bribe(getCorporationBribeReserve({...corp, expenses: 40e12}, 3)), 0);
assert.equal(bribe(getCorporationBribeReserve({...corp, funds: NaN}, 3)), 0);
{
  const text = source('work-for-faction2.js');
  const code = section(text, '  async function tryCorporationBribe(', '  async function executeRepPlan(');
  const calls = [], events = []; let rep = 0, round = 3, funds = corp.funds;
  const corporation = {
    getCorporation: () => ({...corp, funds, valuation: 1e15}),
    getConstants: () => ({bribeThreshold: 100e12, bribeAmountPerReputation: 1e9}),
    getInvestmentOffer: () => ({round}),
    bribe: (faction, amount) => {calls.push({faction, amount}); funds -= amount; rep += amount / 1e9; return true;},
  };
  const run = Function('corpRun', 'runScriptLocal', 'recordRunEvents', `
    const ns={format:{number:String}}, factionRep={}, log=()=>{};let lastCorporationBribeError='';
    ${code};return tryCorporationBribe;`)(async (_ns, method, faction, amount) => {
      assert.equal(method, 'hasCorporation'); return true;
    }, async (_ns, file, persistent, args) => {
      assert.equal(file, 'bin/bribe-faction.js');
      return helper(bribeMain, {args, corporation, singularity: {getFactionRep: () => rep}});
    },
    async (_ns, event) => events.push(...event));
  assert(await run({faction: 'Daedalus', targetRep: 1e6, kind: 'donation-unlock'}));
  assert.deepEqual(calls, [{faction:'Daedalus',amount:1e15}]); assert.equal(events[0].data.purpose, 'donation-unlock');
  round = 2; rep = 0; assert(!await run({faction:'Daedalus',targetRep:1e6})); assert.equal(calls.length, 1);
  round = 3; funds = 5e15; assert(!await run({faction:'Daedalus',targetRep:1e6}));
  assert.equal(calls.length, 1, 'An earlier quote must not spend money consumed by intervening upgrades');
}

assert.equal(selectGoOpponent('hidden', true, {ownedAugs:new Map()}, () => 0), 'Netburners');
assert.equal(selectGoOpponent('hidden', false, {ownedAugs:new Map([['The Red Pill',1]])}), HIDDEN_GO_OPPONENT);
assert.notEqual(selectGoOpponent('random', false, {ownedAugs:new Map([['The Red Pill',1]])}, () => 0.999), HIDDEN_GO_OPPONENT);
assert.equal(selectGoOpponent('random', true, {ownedAugs:new Map([['The Red Pill',1]])}, () => 0.999), HIDDEN_GO_OPPONENT);
const game = {opponent:'Illuminati',size:5,blackScore:14,whiteScore:10.5,durationMs:1000,resumed:false};
assert.equal(await helper(goStatsMain, {...io,args:[JSON.stringify(game)]}), true);
await helper(goStatsMain, {...io,args:[JSON.stringify({...game,resumed:true})]});
const stats = JSON.parse(files.get('/data/go-results.json'))['Illuminati:5'];
assert.equal(stats.wins, 2); assert.equal(stats.timedGames, 1); assert.equal(stats.durationMs, 1000);

const inventory = {1:3,4:3,5:1,2:1};
assert.equal(selectNextBitNode(inventory, 3, EARLY_UNLOCK_ROUTE).node, 10);
assert.equal(selectNextBitNode({...inventory,3:1}, 10, EARLY_UNLOCK_ROUTE).node, 6);
assert.equal(selectNextBitNode({...inventory,3:1,10:1,6:1,7:2}, 7, EARLY_UNLOCK_ROUTE).node, 3);
console.log('Snapshot RAM fallbacks, scheduler inventory, real reset decisions, Hacknet horizons, journal lifecycle, bribe milestones, Go eligibility/timing, and opt-in route passed.');
