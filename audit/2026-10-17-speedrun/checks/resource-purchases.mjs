// Positive checks for B04/B06/B10/B17/B18. Executes repository functions with mocked game transport.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {maxRun} from '../../../utils.js';
import {main as purchaseSleeves} from '../../../purchaseSleeves.js';

const source = file => readFile(new URL('../../../' + file, import.meta.url), 'utf8');
const noop = () => {};
const STOP = Symbol('bounded check complete');
async function functionFrom(file, begin, end, bindings = {}) {
  const text = await source(file), start = text.indexOf(begin);
  assert(start >= 0, `Missing declaration in ${file}: ${begin}`);
  const stop = end ? text.indexOf(end, start + begin.length) : text.length;
  assert(stop > start, `Missing end marker in ${file}: ${end}`);
  const declaration = text.slice(start, stop).trim().replace(/^export /, '');
  const name = declaration.match(/(?:async )?function\s+(\w+)/)[1];
  return Function(...Object.keys(bindings), declaration + `\nreturn ${name};`)(...Object.values(bindings));
}
function rpcMock(responder, additions = {}) {
  let nextPid = 1;
  const replies = new Map();
  return {
    print: noop, tprint: noop, toast: noop, sleep: async () => {},
    exec(file, host, options, ...args) {
      const pid = nextPid++;
      replies.set(pid, responder(file, args, host));
      return pid;
    },
    nextPortWrite: async () => {}, readPort: pid => replies.get(pid), ...additions,
  };
}

// B04: initial buys and later upgrades share a 20% pass allowance and recheck cash/reserve.
async function hostPass(settings = {}) {
  const state = {money: 1e6, reserve: 0, spent: 0, purchases: [], upgrades: [], attempts: 0, homeAttempts: 0, sleeps: 0};
  Object.assign(state, settings.state);
  const initialMoney = state.money, ram = new Map((settings.servers ?? []).map(name => [name, 2]));
  const buyCost = settings.buyCost ?? 110_000;
  const debit = cost => {
    assert(cost <= state.money - Math.max(0, state.reserve), 'An action must fit the latest cash minus reserve');
    assert(state.spent + cost <= initialMoney * 0.2, 'All actions must share the pass budget');
    state.money -= cost; state.spent += cost;
  };
  const ns = {
    read: () => String(state.reserve), getServerMoneyAvailable: () => state.money,
    getServerMaxRam: host => host === 'home' ? 64 : ram.get(host),
    sleep: async () => { state.sleeps++; settings.onSleep?.(state); },
    cloud: {
      getServerNames: () => [...ram.keys()], getServerLimit: () => settings.limit ?? 25,
      getRamLimit: () => settings.maxRam ?? 2,
      getServerCost: size => { assert.equal(size, 2); return buyCost; },
      purchaseServer: (name, size) => {
        assert.equal(size, 2); state.attempts++;
        if (settings.failPurchase) return '';
        debit(buyCost); const host = name + '-' + ram.size;
        ram.set(host, size); state.purchases.push(host); return host;
      },
      getServerUpgradeCost: () => settings.upgradeCost ?? 20_000,
      upgradeServer: (host, size) => {
        debit(settings.upgradeCost ?? 20_000);
        state.upgrades.push([host, size]); ram.set(host, size); return true;
      },
    },
  };
  const run = await functionFrom('host-manager.js', 'async function tryUpgradeRam(ns)', null, {
    purchasedServerName: 'daemon', getActiveSourceFiles: async () => settings.homeCost === undefined ? {} : {4: 3},
    singRun: async (ns, method) => {
      if (method === 'getUpgradeHomeRamCost') { settings.onHomeCost?.(state); return settings.homeCost; }
      assert.equal(method, 'upgradeHomeRam'); state.homeAttempts++;
      if (settings.homeResult !== undefined) return settings.homeResult;
      debit(settings.homeCost); return true;
    },
  });
  state.result = await run(ns);
  return state;
}
let host = await hostPass({state: {reserve: 900_000}});
assert.equal(host.attempts, 0, 'The original $1m/$900k-reserve case must not buy a $110k server');
host = await hostPass({buyCost: 75_000, limit: 3, maxRam: 8});
assert.equal(host.purchases.length, 2);
assert.equal(host.spent, 190_000, 'Initial purchases must reduce the later upgrade allowance');
host = await hostPass({buyCost: 80_000, state: {reserve: 840_000}});
assert.equal(host.purchases.length, 2); assert.equal(host.money, 840_000);
host = await hostPass({buyCost: 100_000, state: {reserve: 800_000}, onSleep: state => { state.money -= 75_000; }});
assert.equal(host.purchases.length, 1, 'Recheck cash after another buyer spends during a yield');
host = await hostPass({buyCost: 100_000, onSleep: state => { state.reserve = 950_000; }});
assert.equal(host.purchases.length, 1, 'Respect a reserve increase during the pass');
host = await hostPass({buyCost: 100_000, state: {reserve: 850_000}, onSleep: state => { state.money += 50_000; }});
assert.equal(host.purchases.length, 1, 'New income must not enlarge the initial pass allowance');
host = await hostPass({buyCost: 75_000, limit: 2, homeCost: 60_000});
assert.equal(host.homeAttempts, 0, 'Home upgrades must use the remaining budget after server purchases');
host = await hostPass({buyCost: 75_000, limit: 2, homeCost: 50_000});
assert.equal(host.result, true); assert.equal(host.spent, 200_000);
host = await hostPass({limit: 0, homeCost: 100_000, state: {reserve: 800_000}, onHomeCost: state => { state.money = 850_000; }});
assert.equal(host.homeAttempts, 0, 'Recheck cash after the home-cost RPC');
host = await hostPass({limit: 0, homeCost: 100_000, homeResult: 'ERROR: unavailable'});
assert.notEqual(host.result, true, 'A truthy RPC error is not a successful home upgrade');
assert.equal((await hostPass({failPurchase: true})).attempts, 1);
for (const buyCost of [NaN, Infinity, -1]) assert.equal((await hostPass({buyCost})).attempts, 0);
assert.equal((await hostPass({state: {reserve: NaN}})).attempts, 0);

// B06: run the real sleeve buyer through waiting, a cash increase, and the memory phase.
async function sleeveBuyer({result = {success: true}, alreadyBought = false, memoryResult = {success: true}} = {}) {
  let cash = 50, purchased = alreadyBought, waits = 0, playerReads = 0, attempts = 0, memoryAttempts = 0;
  const messages = [];
  const explicitSuccess = value => value === true || value?.success === true;
  const ns = rpcMock((file, args) => {
    if (file === 'bin/getPlayer.js') { playerReads++; return {money: cash, factions: ['The Covenant']}; }
    assert.equal(file, 'bin/sleeveRun.js');
    const [method] = args;
    if (method === 'getSleeveCost') return purchased ? Infinity : 100;
    if (method === 'purchaseSleeve') {
      attempts++; assert(cash >= 100);
      if (explicitSuccess(result)) { cash -= 100; purchased = true; }
      return result;
    }
    if (method === 'getNumSleeves') return 1;
    if (method === 'getSleeve') return {memory: 99};
    if (method === 'getMemoryUpgradeCost') return 10;
    if (method === 'upgradeMemory') { memoryAttempts++; return memoryResult; }
    throw Error(`Unexpected sleeve RPC: ${method}`);
  }, {
    enums: {FactionName: {TheCovenant: 'The Covenant'}}, print: line => messages.push(line),
    sleep: async delay => {
      if (delay === 1000 || ++waits === 3) throw STOP;
      assert.equal(delay, 5000); cash = 150;
    },
  });
  await assert.rejects(purchaseSleeves(ns), error => error === STOP);
  return {attempts, memoryAttempts, playerReads, messages};
}
for (const result of [true, {success: true}]) {
  const buyer = await sleeveBuyer({result});
  assert.equal(buyer.attempts, 1, 'Buy after live cash rises, without restarting the script');
  assert(buyer.playerReads >= 3);
  assert.equal(buyer.memoryAttempts, 1, 'Finishing sleeve purchases must reach memory upgrades');
  assert(buyer.messages.some(line => line.includes('Purchased a sleeve')));
}
for (const result of [false, {success: false, message: 'insufficient cash'}, 'ERROR: API unavailable']) {
  const buyer = await sleeveBuyer({result});
  assert(buyer.attempts > 0);
  assert(!buyer.messages.some(line => line.includes('Purchased a sleeve')));
}
for (const memoryResult of [{success: false}, 'ERROR: memory unavailable']) {
  const buyer = await sleeveBuyer({alreadyBought: true, memoryResult});
  assert.equal(buyer.memoryAttempts, 1);
  assert(!buyer.messages.some(line => line.includes('Sleeve0 +1')));
  assert(buyer.messages.some(line => line.includes('failed to upgrade memory')));
}

// B10: use the real batch function and its cached inventory; reconcile partial failures.
async function sleeveBatch(augs, settings = {}) {
  const state = {
    availableAugs: [augs.map(aug => ({...aug}))], cacheExpiry: [Infinity],
    options: {'buy-cooldown': 0, 'min-aug-batch': 1, ...settings.options},
    lastPurchaseTime: [], lastPurchaseStatusUpdate: [], lastSleeveHp: [100], lastSleeveShock: [0],
  };
  let inventory = augs.map(aug => ({...aug})), calls = [], refreshes = 0;
  const run = await functionFrom('sleeve.js', 'async function manageSleeveAugs(ns, i, budget)',
    '\n/** @param {NS} ns\n * @returns {Promise<Task>}', {
      ...state, sleeveRun: async (ns, method) => {
        assert.equal(method, 'getSleevePurchasableAugs'); refreshes++;
        return inventory.map(aug => ({...aug}));
      }, log: noop, formatMoney: String, formatDuration: String,
    });
  const ns = {sleeve: {purchaseSleeveAug: (i, name) => {
    assert.equal(i, 0); calls.push(name);
    if (settings.throwOn === name) throw Error('purchase failed');
    if (settings.failOn === name) return false;
    inventory = inventory.filter(aug => aug.name !== name); return true;
  }}};
  return {state, calls, settings, run: budget => run(ns, 0, budget), refreshes: () => refreshes,
    externalPurchase: name => { inventory = inventory.filter(aug => aug.name !== name); }};
}
const augs = [{name: 'A', cost: 100}, {name: 'B', cost: 200}, {name: 'C', cost: 300}];
let batch = await sleeveBatch(augs.slice(0, 1));
assert.equal(await batch.run(100), 100); assert.deepEqual(batch.calls, ['A']);
assert.equal(batch.state.lastSleeveHp[0], undefined);
batch = await sleeveBatch(augs);
assert.equal(await batch.run(600), 600); assert.deepEqual(batch.calls, ['A', 'B', 'C']);
batch = await sleeveBatch(augs, {failOn: 'B'});
assert.equal(await batch.run(600), 100, 'Count only confirmed purchases');
assert.deepEqual(batch.calls, ['A', 'B']);
assert.deepEqual(batch.state.availableAugs[0].map(aug => aug.name), ['B', 'C']);
batch.settings.failOn = null;
assert.equal(await batch.run(500), 500);
assert.equal(batch.refreshes(), 1); assert.deepEqual(batch.calls, ['A', 'B', 'B', 'C']);
batch = await sleeveBatch(augs, {failOn: 'A'});
assert.equal(await batch.run(600), 0); assert.equal(batch.state.lastPurchaseTime[0], undefined);
batch.externalPurchase('A'); batch.settings.failOn = null;
assert.equal(await batch.run(600), 500, 'Refresh inventory after a failure/external purchase');
assert.deepEqual(batch.calls, ['A', 'B', 'C']);
batch = await sleeveBatch(augs, {throwOn: 'B'});
await assert.rejects(batch.run(600), /purchase failed/);
assert.equal(batch.state.cacheExpiry[0], 0);
assert.deepEqual(batch.state.availableAugs[0].map(aug => aug.name), ['B', 'C']);
batch = await sleeveBatch(augs, {options: {'buy-cooldown': 60_000}});
batch.state.lastPurchaseTime[0] = Date.now();
assert.equal(await batch.run(600), 0); assert.deepEqual(batch.calls, []);

// B17: exercise both real maxRun passes through the RPC helper transport.
async function capacity(ram, persistent, useHacknet = false) {
  return maxRun(rpcMock((file, args) => {
    if (file === 'bin/getServersLight.js') return Object.keys(ram);
    assert.equal(file, 'bin/getServerAvailRam.js'); return ram[args[0]];
  }, {hasRootAccess: host => !host.startsWith('locked') && !host.startsWith('hacknet')}), persistent, useHacknet);
}
const ram = {home: 128, rooted: 64, locked: 4096, 'hacknet-server-0': 1024};
assert.equal(await capacity(ram, false), 128);
assert.equal(await capacity(ram, true), 128);
assert.equal(await capacity(ram, false, true), 1024);
assert.equal(await capacity({home: 0, rooted: 64, rooted2: 32, locked: 4096}, true), 32);
assert.equal(await capacity({home: 128}, true), 128);
assert.equal(await capacity({home: 0, locked: 4096}, false), 0);

// B18: verify total worker + helper RAM, invalid capacities, and preservation of a live worker.
const warnings = [], stasisHelperRam = 13.6;
const respawn = await functionFrom('darknet.js', 'function respawnAfterStasis(ns, ramPerThread, ...args)',
  'function logonce(ns, msg)', {stasisHelperRam, logonce: (ns, message) => warnings.push(message)});
function stasisNs(maxRam, blocked = 0, otherProcess = false) {
  const launches = [];
  return {
    launches, self: () => ({pid: 1, server: 'dark-worker', filename: 'darknet.js'}),
    getServerMaxRam: () => maxRam, dnet: {getBlockedRam: () => blocked},
    ps: () => otherProcess ? [{pid: 1}, {pid: 2}] : [{pid: 1}],
    spawn: (file, options, ...args) => { launches.push({file, options, args}); throw STOP; },
  };
}
for (const [maxRam, blocked, perThread, mode, expectedThreads] of [
  [128, 0, 24.55, 'clear-stasis', 4], [128, 0, 12.55, undefined, 10],
  [128, 32, 24.55, 'lab', 3], [64, 0, 24.55, 'clear-stasis', 2],
]) {
  const ns = stasisNs(maxRam, blocked), args = mode ? [mode] : [];
  assert.throws(() => respawn(ns, perThread, ...args), error => error === STOP);
  const launch = ns.launches[0];
  assert.equal(launch.file, 'darknet.js'); assert.equal(launch.options.threads, expectedThreads);
  assert.equal(launch.options.ramOverride, perThread); assert.equal(launch.options.spawnDelay, 0);
  assert.deepEqual(launch.args, args);
  assert(launch.options.threads * perThread + (mode ? stasisHelperRam : 0) <= maxRam - blocked);
}
for (const [maxRam, blocked, perThread, otherProcess] of [
  [16, 0, 24.55], [128, 120, 24.55], [NaN, 0, 24.55], [Infinity, 0, 24.55],
  [128, 200, 24.55], [128, 0, NaN], [128, 0, 0], [128, 0, -1], [128, 0, 24.55, true],
]) {
  const ns = stasisNs(maxRam, blocked, otherProcess), before = warnings.length;
  respawn(ns, perThread, 'clear-stasis');
  assert.equal(ns.launches.length, 0); assert.equal(warnings.length, before + 1);
}
const setStasis = await functionFrom('darknet.js', 'async function runSetStasis(ns, value = true)',
  'function getWorker()');
for (const changesState of [false, true]) {
  let linked = true, running = true;
  const ok = await setStasis({
    fileExists: () => true, self: () => ({server: 'dark-worker'}), exec: () => 2,
    isRunning: () => running, sleep: async () => { running = false; if (changesState) linked = false; },
    dnet: {getStasisLinkedServers: () => linked ? ['dark-worker'] : []},
  }, false);
  assert.equal(ok, changesState, 'Child exit alone must not report a successful stasis change');
}
const darkSource = await source('darknet.js');
// Execute the real main-loop transition, followed by the new worker's clear-stasis entry path.
const transitionStart = darkSource.indexOf('if (ns.dnet.getStasisLinkedServers().includes(ns.self().server)) {');
const transitionEnd = darkSource.indexOf('if (ns.args.includes("lab"))', transitionStart);
assert(transitionStart >= 0 && transitionEnd > transitionStart);
const transition = Function('ns', 'respawnAfterStasis', 'scriptCost', darkSource.slice(transitionStart, transitionEnd));
const clearStart = darkSource.indexOf('if (ns.args.includes("clear-stasis")) {');
const clearEnd = darkSource.indexOf('//library of all types', clearStart);
assert(clearStart >= 0 && clearEnd > clearStart);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const clear = AsyncFunction('ns', 'runSetStasis', 'respawnAfterStasis', 'scriptCost', 'logonce', darkSource.slice(clearStart, clearEnd));
const transitionNs = stasisNs(128);
let linked = true, helperRunning = false, helperCalls = 0;
transitionNs.dnet.getStasisLinkedServers = () => linked ? ['dark-worker'] : [];
assert.throws(() => transition(transitionNs, respawn, 12.55), error => error === STOP);
const clearingWorker = transitionNs.launches[0];
transitionNs.args = clearingWorker.args;
transitionNs.fileExists = () => true;
transitionNs.exec = (file, host, options, value) => {
  assert.equal(file, '/temp_set_stasis.js'); assert.equal(host, 'dark-worker'); assert.equal(value, false);
  assert(clearingWorker.options.threads * clearingWorker.options.ramOverride + stasisHelperRam <= 128);
  assert.equal(options.threads, 1); helperCalls++; helperRunning = true; return 2;
};
transitionNs.isRunning = () => helperRunning;
transitionNs.sleep = async () => { helperRunning = false; linked = false; };
await assert.rejects(clear(transitionNs, setStasis, respawn, 12.55, noop), error => error === STOP);
assert.equal(helperCalls, 1); assert.equal(linked, false);
assert.deepEqual(transitionNs.launches[1].args, []);
assert.equal(transitionNs.launches[1].options.ramOverride, 12.55);
assert.equal(transitionNs.launches[1].options.threads, 10);
let returnedToNormal = false;
await clear({args: ['clear-stasis'], self: () => ({server: 'dark-worker'})}, async () => false,
  () => { returnedToNormal = true; }, 12.55, noop);
assert.equal(returnedToNormal, false, 'Failed stasis clearing must not claim a successful return to normal work');
assert(!darkSource.includes('utilFile'), 'The standalone darknet worker must not copy a nonexistent util.js');
console.log('B04/B06/B10/B17/B18 checks passed: budgets, fresh sleeve cash/results, complete aug batches, eligible RAM, and stasis worker/helper capacity');
