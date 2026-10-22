// Reproduce a running/offloaded pre-c6a62fd utils.js calling freshly downloaded home calculators.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {main as batchMain} from '../../../bin/getHackP.js';
import {main as growMain} from '../../../bin/getGrowThreads.js';
import {main as bnMain} from '../../../bin/getbnmultis.js';
import {validateBatchPlan} from '../../../kernel.js';
import {getHackP, getGrowThreads, serverRun} from '../../../utils.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const oldSource = execFileSync('git', ['show', 'a9ae1be:utils.js'], {cwd: repo, encoding: 'utf8'});
const old = await import('data:text/javascript;base64,' + Buffer.from(oldSource).toString('base64'));
const target = {hostname: 'the-hub', moneyMax: 1e9, moneyAvailable: 0, minDifficulty: 1, hackDifficulty: 24,
  serverGrowth: 45, hasAdminRights: true, requiredHackingSkill: 300};
const player = {skills: {hacking: 800, intelligence: 0}, mults: {hacking_money: 1, hacking_chance: 1, hacking_grow: 1}};
const normal = {ScriptHackMoney: 1, ScriptHackMoneyGain: 1, ServerGrowthRate: 1};
const noop = () => {};

function harness({currentNode = 1, sf5 = false, homeRam = 8, multipliers = normal} = {}) {
  let nextPid = 10, used = 0;
  const ports = new Map(), running = new Set();
  const state = {peak: 0, apiReads: 0, launches: [], errors: [], dispatched: []};
  const sizes = {'bin/getHackP.js': 5.1, 'bin/getGrowThreads.js': 4.1, 'bin/getbnmultis.js': 2.6, 'bin/getResetInfo.js': 2.6};
  const costs = {getServer: 2, getPlayer: 0.5, weakenAnalyze: 1, getResetInfo: 1, getBitNodeMultipliers: 4};
  const reset = {currentNode, ownedSF: new Map(sf5 ? [[5, 1]] : [])};
  const port = id => {
    if (!ports.has(id)) {
      const values = []; let resolve;
      ports.set(id, {empty: () => !values.length, read: () => values.shift(),
        nextWrite: () => new Promise(r => resolve = r), write(value) {values.push(value); resolve?.();}});
    }
    return ports.get(id);
  };
  const ns = {print: noop, getHostname: () => 'CSEC', sleep: async () => {}, getPortHandle: port,
    isRunning: pid => running.has(pid), getScriptRam: file => file === 'bin/serverRun.js' ? 1.6 : sizes[file],
    exec(file, host, options, ...args) {
      assert.equal(host, 'home');
      assert(args.every(arg => ['string', 'number', 'boolean'].includes(typeof arg)), 'No undefined script arguments');
      state.launches.push({file, args});
      const pid = ++nextPid;
      if (file === 'bin/serverRun.js') {
        assert(args.slice(2, 14).every(n => Number.isInteger(n) && n >= 0), 'Dispatcher counts must be finite nonnegative integers');
        state.dispatched.push(args); port(pid).write({lastpid: 0, batches: args[13], recalc: false}); return pid;
      }
      let allocated = options.ramOverride ?? sizes[file], charged = 1.6;
      const chargedApis = new Set();
      const charge = name => {
        if (!chargedApis.has(name)) {chargedApis.add(name); charged += costs[name];}
        assert(charged <= allocated + 1e-9, `${file}: ${name} exceeded its allocated RAM`);
      };
      assert(used + allocated <= homeRam, `${file} could not fit home`);
      used += allocated; state.peak = Math.max(state.peak, used); running.add(pid);
      queueMicrotask(async () => {
        let onExit = noop;
        const child = {pid, args, getPortHandle: port, atExit: fn => onExit = fn,
          getFunctionRamCost: name => {assert(name in costs); return costs[name];},
          ramOverride(amount) {
            if (amount < charged - 1e-9 || used - allocated + amount > homeRam) return allocated;
            used += amount - allocated; allocated = amount; state.peak = Math.max(state.peak, used); return amount;
          },
          getServer: () => {charge('getServer'); return {...target};},
          getPlayer: () => {charge('getPlayer'); return player;},
          weakenAnalyze: () => {charge('weakenAnalyze'); return 0.05;},
          getResetInfo: () => {charge('getResetInfo'); return reset;},
          getBitNodeMultipliers: () => {charge('getBitNodeMultipliers'); state.apiReads++; return multipliers;},
        };
        try {
          if (file === 'bin/getResetInfo.js') port(pid).write(child.getResetInfo());
          else await ({'bin/getHackP.js': batchMain, 'bin/getGrowThreads.js': growMain, 'bin/getbnmultis.js': bnMain})[file](child);
        } catch (error) {state.errors.push(error);}
        finally {onExit(); used -= allocated; running.delete(pid);}
      });
      return pid;
    },
  };
  return {ns, state};
}

// Original argument counts stay valid with fresh helpers, including non-BN1 multipliers and earned SF5.
for (const options of [{}, {currentNode: 4}, {currentNode: 5, homeRam: 16, multipliers: {...normal, ScriptHackMoney: 0.15}},
  {sf5: true, homeRam: 16, multipliers: {...normal, ServerGrowthRate: 0.2}}]) {
  const h = harness(options);
  const batch = await old.getHackP(h.ns, 'the-hub', -1, -1, 1);
  validateBatchPlan(batch, 'the-hub');
  const grow = await old.getGrowThreads(h.ns, 'the-hub', 0, 1);
  assert(Number.isInteger(grow) && grow > 0);
  assert.deepEqual(batch, await getHackP(h.ns, 'the-hub', -1, -1, 1));
  assert.equal(grow, await getGrowThreads(h.ns, 'the-hub', 0, 1));
  assert.equal(h.state.errors.length, 0);
  assert(h.state.peak <= (options.homeRam ?? 8));
  assert.equal(h.state.apiReads > 0, options.sf5 === true || options.currentNode === 5);
}
{
  const h = harness({sf5: true});
  assert.match(await old.getHackP(h.ns, 'the-hub', -1, -1, 1), /^ERROR:/);
  assert.match(h.state.errors[0].message, /requires 10.1 GB/);
  assert.equal(h.state.apiReads, 0, 'Do not call a dynamically unaffordable API');
}

// Execute the complete real preparation path with OLD wrappers and NEW home helpers, through serverRun.
const kernel = await readFile(new URL('../../../kernel.js', import.meta.url), 'utf8');
const loop = kernel.slice(kernel.indexOf('  async function doTargetingLoop('), kernel.indexOf('  async function runbotnet('));
const STOP = Symbol('dispatch observed');
const h = harness();
const bindings = {getOptimalTarget: async () => ({...target}), getServ: async () => ({...target}), getPlayerInfo: async () => player,
  getServers: async () => [{hostname: 'worker', hasAdminRights: true, maxRam: 32768}],
  getServerAvailRam: async () => 32768, getServerMaxRam: async () => 32768,
  sharing: {update: async () => false, reclaimableRam: () => 0, handoff: () => ''},
  getHackP: old.getHackP, getGrowThreads: old.getGrowThreads, validateBatchPlan, log: noop,
  serverRun: async (...args) => {await old.serverRun(...args); throw STOP;}, initialPlayer: player};
const run = Function(...Object.keys(bindings), `
  let player=initialPlayer,target,nextTarget,threadsLeft=0,totalram=0,botnetStatus=false,botsRequired=-1,botsSent=0;
  const weakenStrength=0.05,reservedRam=32,useHacknet=false;
  ${loop};return doTargetingLoop;`)(...Object.values(bindings));
await assert.rejects(run({...h.ns, getHackTime: () => 10000}), error => error === STOP);
assert.equal(h.state.dispatched.length, 1);
assert.equal(h.state.dispatched[0][2], 460, 'Exercise the reported initial weaken count');
assert.equal(h.state.errors.length, 0);

for (const bad of [undefined, 'ERROR:Batch calculation exited without a result', {}, {H1: NaN}, {H1: 0, W1: 0, G1: 0, W2: 0}])
  assert.throws(() => validateBatchPlan(bad, 'the-hub'), /Invalid batch plan/);
for (const value of [undefined, NaN, Infinity, -1, 1.5]) {
  let launched = false;
  await assert.rejects(serverRun({exec: () => launched = true}, false, 'the-hub', 460, value, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, false), /Invalid dispatcher count/);
  assert.equal(launched, false);
}
console.log('Old utils/new calculators, reported kernel preparation path, effective RAM and invalid-dispatch guards passed.');
