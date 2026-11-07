// Exercise the real sell loop, offloaded manager/home helper and Steam price parser.
// node audit/2026-10-17-speedrun/checks/corporation-sale-prices.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {corpRun} from '../../../utils.js';
import {main as helper} from '../../../bin/corpRun.js';

const repo = new URL('../../../', import.meta.url), engine = resolve(process.argv[2] ?? '../bitburner-engine');
const source = name => readFileSync(resolve(engine, name), 'utf8');
const before = execFileSync('git', ['show', 'b1e6bdf:corporation.js'], {cwd: repo, encoding: 'utf8'});
const after = readFileSync(new URL('corporation.js', repo), 'utf8');
const actions = source('src/Corporation/Actions.ts');
const first = actions.indexOf('export function convertPriceString('), last = actions.indexOf('export function setSmartSupply(', first);
assert(first >= 0 && last > first);
const game = Function(stripTypeScriptTypes(actions.slice(first, last).replace(/^export /gm, '')) +
  ';return {sellMaterial,sellProduct};')();
const portCode = source('src/NetscriptPort.ts').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const Port = Function('NetscriptPorts', 'Settings', stripTypeScriptTypes(portCode) + ';return PortHandle;')(
  new Map(), {MaxPortCapacity: 50});
const STOP = Symbol('finished sale phase'), noop = () => {};
let pid = 0;

function fixture(code, kind, options = {}) {
  const product = kind === 'product', div = product ? 'Tobacco' : 'Agriculture', city = 'Sector-12';
  const name = options.name ?? (product ? 'Prod v2' : 'Plants'), key = div + city + name;
  const state = {office: options.office ?? 100, quotes: [], ta: [], logs: [], calls: []};
  const snapshot = {stored: 100, productionAmount: 10, actualSellAmount: 5, marketPrice: 100, quality: 12,
    productionCost: 20, developmentProgress: 100, rating: 25, exports: [], ...options.item};
  const industry = {makesProducts: product, producedMaterials: product ? [] : options.sibling ? [name, 'Food'] : [name],
    realEstateFactor: 0.15, hardwareFactor: 0.15, robotFactor: 0.2, aiCoreFactor: 0.15};
  const division = {name: div, industry: div, products: product ? [name] : [], makesProducts: product};
  const api = {
    getCorporation: () => ({nextState: 'SALE', public: false}), getInvestmentOffer: () => ({round: 2}),
    getDivision: () => division, hasResearched: () => Boolean(options.ta), getIndustryData: () => industry,
    getProduct: () => snapshot, getMaterialData: () => ({baseMarkup: options.baseMarkup ?? 2}),
    getMaterial: (divisionName, _city, mat) => divisionName === 'Destination' ? {importAmount: options.exported}
      : mat === name ? snapshot : mat === 'Food' ? {...snapshot, exports: [], actualSellAmount: 1} : {stored: 0},
    getOffice: () => ({employeeProductionByJob: {Operations: state.office, Engineer: 0, Management: 0}}),
    getUpgradeLevel: () => {if (options.rpcError) throw Error('fixture access denied'); return 0;},
    setMaterialMarketTA2: (...args) => state.ta.push(args), setProductMarketTA2: (...args) => state.ta.push(args),
    sellMaterial(_div, _city, mat, amt, price) {
      const material = {}; game.sellMaterial(material, String(amt), String(price));
      state.quotes.push([mat, material.desiredSellAmount, material.desiredSellPrice]);
    },
    sellProduct(_div, _city, prod, amt, price) {
      const p = {cityData: {[city]: {}}}; game.sellProduct(p, city, String(amt), String(price), false);
      state.quotes.push([prod, p.cityData[city].desiredSellAmount, p.cityData[city].desiredSellPrice]);
    },
  };
  const running = new Set();
  const ns = {pid: 1, print: noop, tprint: noop, ramOverride: ram => ram, flags: () => ({'dividend-rate': 0.01}),
    disableLog: noop, clearLog: noop, format: {number: String}, getHostname: () => 'run4theh111z',
    corporation: {hasCorporation: () => true, nextUpdate: () => {throw STOP;}},
    getFunctionRamCost: () => 1.6, getScriptRam: () => 23.6, getPortHandle: id => new Port(id),
    isRunning: id => running.has(id),
    exec(file, host, opts, fn, ...args) {
      assert.equal(file, 'bin/corpRun.js'); assert.equal(host, 'home'); assert.equal(opts.ramOverride, 23.6);
      const id = ++pid; running.add(id); state.calls.push(fn);
      queueMicrotask(async () => {
        let atExit;
        try { await helper({...ns, pid: id, args: [fn, ...args], atExit: cb => {atExit = cb;}, corporation: api}); }
        finally {atExit(); running.delete(id);}
      });
      return id;
    },
  };
  const setup = (divs, offices, warehouses, research) => {
    divs[div] = division; offices[div + city] = true; warehouses[div + city] = true;
    if (options.marketData !== false) research['Market Research - Demand'] = research['Market Data - Competition'] = true;
  };
  const manager = Function('corpRun', 'getReset', 'getBNMults', 'log', 'setup',
    code.replace(/^import .*\n/gm, '').replace(/^export /gm, '') + `
      const setupDivision = () => setup(hasDivDB, hasOfficeDB, hasWarehouseDB, researchedDB);
      setupDivision();
      // Isolate the round-two sale: bootstrap, HUD and development perform no work in this fixture.
      prep = async () => {setupDivision(); return true;}; updateHud = manageProducts = async () => {};
      return {main, sell, cache: ta2DB};
    `)(corpRun, () => ({currentNode: 10, ownedSF: new Map([[3, 1]])}),
    () => ({CorporationValuation: 0.5, CorporationSoftcap: 0.9, CorporationDivisions: 0.9}),
    (_ns, message) => state.logs.push(message), setup);
  if (options.entry) manager.cache[key] = {...options.entry};
  return {state, snapshot, cache: manager.cache, key, main: () => manager.main(ns), sell: () => manager.sell(ns)};
}

const entry = {sellingPrice: 200, sellingQuantity: 100, markupLimit: 0};
for (const kind of ['material', 'product']) {
  const options = {entry, office: 0, sibling: kind === 'material'};
  const old = fixture(before, kind, options);
  const method = kind === 'material' ? 'sellMaterial' : 'sellProduct';
  await assert.rejects(old.main(), new RegExp(`corporation\\.${method}: .*?Invalid value or expression for sell price field: .*?Price: INFINITY\\. sanitizedPrice: \\.`));
  assert(old.state.logs.some(s => s.includes('BN10: valuation x0.5')));
  const fixed = fixture(after, kind, options);
  const siblingKey = 'AgricultureSector-12Food';
  if (options.sibling) fixed.cache[siblingKey] = {...entry, markupLimit: 4};
  await assert.rejects(fixed.main(), error => error === STOP, 'Manager must reach the next corporation update');
  assert.deepEqual(fixed.state.quotes[0].slice(1), ['MAX', 'MP']);
  assert(!Object.hasOwn(fixed.cache, fixed.key));
  if (options.sibling) {
    assert.deepEqual(fixed.state.quotes[1], ['Food', 'MAX', '104']);
    assert.equal(fixed.cache[siblingKey].markupLimit, 4, 'Keep other items calibrated');
  }
  // Once production resumes, the same running manager can relearn instead of staying on MP.
  fixed.state.office = 100;
  await fixed.sell(); fixed.snapshot.actualSellAmount = 11; await fixed.sell();
  fixed.snapshot.actualSellAmount = 5; await fixed.sell();
  assert(Number.isFinite(fixed.cache[fixed.key].markupLimit) && fixed.cache[fixed.key].markupLimit > 0);
  assert(fixed.state.quotes.filter(([name]) => fixed.key.endsWith(name)).at(-1)[2] !== 'MP');
}

// Differential checks exercise the old/new managers with the same observations and actual price parser.
function close(a, b) { assert(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`); }
for (const kind of ['material', 'product']) {
  const cases = [{}, {entry, item: {actualSellAmount: 10}}, {entry, item: {actualSellAmount: 0}}, {entry},
    {entry: {...entry, markupLimit: 4.75}}, {entry: {...entry, markupLimit: 4.75}, item: {productionAmount: 0}},
    {ta: true, entry: {...entry, markupLimit: Infinity}}, {item: {stored: 0}}];
  if (kind === 'material') cases.push({marketData: false}, {entry, exported: 2,
    item: {exports: [{division: 'Destination', city: 'Aevum'}]}}, {entry: {...entry, markupLimit: 4}, exported: 11,
    item: {exports: [{division: 'Destination', city: 'Aevum'}]}});
  else cases.push({item: {developmentProgress: 99}});
  for (const options of cases) {
    const a = fixture(before, kind, options), b = fixture(after, kind, options); await a.sell(); await b.sell();
    assert.deepEqual(a.state.ta, b.state.ta); assert.equal(a.state.quotes.length, b.state.quotes.length);
    for (const [i, [name, qty, price]] of a.state.quotes.entries()) {
      const quote = b.state.quotes[i]; assert.deepEqual(quote.slice(0, 2), [name, qty]);
      if (Number.isFinite(Number(price))) close(Number(quote[2]), Number(price)); else assert.equal(quote[2], price);
    }
    assert.deepEqual(b.cache, a.cache);
  }
}

for (const [kind, options] of [
  ['material', {entry, office: NaN}], ['product', {entry, office: Infinity}],
  ['material', {entry: {...entry, markupLimit: Infinity}}], ['product', {entry: {...entry, sellingQuantity: NaN}}],
  ['material', {entry: {...entry, sellingPrice: Infinity}}], ['material', {item: {marketPrice: NaN}}],
  ['product', {item: {rating: Infinity}}], ['product', {item: {productionCost: Number.MAX_VALUE}}],
  ['material', {entry: {...entry, sellingPrice: Number.MAX_VALUE}, item: {actualSellAmount: 11}}],
  ['material', {entry: {...entry, sellingPrice: Number.MAX_VALUE, markupLimit: 2}, exported: 11,
    item: {exports: [{division: 'Destination', city: 'Aevum'}]}}],
  ['product', {entry: {...entry, sellingPrice: Number.MAX_VALUE}, item: {actualSellAmount: 11}}],
  ['product', {entry: {...entry, markupLimit: Number.MAX_VALUE}}], ['product', {name: 'Prod v700'}],
  ['product', {name: 'Prod v1100'}], ['material', {marketData: false, baseMarkup: 0}],
]) {
  const f = fixture(after, kind, options); await f.sell();
  assert.deepEqual(f.state.quotes[0].slice(1), ['MAX', 'MP']); assert(!Object.hasOwn(f.cache, f.key));
}
const error = fixture(after, 'material', {entry, rpcError: true});
await assert.rejects(error.sell(), /corporation\.getUpgradeLevel: .*fixture access denied/);
console.log('Reproduced INFINITY through the old BN10 round-two manager / home helper / game parser; scoped fallback, recovery, normal quote parity, exports, TA.II, pre-unlock prices and RPC error propagation passed.');
