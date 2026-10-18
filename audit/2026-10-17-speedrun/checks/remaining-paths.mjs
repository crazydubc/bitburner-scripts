import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {main as contractMain} from '../../../Tasks/contractor.js.solver.js';
import {main as backdoorChild} from '../../../Tasks/backdoor-all-servers.js.backdoor-one.js';
import {executePurchase, purchaseRam} from '../../../purchase-guard.js';
import {canAffordCorporationPurchase} from '../../../corporation.js';

const noop = () => {};
const source = file => readFile(new URL('../../../' + file, import.meta.url), 'utf8');
async function extract(file, begin, end, bindings) {
  const text = await source(file), start = text.indexOf(begin), stop = end ? text.indexOf(end, start) : text.length;
  assert(start >= 0 && stop > start);
  const code = text.slice(start, stop), name = code.match(/(?:async )?function\s+(\w+)/)[1];
  return Function(...Object.keys(bindings), code + `;return ${name};`)(...Object.values(bindings));
}

// B09: due work launches once; one failed launch does not prevent other managers from starting.
const active = new Set(), launched = [], entries = [
  {name: 'fail.js', nextRun: 0, shouldRun: () => true, args: () => []},
  {name: 'manager.js', nextRun: 0, shouldRun: () => true, args: () => []},
  {name: 'manager.js', nextRun: 0, shouldRun: () => true, args: () => []},
  {name: 'disabled.js', nextRun: 0, shouldRun: () => false, args: () => []},
];
const bindings = {PERIOD: 30000, log: noop, getErrorInfo: String,
  isScriptRunning: async (_ns, file) => active.has(file),
  runScriptSomewhere: async (_ns, file) => {launched.push(file); if (file === 'fail.js') throw Error('home full'); active.add(file); return 1;}};
const runPeriodic = await extract('autopilot.js', 'async function runPeriodicScripts(ns)', '/** Accept Stanek', {...bindings, periodicScripts: entries});
await runPeriodic({}); assert.deepEqual(launched, ['fail.js', 'manager.js']);
await runPeriodic({}); assert.equal(launched.length, 2);
const helpers = [{name: 'manager.js', nextRun: Date.now() + 60000, shouldRun: () => true, args: () => []},
  {name: 'another.js', nextRun: 0, shouldRun: () => true, args: () => []}];
const runHelpers = await extract('autopilot.js', 'async function checkOnRunningScripts(ns)', 'async function runPeriodicScripts',
  {...bindings, asynchronousHelpers: helpers});
await runHelpers({}); assert.deepEqual(launched, ['fail.js', 'manager.js', 'another.js']);
assert((await source('autopilot.js')).includes('["-c", "--max-payoff-time", "4h"]'));
assert(!(await source('autopilot.js')).includes('1E100h'));

// B13: a clean remote parent uses only the home child, deduplicates by target, and includes equal-level servers.
const childName = 'Tasks/backdoor-all-servers.js.backdoor-one.js';
const backdoorParent = await extract('Tasks/backdoor-all-servers.js', 'async function main(ns)', null, {
  argsSchema: [], getFilePath: name => name, getConfiguration: () => ({'spawn-delay': 0, 'reserved-home-ram': 22}), log: noop,
});
const starts = [], existing = [{filename: '/' + childName, args: ['n00dles']}];
let free = 64;
const backdoorNs = {getFunctionRamCost: name => name === 'baseCost' ? 1.6 : 1, getHackingLevel: () => 10,
  scan: host => host === 'home' ? ['n00dles', 'foodnstuff', 'w0r1d_d43m0n', 'unrooted'] : ['home'],
  getServer: host => ({hostname: host, requiredHackingSkill: 10, hasAdminRights: host !== 'unrooted', backdoorInstalled: false}),
  ps: host => {assert.equal(host, 'home'); return existing;},
  getServerMaxRam: () => free, getServerUsedRam: () => 0, sleep: async () => {},
  exec(file, host, opts, target, route) {assert.equal(file, childName); assert.equal(host, 'home');
    assert.equal(opts.preventDuplicates, true); starts.push([target, JSON.parse(route)]); return 7;},
};
await backdoorParent(backdoorNs);
assert.deepEqual(starts, [['foodnstuff', ['home', 'foodnstuff']]]);
free = 23; await backdoorParent(backdoorNs); assert.equal(starts.length, 1);
let connected = 'home', installed = false, installing = false;
const hops = [];
await backdoorChild({args: ['foodnstuff', '["home","n00dles","foodnstuff"]'],
  getServer: () => ({backdoorInstalled: installed}), toast: noop,
  singularity: {
    connect: host => {assert(!installing, 'Do not call another NS API concurrently with installBackdoor'); connected = host; hops.push(host); return true;},
    installBackdoor: async () => {assert.equal(connected, 'foodnstuff'); installing = true; await Promise.resolve(); installed = true; installing = false;},
  },
});
assert.deepEqual(hops, ['home', 'n00dles', 'foodnstuff', 'home']);
await assert.rejects(backdoorChild({args: ['w0r1d_d43m0n', '[]']}), /Invalid automatic/);

// B14: failure state survives invocations; data/version/retry change eligibility, but last tries stay reserved.
let quarantine = '', solverCode = 'version one', attempts = 0, tries = 3;
const contract = {hostname: 'n00dles', contract: 'test.cct', type: 'Find Largest Prime Factor', data: 21};
const contractNs = {pid: 5, args: [], getHostname: () => 'home', getScriptName: () => 'Tasks/contractor.js.solver.js', ps: () => [],
  print: noop, tprint: noop, sleep: async () => {},
  read: file => file === '/data/contract-quarantine.json' ? quarantine : solverCode,
  write: async (file, data) => {assert.equal(file, '/data/contract-quarantine.json'); quarantine = data;},
  codingcontract: {getNumTriesRemaining: () => tries, attempt: () => {
    assert(Object.values(JSON.parse(quarantine)).some(entry => entry.reason === 'attempting'), 'Journal before consuming an attempt');
    attempts++; tries--; return '';
  }},
};
const sweep = async (extra = []) => {contractNs.args = [JSON.stringify([contract]), ...extra]; await contractMain(contractNs);};
await sweep(); assert.equal(attempts, 1); assert.equal(tries, 2);
await sweep(); assert.equal(attempts, 1, 'Same wrong answer must not be submitted again');
contract.data = 35; await sweep(); assert.equal(attempts, 2); assert.equal(tries, 1);
solverCode = 'version two'; await sweep(); assert.equal(attempts, 2, 'A code change does not waive the last-try reserve');
await sweep(['--retry-failed']); assert.equal(attempts, 2);
await sweep(['--retry-failed', '--allow-last-attempt']); assert.equal(attempts, 3);
quarantine = '{bad'; await assert.rejects(sweep(), /JSON/); assert.equal(attempts, 3);

// B02: serialized home checks protect against cash/reserve/price changes across every caller's await.
let cash = 200, reserve = 100, casino = 0, purchases = 0, price = 60;
const debit = cost => {cash -= cost; purchases++; return true;};
const purchaseNs = {getHostname: () => 'home', read: () => String(reserve), getServerMoneyAvailable: () => cash,
  enums: {PositionType: {Long: 'L', Short: 'S'}},
  getMoneySources: () => ({sinceInstall: {casino}}), getFunctionRamCost: () => 1,
  cloud: {getServerCost: () => price, purchaseServer: () => {debit(price); return 'daemon-0';}},
  hacknet: {getPurchaseNodeCost: () => price, purchaseNode: () => {debit(price); return 0;}},
  stock: {getPurchaseCost: (symbol, shares, positionType) => {
    assert.equal(symbol, 'AAA'); assert.equal(shares, 6);
    assert(['L', 'S'].includes(positionType), 'Stock quotes only accept PositionType enum values');
    return price;
  }, buyStock: () => {debit(price); return 10;}, buyShort: () => {debit(price); return 10;}},
  gang: {getEquipmentCost: () => price, purchaseEquipment: () => debit(price)},
};
assert.equal(executePurchase(purchaseNs, 'cloud', 'purchaseServer', ['daemon', 2]).spent, 60);
assert.equal(executePurchase(purchaseNs, 'gang', 'purchaseEquipment', ['a', 'b']).spent, 0);
assert.equal(cash, 140, 'A second manager cannot spend the first manager’s stale cash allowance');
cash = 300; reserve = 290;
assert.equal(executePurchase(purchaseNs, 'hacknet', 'purchaseNode', []).spent, 0, 'A changed reserve is read at execution');
reserve = 100; price = 80;
assert.equal(executePurchase(purchaseNs, 'cloud', 'purchaseServer', ['daemon', 2], {budget: 60}).spent, 0, 'A changed price must fit the original budget');
cash = 1e12; price = 60;
assert.equal(executePurchase(purchaseNs, 'stock', 'buyStock', ['AAA', 6]).spent, 0, 'Unrelated wealth does not prove casino completion');
casino = 10e9;
assert.equal(executePurchase(purchaseNs, 'stock', 'buyStock', ['AAA', 6]).spent, 60);
assert.equal(executePurchase(purchaseNs, 'stock', 'buyShort', ['AAA', 6]).spent, 60);
casino = 0;
assert.equal(executePurchase(purchaseNs, 'stock', 'buyShort', ['AAA', 6]).spent, 0, 'A new installation re-locks share buying');
cash = 200; reserve = 200;
assert.equal(executePurchase(purchaseNs, 'hacknet', 'purchaseNode', [], {reserve: 0}).result, 0, 'Node index zero is a successful purchase');
cash = 200;
assert.equal(executePurchase(purchaseNs, 'hacknet', 'purchaseNode', [], {ignoreReserveBelowFraction: 0.1}).spent, 0);
price = 10;
assert.equal(executePurchase(purchaseNs, 'hacknet', 'purchaseNode', [], {ignoreReserveBelowFraction: 0.1}).spent, 10);
reserve = NaN;
assert.throws(() => executePurchase(purchaseNs, 'cloud', 'purchaseServer', ['a', 2]), /Invalid purchase/);
reserve = 0; cash = NaN;
assert.throws(() => executePurchase(purchaseNs, 'cloud', 'purchaseServer', ['a', 2]), /Invalid home cash/);
assert.throws(() => purchaseRam(purchaseNs, 'singularity', 'deleteServer'), /Unsupported/);

// Missing late-game industries are normal; API failures are not evidence that a division is missing.
async function corpExpansion({funds = 200e9, multiplier = 1, existing = [], failRead = false} = {}) {
  const divisions = new Map(existing.map(name => [name, {name, cities: ['Sector-12']}])) , warehouses = new Set();
  const calls = [], ns = {};
  const getCorp = async () => ({funds, divisions: [...divisions.keys()]});
  const corpRun = async (_ns, method, name, city) => {
    calls.push([method, name, city]);
    switch (method) {
      case 'getDivision': if (failRead) throw Error('division read unavailable'); return structuredClone(divisions.get(name));
      case 'getIndustryData': return {startingCost: 20e9};
      case 'expandIndustry': assert(funds >= 20e9); funds -= 20e9; divisions.set(name, {name, cities: ['Sector-12']}); return;
      case 'getOffice': return {size: 3};
      case 'expandCity': assert(funds >= 4e9); funds -= 4e9; divisions.get(name).cities.push(city); return;
      case 'purchaseWarehouse': assert(funds >= 5e9); funds -= 5e9; warehouses.add(name + city); return;
      case 'hasWarehouse': return warehouses.has(name + city);
      default: assert.fail(method);
    }
  };
  const getOptionalDivision = await extract('corporation.js', 'async function getOptionalDivision',
    '/** Keep a corporation purchase', {getCorp, corpRun});
  const cache = {hasDivDB: {}, hasOfficeDB: {}, hasWarehouseDB: {}};
  const expand = await extract('corporation.js', 'async function expandCities', 'async function tryPurchaseUnlock', {
    corpRun, getCorp, getOptionalDivision, corpFunds: async () => funds, bnMults: {CorporationDivisions: multiplier},
    canAffordCorporationPurchase, getCorporationConstants: async () => ({officeInitialCost: 4e9, warehouseInitialCost: 5e9}),
    cities: ['Sector-12', 'Aevum'], ...cache,
  });
  return {expand: (name, options) => expand(ns, name, options), calls, divisions, warehouses, cache};
}
{
  const h = await corpExpansion();
  for (const name of ['Water Utilities', 'Computer Hardware', 'Refinery', 'Mining']) {
    assert.equal(await h.expand(name), true);
    assert.deepEqual(h.divisions.get(name).cities, ['Sector-12', 'Aevum']);
    assert(h.warehouses.has(name + 'Aevum'));
  }
  assert.equal(h.calls.filter(([method]) => method === 'expandIndustry').length, 4);
  await h.expand('Mining');
  assert.equal(h.calls.filter(([method]) => method === 'expandIndustry').length, 4, 'Resume without duplicating industries');
}
{
  const h = await corpExpansion({funds: 25e9});
  assert.equal(await h.expand('Mining', {reserve: 10e9}), false);
  assert(!h.calls.some(([method]) => method === 'expandIndustry'));
}
{
  const h = await corpExpansion({multiplier: 0.1, existing: ['Agriculture', 'Tobacco']});
  assert.equal(await h.expand('Mining'), false);
  assert(!h.calls.some(([method]) => method === 'expandIndustry'), 'Respect this BitNode’s division cap');
}
{
  const h = await corpExpansion({existing: ['Mining'], failRead: true});
  await assert.rejects(h.expand('Mining'), /division read unavailable/);
  assert(!h.calls.some(([method]) => method === 'expandIndustry'), 'Do not hide transport failure as missing state');
}
console.log('Scheduler, home backdoors, contract quarantine, purchase/casino checks and bounded corporation expansion passed.');
