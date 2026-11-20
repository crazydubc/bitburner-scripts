import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {main as batchMain} from '../../../bin/getHackP.js';
import {main as growMain} from '../../../bin/getGrowThreads.js';
import {main as bnMain} from '../../../bin/getbnmultis.js';
import {getHackP, getGrowThreads} from '../../../utils.js';
import {growthLog, growThreads, hackingChance, hackingPercent} from '../../../hacking-formulas.js';

const baseServer = {hostname: 'n00dles', minDifficulty: 1, hackDifficulty: 1, hasAdminRights: true,
  requiredHackingSkill: 1, serverGrowth: 70, moneyMax: 1e6, moneyAvailable: 1e6};
const player = {skills: {hacking: 200, intelligence: 30}, mults: {hacking_grow: 1, hacking_money: 1, hacking_chance: 1}};
const mults = {ScriptHackMoney: 1, ScriptHackMoneyGain: 1, ServerGrowthRate: 1};
const styles = new Set();
for (const weaken of [0.025, 0.05, 0.1]) for (const security of [1, 10, 50])
  for (const growth of [10, 70, 500]) for (const moneyMult of [0.2, 1, 10]) for (const startingHackThreads of [1, 100, 1000]) {
    const server = {...baseServer, minDifficulty: security, hackDifficulty: security, serverGrowth: growth};
    const multipliers = {...mults, ScriptHackMoney: moneyMult};
    let exit, batch;
    await batchMain({pid: 1, args: ['n00dles', -1, -1, startingHackThreads, JSON.stringify(multipliers)],
      getPortHandle: () => ({write: result => {batch = result;}}), atExit: callback => {exit = callback;},
      ramOverride: value => value,
      getPlayer: () => player, getServer: () => ({...server}),
      weakenAnalyze: (threads, cores) => {assert.equal(cores, 1); return threads * weaken;},
    });
    exit(); styles.add(batch.Type);
    for (const field of ['H1', 'W1', 'G1', 'W2']) assert(Number.isInteger(batch[field]) && batch[field] >= 0);
    const hackSecurity = batch.H1 * 0.002, growSecurity = batch.G1 * 0.004;
    for (const workerCores of [1, 8]) {
      const strength = weaken * (1 + (workerCores - 1) / 16);
      assert((batch.W1 + batch.W2) * strength + 1e-10 >= hackSecurity + growSecurity, 'Planned weakening must cover all security');
      if (batch.Type === 'HWGW') assert(batch.W1 * strength + 1e-10 >= hackSecurity);
    }
    const afterHack = Math.max(1, server.moneyMax * (1 - Math.min(1, batch.HackP * batch.H1)));
    const growServer = {...server, moneyAvailable: afterHack,
      hackDifficulty: server.minDifficulty + Math.max(0, hackSecurity - batch.W1 * weaken)};
    const recovered = (afterHack + batch.G1) * Math.exp(growthLog(growServer, player, multipliers) * batch.G1);
    assert(recovered >= server.moneyMax * (1 - 1e-12), 'Growth at the modeled residual security restores money');
  }
assert.deepEqual([...styles].sort(), ['HGW', 'HWGW', 'Hybrid'], 'Exercise every supported batch type');
assert.equal(hackingChance({...baseServer, hasAdminRights: false}, player), 0);

// Compare fallback growth with the pinned engine function when its checkout is supplied.
if (process.argv[2]) {
  const engineSource = name => readFile(process.argv[2] + '/src/' + name, 'utf8');
  const growth = await engineSource('Server/formulas/grow.ts');
  const growthCode = stripTypeScriptTypes(growth.slice(growth.indexOf('export function calculateServerGrowthLog('),
    growth.indexOf('export function calculateServerGrowth('))).replace(/^export /, '');
  const constantsCode = stripTypeScriptTypes(await engineSource('Server/data/Constants.ts')).replace(/^export /, '');
  const constants = Function(constantsCode + '; return ServerConstants;')();
  const engineGrowth = Function('currentNodeMults', 'ServerConstants', 'getCoreBonus', growthCode + ';return calculateServerGrowthLog;')(
    mults, constants, cores => 1 + (cores - 1) / 16);
  const source = await readFile(process.argv[2] + '/src/Server/ServerHelpers.ts', 'utf8');
  const fragment = source.slice(source.indexOf('export function numCycleForGrowthCorrected('), source.indexOf('//Applied server growth'));
  const code = stripTypeScriptTypes(fragment).replace(/^export /, '');
  const engine = Function('Player', 'calculateServerGrowthLog', code + ';return numCycleForGrowthCorrected;')(
    player, engineGrowth);
  for (const moneyMax of [1e3, 1e6, 1e12]) for (const fraction of [0, 1e-6, 0.01, 0.5, 0.99, 1])
    for (const cores of [1, 8]) for (const security of [1, 10, 90]) {
      const server = {...baseServer, moneyMax, moneyAvailable: moneyMax * fraction, hackDifficulty: security};
      assert(Math.abs(growthLog(server, player, mults, cores) - engineGrowth(server, 1, player, cores)) < 1e-14);
      assert.equal(growThreads(server, player, mults, cores), engine(server, moneyMax, server.moneyAvailable, cores, player));
    }
  const hacking = await engineSource('Hacking.ts');
  const intelligence = stripTypeScriptTypes(await engineSource('PersonObjects/formulas/intelligence.ts')).replace(/^export /, '');
  const intBonus = Function(intelligence + ';return calculateIntelligenceBonus;')();
  for (const [name, actual] of [['calculateHackingChance', hackingChance], ['calculatePercentMoneyHacked', hackingPercent]]) {
    const start = hacking.indexOf(`export function ${name}(`);
    const code = stripTypeScriptTypes(hacking.slice(start, hacking.indexOf('/**', start))).replace(/^export /, '');
    const expected = Function('currentNodeMults', 'calculateIntelligenceBonus', 'clampNumber', code + `;return ${name};`)(
      mults, intBonus, (value, min = -Infinity, max = Infinity) => Math.max(min, Math.min(max, value)));
    for (const hackingLevel of [1, 200, 10000]) for (const intelligenceLevel of [0, 30, 230]) for (const security of [1, 50, 100]) {
      const server = {...baseServer, hackDifficulty: security};
      const person = {...player, skills: {hacking: hackingLevel, intelligence: intelligenceLevel}};
      assert.equal(actual(server, person, mults), expected(server, person));
    }
  }
}

// Real helpers run under an 8 GB home budget, without overlapping the planner and its inputs.
let nextPid = 1, used = 0, peak = 0, apiReads = 0;
const ports = new Map(), live = new Set(), launches = [];
const reset = {currentNode: 1, lastNodeReset: 1, ownedSF: new Map()};
const sizes = {'bin/getResetInfo.js': 2.6, 'bin/getbnmultis.js': 2.6, 'bin/getHackP.js': 5.1, 'bin/getGrowThreads.js': 4.1};
const port = id => {
  if (!ports.has(id)) ports.set(id, {values: [], waiters: []});
  const p = ports.get(id);
  return {empty: () => p.values.length === 0, read: () => p.values.shift(),
    nextWrite: () => new Promise(resolve => p.waiters.push(resolve)),
    write: value => {p.values.push(value); for (const done of p.waiters.splice(0)) done();}};
};
const ns = {print() {}, getScriptRam: file => sizes[file], getPortHandle: port, isRunning: id => live.has(id),
  exec(file, host, options, ...args) {
    assert.equal(host, 'home');
    const ram = options.ramOverride ?? sizes[file];
    assert(used + ram <= 8, `Helper chain exceeded 8 GB: ${file}`);
    used += ram; peak = Math.max(used, peak); launches.push(file);
    const pid = nextPid++; live.add(pid);
    queueMicrotask(async () => {
      let exit = () => {};
      const child = {pid, args, getPortHandle: port, atExit: callback => {exit = callback;},
        getFunctionRamCost: name => ({getResetInfo: 1, getBitNodeMultipliers: 4})[name],
        getResetInfo: () => reset, ramOverride: value => {assert(value <= ram); return value;},
        getBitNodeMultipliers: () => {apiReads++; return {...mults};},
        getServer: () => ({...baseServer}), getPlayer: () => player, weakenAnalyze: () => 0.05};
      try {
        if (file === 'bin/getResetInfo.js') port(pid).write(reset);
        else await ({'bin/getHackP.js': batchMain, 'bin/getGrowThreads.js': growMain, 'bin/getbnmultis.js': bnMain})[file](child);
      } finally {exit(); used -= ram; live.delete(pid);}
    });
    return pid;
  },
};
assert((await getHackP(ns, 'n00dles', -1, -1, 1)).H1 > 0);
assert.equal(apiReads, 0, 'No unavailable BN API call before SF5');
assert((await getGrowThreads(ns, 'n00dles', 1, 1)) > 0);
reset.ownedSF.set(5, 1);
assert((await getHackP(ns, 'n00dles', -1, -1, 1)).G1 > 0);
assert.equal(apiReads, 1); assert(peak <= 8); assert.equal(used, 0);

// Execute the actual narrow kernel statements with a delayed calculator and finite leftovers.
const kernel = await readFile(new URL('../../../kernel.js', import.meta.url), 'utf8');
const subtraction = kernel.match(/threadsLeft -= \(\(batchInfo\.H1[^\n]+/)[0];
const left = Function('threadsLeft', 'batchInfo', 'results', subtraction + ';return threadsLeft;')(
  100, {H1: 2, W1: 1, G1: 5, W2: 1}, {batches: 7});
assert.equal(left, 37);
const switchCode = kernel.slice(kernel.indexOf('        target = nextTarget;'), kernel.indexOf('\n      if (recalcbad)'));
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const switched = await AsyncFunction('getHackP', 'ns', 'nextTarget', `
  let target, loopCount, botnetStatus, botsSent, botsRequired, recalcbad, recalcgood, batchInfo;
  if (true) { ${switchCode}
  return batchInfo;`)(async (_ns, target) => {assert.equal(target, 'foodnstuff'); await Promise.resolve(); return {H1: 4};}, {}, {hostname: 'foodnstuff'});
assert.deepEqual(switched, {H1: 4});
console.log('Batch security/money invariants, all three batch types, 8 GB helpers and target-switch checks passed.' +
  (process.argv[2] ? ' Pinned engine growth/chance/percent parity also passed.' : ' Supply an engine checkout for source parity checks.'));
