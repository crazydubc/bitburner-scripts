import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {main as dispatch} from '../../../bin/serverRun.js';
import {main as calculate} from '../../../bin/getHackP.js';
import {serverRun} from '../../../utils.js';
import {selectLimitedBatch, validateBatchPlan} from '../../../kernel.js';

const oldSource = execFileSync('git', ['show', 'c5ed3aa:bin/serverRun.js'],
  {cwd: new URL('../../../', import.meta.url), encoding: 'utf8'});
const oldDispatch = (await import('data:text/javascript;base64,' + Buffer.from(oldSource).toString('base64'))).main;
const realPerformance = globalThis.performance;
let clock = 0;
globalThis.performance = {now: () => clock};

function harness({ram = 1048576, launchMs = 0, sleepMs = 0, duration = 10000} = {}) {
  let used = 32, exit, result, burst = 0, maxBurst = 0, yields = 0;
  const launches = [], logs = [];
  const ns = {
    args: [], pid: 1, scan: () => [], hasRootAccess: () => true,
    getServerMaxRam: () => ram, getServerUsedRam: () => used,
    scp: () => true, getHackTime: () => duration / 4,
    getGrowTime: () => duration * 0.8, getWeakenTime: () => duration,
    getPortHandle: () => ({write: value => result = value}), atExit: fn => exit = fn,
    print: value => logs.push(value), tprintf() {},
    async sleep() { yields++; burst = 0; clock += sleepMs; await new Promise(resolve => setImmediate(resolve)); },
    exec(file, host, options, ...args) {
      const cost = file.includes('hack-target') ? 1.7 : 1.75;
      assert(Number.isInteger(options.threads) && options.threads > 0);
      assert(used + cost * options.threads <= ram + 1e-6, 'Never exceed actual host RAM');
      used += cost * options.threads;
      launches.push({file, host, threads: options.threads, args});
      maxBurst = Math.max(maxBurst, ++burst); clock += launchMs;
      return 100 + launches.length;
    },
  };
  return {ns, launches, logs, get used() {return used;}, get yields() {return yields;},
    get maxBurst() {return maxBurst;},
    async run(main, args) { clock = 0; ns.args = args; await main(ns); exit(); return result; }};
}
const args = (batch, count, prep = [0, 0, 0, 0, 0, 0, 0]) =>
  [false, 'test', ...prep, batch.H1, batch.W1, batch.G1, batch.W2, count, false, ''];
const server = {hostname: 'test', moneyMax: 1e9, moneyAvailable: 1e9, minDifficulty: 1,
  hackDifficulty: 1, serverGrowth: 50, hasAdminRights: true, requiredHackingSkill: 50};
const player = {skills: {hacking: 2000, intelligence: 0},
  mults: {hacking_money: 1, hacking_chance: 1, hacking_grow: 1}};
const multipliers = {ScriptHackMoney: 0.15, ScriptHackMoneyGain: 1, ServerGrowthRate: 1};
const capacity = Math.floor((1048576 - 32) / 1.75);
async function plan(batches = -1, threads = -1, first = 1) {
  let exit, value;
  await calculate({args: ['test', batches, threads, first, JSON.stringify(multipliers)], pid: 2,
    ramOverride: value => value, getServer: () => ({...server}), getPlayer: () => player,
    weakenAnalyze: () => 0.05, atExit: fn => exit = fn, getPortHandle: () => ({write: result => value = result})});
  exit(); return value;
}
const threads = batch => batch.H1 + batch.W1 + batch.G1 + batch.W2;
const kernel = readFileSync(new URL('../../../kernel.js', import.meta.url), 'utf8');
const oldKernel = execFileSync('git', ['show', '0c68b91:kernel.js'],
  {cwd: new URL('../../../', import.meta.url), encoding: 'utf8'});
async function firstWave(limit, {code = kernel, candidate, ram = 1048576} = {}) {
  const loop = code.slice(code.indexOf('  async function doTargetingLoop('), code.indexOf('  async function runbotnet('));
  const STOP = Symbol('first dispatch'), plans = [];
  let input;
  const bindings = {selectLimitedBatch, validateBatchPlan,
    getOptimalTarget: async () => ({...server}), getServ: async () => ({...server, hackDifficulty: 24}),
    getPlayerInfo: async () => player, initialPlayer: player,
    getServers: async () => [{hostname: 'home', hasAdminRights: true, maxRam: ram}],
    getServerAvailRam: async () => ram, getGrowThreads: async () => 100,
    getHackP: async (_ns, hostname, batches, budget, first) => {
      plans.push({hostname, batches, budget, first});
      return plans.length > 1 && candidate ? candidate : await plan(batches, budget, first);
    },
    sharing: {update: async () => false, reclaimableRam: () => 0, handoff: () => ''},
    log() {}, serverRun: async (...values) => {input = values.slice(1); throw STOP;}, STOP};
  const run = Function(...Object.keys(bindings), `
    let player=initialPlayer,target,nextTarget,threadsLeft=0,botnetStatus=false,botsRequired=-1,botsSent=0;
    const weakenStrength=0.05,reservedRam=32,useHacknet=false,options={'max-batches':${limit}};
    ${loop};return doTargetingLoop;`)(...Object.values(bindings));
  await assert.rejects(run({sleep: async () => {}, getHackTime: () => 10000}), error => error === STOP);
  return {input, plans, batch: {H1: input[9], W1: input[10], G1: input[11], W2: input[12]}};
}

try {
  // Real BN5 planner inputs at the reported 1 PB capacity select a four-thread HGW batch.
  // Model a fast launch path: this proves the old dispatcher's process allowance,
  // not the hardware-specific point at which the live renderer becomes unresponsive.
  const initial = await plan(), requested = Math.floor(capacity / threads(initial));
  const old = harness(), current = harness();
  await old.run(oldDispatch, args(initial, requested));
  assert(old.launches.length > 50000, 'Reproduce the large process flood before the guard');
  const bounded = await current.run(dispatch, [...args(initial, requested), 2000]);
  assert.equal(bounded.batches, 2000);
  assert.equal(bounded.recalc, true, 'Use the existing kernel feedback, rather than leaving tiny batches indefinitely');
  assert.equal(current.launches.length, 6000);
  assert(current.maxBurst <= 75, 'Yield after at most 25 complete HGW batches, even on a fast CPU');
  assert(current.yields > 0);
  assert.equal(bounded.lastpid, 100 + current.launches.length);

  // The existing recalculation grows the individual batches and still uses the capacity.
  const recalculated = await plan(bounded.batches, capacity, initial.H1);
  const nextCount = Math.floor(capacity / threads(recalculated));
  assert(nextCount > 0 && nextCount <= 2000);
  assert(threads(recalculated) > threads(initial));
  assert(nextCount * threads(recalculated) / capacity > 0.99, 'Larger batches retain >99% of planned thread capacity');
  const next = harness(), nextResult = await next.run(dispatch, [...args(recalculated, nextCount), 2000]);
  assert.equal(nextResult.recalc, false);
  assert.equal(nextResult.batches, nextCount);
  assert(next.launches.length <= 8000);

  // Execute the entire kernel preparation path. Resizing now happens before its first
  // limited dispatch and budgets only capacity left AFTER prep, not the full server.
  const first = await firstWave(2000), prepThreads = first.input.slice(2, 9).reduce((a, b) => a + b, 0);
  assert.equal(first.plans.length, 2);
  assert.equal(first.plans[1].batches, 2000);
  assert.equal(first.plans[1].budget, capacity - prepThreads);
  assert(first.input[13] > 0 && first.input[13] <= 2000);
  assert(threads(first.batch) > threads(initial));
  assert((first.input[13] * threads(first.batch) + prepThreads) / capacity > 0.99);
  const firstDispatch = harness();
  const firstResult = await firstDispatch.run(dispatch, first.input);
  assert.equal(firstResult.batches, first.input[13]);
  assert(firstDispatch.launches.length < 8100, 'First wave already uses thousands, not hundreds of thousands, of workers');

  for (const candidate of [
    {...recalculated, Take: 0}, {...recalculated, Take: NaN},
    {...recalculated, H1: capacity + 1, Take: 1e20},
  ]) {
    assert.equal(selectLimitedBatch(initial, candidate, capacity, 2000), initial);
    const rejected = await firstWave(2000, {candidate});
    assert.deepEqual(rejected.batch, {H1: initial.H1, W1: initial.W1, G1: initial.G1, W2: initial.W2});
  }
  assert.equal(selectLimitedBatch(initial, recalculated, capacity, 0), initial, 'No dispatched batches must not select a new plan');
  // Default first-wave counts/prep are byte-for-byte unchanged; small servers avoid the extra planner call.
  assert.deepEqual((await firstWave(99999)).input, (await firstWave(99999, {code: oldKernel})).input);
  assert.equal((await firstWave(99999)).plans.length, 1);
  assert.equal((await firstWave(2000, {ram: 128})).plans.length, 1);

  // Ordinary waves retain identical operations, thread counts, relative delays and replies.
  for (const batch of [initial, {H1: 5, W1: 1, G1: 20, W2: 2}]) {
    for (const count of [0, 1, 300, 2000, 10000]) {
      const previous = harness(), updated = harness();
      const input = args(batch, count, [10, 20, 2, 4, 1, 5, 1]);
      assert.deepEqual(await updated.run(dispatch, input), await previous.run(oldDispatch, input));
      assert.deepEqual(updated.launches, previous.launches);
      assert.equal(updated.yields, previous.yields, 'Default yield frequency is preserved too');
    }
  }
  // Existing deadline remains effective; a slow launch path only stops between full batches.
  const slow = harness({launchMs: 10, duration: 100});
  const timed = await slow.run(dispatch, [...args(initial, requested), 2000]);
  assert(timed.recalc && timed.batches > 0 && timed.batches < 2000);
  assert.equal(slow.launches.length, timed.batches * 3);
  assert(slow.yields > 0);
  // Real timers are not free. Compare default pacing across simulated launch costs,
  // 4ms timer delays and short/long deadlines; do not claim income parity from a zero-cost clock.
  for (const launchMs of [0.02, 0.2, 2]) for (const duration of [100, 1000, 10000]) {
    const previous = harness({launchMs, sleepMs: 4, duration});
    const updated = harness({launchMs, sleepMs: 4, duration});
    assert.deepEqual(await updated.run(dispatch, args(initial, requested)),
      await previous.run(oldDispatch, args(initial, requested)));
    assert.deepEqual(updated.launches, previous.launches);
    assert.equal(updated.yields, previous.yields);
  }
  for (const invalid of [0, -1, 0.5, 100000, Infinity, '2000']) {
    const h = harness();
    await assert.rejects(h.run(dispatch, [...args(initial, 10000), invalid]), /Batch limit/);
    assert.equal(h.launches.length, 0);
  }
  // The optional primitive argument leaves old/default callers' positional contract intact.
  let sent;
  const transport = {print() {}, getScriptRam: () => 5, exec: (_file, _host, _options, ...values) => {sent = values; return 42;},
    getPortHandle: () => ({empty: () => false, read: () => ({lastpid: 100})})};
  const input = args(initial, 10000);
  await serverRun(transport, ...input); assert.deepEqual(sent, input);
  await serverRun(transport, ...input, 2000); assert.deepEqual(sent, [...input, 2000]);
  console.log(`BN5/1 PB fixture: ${old.launches.length} allowed worker launches; opt-in 2000-batch limit launches ${current.launches.length}, ` +
    `with kernel preflight already resizing its first wave. Default volume/pacing (including timer overhead), prep budgets, modeled take, deadlines, validation and opt-in cooperative yields passed.`);
} finally { globalThis.performance = realPerformance; }
