// Run from the repository with Node 24. Uses the actual manager/helper and official office,
// equity and dividend routines. Controlled quotes are not a replay of the user's save.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bare, build, section, source} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';
import {main as homeHelper} from '../../../bin/corpRun.js';
import {getCorporationBribeReserve} from '../../../speedrun-policy.js';

const repo = new URL('../../../', import.meta.url);
const current = readFileSync(new URL('corporation.js', repo), 'utf8');
const previous = execFileSync('git', ['show', '8411a29:corporation.js'], {cwd: repo, encoding: 'utf8'});
const constants = {officeInitialCost: 4e9, warehouseInitialCost: 5e9, officeInitialSize: 3,
  secondsPerMarketCycle: 10, bribeThreshold: 100e12, bribeAmountPerReputation: 1e9,
  initialShares: 1e9, fundingRoundShares: [.1,.35,.25,.2], fundingRoundMultiplier: [3,2,2,1.5]};
const seatCost = build(section(source('Corporation/helpers.ts'), 'export function calculateOfficeSizeUpgradeCost(',
  'export function calculateMaxAffordableUpgrade('), {corpConstants: constants}, 'calculateOfficeSizeUpgradeCost');
const LongTermFundsSources = build(source('Corporation/data/FundsSource.ts'), {}, 'LongTermFundsSources');
const Corporation = build(source('Corporation/Corporation.ts'), {corpConstants: constants, LongTermFundsSources,
  getKeyList: () => [], constructorsForReviver: {}}, 'Corporation');
const accept = build(section(source('Corporation/Actions.ts'), 'export function acceptInvestmentOffer(',
  'export function convertPriceString('), {corpConstants: constants}, 'acceptInvestmentOffer');
const cities = ['Sector-12', 'Aevum', 'Volhaven', 'Chongqing', 'New Tokyo', 'Ishima'];
const now = Date.now(), reset = {currentNode: 3, lastAugReset: now - 1e6, lastNodeReset: now - 2e6};
const log = [], ns = {format: {number: x => String(Math.round(x))}};
function fixture(options = {}, baseline = false) {
  const settings = {round: 2, funds: 7.355e9, revenue: 40e6, expenses: 9.2e6, quote: 7.56e12,
    size: 10, names: ['Agriculture','Tobacco','Chemical'], ...options};
  const {round, names} = settings, investorShares = constants.fundingRoundShares.slice(0, round-1)
    .reduce((a,b) => a + b * constants.initialShares, 0);
  const model = Object.assign(Object.create(Corporation.prototype), {fundingRound: round-1, funds: settings.funds,
    public: false, revenue: settings.revenue, expenses: settings.expenses, totalShares: 1e9, investorShares,
    numShares: 1e9-investorShares, tributeModifier: .15, totalAssets: settings.funds, nextState: 'START'});
  const divisions = Object.fromEntries(names.map(name => [name, {name, industry:name, cities: settings.cities?.[name] ?? cities,
    thisCycleExpenses: name === 'Agriculture' ? (settings.unpaid ?? 0) : 0,
    products: name === 'Tobacco' ? ['Prod v1'] : []}]));
  const snapshot = {generated_at: now, current_node: 3, last_aug_reset: reset.lastAugReset, stock_value_known: true,
    reset_planning: {version: 1, wealth: 1e9, goals: [], reputation: {CyberSec: 0}}};
  const route = {kind: 'inactive', updatedAt: now, lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset};
  let race, lowRam = false, accepts = 0;
  const calls = [], events = [], getInfo = () => ({...model, divisions: names});
  async function rpc(_, fn, ...args) {
    if (args[0] === '--batch') return Promise.all(JSON.parse(args[1]).map(row => rpc(_,fn,...row)));
    calls.push([fn,...args]);
    if (fn === 'getInvestmentOffer' && args[0] === '--bn3-review' || fn === 'acceptInvestmentOffer' && args[0] === '--if-current') {
      if (args[0] === '--if-current' && race) {const fn = race; race = null; fn(model);}
      let result, onExit;
      await homeHelper({pid: 123, args: [fn,...args], getPortHandle: () => ({write: x => {result = structuredClone(x);}}),
        atExit: f => {onExit = f;}, ramOverride: n => lowRam ? Math.min(n,23.6) : n,
        getFunctionRamCost: f => f === 'baseCost' ? 1.6 : f.endsWith('acceptInvestmentOffer') ? 20 : 10,
        read: path => JSON.stringify(path.includes('affordable') ? snapshot : route),
        corporation: {getCorporation: getInfo, getInvestmentOffer: () => model.getInvestmentOffer(),
          acceptInvestmentOffer: () => {accept(model); accepts++; return true;}}});
      onExit(); return result;
    }
    switch (fn) {
      case 'getCorporation': return getInfo();
      case 'getInvestmentOffer': return model.getInvestmentOffer();
      case 'getDivision': return divisions[args[0]];
      case 'getProduct': return {developmentProgress: 100};
      case 'getConstants': return constants;
      case 'getIndustryData': return {startingCost: {Agriculture:40e9,Tobacco:20e9,Chemical:70e9,Restaurant:10e9}[args[0]]};
      case 'hasWarehouse': return args.join(':') !== settings.missingWarehouse;
      case 'hasUnlock': return !(settings.locked ?? []).includes(args[0]);
      case 'getUnlockCost': return args[0] === 'Export' ? 20e9 : 5e9;
      case 'getOffice': return {size: settings.sizes?.[args[1]] ?? settings.size};
      case 'getUpgradeLevelCost': return args[0] === 'Wilson Analytics' ? 1e9 : 1e20;
      case 'getUpgradeLevel': return 500;
      case 'acceptInvestmentOffer': accept(model); accepts++; return true;
      default: assert.fail('Unexpected RPC: ' + fn);
    }
  }
  const api = Function('corpRun','log','recordRunEvents','getCorporationBribeReserve','reset','divisions',
    bare(baseline ? previous : current) + `
      bnMults = {CorporationValuation: 1}; Object.assign(hasDivDB, divisions);
      for (const [name,d] of Object.entries(divisions)) for (const c of d.cities)
        hasOfficeDB[name+c]=hasWarehouseDB[name+c]=true;
      ${baseline ? '' : 'bn3Reset = reset;'}
      return {tick: async (ns, offer) => {investOffer=offer;return checkInvest(ns);},
        upgrades: (ns, r) => {investOffer={round:r};return updateMisc(ns);},
        review: () => investmentReview, budget: ns => corpFunds(ns),
        ${baseline ? '' : 'stage: (ns,r,c) => quoteBn3Stage(ns,r,c,corporationConstants), benefit: bn3FundingBenefit, state: () => fundingStatus,'}
      init: ns => getCorporationConstants(ns)};
    `)(rpc, (_, s) => log.push(s), async (_, es) => events.push(...es), getCorporationBribeReserve, reset, divisions);
  function quote(value) {model.valuation = value / (constants.fundingRoundShares[model.fundingRound] * constants.fundingRoundMultiplier[model.fundingRound]);}
  quote(settings.quote);
  async function tick(value) {if (value !== undefined) quote(value); return api.tick(ns, model.getInvestmentOffer());}
  async function run(n, offers) {let r; for (let i=0; i<n; i++) r=await tick(offers?.(i)); return r;}
  return {api, model, snapshot, route, calls, events, run, tick, quote, getInfo, accepts: () => accepts,
    race: f => {race=f;}, restrictRam: () => {lowRam=true;},
    stage: async () => {await api.init(ns); return api.stage(ns,round,getInfo());}};
}

// Screenshot: old full review refuses unchanged $7.56t offers; new code accepts once.
const old=fixture({},true); assert.equal(await old.run(50),2); assert.equal(old.accepts(),0);
const live=fixture(); const s=await live.stage();
assert(Math.abs(s.full - (9e9 + 6*seatCost(10,96))) < 1);
assert(Math.abs(s.minimum - (9e9 + seatCost(10,3))) < 1);
assert.equal(await live.tick(),2); assert.equal(await live.api.budget(ns),0);
assert.equal(await live.run(11),2); assert.equal(await live.tick(),3);
assert.equal(live.accepts(),1); assert.equal(live.events.length,1);
assert(Math.abs(live.model.funds - (7.56e12 + 7.355e9)) < 1);
assert.equal(live.model.investorShares,450e6);
await live.run(4); assert.equal(live.accepts(),1,'No immediate second sale');

// The IPO is still reached normally. An incomplete division is a priced expense, not a veto.
for (const [round, options] of [[1,{names:['Agriculture'],locked:['Export','Market Research - Demand','Market Data - Competition']}],
    [2,{names:['Agriculture','Tobacco'],cities:{Tobacco:['Sector-12']},missingWarehouse:'Agriculture:Ishima'}],
    [3,{size:106}],[4,{size:250}]]) {
  const f=fixture({round, ...options, quote:round===1?300e9:7.56e12});
  const p=await f.stage();
  if(round===1) assert(Math.abs(p.minimum - (70e9+20e9+10*9e9+30e9+2e9+15e9+seatCost(3,7)))<1);
  if(round===2) assert(Math.abs(p.full - (9e9+70e9+10*9e9+5e9+seatCost(10,96)+5*seatCost(3,103)))<1);
  assert.equal(await f.run(13),round+1);
}
const debt=fixture({funds:-4e9,unpaid:5e9,quote:20e9});
assert.equal(await debt.run(13),2); assert.equal(debt.api.review(),null); assert.equal(debt.accepts(),0);
assert.equal(await debt.tick(),2); assert.equal(debt.api.review(),null);
const tiny=fixture({funds:25e12,quote:1e6}); assert.equal(await tiny.run(13),2);
const selfFundSoon=fixture({funds:s.minimum-1e6,quote:1e6}); assert.equal(await selfFundSoon.run(13),2);
const weak=fixture({revenue:0,expenses:5e6,quote:1e6}); assert.equal(await weak.run(13),2);
const rescue=fixture({funds:-5e9,unpaid:2e9,quote:300e9,revenue:0,expenses:5e6,names:['Agriculture']});
assert.equal(await rescue.run(13),3,'A real offer can finance missing setup even if sales have stopped');
const different=fixture({sizes:{'Sector-12':114,'Aevum':43,'Volhaven':3}});
assert(Math.abs((await different.stage()).full - (9e9+seatCost(43,63)+seatCost(3,103)+3*seatCost(10,96))) < 1);
const missing=fixture({round:4,funds:100e9,names:['Agriculture']});
await missing.api.upgrades(ns,4); assert(!missing.calls.some(([fn,div])=>fn==='getDivision' && div==='Tobacco'));
// Sustained growth can pay for all six offices in one more tick; a flat offer at the
// same starting level does not wait. A stalled rise doesn't freeze growth.
const rising=fixture(); await rising.tick();
assert.equal(await rising.run(12,i => s.full - 7.355e9 - (12-i)*20e9),2);
assert(rising.api.state().includes('investor growth')); assert.equal(await rising.tick(s.full),3);
const flat=fixture({quote:s.full-7.355e9-20e9}); assert.equal(await flat.run(13),3);
const fading=fixture(); await fading.tick(); const near = i => s.full-7.355e9-(12-i)*20e9;
assert.equal(await fading.run(12,near),2); assert.equal(await fading.run(3,() => near(11)),3);

// Last-moment risk on the offloaded manager's home helper: no mutation, no success event.
for (const intervention of [f => f.race(m=>{m.valuation /= 10;}), f => f.race(m=>{m.funds-=1;}),
    f=>f.race(m=>{accept(m);}),f=>f.race(m=>{m.public=true;}),f=>f.race(m=>{m.nextState='SALE';}), f=>f.restrictRam()]) {
  const f=fixture(); await f.run(12); intervention(f); assert.equal(await f.tick(),2);
  assert.equal(f.accepts(),0); assert.equal(f.events.length,0); assert.equal(f.api.review(),null);
}
const manual=fixture(); await manual.tick(); manual.model.public=true; assert.equal(await manual.tick(),5); assert.equal(manual.accepts(),0);

// A real faction milestone can beat the growth rule; do not count unaffordable/stale bribes.
const bribe=fixture({quote:80e12,funds:15e12});
Object.assign(bribe.route,{kind:'faction-rep',faction:'CyberSec',targetRep:5000});
const bribePolicy=(f,p) => f.api.benefit(2,f.getInfo(),f.model.getInvestmentOffer(),f.model.funds,p,constants,f.snapshot,f.route);
assert.match(bribePolicy(bribe,await bribe.stage()),/CyberSec/);
await bribe.run(13); assert.match(log.at(-1),/active CyberSec/);
const stale=fixture({quote:80e12,funds:15e12}); Object.assign(stale.route, bribe.route);
const st=await stale.stage(); stale.route.updatedAt=now-90001; assert.equal(bribePolicy(stale,st),'');
stale.route.updatedAt=now; stale.route.lastAugReset--; assert.equal(bribePolicy(stale,st),'');
stale.route.lastAugReset++; stale.route.targetRep=1e9; assert.equal(bribePolicy(stale,st),'');
stale.route.targetRep=100; stale.model.valuation=99e12; assert.equal(bribePolicy(stale,st),'');

// The final investment is company money. Compute player dividends with the game's
// retained shares, tribute and per-cycle rounding convention, then test both sides of the gap.
const final=fixture({round:4,funds:100e12,revenue:12e9,expenses:1e9,quote:1e6});
const d=await final.stage(), offer=final.model.getInvestmentOffer();
const post=Object.assign(Object.create(Corporation.prototype),final.model,{dividendRate:.01,numShares:final.model.numShares-offer.shares});
const gap=post.getCycleDividends()*12;
const goal={label:'augmentation',money:final.snapshot.reset_planning.wealth+gap+1,rep:0,faction:'CyberSec'};
final.snapshot.reset_planning.goals=[goal];
const dividendBenefit=()=>final.api.benefit(4,final.getInfo(),offer,final.model.funds,d,constants,final.snapshot,final.route);
assert.equal(dividendBenefit(),''); goal.money-=2; assert.match(dividendBenefit(),/dividends/);
final.snapshot.stock_value_known=false;assert.equal(dividendBenefit(),'');final.snapshot.stock_value_known=true;
final.snapshot.last_aug_reset--;assert.equal(dividendBenefit(),'');final.snapshot.last_aug_reset++;
assert.equal(await final.run(13),5);assert.match(log.at(-1),/cash gap/);
console.log(JSON.stringify({legacyRoundAfter50Checks:2, adaptiveRoundAfter13Checks:3,
  offer:7.56e12, assumedOfficeSeats:10, nextStep:s.minimum, fullBuild:s.full,
  netCapitalAfterFunding:live.model.funds, checked:'four private rounds, timing, cash, bribes, dividends, guarded acceptance'}));
