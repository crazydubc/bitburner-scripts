// Real manager functions plus official product development/manufacturing code; no live-game claims.
// node audit/2026-10-17-speedrun/checks/corporation-products.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';

const root = new URL('../../../', import.meta.url);
const engine = resolve(process.argv[2] ?? '../bitburner-engine');
const official = path => readFileSync(resolve(engine, path), 'utf8');
const current = readFileSync(new URL('corporation.js', root), 'utf8');
const baseline = execFileSync('git', ['show', 'b50154d:corporation.js'], {cwd: root, encoding: 'utf8'});
const noImports = source => source.replace(/^import .*;?\n/gm, '').replace(/^export /gm, '');
function manager(source, rpc, division, round = 3, pricing = {}) {
  return Function('corpRun', noImports(source) + `
    hasDivDB.Tobacco = arguments[1];
    investOffer = {round: arguments[2]};
    Object.assign(ta2DB, arguments[3]);
    return {manageProducts, spendRP, runResearchList, ta2DB};
  `)((_ns, method, ...args) => rpc(method, args), division, round, pricing);
}

// Read the actual research costs and product industry weights from the reference engine.
const {CorpEmployeeJob} = Function(stripTypeScriptTypes(noImports(official('src/Corporation/Enums.ts')),
  {mode: 'transform'}) + ';return {CorpEmployeeJob};')();
const {Research} = Function(stripTypeScriptTypes(noImports(official('src/Corporation/Research.ts'))) +
  ';return {Research};')();
const ResearchMap = Function('Research', stripTypeScriptTypes(noImports(official('src/Corporation/ResearchMap.ts'))) +
  ';return ResearchMap;')(Research);
const industrySource = official('src/Corporation/data/IndustryData.ts');
const tobaccoStart = industrySource.indexOf('  [IndustryType.Tobacco]: ') + '  [IndustryType.Tobacco]: '.length;
const tobaccoEnd = industrySource.indexOf('  [IndustryType.Water]: ', tobaccoStart);
assert(tobaccoStart > 0 && tobaccoEnd > tobaccoStart);
const tobacco = Function('return (' + industrySource.slice(tobaccoStart, tobaccoEnd).trim().replace(/,$/, '') + ');')();
const productCode = stripTypeScriptTypes(noImports(official('src/Corporation/Product.ts')));
const Product = Function('CityName', 'CorpEmployeeJob', 'IndustriesData', 'MaterialInfo',
  'createEnumKeyedRecord', 'getRecordKeys', 'getRecordEntries', 'getRandomIntInclusive', 'constructorsForReviver',
  productCode + ';return Product;')(
  {Sector12: 'Sector-12'}, CorpEmployeeJob, {Tobacco: tobacco}, {Plants: {size: 1}},
  (keys, value) => Object.fromEntries(Object.values(keys).map(key => [key, value(key)])),
  Object.keys, Object.entries, () => 35, {});

function developed(investment, researchPoints, productivity = 1, advertising = investment) {
  const product = new Product({name: 'Test', createCity: 'Sector-12', designInvestment: investment,
    advertisingInvestment: advertising});
  product.createProduct(100000, {Operations: 100 * productivity, Engineer: 100 * productivity,
    Management: 100 * productivity, Business: 100 * productivity, 'Research & Development': 0,
    total: 400 * productivity});
  assert.equal(product.developmentProgress, 100);
  product.finishProduct({industry: 'Tobacco', researchPoints, researchFactor: tobacco.scienceFactor,
    awareness: 100, popularity: 50, requiredMaterials: {Plants: 1}});
  return product;
}
const v1 = developed(1e9, 100000);
const v2SameStaff = developed(2e9, 100000);
const investmentGain = v2SameStaff.rating / v1.rating - 1;
assert(investmentGain > 0.005 && investmentGain < 0.006, 'Doubling early design spending adds only about 0.53%');
assert(developed(2e9, 100000, 0.8).rating < v1.rating, 'Weaker development productivity can outweigh doubled investment');
assert(developed(2e9, 80000).rating < v1.rating, 'Spending banked research can lower the next design rating');
assert.equal(developed(1e9, 100000, 1, 2e9).rating, v1.rating, 'Marketing investment does not improve design rating');

// Execute the actual manufacturing method: a better design can have a worse effective rating.
const divisionCode = official('src/Corporation/Division.ts');
const start = divisionCode.indexOf('  processProduct(marketCycles');
const end = divisionCode.indexOf('  resetImports(', start);
assert(start >= 0 && end > start);
const processProduct = Function('corpConstants', 'getRecordEntries', 'throwIfReachable', 'MaterialInfo',
  stripTypeScriptTypes('function ' + divisionCode.slice(start, end).trim()) + ';return processProduct;')(
  {secondsPerMarketCycle: 10}, Object.entries, value => assert.fail(`Unexpected state ${value}`), {Plants: {size: 1}});
function manufactured(rating, plantsQuality, stored = 0, previousRating = 0) {
  const product = new Product();
  product.rating = rating; product.requiredMaterials = {Plants: 1}; product.size = 1;
  product.cityData['Sector-12'].stored = stored;
  product.cityData['Sector-12'].effectiveRating = previousRating;
  const division = {offices: {'Sector-12': {}}, productionMult: 1,
    warehouses: {'Sector-12': {size: 10000, sizeUsed: 0, smartSupplyStore: 0,
      materials: {Plants: {stored: 1e6, quality: plantsQuality, productionAmount: 0}}}},
    getOfficeProductivity: () => 10, getProductionMultiplier: () => 1,
    getProductProductionMultiplier: () => 1, updateWarehouseSizeUsed: () => {}};
  processProduct.call(division, 1, product, {state: {nextName: 'PRODUCTION'}, getProductionMultiplier: () => 1});
  return product.cityData['Sector-12'].effectiveRating;
}
assert.equal(manufactured(100, 2), 30);
assert.equal(manufactured(144, 1), 24, 'Lower-quality Plants can reverse the visible rating order');
assert.equal(manufactured(144, 2), 36, 'With identical materials, the stronger design stays stronger');
assert.equal(manufactured(144, 1, 100, 36), 30, 'Effective rating also retains the quality of unsold stock');

function researchHarness(source, points = 101000) {
  const state = {points, purchases: [], reads: 0};
  const api = manager(source, (method, args) => {
    if (method === 'getDivision') {state.reads++; return {researchPoints: state.points};}
    if (method === 'getResearchCost') return ResearchMap[args[1]].cost;
    if (method === 'research') {
      const cost = ResearchMap[args[1]].cost;
      assert(state.points >= cost, 'Research purchase must be affordable');
      state.purchases.push({name: args[1], before: state.points, cost}); state.points -= cost; return;
    }
    assert.fail(`Unexpected research RPC ${method}`);
  }, {industry: 'Tobacco'});
  return {state, api};
}
let r = researchHarness(baseline);
await r.api.spendRP({});
assert.equal(r.state.points, 86000);
assert(r.state.purchases.some(({before, cost}) => cost >= before / 10), 'Reproduce stale research balance');
r = researchHarness(current);
await r.api.spendRP({});
assert.equal(r.state.points, 96000);
assert.deepEqual(r.state.purchases.map(p => p.name), ['Hi-Tech R&D Laboratory']);
assert(r.state.purchases.every(({before, cost}) => cost < before / 10));
const guardedResearchRating = developed(2e9, r.state.points).rating;
assert(guardedResearchRating > developed(2e9, 86000).rating);
r.state.points = 100000;
await r.api.spendRP({});
assert.equal(r.state.purchases.length, 1, 'Keep the existing strict research threshold');
r.state.points = 100001;
await r.api.spendRP({});
assert.deepEqual(r.state.purchases.map(p => p.name), ['Hi-Tech R&D Laboratory', 'uPgrade: Fulcrum']);
assert.equal(r.state.points, 90001, 'Resume in priority order when the research bank recovers');
const lowRatioList = ['Hi-Tech R&D Laboratory', 'Overclock', 'Sti.mu', 'Automatic Drug Administration', 'Go-Juice', 'CPH4 Injections'];
r = researchHarness(baseline, 61000);
await assert.rejects(r.api.runResearchList({}, 'Tobacco', lowRatioList, 2), /affordable/);
r = researchHarness(current, 61000);
await r.api.runResearchList({}, 'Tobacco', lowRatioList, 2);
assert.equal(r.state.points, 41000);
assert(r.state.purchases.every(({before, cost}) => cost < before / 2));

function lineup(source, options = {}) {
  const names = options.names ?? ['Prod v1', 'Prod v2', 'Prod v3'];
  const products = Object.fromEntries(names.map((name, index) => [name, {
    developmentProgress: 100, stats: {quality: index + 1}, productionCost: 2336, ...options.products?.[name]}]));
  const division = {name: 'Tobacco', industry: 'Tobacco', makesProducts: true, maxProducts: 3, products: [...names]};
  const state = {funds: options.funds ?? 16e9, calls: [], products, division};
  const api = manager(source, (method, args) => {
    state.calls.push([method, ...args]);
    if (method === 'getDivision') return structuredClone(division);
    if (method === 'getProduct') return products[args[2]];
    if (method === 'getCorporation') return {funds: state.funds};
    if (method === 'discontinueProduct') {
      division.products = division.products.filter(name => name !== args[1]); delete products[args[1]]; return;
    }
    if (method === 'makeProduct') {
      assert(division.products.length < division.maxProducts);
      assert(!division.products.includes(args[2]));
      const cost = args[3] + args[4]; assert(state.funds >= cost);
      state.funds -= cost; division.products.push(args[2]);
      products[args[2]] = {developmentProgress: 0}; return;
    }
    assert.fail(`Unexpected product RPC ${method}`);
  }, division, options.round ?? 3, options.pricing);
  return {state, api, run: () => api.manageProducts({}), mutations: () => state.calls.filter(([method]) =>
    ['discontinueProduct', 'makeProduct'].includes(method))};
}
let h = lineup(baseline, {funds: 16e9 - 1}); await h.run();
assert.deepEqual(h.mutations().map(([method]) => method), ['discontinueProduct'], 'Reproduce deleting a seller without replacement funding');
for (const options of [{funds: 16e9 - 1}, {funds: 26e9 - 1, round: 2}, {funds: NaN},
  {names: ['Prod v1022', 'Prod v1023', 'Prod v1024'], funds: Number.MAX_VALUE}]) {
  h = lineup(current, options); await h.run(); assert.deepEqual(h.mutations(), []);
  assert.equal(h.state.division.products.length, 3);
}
h = lineup(current); await h.run();
assert.deepEqual(h.mutations(), [['discontinueProduct', 'Tobacco', 'Prod v1'],
  ['makeProduct', 'Tobacco', 'Sector-12', 'Prod v4', 8e9, 8e9]]);
h = lineup(current, {round: 2, funds: 26e9}); await h.run(); assert.equal(h.state.funds, 10e9);
const weakestNewest = {products: {'Prod v3': {stats: {quality: 0.1}}}};
h = lineup(baseline, weakestNewest); await h.run();
assert.equal(h.mutations()[1][3], 'Prod v3', 'Reproduce reusing the retired newest version and its smaller budget');
h = lineup(current, weakestNewest); await h.run();
assert.deepEqual(h.mutations(), [['discontinueProduct', 'Tobacco', 'Prod v3'],
  ['makeProduct', 'Tobacco', 'Sector-12', 'Prod v4', 8e9, 8e9]]);
for (const names of [[], ['Prod v1'], ['Prod v1', 'Prod v2']]) {
  h = lineup(current, {names, funds: 2e9 * 2 ** names.length}); await h.run();
  assert.deepEqual(h.mutations(), [['makeProduct', 'Tobacco', 'Sector-12', `Prod v${names.length + 1}`,
    1e9 * 2 ** names.length, 1e9 * 2 ** names.length]]);
}
for (const options of [{products: {'Prod v3': {developmentProgress: 99.9}}},
  {products: Object.fromEntries(['Prod v1', 'Prod v2', 'Prod v3'].map(name => [name, {stats: {quality: NaN}}]))}]) {
  h = lineup(current, options); await h.run(); assert.deepEqual(h.mutations(), []);
}
h = lineup(current); h.state.products['Prod v3'] = null; await h.run();
assert.deepEqual(h.mutations(), [], 'A missing product snapshot must defer replacement');
const pricing = Object.fromEntries(['Prod v1', 'Prod v2', 'Prod v3'].map((name, index) =>
  ['TobaccoSector-12' + name, {markupLimit: [300, 100, 200][index]}]));
h = lineup(current, {pricing}); await h.run();
assert.equal(h.mutations()[0][2], 'Prod v2', 'Preserve the existing price-based retirement policy');
assert.equal(h.api.ta2DB['TobaccoSector-12Prod v2'], undefined, 'Clear retired-product pricing');
assert(h.api.ta2DB['TobaccoSector-12Prod v1']);
console.log(JSON.stringify({designGainFromDoublingInvestment: investmentGain,
  effectiveRatingExample: {olderDesign100: manufactured(100, 2), newerDesign144: manufactured(144, 1)}}));
console.log('Official product formulas, stale-research reproduction, funded replacements, version progression, first slots, reserves, development and pricing checks passed.');
