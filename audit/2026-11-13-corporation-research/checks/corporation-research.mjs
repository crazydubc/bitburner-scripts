// Actual manager assignments and pinned engine research/productivity/product code. No live save.
// node audit/2026-11-13-corporation-research/checks/corporation-research.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Division, MaterialInfo, industry, bare, build, source, CorpEmployeeJob} from
  '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';

const root = new URL('../../../', import.meta.url);
const at = ref => execFileSync('git', ['show', `${ref}:corporation.js`], {cwd: root, encoding: 'utf8'});
const beforeRegression = at('c7efc82^');
const broken = at('8e37475');
const fixed = readFileSync(new URL('corporation.js', root), 'utf8');
const cities = ['Sector-12', 'Aevum', 'Volhaven', 'Chongqing', 'New Tokyo', 'Ishima'];
const CityName = Object.fromEntries(cities.map((city, i) => [i === 0 ? 'Sector12' : city, city]));
const createEnumKeyedRecord = (keys, value) => Object.fromEntries(Object.values(keys).map(key => [key, value(key)]));
const common = {CityName, CorpEmployeeJob, createEnumKeyedRecord, getRecordKeys: Object.keys,
  getRecordEntries: Object.entries, constructorsForReviver: {}, getRandomIntInclusive: () => 75,
  throwIfReachable: assert.fail};
const OfficeSpace = build(source('Corporation/OfficeSpace.ts'), common, 'OfficeSpace');
const Product = build(source('Corporation/Product.ts'), {...common, MaterialInfo,
  IndustriesData: {Tobacco: industry}}, 'Product');
const one = () => 1;
const corp = {getEmployeeCreMultiplier: one, getEmployeeChaMult: one, getEmployeeIntMult: one,
  getEmployeeEffMult: one, getScientificResearchMult: one, state: {nextName: 'PURCHASE'}};
const divisionMultipliers = {getEmployeeCreMultiplier: one, getEmployeeChaMultiplier: one,
  getEmployeeIntMultiplier: one, getEmployeeEffMultiplier: one, getScientificResearchMultiplier: one};

function fixture(code, options = {}) {
  const opts = {round: 3, funds: 107.477e9, offer: 384e12, size: 146, employees: 146,
    completeWarehouses: true, progress: 100, ...options};
  const offices = Object.fromEntries(cities.map(city => {
    const office = new OfficeSpace({city, size: opts.size});
    Object.assign(office, {numEmployees: opts.employees, avgMorale: 100, avgEnergy: 99.397,
      totalExperience: opts.employees * 75.129});
    office.employeeNextJobs.Unassigned = opts.employees;
    return [city, office];
  }));
  const products = ['Prod v5', 'Prod v6', 'Prod v7'];
  const info = {name: 'Tobacco', industry: 'Tobacco', makesProducts: true, products, thisCycleExpenses: 0};
  const calls = [];
  const rpc = (_ns, method, ...args) => {
    if (args[0] === '--batch') return JSON.parse(args[1]).map(a => rpc(_ns, method, ...a));
    calls.push([method, ...args]);
    const office = offices[args[1]];
    switch (method) {
      case 'getDivision': return {...info};
      case 'getProduct': return {developmentProgress: opts.progress};
      case 'getCorporation': return {funds: opts.funds, revenue: 3.12e9, public: false,
        nextState: 'EXPORT', divisions: ['Tobacco']};
      case 'getOffice': return {...office, employeeJobs: {...office.employeeNextJobs}};
      case 'setJobAssignment': {
        const [,, job, count] = args;
        assert(Number.isInteger(count) && count >= 0);
        assert(office.employeeNextJobs.Unassigned >= count - office.employeeNextJobs[job]);
        return office.autoAssignJob(job, count);
      }
      case 'getOfficeSizeUpgradeCost': return 1e6;
      case 'upgradeOfficeSize': office.size += args[2]; opts.funds -= 1e6; return;
      case 'hireEmployee': return office.hireRandomEmployee(CorpEmployeeJob.Unassigned);
      case 'acceptInvestmentOffer': opts.round++; return true;
      case 'getInvestmentOffer': return {round: opts.round, funds: opts.offer};
      default: assert.fail(`Unexpected manager call: ${method}`);
    }
  };
  const api = Function('corpRun', 'log', 'recordRunEvents', 'opts', 'info', bare(code) + `
    hasDivDB.Tobacco = info;
    for (const city of cities) {
      hasOfficeDB['Tobacco' + city] = true;
      hasWarehouseDB['Tobacco' + city] = opts.completeWarehouses || city === 'Sector-12';
    }
    investOffer = {round: opts.round, funds: opts.offer};
    bnMults = {CorporationValuation: 1};
    return {manageOffice, checkInvest,
      updateOffer: () => investOffer = {round: opts.round, funds: opts.offer},
      booster: () => tobaccoBooster};
  `)(rpc, () => {}, async () => {}, opts, info);
  const ns = {format: {number: n => String(n)}};
  return {opts, offices, calls, products, api,
    assign: () => api.manageOffice(ns),
    check: () => {api.updateOffer(); return api.checkInvest(ns);},
    plan: () => Object.fromEntries(cities.map(city => [city, {...offices[city].employeeNextJobs}])),
    apply: () => {
      for (const office of Object.values(offices)) {
        Object.assign(office.employeeJobs, office.employeeNextJobs);
        office.calculateEmployeeProductivity(corp, divisionMultipliers);
      }
    }};
}

function assertResearchOffices(h) {
  for (const city of cities.slice(1)) {
    const jobs = h.plan()[city];
    assert.equal(jobs[CorpEmployeeJob.RandD], h.offices[city].numEmployees, city);
    for (const job of ['Operations', 'Engineer', 'Business', 'Management', 'Unassigned']) assert.equal(jobs[job], 0);
  }
  const home = h.plan()['Sector-12'];
  assert(home.Operations > 0 && home.Engineer > 0 && home.Business === 1 && home.Management > 0);
  assert.equal(home[CorpEmployeeJob.RandD], 0);
}

const original = fixture(beforeRegression), old = fixture(broken), repaired = fixture(fixed);
for (const h of [original, old, repaired]) {await h.assign(); h.apply();}
for (const jobs of Object.values(old.plan())) assert.equal(jobs[CorpEmployeeJob.RandD], 0,
  'Reproduce the live report: every city stops researching after any completed product');
assertResearchOffices(original); assertResearchOffices(repaired);
assert.deepEqual(repaired.plan(), original.plan(), 'Restore pre-regression round-three assignments');
assert.deepEqual(repaired.plan()['Sector-12'], old.plan()['Sector-12'], 'Keep the design/production office intact');
assert(!repaired.calls.some(([method]) => method === 'getProduct'), 'Round-three staffing needs no per-city product helpers');
assert.deepEqual(repaired.products, old.products);

// The early exit with incomplete infrastructure and the post-upgrade assignment must both retain R&D.
for (const options of [{completeWarehouses: false}, {size: 3, employees: 3},
  {employees: 100}, {progress: 30}, {funds: -1}, {round: 4, size: 250, employees: 250}]) {
  const h = fixture(fixed, options); await h.assign(); assertResearchOffices(h);
  assert(Object.values(h.plan()).every(jobs => jobs.Unassigned === 0));
}

// Round two still manufactures in remote cities after v1 completes; this fix starts in round three.
for (const progress of [0, 100]) {
  const a = fixture(broken, {round: 2, size: 10, employees: 10, progress});
  const b = fixture(fixed, {round: 2, size: 10, employees: 10, progress});
  await a.assign(); await b.assign(); assert.deepEqual(a.plan(), b.plan());
  assert.equal(b.plan().Aevum[CorpEmployeeJob.RandD] > 0, progress === 0);
}

// Actual engine research accumulation: four material phases per ten-second cycle. Fixed employee
// stats, no Project Insight or research upgrades; not a model of the user's elapsed run or income.
function researchAfterHour(h) {
  h.apply();
  const div = Object.assign(Object.create(Division.prototype), divisionMultipliers, {
    offices: h.offices, warehouses: {}, products: new Map(), researchPoints: 1340});
  for (let cycle = 0; cycle < 360; cycle++) for (const state of ['PURCHASE', 'PRODUCTION', 'EXPORT', 'SALE']) {
    corp.state.nextName = state;
    div.processMaterials(1, corp);
  }
  return div.researchPoints;
}
const stuckPoints = researchAfterHour(old), growingPoints = researchAfterHour(repaired);
assert.equal(stuckPoints, 1340); assert(growingPoints > stuckPoints);
function design(h, points) {
  const product = new Product({name: 'Next', createCity: 'Sector-12', designInvestment: 128e9,
    advertisingInvestment: 128e9});
  product.createProduct(100000, h.offices['Sector-12'].employeeProductionByJob);
  assert.equal(product.developmentProgress, 100);
  product.finishProduct({industry: 'Tobacco', researchPoints: points, researchFactor: industry.scienceFactor,
    awareness: 2723, popularity: 1244, requiredMaterials: {Plants: 1}});
  return product;
}
const oldDesign = design(old, stuckPoints), newDesign = design(repaired, growingPoints);
assert(newDesign.rating > oldDesign.rating);
assert.equal(design(repaired, stuckPoints).rating, oldDesign.rating, 'Design staffing and funding are unchanged');

// Retain the investment push and subsequent return to research; do not lower targets to hide the bug.
assert.equal(await repaired.check(), 3); assert.equal(repaired.api.booster(), false);
repaired.opts.offer = 3e15; assert.equal(await repaired.check(), 3);
assert.equal(repaired.api.booster(), true); await repaired.assign();
assert(Object.values(repaired.plan()).every(j => j[CorpEmployeeJob.RandD] === 0 && j.Operations > 0 && j.Business === 1));
repaired.opts.offer = 12e15;
assert.equal(await repaired.check(), 3);
let nextRound = 3, reviewChecks = 0;
while (nextRound === 3 && reviewChecks++ < 20) nextRound = await repaired.check();
assert.equal(nextRound, 4); assert.equal(repaired.api.booster(), false);
await repaired.assign(); assertResearchOffices(repaired);
assert.equal(repaired.calls.filter(([m]) => m === 'acceptInvestmentOffer').length, 1);

console.log(JSON.stringify({check: 'round-three research regression', oldResearchAfterHour: stuckPoints,
  repairedResearchAfterHour: growingPoints, nextDesignRatingRatio: newDesign.rating / oldDesign.rating,
  note: 'Fixed-stat engine fixture, not live-save timing or profit predictions'}));
console.log('Round-three R&D restored; home design, round-two sales, upgrades, missing warehouses, debt and investment transitions passed.');
