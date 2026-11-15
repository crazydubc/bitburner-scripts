// Real v1/v2 design, city production, sales and office prices in Steam 3.0.1.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fixtures} from '../../2026-11-15-corporation-production/checks/cash-production.mjs';
import {build,section,source,CorpEmployeeJob,MaterialInfo,industry} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';
const repo=new URL('../../../',import.meta.url);
const before=execFileSync('git',['show','b603f09:corporation.js'],{cwd:repo,encoding:'utf8'});
const after=readFileSync(new URL('corporation.js',repo),'utf8');
const city='Sector-12', cities=[city,'Aevum','Volhaven','Chongqing','New Tokyo','Ishima'];
const Product=build(source('Corporation/Product.ts'),{CorpEmployeeJob,MaterialInfo,IndustriesData:{Tobacco:industry},
  CityName:Object.fromEntries(cities.map((c,i)=>[i?c:'Sector12',c])),getRecordKeys:Object.keys,getRecordEntries:Object.entries,
  constructorsForReviver:{},getRandomIntInclusive:()=>35,createEnumKeyedRecord:(keys,fn)=>Object.fromEntries(Object.values(keys).map(k=>[k,fn(k)]))},'Product');
const seatCost=build(section(source('Corporation/helpers.ts'),'export function calculateOfficeSizeUpgradeCost(',
  'export function calculateMaxAffordableUpgrade('),{corpConstants:{officeInitialCost:4e9}},'calculateOfficeSizeUpgradeCost');
const make=(name,invest=2e9,c=city)=>new Product({name,createCity:c,designInvestment:invest,advertisingInvestment:invest});
async function setup(code, opts={}) {
  const ta=opts.ta??true, f=fixtures(code,{funds:opts.funds??80e9,ta});const l=f.lines.Tobacco;
  for(const o of Object.values(l.offices)){
    o.size=o.numEmployees=opts.seats??10;o.totalExperience=75*o.size;o.totalSalary=o.size*1000;
    o.employeeJobs.Unassigned=o.employeeNextJobs.Unassigned=o.size;
  }
  f.costs.seats=seatCost;l.d.researchFactor=industry.scienceFactor;
  const seed=l.products.get('Prod v5');l.products.clear();seed.name='Prod v1';l.products.set(seed.name,seed);
  await f.prepare();await f.api.manageOffice(f.ns);f.apply();
  l.d.popularity=l.d.awareness;
  const v1=make('Prod v1',1e9);v1.createProduct(1e6,l.offices[city].employeeProductionByJob);v1.finishProduct(l.d);v1.marketTa2=true;
  l.products.set('Prod v1',v1);
  await f.cycle(); // Publish staffed office productivity before the manual price controller samples it.
  // Calibrate market conditions only; both managers face exactly the same market.
  // Keep the same demand/competition, advertising and input quality for the two designs.
  async function marketCycle(calibrating=false) {
    for(const w of Object.values(l.warehouses))w.materials.Plants.stored=10000;
    f.corp.state.nextName='PRODUCTION';l.d.processProducts(1,f.corp);
    for(const p of l.products.values())p.marketTa2=ta||calibrating;
    if(calibrating || ta) {
      for(const p of l.products.values())if(p.finished)for(const c of cities){
        p.cityData[c].desiredSellAmount='MAX';p.cityData[c].desiredSellPrice='0';
      }
    } else {f.corp.nextState='SALE';await f.api.sellCashOutput(f.ns);}
    f.corp.state.nextName='SALE';const rev=l.d.processProducts(1,f.corp)[0]/10;
    const materials=Object.values(l.warehouses).reduce((s,w)=>s+(10000-w.materials.Plants.stored)*w.materials.Plants.marketPrice,0)/10;
    const payroll=Object.values(l.offices).reduce((s,o)=>s+o.numEmployees*1000*.5,0);
    return {revenue:rev,expenses:materials+payroll};
  }
  l.d.awareness=l.d.popularity=1;
  let lo=0,hi=35;
  for(let i=0;i<52;i++) {
    const mid=(lo+hi)/2;l.d.awareness=l.d.popularity=10**mid;
    const {revenue,expenses}=await marketCycle(true);if(revenue-expenses<800e6)lo=mid;else hi=mid;
  }
  const book=({revenue,expenses})=>{Object.assign(f.corp,{revenue,expenses});
    Object.assign(l.d,{lastCycleRevenue:revenue,lastCycleExpenses:expenses});};
  for(let i=0;i<(ta?1:30);i++)book(await marketCycle());
  assert(Math.abs(f.corp.revenue-f.corp.expenses-800e6)<16e6,
    `Initial net with ${ta?'TA.II':'script pricing'}: ${f.corp.revenue-f.corp.expenses}`);
  const baseTake=1-f.corp.dividendRate;
  async function next(){
    f.corp.funds+=(f.corp.revenue-f.corp.expenses)*10*baseTake;
    f.apply();book(await marketCycle());await f.cycle();f.corp.nextState='EXPORT';
  }
  async function startIfMissing() {
    if(l.products.size!==1)return;
    await f.api.manageProducts(f.ns);
    if(l.products.has('Prod v2')){
      const request=f.calls.findLast(a=>a[0]==='makeProduct');assert.equal(request[2],city);
      const product=make('Prod v2',request[4]);l.products.set('Prod v2',product);
    }
  }
  return {f,l,v1,next,startIfMissing,book,marketCycle};
}

function target(f, dollars) {
  const now=Date.now(),r=f.reset;
  Object.assign(f.route,{kind:'faction-rep',faction:'Daedalus',targetRep:dollars/1e9,updatedAt:now,lastAugReset:r.lastAugReset,lastNodeReset:r.lastNodeReset});
  Object.assign(f.snapshot,{current_node:r.currentNode,last_aug_reset:r.lastAugReset,generated_at:now,reset_planning:{version:1,reputation:{Daedalus:0}}});
}
async function run(code,ta) {
  const h=await setup(code,{ta});const {f,l}=h;
  let started,finished,eligible,beforeV2Net,atFinish,spent=0,minCash=Infinity;
  const goal=8e12, runway=()=>Math.max(5e9,f.corp.expenses*600);
  target(f,goal);
  for(let tick=1;tick<=1800;tick++){
    await h.next();
    await h.startIfMissing();
    if(!started&&l.products.has('Prod v2'))started=tick;
    const v2=l.products.get('Prod v2');
    if(v2?.finished&&!finished){finished=tick;atFinish=f.corp.funds;}
    if(!finished)beforeV2Net=f.corp.revenue-f.corp.expenses;
    if(!eligible && f.corp.funds-runway()>=goal)eligible=tick;
    if(eligible&&finished)break;
    // Both use their actual reinvestment rules, with only seat upgrades competitive;
    // financing, initial workforce, dividends, products, prices and budgets are matched.
    await f.api.manageOffice(f.ns);
    const balance=f.corp.funds;
    if(!finished)await f.api.growCashDivision(f.ns);
    spent+=balance-f.corp.funds;minCash=Math.min(minCash,f.corp.funds);
    f.calls.length=0;
  }
  assert(started && finished && eligible);assert(minCash>=5e9);assert.equal(l.products.size,2);assert(l.products.has('Prod v1'));
  return {started,finished,bribeAffordable:eligible,hq:l.offices[city].size,allSeats:Object.values(l.offices).reduce((n,o)=>n+o.size,0),
    spentB:Math.round(spent/1e9*10)/10,atFinishB:Math.round(atFinish/1e9),beforeV2NetM:Math.round(beforeV2Net/1e6),
    netWithV2M:Math.round((f.corp.revenue-f.corp.expenses)/1e6),v2Rating:Math.round(l.products.get('Prod v2').rating)};
}
for(const ta of [false,true]){
  const old=await run(before,ta), fixed=await run(after,ta);
  console.log(JSON.stringify({pricing:ta?'Market-TA.II':'script',old,fixed}));
  assert(fixed.finished<old.finished,'Bring a second fully priced seller to market earlier');
  assert(fixed.bribeAffordable<old.bribeAffordable,'Earlier sales must cover expansion costs and reach the actual cash target sooner');
  assert(fixed.beforeV2NetM>=784,'Leave existing v1 earning');
}

// Reproduce money present but reserved: freeze cash so no credit magically appears between polls.
// Same v2 quality budget, no dipping below the reserve, no waiting on a fixed Treasury percentage.
async function held(code,{balance=15e9,rep=0,limit=Infinity}={}){
  const h=await setup(code,{funds:balance});const {f,l}=h;
  if(rep)target(f,rep);f.limitRam(limit);
  for(let i=0;i<3;i++){await f.cycle();f.corp.nextState='EXPORT';await h.startIfMissing();}
  return {f,l,h};
}
assert(!(await held(before)).l.products.has('Prod v2'));
const loose=await held(after);assert(loose.l.products.has('Prod v2'));
assert.equal(loose.f.corp.funds,11e9);assert.equal(loose.l.products.get('Prod v2').designInvestment,2e9);
assert(!(await held(after,{balance:8.9e9})).l.products.has('Prod v2'),'Do not use $5b of operating cash');
assert(!(await held(after,{rep:20e9})).l.products.has('Prod v2'),'An earlier reachable bribe gets first claim');
assert(!(await held(after,{rep:7e9})).l.products.has('Prod v2'),'Do not interrupt an already funded bribe');
assert((await held(after,{rep:5e9})).l.products.has('Prod v2'),'A fully funded bribe permits spending the surplus');
assert(!(await held(after,{limit:23.6})).l.products.has('Prod v2'),'Defer if a safe launch will not fit');
const thin=await setup(after,{funds:15e9});thin.book({revenue:2e6,expenses:0});
for(let i=0;i<3;i++){await thin.f.cycle();await thin.startIfMissing();}
assert(!thin.l.products.has('Prod v2'),'Too little proven profit to release retained cash for the design');
const debt=await setup(after,{funds:15e9});debt.l.d.thisCycleExpenses=8e9;
await debt.f.cycle();await debt.f.cycle();await debt.startIfMissing();
assert(!debt.l.products.has('Prod v2'),'Honor delivered but unpaid materials');

// Restart into an existing v2: no manager launch record. Exercise the actual engine's
// progress from the correct office and an independently created satellite design.
async function inherited(c=city, progress=20) {
  const h=await setup(after);const p=make('Prod v2',2e9,c);h.l.products.set(p.name,p);
  p.developmentProgress=progress;
  for(let i=0;i<4;i++)await h.next();return h;
}
const resumed=await inherited();assert(resumed.f.api.plan().v2.confirmed);assert(resumed.l.products.get('Prod v2').developmentProgress>20);
await resumed.f.api.growCashDivision(resumed.f.ns);assert.equal(resumed.l.offices[city].size,13);
const outside=await inherited('Aevum');assert(!outside.f.api.plan().v2.confirmed);
const near=await inherited();near.l.products.get('Prod v2').developmentProgress=99.99;
near.f.corp.nextState='START';await near.f.prepare();near.f.corp.nextState='PURCHASE';await near.f.prepare();
const guarded=(h)=>h.f.calls.filter(([name,...args])=>name==='getProduct'&&args[2]==='Prod v2').length;
const at=guarded(near);await near.f.api.growCashDivision(near.f.ns);
assert.equal(guarded(near),at,'No design-speed buy when staff would arrive after completion');

// Identify guarded calls without counting normal upgrades that make money from v1 sales.
for(const kind of ['weak-sales','loss','unaffordable','short-rep','public-change','phase','new-bill','bribe','finished','stale-progress','repriced','low-ram']){
  const h=await inherited(), {f,l}=h, oldSize=l.offices[city].size;
  // Disable ordinary short-payback upgrades, keep the time advantage alone affordable.
  f.costs.seats=20e9;
  let intervened=false;
  if(kind==='weak-sales'||kind==='loss'||kind==='unaffordable'||kind==='short-rep'){
    if(kind==='weak-sales') for(const row of Object.values(h.v1.cityData)) row.actualSellAmount=0;
    if(kind==='loss') {f.corp.expenses=f.corp.revenue+1;l.d.lastCycleExpenses=l.d.lastCycleRevenue+1;}
    if(kind==='unaffordable') f.costs.seats=1e20;
    if(kind==='short-rep') target(f,f.corp.funds+20e9);
    await f.cycle();f.corp.nextState='EXPORT';
  }else{
    f.intervene(()=>{
      intervened=true;
      if(kind==='public-change') f.corp.public=false;
      if(kind==='phase') f.corp.nextState='START';
      if(kind==='new-bill') l.d.thisCycleExpenses=f.corp.funds-5e9;
      if(kind==='bribe') f.corp.funds=5e9;
      if(kind==='finished') l.products.get('Prod v2').developmentProgress=100;
      if(kind==='stale-progress') l.products.get('Prod v2').developmentProgress=95;
      if(kind==='repriced') f.costs.seats=21e9;
      if(kind==='low-ram') f.limitRam(23.6);
    });
  }
  await f.api.growCashDivision(f.ns);assert.equal(l.offices[city].size,oldSize,kind);
  if(['public-change','phase','new-bill','bribe','finished','stale-progress','repriced','low-ram'].includes(kind))assert(intervened,kind);
}
console.log('Cash-funded launch, existing v2, design city, near-finish, sales, bills, earlier rep, repricing and RAM deferrals passed.');
