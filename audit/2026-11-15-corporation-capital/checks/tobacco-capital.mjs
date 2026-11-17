// Run from the repository root; audits are not installed by git-pull.js.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {getCorporationBribeReserve} from '../../../speedrun-policy.js';
import {fixtures} from '../../2026-11-15-corporation-production/checks/cash-production.mjs';
import {source,build,section,industry,CorpEmployeeJob,MaterialInfo,bare} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';
const root=new URL('../../../',import.meta.url),city='Sector-12',cities=[city,'Aevum','Volhaven','Chongqing','New Tokyo','Ishima'];
const before=execFileSync('git',['show','6865fd2:corporation.js'],{cwd:root,encoding:'utf8'}),after=readFileSync(new URL('corporation.js',root),'utf8');
const Product=build(source('Corporation/Product.ts'),{CorpEmployeeJob,MaterialInfo,IndustriesData:{Tobacco:industry},CityName:Object.fromEntries(cities.map((c,i)=>[i?c:'Sector12',c])),
  getRecordKeys:Object.keys,getRecordEntries:Object.entries,constructorsForReviver:{},getRandomIntInclusive:()=>35,createEnumKeyedRecord:(keys,fn)=>Object.fromEntries(Object.values(keys).map(k=>[k,fn(k)]))},'Product');
const seatCost=build(section(source('Corporation/helpers.ts'),'export function calculateOfficeSizeUpgradeCost(','export function calculateMaxAffordableUpgrade('),
  {corpConstants:{officeInitialCost:4e9}},'calculateOfficeSizeUpgradeCost');
const predict=Function(bare(after)+';return tobaccoDesign')();
const rounded=(n,dec)=>Number(n.toFixed(dec));
function target(f,dollars) {
  const now=Date.now(),r=f.reset;
  Object.assign(f.route,{kind:'faction-rep',faction:'Daedalus',targetRep:dollars/1e9,updatedAt:now,lastAugReset:r.lastAugReset,lastNodeReset:r.lastNodeReset});
  Object.assign(f.snapshot,{current_node:r.currentNode,last_aug_reset:r.lastAugReset,generated_at:now,reset_planning:{version:1,reputation:{Daedalus:0}}});
}
const initialTime=Date.now(), referenceNet=new Map();
let clock=initialTime;Date.now=()=>clock;
async function setup(code,ta=false,{runHours=19,brand=0,research=2379,hqSeats=3,satellite=3,quality=55.62,boost=9.316}={}) {
  clock=initialTime;
  const f=fixtures(code,{funds:975.229e9,ta}), l=f.lines.Tobacco,{d,offices,warehouses,products}=l;
  f.history.finishAt=runHours===null?0:clock+runHours*3600e3;f.costs.seats=seatCost;f.levels['Smart Factories']=13;f.corp.getProductionMultiplier=()=>1.39;
  Object.assign(d,{researchPoints:research,researchFactor:industry.scienceFactor,awareness:9.09,popularity:2.923,productionMult:boost});
  if(brand)d.awareness=d.popularity=brand;
  for(const o of Object.values(offices)){
    o.size=o.numEmployees=o.city===city?hqSeats:satellite;o.totalExperience=85.214*o.size;o.employeeJobs.Unassigned=o.employeeNextJobs.Unassigned=o.size;
  }
  for(const w of Object.values(warehouses))Object.assign(w.materials.Plants,{quality,marketPrice:2693});
  await f.prepare();await f.api.manageOffice(f.ns);f.apply();
  const newProduct=(n,invest)=>new Product({name:'Prod v'+n,createCity:city,designInvestment:invest,advertisingInvestment:invest});
  const staff={...offices[city].employeeProductionByJob};
  products.clear();
  for(const n of [1,2]){
    const p=newProduct(n,n*1e9);p.createProduct(1e7,staff);p.finishProduct(d);p.marketTa2=ta;products.set(p.name,p);
  }
  const test=newProduct(3,100e9);test.createProduct(1e7,staff);test.finishProduct(d);
  const highBudget=test.rating,baseRating=products.get('Prod v1').rating;
  assert(highBudget/baseRating<1.05);
  let outsideNet=0,last={net:0,revenue:0,expenses:0};
  const setBook=()=>{Object.assign(d,{lastCycleRevenue:last.revenue,lastCycleExpenses:last.expenses});
    Object.assign(f.corp,{revenue:last.revenue+outsideNet,expenses:last.expenses});};
  async function cycle({grow=false}={}){
    clock+=10000;f.apply();f.corp.nextState='START';await f.prepare();f.corp.nextState='PURCHASE';await f.prepare();
    for(const w of Object.values(warehouses)){w.materials.Plants.stored=0;d.updateWarehouseSizeUsed(w);}
    await f.api.buyCashInputs(f.ns);
    let units=0;for(const w of Object.values(warehouses)){const m=w.materials.Plants;m.stored=m.buyAmount*10;units+=m.stored;}
    // Division.processMaterials accrues R&D in each of the four non-START phases.
    d.researchPoints+=.016*Object.values(offices).reduce((s,o)=>s+Math.sqrt(o.employeeProductionByJob['Research & Development']),0);
    f.corp.state.nextName='PRODUCTION';d.processProducts(1,f.corp);
    f.corp.nextState='EXPORT';await f.api.manageOffice(f.ns);
    if(grow)await f.api.growCashDivision(f.ns);
    f.corp.nextState='SALE';await f.api.sellCashOutput(f.ns);
    f.corp.state.nextName='SALE';const revenue=d.processProducts(1,f.corp)[0]/10;
    const payroll=Object.values(offices).reduce((s,o)=>s+1.5*(o.numEmployees*(o.avgIntelligence+o.avgCharisma+o.avgCreativity+o.avgEfficiency)+o.totalExperience),0),expenses=units*2693/10+payroll;
    last={revenue,expenses,net:revenue-expenses};setBook();
    f.corp.funds+=(last.net+outsideNet)*(1-f.corp.dividendRate)*10;return last.net;
  }
  let warm=0;
  for(let i=0;i<45;i++){const n=await cycle();if(i>=30)warm+=n/15;}
  const key=JSON.stringify([ta,brand]);if(code===before || !referenceNet.has(key))referenceNet.set(key,brand?0:2.10e6-warm);
  outsideNet=referenceNet.get(key);setBook();f.corp.funds=975.229e9;
  for(let i=0;i<7;i++)await cycle();
  f.corp.funds=975.229e9;f.calls.length=0;
  const active=newProduct(3,1e9);active.marketTa2=ta;active.createProduct(1,staff);active.createProduct(15/active.developmentProgress-1,staff);products.set(active.name,active);
  return {f,l,active,cycle,extra:outsideNet,baseRating,highBudget};
}
async function run(code,ta) {
  const h=await setup(code,ta),{f,l,active}=h;
  // First compare the same v3 at 15%, including all actual seat and ingredient costs.
  // Freeze physical growth at release, then measure the selling line (no v4 in this comparison).
  let release=null,spent=0,minimum=f.corp.funds,netSum=0,eligible=null;
  const goal=1e12;
  for(let i=1;i<=1440;i++){
    target(f,goal);
    const balance=f.corp.funds,net=await h.cycle({grow:release===null});
    spent+=balance+10*(net+h.extra)*(1-f.corp.dividendRate)-f.corp.funds;minimum=Math.min(minimum,f.corp.funds);
    if(release===null&&active.finished)release=i;
    if(i>1380)netSum+=net/60;
    if(eligible===null && f.corp.funds-Math.max(5e9,600*f.corp.expenses)>=goal)eligible=i;
    f.calls.length=0;
  }
  assert(release!==null && eligible!==null && minimum>=5e9 && l.products.size===3 && l.products.has('Prod v1') && l.products.has('Prod v2'));
  return {hq:l.offices[city].size,otherSeats:Object.values(l.offices).reduce((s,o)=>s+o.size,0)-l.offices[city].size,
    spentB:rounded(spent/1e9,1),v3Minutes:rounded(release/6,1),rating:rounded(active.rating,1),tobaccoNetM:rounded(netSum/1e6,3),
    corpNetM:rounded((netSum+h.extra)/1e6,3),fourHourCashB:rounded(f.corp.funds/1e9,1),bribeMinutes:rounded(eligible/6,1)};
}
for(const ta of [false,true]){
  const old=await run(before,ta),fixed=await run(after,ta);console.log(JSON.stringify({pricing:ta?'TA.II':'script',old,fixed}));
  assert(fixed.rating>old.rating && fixed.corpNetM>old.corpNetM && fixed.fourHourCashB>old.fourHourCashB && fixed.bribeMinutes<old.bribeMinutes);
  assert(fixed.spentB===0,'The reported low-income setup can improve without spending the bribe money');
}
// Cross-check the rating and hidden markup estimate with the game, including an alternate job mix.
const h=await setup(after),{f,l}=h;
for(const j of [[180,240,200,0,0],[600,1000,249,500,67],[0,600,0,0,0]]){
  const names=['Operations','Engineer','Business','Management','Research & Development'];
  const mix=Object.fromEntries(names.map((v,i)=>[v,j[i]]));mix.total=j.reduce((s,v)=>s+v,0);
  const p=new Product({name:'test',createCity:city,designInvestment:2e9,advertisingInvestment:3e9});
  p.createProduct(1e6,mix);p.finishProduct(l.d);
  const pred=predict(j,l.d.researchPoints,industry.scienceFactor,2e9,3e9);
  assert(Math.abs(p.rating-pred.rating)<1e-8 && Math.abs(1/p.markup-pred.inverseMarkup)<1e-10);
}
console.log('Same three-person design team, $1b vs $100b on each slider:',h.baseRating.toFixed(2),h.highBudget.toFixed(2));

// Directly compare the quote with Market-TA.II in the engine. The benchmark above
// exercises the actual sell loop; here change input price after the manager quoted it.
const terms=Function(bare(after)+';cashPlan={salesBots:1.17};return tobaccoSaleTerms')();
const p0=l.products.get('Prod v1'),row=p0.cityData[city],warehouse=l.warehouses[city],office=l.offices[city];
const business=office.employeeProductionByJob.Business;
for(const stock of [1,32,17000]){
  const p={...p0,...row,productionCost:13465};const terms0=terms(p,l.d,industry,business);
  assert(terms0 && Math.abs(terms0.limit-p.effectiveRating/p0.markup)<1e-8);
  const amount=stock/10, premium=terms0.limit*Math.sqrt(terms0.capacity/amount);
  Object.assign(warehouse.materials.Plants,{marketPrice:3555});f.corp.getSalesMult=()=>1.17;
  Object.assign(row,{stored:stock,desiredSellAmount:'MAX',desiredSellPrice:'MP+'+premium});
  p0.marketTa2=false;l.d.processSaleState(1,p0,f.corp,office,warehouse);
  const price=p0.uiMarketPrice[city],sold=row.actualSellAmount;
  row.stored=stock;p0.marketTa2=true;l.d.processSaleState(1,p0,f.corp,office,warehouse);
  assert(Math.abs(p0.uiMarketPrice[city]-price)<1e-8 && Math.abs(sold-row.actualSellAmount)<1e-8);
}
assert.equal(terms({...p0,...row,stats:{quality:1}},l.d,industry,business),null,'Incomplete product snapshots use the existing fallback');
assert.equal(terms({...p0,...row,demand:undefined},l.d,industry,business),null,'Unavailable market data is not a real quote');

// The richer market has an economically different answer. Both sides have identical
// upgraded brand, products, inputs and cash. Count paid hires and cash; no new investment rounds.
async function higherMargin(code,{brand=2000,hours=12,limit=Infinity}={}) {
  const x=await setup(code,false,{runHours:19,brand,research:124000,hqSeats:30,satellite:12,quality:164,boost:33.21}),{f,l,active}=x;
  f.limitRam(limit);let spent=0,atRelease,netSum=0;
  for(let i=0;i<hours*360;i++){
    target(f,8e12);
    const balance=f.corp.funds,net=await x.cycle({grow:!active.finished});
    spent+=balance+(net+x.extra)*9.9-f.corp.funds;
    if(active.finished && !atRelease)atRelease=i+1;
    if(i>=hours*360-60)netSum+=net/60;
    f.calls.length=0;
  }
  return {spentB:rounded(spent/1e9,1),seats:l.offices[city].size,rating:rounded(active.rating,1),
    minutes:rounded(atRelease/6,1),netM:rounded(netSum/1e6,2),cashB:rounded(f.corp.funds/1e9,1)};
}
const previous=await higherMargin(before),withoutSpecial=await higherMargin(after,{limit:41.6}),higher=await higherMargin(after);
console.log(JSON.stringify({higherMargin:{previous,withoutSpecial,higher}}));
assert(higher.spentB>0 && higher.rating>previous.rating && higher.cashB>previous.cashB && higher.cashB>withoutSpecial.cashB && higher.rating>withoutSpecial.rating,
  'When the design seats do pay, real sales recover the cost in the comparison window');

// A single skipped sale is not evidence of a dead division. Six bad settlements are.
const policy=Function('getCorporationBribeReserve',bare(after)+`;cashPlan={round:5,goods:{}};return (d,c,items,liquid,target)=>{
  cashPlan.goods[d.name]=items;return cashPlan.tobacco=observeTobaccoEarnings(d,c,liquid,
    {secondsPerMarketCycle:10,bribeThreshold:100e12},target)}`)(getCorporationBribeReserve);
const summarise=(sold,revenue=1e6)=>policy({name:'Tobacco',industry:'Tobacco',products:['Prod v1','Prod v2'],lastCycleRevenue:revenue,lastCycleExpenses:1e4},
  {public:true,funds:975e9,dividendRate:.01,revenue:2.1e6,expenses:1e4,valuation:120e12},
  [1,2].map(i=>({city,product:{name:'Prod v'+i,actualSellAmount:sold,productionAmount:5}})),975e9,8e12);
for(let i=0;i<5;i++)summarise(6);
const skipped=summarise(0,0);
assert(skipped.ready);
assert.deepEqual(skipped.soldByProduct,{'Prod v1':5,'Prod v2':5});
for(let i=0;i<5;i++)summarise(0,0);
assert(!summarise(0).ready);

// Use the real home guard: every recheck must occur before the one paid mutation.
const {main:helper}=await import('../../../bin/corpRun.js');
const lineup=['Prod v1','Prod v2','Prod v3'];
async function homeCheck(args,{funds=100e9,bills=0,phase='EXPORT',products=lineup,finished=2,price=4e9,ram=Infinity,
  industry='Tobacco',publicCo=true,runs}={}) {
  let reply,handler,paid=0,reads=0;
  const corp={public:publicCo,funds,divisions:['Tobacco'],nextState:phase};
  const ns={pid:991,args,ramOverride:n=>Math.min(n,ram),getFunctionRamCost:n=>n==='baseCost'?1.6:n.includes('get')?10:20,
    getPortHandle:()=>({write:r=>reply=r}),atExit:cb=>handler=cb,read:path=>{if(!path.includes('bn-run-log'))return '';
      reads++;return JSON.stringify({runs});},corporation:{getCorporation:()=>corp,getDivision:()=>({name:'Tobacco',industry,cities,products,thisCycleExpenses:bills}),
    getProduct:(_d,_c,p)=>({developmentProgress:products.indexOf(p)<finished?100:20}),getOfficeSizeUpgradeCost:()=>price,
    upgradeOfficeSize:(d,c,n)=>{assert.equal(d,'Tobacco');assert.equal(c,'Aevum');assert.equal(n,3);paid++;}}};
  await helper(ns);handler();return {reply,paid,reads};
}
const args=['upgradeOfficeSize','--earning-line','Tobacco',4e9,75e9,'EXPORT',JSON.stringify(lineup),'Aevum',0];
assert((await homeCheck(args)).paid===1);
for(const v of [{publicCo:false},{industry:'Restaurant'},{price:5e9},{phase:'SALE'},{products:lineup.slice(0,2)},{finished:1},
  {ram:41.6},{bills:22e9},{funds:76e9},{bills:NaN}]){
  const x=await homeCheck(args,v);assert.equal(x.reply,false);assert.equal(x.paid,0);
}
assert.equal((await homeCheck([...args.slice(0,-1),99e9])).paid,1,'An obsolete bribe target cannot block a quoted productive purchase');
const start=clock-1e6,oldRun=(node,d,when)=>({node,startTime:when,endTime:when+d,milestones:[{kind:'bn-finish-ready',sinceNodeMs:d}]});
const runs=[oldRun(3,100000,start-8e6),oldRun(4,100,start-5e6),oldRun(3,300000,start-4e6),{node:3,endTime:start-1000,milestones:[]}];
const timeArgs=['getCorporation','--cash-plan',3,start];
assert.equal((await homeCheck(timeArgs,{runs})).reply.finishAt,0,'A missed historical estimate cannot freeze growth for the rest of the node');
const earlierStart=clock-50000;
assert.equal((await homeCheck(['getCorporation','--cash-plan',3,earlierStart],{runs})).reply.finishAt,earlierStart+200000);
assert.equal((await homeCheck(timeArgs,{runs:[]})).reply.finishAt,0);
assert.equal((await homeCheck(timeArgs,{runs:[...runs,{runKey:'3:'+start,milestones:[{kind:'bn-finish-ready',sinceNodeMs:3500}]}]})).reply.finishAt,start+3500);
assert.equal((await homeCheck(['getCorporation','--cash-plan'],{runs})).reads,0);
console.log('Rating and markup agree with the game; tick averaging, changed input price, run-history limits, protected cash, fresh lineup and RAM checks passed.');

// An existing profitable division with three-seat satellites can buy a first
// researcher. A close bribe or imminent BN completion must veto that extra capital.
async function satelliteCase(reason){
  const x=await setup(after,false,{runHours:19,brand:2000,research:124000,hqSeats:30,satellite:3,quality:164,boost:33.21});
  const {f,l}=x;f.costs.seats=(size,n)=>size>=30?1e20:seatCost(size,n);
  if(reason==='history')f.history.finishAt=f.api.plan().finishAt=Date.now()+1000;
  if(reason==='missing-history') f.history.finishAt=f.api.plan().finishAt=0;
  target(f,reason==='bribe'?f.corp.funds-5e9:8e12);
  await f.cycle();f.corp.nextState='EXPORT';let checked=false;
  f.intervene(()=>{checked=true;if(reason==='bill')l.d.thisCycleExpenses=f.corp.funds;});
  await f.api.growCashDivision(f.ns);
  const paid=f.api.plan().tobacco?.note?.includes('+3 seats:')===true;
  if(reason==='history'){assert(!checked && !paid);return;}
  if(reason==='bill'){assert(checked && !paid);return;}
  if(reason==='missing-history'){assert.equal(f.api.plan().finishAt,0);return;}
  assert(checked && paid,'First affordable satellite researcher is funded');
  await f.cycle();await f.api.manageOffice(f.ns);f.apply();
  assert(Object.entries(l.offices).some(([c,o])=>c!==city && o.numEmployees===6 && o.employeeJobs['Research & Development']===1));
}
for(const why of ['profit','history','bribe','bill','missing-history'])await satelliteCase(why);
console.log('Paid research staffing, active reputation target, imminent BN finish and live invoice cases passed.');
