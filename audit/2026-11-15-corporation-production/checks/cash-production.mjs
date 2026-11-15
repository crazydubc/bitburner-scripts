// Controlled comparison: same paid offices, products, staff, markets and supplies.
// Run with Node 24 and the Bitburner engine checkout as the first argument.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Division, Warehouse, Material, MaterialInfo, materialNames, industry, sale, bare, build, source, CorpEmployeeJob}
  from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';
import {main as homeHelper} from '../../../bin/corpRun.js';
import {getCorporationBribeReserve} from '../../../speedrun-policy.js';

const repo = new URL('../../../',import.meta.url);
const before = execFileSync('git',['show','96a131b:corporation.js'],{cwd:repo,encoding:'utf8'});
const after = readFileSync(new URL('corporation.js',repo),'utf8');
const cities = ['Sector-12','Aevum','Volhaven','Chongqing','New Tokyo','Ishima'];
const one = () => 1;
const officeType = build(source('Corporation/OfficeSpace.ts'), {CorpEmployeeJob,CityName:{Sector12:'Sector-12'},getRecordEntries:Object.entries,
  createEnumKeyedRecord:(keys,fn)=>Object.fromEntries(Object.values(keys).map(k=>[k,fn(k)])),
  constructorsForReviver:{},getRandomIntInclusive:()=>75,getRecordKeys:Object.keys},'OfficeSpace');
const constants={secondsPerMarketCycle:10,officeInitialCost:4e9,warehouseInitialCost:5e9,
  bribeThreshold:100e12,bribeAmountPerReputation:1e9};
const reset={currentNode:3,lastAugReset:Date.now()-360000,lastNodeReset:Date.now()-86400000};
export function fixtures(code,{restaurant=false,restaurantOnly=false,funds=5e9,unpaid=0,ta=true}={}) {
  const kinds=restaurantOnly ? ['Restaurant'] : restaurant ? ['Tobacco','Restaurant'] : ['Tobacco'];
  const corp={funds,expenses:100e6,revenue:900e6,public:true,valuation:120e12,dividendRate:.01,
    divisions:kinds, nextState:'PURCHASE',state:{nextName:'PURCHASE'},getProductionMultiplier:one,getSalesMult:one,
    getScientificResearchMult:one,getEmployeeCreMultiplier:one,getEmployeeChaMult:one,getEmployeeIntMult:one,getEmployeeEffMult:one};
  const lines={}, calls=[], route={}, snapshot={};
  for (const kind of kinds) {
    const offices={}, warehouses={}, products=new Map();
    const recipe=kind==='Tobacco'?{Plants:1}:{Food:.5,Water:.5};
    const specs={...industry,makesMaterials:false,makesProducts:true,producedMaterials:[],requiredMaterials:recipe};
    for (const city of cities) {
      const o=new officeType({city,size:100});
      Object.assign(o,{numEmployees:100,avgMorale:100,avgEnergy:100,totalExperience:7500,totalSalary:100e3});
      o.employeeJobs.Unassigned=o.employeeNextJobs.Unassigned=100;
      offices[city]=o;
      const materials=Object.fromEntries(materialNames.map(name=>[name,new Material({name})]));
      for(const name of Object.keys(recipe)) Object.assign(materials[name],{marketPrice:3000,quality:200,stored:0});
      warehouses[city]=Object.assign(Object.create(Warehouse.prototype),{city,materials,level:20,size:5000,sizeUsed:0,smartSupplyEnabled:false,smartSupplyStore:0});
    }
    for(const [i,name] of ['Prod v5','Prod v6','Prod v7'].entries()) {
      const p={name,developmentProgress:100,finished:true,size:.05,rating:40000*(1+i*.25),markup:1,competition:25,demand:80,
        uiMarketPrice:{},requiredMaterials:recipe,cityData:{},stats:{quality:i+1},marketTa2:ta};
      for(const city of cities) p.cityData[city]={productionLimit:null,stored:0,effectiveRating:0,productionCost:0,
        desiredSellPrice:'0',desiredSellAmount:'MAX',actualSellAmount:0,productionAmount:0};
      products.set(name,p);
    }
    const d=Object.assign(Object.create(Division.prototype),specs,{name:kind,industry:kind,awareness:2000,popularity:1000,
      researchPoints:2000,offices,warehouses,products,lastCycleRevenue:kind==='Tobacco'?820e6:200e6,lastCycleExpenses:20e6,
      thisCycleExpenses:kind===kinds[0]?unpaid:0,getSalesMultiplier:one,getProductionMultiplier:one,getProductProductionMultiplier:one,
      getEmployeeCreMultiplier:one,getEmployeeChaMultiplier:one,getEmployeeIntMultiplier:one,getEmployeeEffMultiplier:one,getScientificResearchMultiplier:one});
    d.calculateProductionFactors();
    lines[kind]={d,offices,warehouses,products,specs};
  }
  const ownedResearch=new Set();
  const info=k=>{const d=lines[k].d;return {name:k,industry:k,cities,products:[...d.products.keys()],makesProducts:true,maxProducts:3,
    lastCycleRevenue:d.lastCycleRevenue,lastCycleExpenses:d.lastCycleExpenses,thisCycleExpenses:d.thisCycleExpenses,productionMult:d.productionMult,
    awareness:d.awareness,popularity:d.popularity};};
  const costs={advert:1e25,factory:1e25,seats:1e25};
  let restrict=Infinity, beforeProject;
  const seatCost=(o,n)=>typeof costs.seats==='function'?costs.seats(o.size,n):costs.seats;
  function rpc(_,fn,...a) {
    if(a[0]==='--cash-project'||a[0]==='--second-design'){
      beforeProject?.();beforeProject=undefined;
      let cb,reply;
      return homeHelper({args:[fn,...a],pid:1,atExit:f=>cb=f,getPortHandle:()=>({write:v=>reply=v}),
        ramOverride:n=>Math.min(n,restrict),getFunctionRamCost:f=>f==='baseCost'?1.6:f.includes('get')?10:20,
        corporation:new Proxy({},{get:(_,m)=>(...args)=>rpc(null,m,...args)})}).then(()=>{cb();assert.notEqual(typeof reply,'string');return reply;});
    }
    if(a[0]==='--batch') return JSON.parse(a[1]).map(row=>rpc(_,fn,...row));
    calls.push([fn,...a]);
    const [k,c,n,v]=a, l=lines[k], o=l?.offices[c], w=l?.warehouses[c], p=l?.products.get(n);
    switch(fn) {
      case 'getConstants':return constants;
      case 'getCorporation':return k==='--cash-plan'?{corporation:{...corp},offer:{round:5,funds:0},route,snapshot}:{...corp};
      case 'getDivision':return info(k);case 'hasWarehouse':return !!w;
      case 'getOffice':return {...o,employeeJobs:{...o.employeeJobs},employeeProductionByJob:{...o.employeeProductionByJob}};
      case 'setJobAssignment':return o.autoAssignJob(n,v);
      case 'discontinueProduct':l.products.delete(c);return;
      case 'makeProduct':{
        const p0=[...l.products.values()][0], cost=v+a[4];assert(corp.funds>=cost);corp.funds-=cost;
        l.products.set(n,{...structuredClone(p0),name:n,developmentProgress:0,finished:false});return;
      }
      case 'getProduct':return {...p,...p.cityData[c]};
      case 'getUpgradeLevel':return 0;case 'getOfficeSizeUpgradeCost':return seatCost(o,n);
      case 'upgradeOfficeSize':{const price=seatCost(o,n);assert(corp.funds>=price);corp.funds-=price;o.size+=n;return;}
      case 'hireEmployee':return o.hireRandomEmployee(CorpEmployeeJob.Unassigned);
      case 'getIndustryData':return l.specs;case 'getUpgradeLevelCost':return costs.factory;
      case 'getHireAdVertCost':return costs.advert;
      case 'hireAdVert':corp.funds-=costs.advert;return;
      case 'getWarehouse':return {size:w.size,sizeUsed:w.sizeUsed,level:w.level};
      case 'getMaterial':return {...w.materials[n]};case 'getMaterialData':return MaterialInfo[k];
      case 'hasUnlock':return true;case 'hasResearched':return (ta && c==='Market-TA.II') || ownedResearch.has(c);
      case 'sellProduct':return sale.sellProduct(p,c,String(v),String(a[4]),false);
      case 'setProductMarketTA2':return;
      case 'exportMaterial':lines[k].warehouses[c].materials[a[4]].exports.push({division:n,city:v,amount:a[5]});return;
      case 'sellMaterial':return sale.sellMaterial(w.materials[n],String(v),String(a[4]));
      case 'buyMaterial':assert(Number.isFinite(v)&&v>=0);w.materials[n].buyAmount=v;return;
      default:assert.fail('Unexpected: '+fn+' '+a);
    }
  }
  const api=Function('corpRun','log','getCorporationBribeReserve','kinds','info','reset',bare(code)+`
    investOffer={round:5};researchedDB['Market Research - Demand']=researchedDB['Market Data - Competition']=true;
    for(const k of kinds){hasDivDB[k]=info(k);
      for(const c of cities)hasOfficeDB[k+c]=hasWarehouseDB[k+c]=true;}
    ${code===before?'return {manageOffice,sell};':`companyReset=bn3Reset=reset;
      return {connectCashSuppliers,manageOffice,manageProducts,growCashDivision,prepareCashOperations,buyCashInputs,sellCashOutput,
        budget:ns=>corpFunds(ns), plan:()=>cashPlan, projectBudget, use:usesCashPolicy};`}
  `)(rpc,assert.fail,getCorporationBribeReserve,kinds,info,reset);
  const ns={format:{number:String}};
  async function prepare() {await api.prepareCashOperations(ns,5);}
  async function cycle() {
    corp.nextState='START';await prepare();corp.nextState='PURCHASE';await prepare();
  }
  function apply() {for(const {d,offices} of Object.values(lines))for(const o of Object.values(offices)){
    Object.assign(o.employeeJobs,o.employeeNextJobs);o.calculateEmployeeProductivity(corp,d);
  }}
  return {corp,lines,api,costs,ns,route,snapshot,calls,prepare,cycle,apply,ownedResearch,reset,limitRam:n=>restrict=n,intervene:fn=>beforeProject=fn};
}

async function produce(code,ta) {
  const f=fixtures(code,{ta});const {corp,ns,api,lines:{Tobacco:l}}=f;
  if(code===after) await f.prepare();
  await api.manageOffice(ns);f.apply();
  // Hold ingredient quality, market demand and employee attributes fixed. Warm up both
  // actual pricing controllers; measure revenue actually sold and the cost of inputs consumed.
  let measuredNet=0;const samples=12, warm=30;
  for(let cycle=0;cycle<warm+samples;cycle++){
    for(const w of Object.values(l.warehouses))w.materials.Plants.stored=10000;
    corp.state.nextName='PRODUCTION';for(const p of l.products.values())l.d.processProduct(1,p,corp);
    corp.nextState='SALE';if(code===after)await api.sellCashOutput(ns);else await api.sell(ns);
    corp.state.nextName='SALE';const revenue=[...l.products.values()].reduce((s,p)=>s+l.d.processProduct(1,p,corp),0)/10;
    const plants=Object.values(l.warehouses).reduce((s,w)=>s+(10000-w.materials.Plants.stored)*3000,0)/10;
    // Division.process charges each office's totalSalary in each of its five phases.
    const payroll=5*Object.values(l.offices).reduce((s,o)=>s+o.totalSalary,0)/10;
    if(cycle>=warm)measuredNet+=revenue-plants-payroll;
    if(code===after)await f.cycle();
  }
  const selling=cities.filter(c=>[...l.products.values()].every(p=>p.cityData[c].actualSellAmount>0));
  const research=Object.values(l.offices).reduce((s,o)=>s+o.employeeJobs[CorpEmployeeJob.RandD],0);
  if(code===after){
    corp.nextState='START';await f.prepare();corp.nextState='PURCHASE';await f.prepare();
    for(const w of Object.values(l.warehouses)){w.materials.Plants.stored=0;l.d.updateWarehouseSizeUsed(w);}
    await api.buyCashInputs(ns);
    for(const c of cities) {
      const actual=[...l.products.values()].reduce((s,p)=>s+p.cityData[c].productionAmount,0);
      assert(Math.abs(l.warehouses[c].materials.Plants.buyAmount-actual)<1e-8,'Supply all three actual product lines in '+c);
    }
  }
  return {sellingCities:selling.length,researchEmployees:research,netPerSecond:measuredNet/samples};
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const comparisons={};
for(const ta of [false,true]){
  const former=await produce(before,ta), production=await produce(after,ta);
  assert.equal(former.sellingCities,1);assert.equal(production.sellingCities,6);assert.equal(production.researchEmployees,125);
  assert(former.netPerSecond>0 && production.netPerSecond>former.netPerSecond);
  comparisons[ta?'marketTA2':'manual']={former,production,netRatio:production.netPerSecond/former.netPerSecond};
}

// Repeat the public cash decision with and without a legacy Restaurant on the user's $800m/s net.
const f=fixtures(after,{restaurant:true,funds:2e12,unpaid:1e11});
const {corp,api,ns,lines}=f;const seedSell=(name,rate)=>{for(const p of lines[name].products.values())
  for(const row of Object.values(p.cityData)){row.actualSellAmount=rate;row.productionAmount=Math.max(1,rate);}};
seedSell('Tobacco',25); lines.Tobacco.d.awareness=lines.Tobacco.d.popularity=0;
await f.prepare();const initial=api.plan().floor;
assert.equal(initial,1.425e12);assert.equal(await api.budget(ns),475e9);
await f.prepare();assert.equal(api.plan().floor,initial,'Repeated state is not new earnings');
f.costs.advert=1e9;await api.growCashDivision(ns);assert.deepEqual(f.calls.filter(([m])=>m==='hireAdVert'),[['hireAdVert','Tobacco']]);
await api.manageProducts(ns);assert(lines.Tobacco.products.has('Prod v8'));assert(!f.calls.some(([m,d])=>['makeProduct','discontinueProduct'].includes(m)&&d==='Restaurant'));
seedSell('Restaurant',10);lines.Restaurant.d.lastCycleRevenue=2e9;
await f.cycle();assert.equal(api.plan().focus,'Tobacco');await f.cycle();assert.equal(api.plan().focus,'Tobacco');
await f.cycle();assert.equal(api.plan().focus,'Restaurant','Three profitable cycles with actual product sales');
lines.Restaurant.d.lastCycleExpenses=3e9;for(let i=0;i<3;i++)await f.cycle();
assert.equal(api.plan().focus,'Tobacco','Actual sales alone cannot make a loss-making division the growth target');
assert.equal(api.projectBudget(30,corp,5),48e9,'Old product version numbers cannot drain a treasury');
// Oversupply and unprofitable goods must not consume more money on boosters.
for(const p of lines.Tobacco.products.values())for(const row of Object.values(p.cityData))row.productionAmount=1e4;
await f.cycle();assert.equal(api.plan().boost,false);
seedSell('Tobacco',25);await f.cycle();assert.equal(api.plan().boost,true);
const now=Date.now();
Object.assign(f.route,{kind:'faction-rep',faction:'Daedalus',targetRep:1840,updatedAt:now,lastAugReset:reset.lastAugReset,lastNodeReset:reset.lastNodeReset});
Object.assign(f.snapshot,{current_node:3,last_aug_reset:reset.lastAugReset,generated_at:now,reset_planning:{version:1,reputation:{Daedalus:0}}});
await f.cycle();assert.equal(api.plan().goal,1.84e12);assert(await api.budget(ns)<=0,'Protect the reachable exact rep purchase plus operating cash');
const count=f.calls.filter(([m])=>m==='hireAdVert').length;await api.growCashDivision(ns);
assert.equal(f.calls.filter(([m])=>m==='hireAdVert').length,count);
f.route.updatedAt-=90001;await f.cycle();assert.equal(api.plan().goal,0);assert(await api.budget(ns)>0);
const base=api.plan().floor;
for(let i=0;i<60;i++){corp.funds+=(corp.revenue-corp.expenses)*10*.99;await f.cycle();}
assert.equal(api.plan().floor-base,237.6e9,'60 distinct completed operating cycles at $800m/s, 1% dividends, half retained');
assert.equal(api.use(2),false);assert.equal(api.use(3),true);assert.equal(api.use(4),true);assert.equal(api.use(5),true);
assert(!f.calls.some(([m])=>m==='expandIndustry'));

// Do not retire a city's only selling product to create an untested replacement.
const sole=fixtures(after,{funds:1e12});const retained=sole.lines.Tobacco.products.get('Prod v5');
retained.cityData.Aevum.actualSellAmount=10;await sole.prepare();await sole.api.manageProducts(sole.ns);
assert(sole.lines.Tobacco.products.has('Prod v5'));assert(!sole.calls.some(([m])=>m==='discontinueProduct'));
// A company with only a profitable, finished Restaurant can keep its original business.
const custom=fixtures(after,{restaurantOnly:true,funds:100e9});custom.lines.Restaurant.products.get('Prod v5').cityData.Aevum.actualSellAmount=10;
await custom.prepare();assert.equal(custom.api.plan().focus,'Restaurant');assert(!custom.calls.some(([m])=>m==='expandIndustry'));
// Use a company's existing design office rather than buying a new industry while it designs its first product.
const designing=fixtures(after,{restaurantOnly:true});for(const p of designing.lines.Restaurant.products.values())p.developmentProgress=25;
await designing.prepare();assert.equal(designing.api.plan().focus,'Restaurant');assert(!designing.calls.some(([m])=>m==='expandIndustry'));
// Preserve a manual export; order only the five missing local links, once. Synthetic
// recipe topology isolates the routing rule without changing the engine income fixture.
const supply=fixtures(after,{restaurant:true});supply.lines.Tobacco.specs.producedMaterials=['Food'];
supply.lines.Tobacco.warehouses.Aevum.materials.Food.exports=[{division:'Restaurant',city:'Aevum',amount:'3'}];
await supply.prepare();await supply.api.connectCashSuppliers(supply.ns);await supply.api.connectCashSuppliers(supply.ns);
assert.equal(supply.calls.filter(([m])=>m==='exportMaterial').length,5);
assert.equal(supply.lines.Tobacco.warehouses.Aevum.materials.Food.exports[0].amount,'3');
// Bribe or bill arrives after the manager quotes replacement, manual lineup changes, or insufficient temporary RAM.
for(const race of [f=>{f.corp.funds=1e9;},f=>{f.lines.Tobacco.d.thisCycleExpenses=f.corp.funds;},
  f=>{f.corp.nextState='START';},f=>{f.limitRam(23.6);},f=>{f.lines.Tobacco.products.delete('Prod v7');}]){
  const f=fixtures(after,{funds:1e12});for(const p of f.lines.Tobacco.products.values())p.cityData.Aevum.actualSellAmount=10;
  await f.prepare();f.intervene(()=>race(f));await f.api.manageProducts(f.ns);
  assert(f.lines.Tobacco.products.has('Prod v5'));assert(!f.calls.some(([m])=>m==='makeProduct'||m==='discontinueProduct'));
}
// A pending three-ingredient set (including products in an existing secondary division) cannot overdraw cash.
const poor=fixtures(after,{restaurant:true,funds:5000,unpaid:4000});await poor.prepare();await poor.api.manageOffice(poor.ns);poor.apply();
poor.ownedResearch.add('uPgrade: Fulcrum');await poor.cycle();
await poor.api.buyCashInputs(poor.ns);
const paid=poor.calls.filter(([m])=>m==='buyMaterial').reduce((s,[,div,city,name,rate])=>s+rate*10*poor.lines[div].warehouses[city].materials[name].marketPrice,0);
assert(Math.abs(paid-1000)<1e-6);assert(poor.calls.some(([m,d,,name,rate])=>m==='buyMaterial'&&d==='Restaurant'&&name==='Water'&&rate>0));
console.log(JSON.stringify({comparisons,
  modeledAdditionalCashProtectedOver10Minutes:api.plan().floor-base}));
}
