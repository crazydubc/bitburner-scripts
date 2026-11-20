// Real manager policy and pinned engine accounting/valuation. Fixed operating income, not a live save.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bare, build, source} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';

const root = new URL('../../../', import.meta.url);
const current = readFileSync(new URL('corporation.js', root), 'utf8');
const previous = execFileSync('git', ['show', '9bd8d36:corporation.js'], {cwd: root, encoding: 'utf8'});
const LongTermFundsSources = build(source('Corporation/data/FundsSource.ts'), {}, 'LongTermFundsSources');
const corpConstants = {secondsPerMarketCycle: 10, valuationLength: 10, initialShares: 1e9,
  fundingRoundShares: [.1, .35, .25, .2], fundingRoundMultiplier: [3, 2, 2, 1.5]};
const nodeMults = {CorporationValuation: 1};
const Corporation = build(source('Corporation/Corporation.ts'), {corpConstants, currentNodeMults: nodeMults,
  LongTermFundsSources, getRecordValues: Object.values, getKeyList: () => [], constructorsForReviver: {}}, 'Corporation');
const cities = ['Sector-12', 'Aevum', 'Volhaven', 'Chongqing', 'New Tokyo', 'Ishima'];
const names = ['Agriculture', 'Chemical', 'Tobacco'];
const ns = {format: {number: String}};

function fixture(code = current, options = {}) {
  const settings = {round: 3, funds: 222.45e9, revenue: 12e9, expenses: 0, progress: 100, ...options};
  const products = Object.fromEntries(['Prod v5', 'Prod v6', 'Prod v7'].map((name, i) =>
    [name, {developmentProgress: i === 2 ? settings.progress : 100, stats: {quality: i + 1}, productionCost: 3134}]));
  const divisions = Object.fromEntries(names.map(name => [name, {name, industry: name, cities,
    makesProducts: name === 'Tobacco', maxProducts: 3, products: name === 'Tobacco' ? Object.keys(products) : [],
    researchPoints: 124041, thisCycleExpenses: 0, calculateRecoupableValue: () => 100e9, warehouses: {}}]));
  const offices = Object.fromEntries(names.flatMap(name => cities.map(city => [name + city, {
    size: name === 'Tobacco' ? 170 : 8, numEmployees: name === 'Tobacco' ? 170 : 8,
    avgEnergy: 99, maxEnergy: 100, avgMorale: 99, maxMorale: 100, employeeJobs: {},
  }])));
  const model = Object.assign(Object.create(Corporation.prototype), {
    funds: settings.funds, revenue: settings.revenue, expenses: settings.expenses, public: settings.round === 5,
    fundingRound: settings.round - 1, numberOfOfficesAndWarehouses: 36, divisions: new Map(Object.entries(divisions)),
    totalAssets: settings.funds + 300e9, previousTotalAssets: settings.funds + 300e9,
    valuationsList: [], valuation: 0, cycleValuation: 0,
  });
  model.cycleValuation = model.determineCycleValuation();
  model.valuationsList = Array(10).fill(model.cycleValuation);
  model.determineValuation();
  const calls = [], logs = [], events = [];
  let freshOfferOverride = null, failedAcceptance = false;
  const snapshot = () => ({funds: model.funds, revenue: model.revenue, expenses: model.expenses,
    public: model.public, divisions: names, valuation: model.valuation, nextState: 'START'});
  const rpc = (_ns, method, ...args) => {
    if (args[0] === '--batch') return JSON.parse(args[1]).map(a => rpc(_ns, method, ...a));
    calls.push([method, ...args]);
    const office = offices[args[0] + args[1]];
    switch (method) {
      case 'getCorporation': return snapshot();
      case 'getDivision': return {...divisions[args[0]], products: [...divisions[args[0]].products]};
      case 'getProduct': return products[args[2]];
      case 'getInvestmentOffer': return freshOfferOverride ?? model.getInvestmentOffer();
      case 'acceptInvestmentOffer': {
        if (failedAcceptance) return false;
        const offer = model.getInvestmentOffer();
        assert(offer.funds + model.funds >= (offer.round === 3 ? 12e15 : 500e18), 'Only accept a real eligible offer');
        model.gainFunds(offer.funds, 'private equity'); model.fundingRound++; return true;
      }
      case 'discontinueProduct': {
        const div = divisions[args[0]];
        assert.equal(div.products.length, 3);
        div.products = div.products.filter(name => name !== args[1]); delete products[args[1]]; return;
      }
      case 'makeProduct': {
        const total = args[3] + args[4];
        assert(model.funds >= total + 5e9); assert.equal(divisions[args[0]].products.length, 2);
        model.loseFunds(total, 'product development');
        products[args[2]] = {developmentProgress: 0, stats: {quality: 4}, productionCost: 3134};
        divisions[args[0]].products.push(args[2]); return;
      }
      case 'getOffice': return {...office, employeeJobs: {...office.employeeJobs}};
      case 'getOfficeSizeUpgradeCost': return 1e9;
      case 'upgradeOfficeSize': model.loseFunds(1e9, 'office'); office.size += args[2]; return;
      case 'hireEmployee': if (office.numEmployees >= office.size) return false; office.numEmployees++; return true;
      case 'setJobAssignment': office.employeeJobs[args[2]] = args[3]; return true;
      case 'buyTea': model.loseFunds(office.numEmployees * 500000, 'tea'); return true;
      case 'throwParty': model.loseFunds(office.numEmployees * args[2], 'parties'); return 1;
      default: assert.fail(`Unexpected RPC ${method}`);
    }
  };
  const api = Function('corpRun', 'log', 'recordRunEvents', 'divisions', 'settings', bare(code) + `
    for (const [name, info] of Object.entries(divisions)) {
      hasDivDB[name] = info;
      for (const city of cities) hasOfficeDB[name + city] = hasWarehouseDB[name + city] = true;
    }
    investOffer = {round: settings.round, funds: 0}; bnMults = {CorporationValuation: 1};
    return {manageProducts, checkInvest, corpFunds, updateMisc, manageOffice, warehouseUpgrade, teaParty,
      setOffer: offer => investOffer = offer,
      review: () => typeof investmentReview === 'undefined' ? null : investmentReview,
      booster: () => tobaccoBooster,
      reviewLength: typeof INVESTMENT_REVIEW_CYCLES === 'undefined' ? 0 : INVESTMENT_REVIEW_CYCLES};
  `)(rpc, (_ns, message) => logs.push(message), async (_ns, data) => events.push(...data), divisions, settings);
  const tick = (spending = 0, spendingSource = 'upgrades') => {
    if (spending) model.loseFunds(spending, spendingSource);
    model.gainFunds(model.revenue * 10, 'operating revenue');
    model.loseFunds(model.expenses * 10, 'operating expenses');
    model.updateTotalAssets(); model.cycleValuation = model.determineCycleValuation(); model.determineValuation();
    return model.getInvestmentOffer().funds;
  };
  return {api, model, calls, logs, events, divisions, products, offices, tick,
    act: method => api[method](ns),
    check: async offer => {api.setOffer(offer ?? model.getInvestmentOffer()); return api.checkInvest(ns);},
    quote: offer => freshOfferOverride = offer,
    failAcceptance: () => failedAcceptance = true,
    mutations: () => calls.filter(([method]) => ['discontinueProduct', 'makeProduct'].includes(method))};
}

// Reproduce high operating income, low offer and an unfunded replacement under continuous growth spending.
const old = fixture(previous);
for (let i = 0; i < 30; i++) {
  await old.act('manageProducts');
  old.tick(Math.min(old.model.revenue * 10, await old.act('corpFunds')));
}
const oldOffer = old.model.getInvestmentOffer().funds;
assert(oldOffer > 55e9 && oldOffer < 57e9);
assert.equal(old.model.revenue, 12e9); assert.equal(old.mutations().length, 0);

const fixed = fixture();
await fixed.act('manageProducts');
assert(fixed.api.review()); assert.equal(fixed.mutations().length, 0);
assert.equal(await fixed.act('corpFunds'), 0);
assert(await fixed.api.corpFunds(ns, 0) > 0, 'Employee care retains usable cash');
for (let i = 0; i < fixed.api.reviewLength; i++) {
  assert(fixed.api.review()); await fixed.act('manageProducts');
  assert.equal(fixed.mutations().length, 0, 'All three products stay available throughout review');
  fixed.tick(Math.min(fixed.model.revenue * 10, await fixed.act('corpFunds')));
  assert.equal(await fixed.check(), 3, 'Income does not authorize an offer below the target');
}
assert.equal(fixed.api.review(), null, 'End the review even when the target is not reached');
assert.equal(fixed.calls.filter(([m]) => m === 'acceptInvestmentOffer').length, 0);
const reviewedOffer = fixed.model.getInvestmentOffer().funds;
assert(reviewedOffer > 2.5e15 && reviewedOffer < 2.6e15);
assert.equal(fixed.model.revenue, old.model.revenue, 'The fixture changes spending, not sales');
await fixed.act('manageProducts');
assert.deepEqual(fixed.mutations().map(([method, , name]) => [method, name]),
  [['discontinueProduct', 'Prod v5'], ['makeProduct', 'Sector-12']]);
assert.deepEqual(fixed.divisions.Tobacco.products, ['Prod v6', 'Prod v7', 'Prod v8']);
assert.equal(fixed.products['Prod v8'].developmentProgress, 0);
assert.equal(fixed.api.review(), null, 'Do not repeatedly review the same lineup before replacement');

// A small earning corporation still exits the window; unaffordable replacement preserves every seller.
const poor = fixture(current, {funds: 5e9, revenue: 1e6});
await poor.act('manageProducts');
for (let i = 0; i < poor.api.reviewLength; i++) {poor.tick(); await poor.check();}
for (let i = 0; i < 4; i++) await poor.act('manageProducts');
assert.equal(poor.api.review(), null); assert.equal(poor.mutations().length, 0);

// Near the investment push, wait for the new all-city output to replace the old valuation samples.
const push = fixture(current, {revenue: 15e9});
await push.act('manageProducts');
let checks = 0, switchedAt = 0, result = 3;
while (result === 3 && checks < 30) {
  push.tick(); result = await push.check(); checks++;
  if (push.api.booster() && !switchedAt) {
    switchedAt = checks; push.model.revenue *= 6;
  }
}
assert(switchedAt > 0 && result === 4);
assert(checks - switchedAt >= corpConstants.valuationLength, 'Wait for full-production valuation samples');
assert.equal(push.calls.filter(([m]) => m === 'acceptInvestmentOffer').length, 1);
assert.equal(push.events.length, 1); assert.equal(push.api.review(), null);
assert.equal(push.api.booster(), false, 'Round four returns to research');
await push.act('manageProducts'); assert.equal(push.api.review(), null, 'Do not re-review the same lineup after funding');

// A real target reached during development also gets a bounded review, even if offers keep increasing.
const target = fixture(current, {progress: 80, revenue: 100e9});
for (let i = 0; i < 10; i++) target.tick();
assert.equal(await target.check(), 3); assert(target.api.review());
let lastOffer = target.model.getInvestmentOffer().funds;
for (let i = 0; i < target.api.reviewLength; i++) {
  target.tick(); const offer = target.model.getInvestmentOffer().funds;
  assert(offer > lastOffer); lastOffer = offer;
  const r = await target.check(); assert.equal(r, i === target.api.reviewLength - 1 ? 4 : 3);
}
assert.equal(target.mutations().length, 0, 'Do not cancel an in-progress product');

// Reject a stale high snapshot if the actual quote dropped before acceptance.
const stale = fixture(current, {revenue: 100e9});
await stale.check({round: 3, funds: 13e15});
stale.quote({round: 3, funds: 56e9});
for (let i = 0; i < stale.api.reviewLength; i++) assert.equal(await stale.check({round: 3, funds: 13e15}), 3);
assert.equal(stale.api.review(), null);
assert(!stale.calls.some(([m]) => m === 'acceptInvestmentOffer'));

// Failed acceptance does not report success; an externally changed round/public state clears a hold.
const failed = fixture(current, {revenue: 100e9});
for (let i = 0; i < 10; i++) failed.tick();
failed.failAcceptance(); await failed.check();
for (let i = 0; i < failed.api.reviewLength; i++) {failed.tick(); assert.equal(await failed.check(), 3);}
assert.equal(failed.events.length, 0);
for (const publicState of [false, true]) {
  const h = fixture(); await h.act('manageProducts');
  h.model.fundingRound = 3; h.model.public = publicState;
  assert.equal(await h.check(), publicState ? 5 : 4); assert.equal(h.api.review(), null);
}

// Growth purchases pause, but care and job assignments continue, including round four's fixed office sizes.
for (const round of [3, 4]) {
  const h = fixture(current, {round, funds: 2e12}); await h.act('manageProducts');
  const initialFunds = h.model.funds;
  await h.act('updateMisc'); await h.act('warehouseUpgrade'); await h.act('manageOffice');
  assert.equal(h.model.funds, initialFunds);
  assert(!h.calls.some(([m]) => ['upgradeOfficeSize', 'levelUpgrade', 'hireAdVert', 'upgradeWarehouse'].includes(m)));
  assert(h.calls.some(([m]) => m === 'setJobAssignment'));
  await h.act('teaParty'); assert(h.model.funds < initialFunds);
  assert(h.calls.some(([m]) => m === 'buyTea') && h.calls.some(([m]) => m === 'throwParty'));
}
for (const options of [{round: 2, funds: 2e12}, {round: 5, funds: 2e12}, {progress: 80},
  {funds: -1}, {revenue: 0}, {expenses: 13e9}]) {
  const h = fixture(current, options); await h.act('manageProducts');
  assert.equal(h.api.review(), null, 'Keep bootstrap/public/developing/unprofitable behavior outside this policy');
}

console.log(JSON.stringify({operatingIncomePerSecond: 12e9, repeatedSpendingOffer: oldOffer,
  afterReviewOffer: reviewedOffer, reviewCycles: fixed.api.reviewLength,
  productionPushReviewChecks: checks, scope: 'Fixed-income official accounting fixture; not the live save'}));
console.log('Valuation recovery, bounded reviews, funded weakest-product replacement, fresh offers, care and round transitions passed.');
