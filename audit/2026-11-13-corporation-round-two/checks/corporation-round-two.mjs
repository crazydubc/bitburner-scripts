// Round-two spending starvation, using the actual manager and official accounting/offer methods.
// Operating income and investment spend are controlled; this is not a replay of a live save.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bare, build, source} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';

const root = new URL('../../../', import.meta.url);
const current = readFileSync(new URL('corporation.js', root), 'utf8');
const previous = execFileSync('git', ['show', '3e9e522:corporation.js'], {cwd: root, encoding: 'utf8'});
const beforeSaving = execFileSync('git', ['show', '00e375c:corporation.js'], {cwd: root, encoding: 'utf8'});
const LongTermFundsSources = build(source('Corporation/data/FundsSource.ts'), {}, 'LongTermFundsSources');
const corpConstants = {secondsPerMarketCycle: 10, valuationLength: 10, initialShares: 1e9,
  fundingRoundShares: [.1, .35, .25, .2], fundingRoundMultiplier: [3, 2, 2, 1.5]};
const Corporation = build(source('Corporation/Corporation.ts'), {corpConstants,
  currentNodeMults: {CorporationValuation: 1}, LongTermFundsSources,
  getRecordValues: Object.values, getKeyList: () => [], constructorsForReviver: {}}, 'Corporation');
const cities = ['Sector-12', 'Aevum', 'Volhaven', 'Chongqing', 'New Tokyo', 'Ishima'];
const names = ['Agriculture', 'Chemical', 'Tobacco'];
const ns = {format: {number: String}};

function fixture(code = current, options = {}) {
  const settings = {funds: 5.291e9, revenue: 40e6, expenses: 8e6, progress: 100, round: 2, ...options};
  const products = {'Prod v1': {developmentProgress: settings.progress, stats: {quality: 210.877}}};
  const material = {stored: 0, averagePrice: 1};
  const divisions = Object.fromEntries(names.map(name => [name, {
    name, industry: name, cities, makesProducts: name === 'Tobacco', maxProducts: 3,
    products: name === 'Tobacco' ? ['Prod v1'] : [], thisCycleExpenses: 0,
  }]));
  const model = Object.assign(Object.create(Corporation.prototype), {
    funds: settings.funds, revenue: settings.revenue, expenses: settings.expenses,
    public: settings.round === 5, fundingRound: settings.round - 1, numberOfOfficesAndWarehouses: 36,
    divisions: new Map(names.map(name => [name, {calculateRecoupableValue: () => 100e9,
      warehouses: name === 'Tobacco' ? {'Sector-12': {materials: {Hardware: material}}} : {}, products: new Map()}])),
    totalAssets: settings.funds + 300e9, previousTotalAssets: settings.funds + 300e9,
    valuationsList: [], valuation: 0, cycleValuation: 0,
  });
  model.cycleValuation = model.determineCycleValuation();
  model.valuationsList = Array(10).fill(model.cycleValuation); model.determineValuation();
  const calls = [], logs = [], events = [];
  const warehouses = new Set(names.flatMap(div => cities.map(city => div + city)));
  const warehouseKey = 'ChemicalIshima';
  if (settings.missingWarehouse) warehouses.delete(warehouseKey);
  let quotedOffer = null, accepted = true;
  const rpc = (_ns, method, ...args) => {
    if (args[0] === '--batch') return JSON.parse(args[1]).map(a => rpc(_ns, method, ...a));
    calls.push([method, ...args]);
    switch (method) {
      case 'getCorporation': return {funds: model.funds, revenue: model.revenue, expenses: model.expenses,
        public: model.public, divisions: names, nextState: 'START'};
      case 'getDivision': return {...divisions[args[0]], products: [...divisions[args[0]].products]};
      case 'getProduct': return products[args[2]];
      case 'hasUnlock': return true;
      case 'getConstants': return {officeInitialCost: 4e9, warehouseInitialCost: 5e9};
      case 'getOffice': return {size: 10, numEmployees: 10};
      case 'hasWarehouse': return warehouses.has(args[0] + args[1]);
      case 'purchaseWarehouse':
        assert(!warehouses.has(args[0] + args[1])); assert(model.funds >= 20e9);
        model.loseFunds(5e9, 'warehouse'); warehouses.add(args[0] + args[1]); return;
      case 'buyMaterial': assert.equal(args[3], 0, 'Startup only clears standing orders'); return;
      case 'getInvestmentOffer': return quotedOffer ?? model.getInvestmentOffer();
      case 'acceptInvestmentOffer': {
        const offer = model.getInvestmentOffer();
        assert.equal(offer.round, 2); assert(offer.funds + model.funds >= 8.8e12);
        if (!accepted) return false;
        model.gainFunds(offer.funds, 'private equity'); model.fundingRound++; return true;
      }
      case 'makeProduct':
        assert(model.funds >= args[3] + args[4] + 15e9);
        model.loseFunds(args[3] + args[4], 'product development');
        products[args[2]] = {developmentProgress: 0}; divisions[args[0]].products.push(args[2]); return;
      default: assert.fail(`Unexpected RPC ${method}`);
    }
  };
  const api = Function('corpRun', 'log', 'recordRunEvents', 'divisions', 'settings', bare(code) + `
    for (const [name, info] of Object.entries(divisions)) {
      hasDivDB[name] = info;
      for (const city of cities) hasOfficeDB[name + city] = hasWarehouseDB[name + city] = true;
    }
    investOffer = {round: settings.round, funds: 0}; bnMults = {CorporationValuation: 1};
    return {prep, checkInvest, corpFunds, manageProducts, updateMisc, warehouseUpgrade,
      offer: value => investOffer = value,
      incomplete: name => hasWarehouseDB[name + 'Ishima'] = false,
      review: () => investmentReview,
      length: INVESTMENT_REVIEW_CYCLES};
  `)(rpc, (_ns, message) => logs.push(message), async (_ns, data) => events.push(...data), divisions, settings);
  const tick = (upgradeSpend = 0, boosterSpend = 0) => {
    // Represent boosters at acquisition value. Ordinary material purchases are not all lost assets.
    material.stored += boosterSpend;
    model.loseFunds(upgradeSpend, 'upgrades');
    model.revenue = settings.revenue; model.expenses = settings.expenses + boosterSpend / 10;
    model.gainFunds(model.revenue * 10, 'operating revenue');
    model.loseFunds(model.expenses * 10, 'operating expenses');
    model.updateTotalAssets(); model.cycleValuation = model.determineCycleValuation(); model.determineValuation();
    return model.getInvestmentOffer().funds;
  };
  return {api, model, calls, logs, events, divisions, products, tick,
    act: method => api[method](ns),
    check: async offer => {api.offer(offer ?? model.getInvestmentOffer()); return api.checkInvest(ns);},
    quote: offer => quotedOffer = offer,
    failAcceptance: () => accepted = false};
}

// Spending all $320m of cycle profit holds cash at the cushion and v2 stays unaffordable.
// $80m is a capital upgrade; $240m buys retained boosters. Both use real engine accounting.
const old = fixture(previous);
for (let i = 0; i < 30; i++) {
  await old.act('manageProducts'); old.tick(80e6, 240e6); assert.equal(await old.check(), 2);
}
assert.equal(old.model.funds, 5.291e9); assert.equal(old.api.review(), null);
assert(!old.calls.some(([m]) => m === 'makeProduct' || m === 'acceptInvestmentOffer'));
const spendingOffer = old.model.getInvestmentOffer().funds;
assert(spendingOffer > 4.5e12 && spendingOffer < 5e12);

const fixed = fixture();
for (let i = 0; i < 30; i++) fixed.tick(80e6, 240e6);
// Displayed losses caused by purchases must not prevent measuring the offer.
fixed.model.expenses = fixed.model.revenue + 4.18e6;
assert.equal(await fixed.check(), 2); assert(fixed.api.review());
let next = 2;
for (let i = 0; i < fixed.api.length; i++) {
  assert.equal(await fixed.act('corpFunds'), 0);
  assert(await fixed.api.corpFunds(ns, 0) > 0, 'Employee care can still use cash');
  await fixed.act('manageProducts'); await fixed.act('updateMisc'); await fixed.act('warehouseUpgrade');
  fixed.tick(); next = await fixed.check();
  assert.equal(next, i === fixed.api.length - 1 ? 3 : 2);
}
const reviewedOffer = fixed.events[0].data.offerFunds;
assert(reviewedOffer >= 8.8e12); assert.equal(fixed.events.length, 1);
assert.deepEqual(fixed.divisions.Tobacco.products, ['Prod v1']);
assert.equal(fixed.api.review(), null); assert.equal(fixed.products['Prod v1'].developmentProgress, 100);

// A genuinely smaller company gets growth time, then a second review without buying v2 first.
const small = fixture(current, {revenue: 10e6, expenses: 1e6});
await small.check(); assert(small.api.review());
for (let i = 0; i < small.api.length; i++) {small.tick(); assert.equal(await small.check(), 2);}
assert.equal(small.api.review(), null); assert(await small.act('corpFunds') > 0);
for (let i = 1; i < small.api.length; i++) {
  small.tick(); await small.check(); assert.equal(small.api.review(), null, 'Leave full cycles for growth');
}
small.tick(); await small.check(); assert(small.api.review(), 'Recheck while v1 is still the only product');
assert(!small.calls.some(([m]) => m === 'acceptInvestmentOffer'));

// Required construction, first design and absent revenue retain bootstrap access to funds.
for (const name of names) {
  const h = fixture(); h.api.incomplete(name); await h.check(); assert.equal(h.api.review(), null);
}
for (const options of [{progress: 80}, {revenue: 0}, {revenue: NaN}, {funds: -1}, {funds: NaN}]) {
  const h = fixture(current, options); await h.check(); assert.equal(h.api.review(), null);
}
// An already adequate offer may be reviewed during design, but incomplete Chemical blocks acceptance.
const developing = fixture(current, {progress: 80});
await developing.check({round: 2, funds: 9e12}); assert(developing.api.review());
assert.equal(developing.products['Prod v1'].developmentProgress, 80);
const construction = fixture(); construction.api.incomplete('Chemical');
await construction.check({round: 2, funds: 9e12}); assert.equal(construction.api.review(), null);

// Fresh quotes only: missing/invalid/smaller offers release the hold without accepting.
for (const amount of [4e12, NaN, undefined]) {
  const h = fixture(); await h.check({round: 2, funds: 9e12}); h.quote({round: 2, funds: amount});
  for (let i = 0; i < h.api.length; i++) await h.check({round: 2, funds: 9e12});
  assert.equal(h.api.review(), null); assert(!h.calls.some(([m]) => m === 'acceptInvestmentOffer'));
}
// A failed acceptance must not report an advance, nor strand discretionary spending at zero.
const failed = fixture(); for (let i = 0; i < 12; i++) failed.tick();
failed.failAcceptance(); await failed.check();
for (let i = 0; i < failed.api.length; i++) {failed.tick(); assert.equal(await failed.check(), 2);}
assert.equal(failed.events.length, 0); assert.equal(failed.api.review(), null);
for (const publicState of [false, true]) {
  const h = fixture(); await h.check(); assert(h.api.review());
  h.model.fundingRound = 2; h.model.public = publicState;
  assert.equal(await h.check(), publicState ? 5 : 3); assert.equal(h.api.review(), null);
}

// A completed v1 need not stay stuck when each below-target review ends short of $19b.
// Spend every dollar the real budget makes available after prep and product management.
async function savingScenario(code, missingWarehouse) {
  const h = fixture(code, {funds:7.355e9,revenue:10e6,expenses:1e6,missingWarehouse});
  let growthSpend=0, boughtWarehouseAt=0, startedV2At=0;
  for(let i=1;i<=600;i++) {
    const warehousesBefore=h.calls.filter(([method])=>method==='purchaseWarehouse').length;
    assert.equal(await h.act('prep'),true);await h.act('manageProducts');
    if(h.calls.filter(([method])=>method==='purchaseWarehouse').length>warehousesBefore)boughtWarehouseAt=i;
    const budget=Math.max(0,await h.act('corpFunds'));
    assert.equal(Math.max(0,await h.act('corpFunds')),budget,'Repeated reads preserve the growth allowance');
    h.tick(budget);growthSpend+=budget;assert.equal(await h.check(),2,'Do not accept a below-target offer');
    if(h.products['Prod v2']){startedV2At=i;break;}
  }
  assert(growthSpend>0);assert(!h.calls.some(([m])=>m==='discontinueProduct'));
  return {startedV2At,boughtWarehouseAt,growthSpend};
}
const stalled=await savingScenario(beforeSaving,false), saved=await savingScenario(current,false);
assert.equal(stalled.startedV2At,0);assert(saved.startedV2At>0);
const missing=await savingScenario(beforeSaving,true), expanded=await savingScenario(current,true);
assert.equal(missing.boughtWarehouseAt,0);assert(expanded.boughtWarehouseAt>0&&expanded.startedV2At>expanded.boughtWarehouseAt);
const phases=fixture(current,{funds:7.355e9,revenue:0});
await phases.act('prep');await phases.act('manageProducts');const initialGrowth=await phases.act('corpFunds');
assert(initialGrowth>0 && initialGrowth<2.355e9);
for(let i=0;i<5;i++){
  await phases.act('prep');await phases.act('manageProducts');assert.equal(await phases.act('corpFunds'),initialGrowth);
  assert.equal(await phases.check(),2);assert.equal(phases.api.review(),null);
}
phases.divisions.Tobacco.thisCycleExpenses=3e9;
assert(await phases.act('corpFunds')<=0,'Outstanding bills take priority over both uses of cash');
assert.equal(await phases.api.corpFunds(ns,0),4.355e9,'Affordable employee care can use earmarked cash');

console.log(JSON.stringify({spendingOffer, reviewedOffer, reviewCycles: fixed.api.length,
  keptProducts: fixed.divisions.Tobacco.products, savings:{stalled,saved,missing,expanded},
  scope: 'Controlled income, spending and retained inventory; actual manager and engine valuation, not a live save'}));
console.log('Round-two valuation reviews, v1 retention, funded v2, required construction before discretionary spending, cash/bill safeguards and fresh offers passed.');
