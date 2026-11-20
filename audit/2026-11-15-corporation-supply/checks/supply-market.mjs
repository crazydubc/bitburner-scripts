// One market cycle = 10 seconds. Fixed market, employee stats and morale; no live save.
// Both managers receive the same paid-for seed footprint and the same round-one cheque.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Division,Warehouse,Material,MaterialInfo,materialNames,industry,sale,bare,build,section,source,CorpEmployeeJob} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';
import {main as homeHelper} from '../../../bin/corpRun.js';
import {getCorporationBribeReserve} from '../../../speedrun-policy.js';
const repo=new URL('../../../',import.meta.url), prev=execFileSync('git',['show','20d64bc:corporation.js'],{cwd:repo,encoding:'utf8'}), current=readFileSync(new URL('corporation.js',repo),'utf8');
const cities=['Sector-12','Aevum','Volhaven','Chongqing','New Tokyo','Ishima'], h=cities[0], one=()=>1;
const C={secondsPerMarketCycle:10,officeInitialCost:4e9,officeInitialSize:3,warehouseInitialCost:5e9,warehouseSizeUpgradeCostBase:1e9,
 valuationLength:10,initialShares:1e9,fundingRoundShares:[.1,.35,.25,.2],fundingRoundMultiplier:[3,2,2,1.5],bribeThreshold:100e12,bribeAmountPerReputation:1e9};
const deps={CorpEmployeeJob,MaterialInfo,CityName:Object.fromEntries(cities.map((c,i)=>[i?c:'Sector12',c])),getRecordKeys:Object.keys,getRecordEntries:Object.entries,getRecordValues:Object.values,
 getKeyList:()=>[],constructorsForReviver:{},getRandomIntInclusive:()=>75,createEnumKeyedRecord:(keys,fn)=>Object.fromEntries(Object.values(keys).map(k=>[k,fn(k)]))};
const salary=Number(source('Corporation/data/Constants.ts').match(/employeeSalaryMultiplier = ([\d.]+)/)[1]);
const recoup=build('function '+section(source('Corporation/Division.ts'),'  calculateRecoupableValue():','  updateWarehouseSizeUsed(').trim(),{corpConstants:C,CityName:{Sector12:h},getRecordKeys:Object.keys},'calculateRecoupableValue');
const officeType=build(source('Corporation/OfficeSpace.ts'),deps,'OfficeSpace');
const pick=(k,next)=>Function('return ('+section(source('Corporation/data/IndustryData.ts'),'  [IndustryType.'+k+']: ','  [IndustryType.'+next+']: ').split(']: ')[1].trim().replace(/,$/,'')+')')();
const specs={Agriculture:pick('Agriculture','Refinery'),Chemical:pick('Chemical','Computers'),Tobacco:industry};
const Product=build(source('Corporation/Product.ts'),{...deps,IndustriesData:specs},'Product');
const seatCost=build(section(source('Corporation/helpers.ts'),'export function calculateOfficeSizeUpgradeCost(','export function calculateMaxAffordableUpgrade('),{corpConstants:C},'calculateOfficeSizeUpgradeCost');
const warehouseCost=build(section(source('Corporation/Actions.ts'),'export function upgradeWarehouseCost(','export function upgradeWarehouse('),{corpConstants:C},'upgradeWarehouseCost');
const accept=build(section(source('Corporation/Actions.ts'),'export function acceptInvestmentOffer(','export function convertPriceString('),{corpConstants:C},'acceptInvestmentOffer');
const LongTermFundsSources=build(source('Corporation/data/FundsSource.ts'),{},'LongTermFundsSources');
const upgrades=build(source('Corporation/data/CorporationUpgrades.ts'),{CorpUpgradeName:new Proxy({},{get:(_,n)=>n})},'CorpUpgrades');
const records=n=>upgrades[n.replaceAll(' ','')];
const oldLoop=section(prev,'      await manageProducts(ns)\n      await updateHud(ns)','      await ns.corporation.nextUpdate();');
async function run(code,mult=1,{funds=249.253e9,max=1600,early=false}={}) {
 const old=code===prev, bn=mult===1?3:mult===.2?7:13;
 const Corporation=build(source('Corporation/Corporation.ts'),{...deps,corpConstants:C,LongTermFundsSources,currentNodeMults:{CorporationValuation:mult}},'Corporation');
 const levels={'Smart Storage':3,'Smart Factories':1}, owned=new Set(['Warehouse API','Office API']), research=new Set(), logs=[];
 const corp=Object.assign(Object.create(Corporation.prototype),{public:false,divisions:new Map(),funds,investorShares:bn===3?6e8:1e8,totalShares:bn===3?1.5e9:1e9,numShares:9e8,fundingRound:1,dividendRate:0,
  state:{nextName:'START'},valuationsList:[],totalAssets:0,previousTotalAssets:0,numberOfOfficesAndWarehouses:0,valuation:0,expenses:1e6,revenue:4e6,
  getEmployeeCreMultiplier:one,getEmployeeChaMult:one,getEmployeeIntMult:one,getEmployeeEffMult:one,getScientificResearchMult:one,
  getProductionMultiplier:()=>1+.03*(levels['Smart Factories']||0),getSalesMult:()=>1+.01*(levels['ABC SalesBots']||0)});
 let round=2,i=0,approved=0,offer=0,built=0,firstSale=0,firstSize=0,post=0,rp,plantQuality,afterHead=0,min=funds,beginCash=0,restores=[],salesAtFunding=0;
 const ns={format:{number:String},sleep:async()=>{},printf(){},ui:{renderTail(){}},clearLog(){}};
 const newOffice=(d,c,n=3)=>{const o=new officeType({city:c,size:n});Object.assign(o,{avgEnergy:100,avgMorale:100,totalExperience:0});d.offices[c]=o;corp.numberOfOfficesAndWarehouses++;};
 const newWh=(d,c,l=1)=>{const materials=Object.fromEntries(materialNames.map(n=>[n,new Material({name:n})]));
  d.warehouses[c]=Object.assign(Object.create(Warehouse.prototype),{city:c,level:l,size:100*l*(1+.1*levels['Smart Storage']),sizeUsed:0,materials,smartSupplyEnabled:false});corp.numberOfOfficesAndWarehouses++;};
 const newDiv=k=>{const d=Object.assign(Object.create(Division.prototype),specs[k],{name:k,industry:k,warehouses:{},offices:{},products:new Map(),numAdVerts:0,
  producedMaterials:specs[k].producedMaterials ?? [],researchPoints:0,researchFactor:specs[k].scienceFactor,awareness:0,popularity:0,lastCycleRevenue:0,lastCycleExpenses:0,thisCycleRevenue:0,thisCycleExpenses:0,
  getProductionMultiplier:one,getSalesMultiplier:one,getProductProductionMultiplier:one,getScientificResearchMultiplier:one,
  getEmployeeCreMultiplier:one,getEmployeeChaMultiplier:one,getEmployeeIntMultiplier:one,getEmployeeEffMultiplier:one,
  calculateRecoupableValue:recoup});
  newOffice(d,h);newWh(d,h);corp.divisions.set(k,d);return d;};
 const ag=newDiv('Agriculture');Object.assign(ag,{numAdVerts:2,awareness:6.05,popularity:2.03,researchPoints:60});
 for(const c of cities){if(c!==h){newOffice(ag,c);newWh(ag,c);}const o=ag.offices[c],w=ag.warehouses[c];w.level=3;w.size=390;o.size=o.numEmployees=4;o.totalExperience=300;
  for(const j of ['Operations','Engineer','Business','Management'])o.employeeJobs[j]=o.employeeNextJobs[j]=1;
  o.calculateEmployeeProductivity(corp,ag);
  for(const [n,q] of [['Hardware',700],['AI Cores',620],['Real Estate',42000]])Object.assign(w.materials[n],{stored:q,averagePrice:w.materials[n].marketPrice});
  ag.updateWarehouseSizeUsed(w);}
 ag.calculateProductionFactors();corp.updateTotalAssets();corp.previousTotalAssets=corp.totalAssets;corp.valuation=243.253e9/.3*mult;corp.valuationsList=Array(10).fill(corp.valuation);
 const info=d=>({name:d.name,industry:d.industry,cities:Object.keys(d.offices),products:[...d.products.keys()],maxProducts:3,makesProducts:!!d.makesProducts,numAdVerts:d.numAdVerts,
  researchPoints:d.researchPoints,thisCycleExpenses:d.thisCycleExpenses,lastCycleRevenue:d.lastCycleRevenue,lastCycleExpenses:d.lastCycleExpenses,awareness:d.awareness,popularity:d.popularity,productionMult:d.productionMult || 1});
 const company=()=>({public:false,divisions:[...corp.divisions.keys()],valuation:corp.valuation,investorShares:corp.investorShares,funds:corp.funds,expenses:corp.expenses,revenue:corp.revenue,nextState:corp.state.nextName,dividendRate:0,numShares:corp.numShares,totalShares:corp.totalShares});
 const resize=()=>{for(const d of corp.divisions.values())for(const w of Object.values(d.warehouses))w.size=w.level*100*(1+.1*levels['Smart Storage']);};
 function spend(n,source){assert(n<=corp.funds+1,'spent unavailable funds on '+source);corp.loseFunds(n,source);}
 const rpc=(_,fn,...a)=>{
  if(a[0]==='--first-design'){
    let cb,reply;
    return homeHelper({args:[fn,...a],pid:1,atExit:f=>cb=f,getPortHandle:()=>({write:r=>reply=r}),ramOverride:n=>n,
      getFunctionRamCost:f=>f==='baseCost'?1.6:f.includes('get')?10:20,
      corporation:new Proxy({},{get:(_,m)=>(...args)=>rpc(null,m,...args)})}).then(()=>{cb();assert.equal(typeof reply,'boolean');return reply;});
  }
  if(a[0]==='--batch'||a[0]==='--once'){const rows=JSON.parse(a[1]);if(a[0]==='--once')restores=rows.map(([d,c,m,,r])=>[d,c,m,r]);return rows.map(x=>rpc(_,fn,...x));}
  const [k,c,n,v,z]=a,d=corp.divisions.get(k),o=d?.offices[c],w=d?.warehouses[c],m=w?.materials[n],p=d?.products.get(n);
  switch(fn){
   case 'hasUnlock':return owned.has(k);case 'getUnlockCost':return k==='Export'?20e9:5e9;
   case 'purchaseUnlock':spend(rpc(_,'getUnlockCost',k),'upgrades');owned.add(k);return;
   case 'getConstants':return C;case 'getCorporation':return k==='--cash-plan'?{corporation:company(),offer:corp.getInvestmentOffer()}:company();
   case 'getInvestmentOffer':return k==='--bn3-review'?{corporation:company(),offer:corp.getInvestmentOffer()}:corp.getInvestmentOffer();
   case 'acceptInvestmentOffer':assert.equal(corp.fundingRound,1);approved=i;offer=corp.getInvestmentOffer().funds;accept(corp);post=corp.funds;
    rp=[ag.researchPoints,corp.divisions.get('Chemical')?.researchPoints||0];plantQuality=ag.warehouses[h].materials.Plants.quality;salesAtFunding=ag.warehouses[h].materials.Food.actualSellAmount;return true;
   case 'getIndustryData':return specs[k];case 'expandIndustry':spend(specs[k].startingCost,'division');newDiv(k);return;
   case 'getDivision':return info(d);case 'expandCity':spend(4e9,'office');newOffice(d,c);return;
   case 'purchaseWarehouse':spend(5e9,'warehouse');newWh(d,c);return;case 'hasWarehouse':return !!w;
   case 'getOffice':return o;case 'getOfficeSizeUpgradeCost':return seatCost(o.size,n);case 'upgradeOfficeSize':spend(seatCost(o.size,n),'office');o.size+=n;return;
   case 'hireEmployee':return o.hireRandomEmployee(n||'Unassigned');case 'setJobAssignment':return o.autoAssignJob(n,v);
   case 'getWarehouse':return w;case 'getUpgradeWarehouseCost':return warehouseCost(w.level,1);case 'upgradeWarehouse':spend(warehouseCost(w.level,1),'warehouse');w.level++;resize();return;
   case 'getUpgradeLevel':return levels[k]||0;case 'getUpgradeLevelCost':{const rec=records(k);return rec.basePrice*rec.priceMult**(levels[k]||0);}
   case 'levelUpgrade':spend(rpc(_,'getUpgradeLevelCost',k),'upgrades');levels[k]=(levels[k]||0)+1;resize();return;
   case 'getHireAdVertCount':return d.numAdVerts;case 'getHireAdVertCost':return 1e9*1.06**d.numAdVerts;case 'hireAdVert':{
    spend(rpc(_,'getHireAdVertCost',k),'advert');const ad=1+.005*(levels['Wilson Analytics']||0);d.numAdVerts++;d.awareness=(d.awareness+3*ad)*1.005*ad;d.popularity=(d.popularity+ad)*1.01*ad;return;}
   case 'getMaterialData':return MaterialInfo[k];case 'getMaterial':return {...m,demand:owned.has('Market Research - Demand')?m.demand:undefined,competition:owned.has('Market Data - Competition')?m.competition:undefined};
   case 'buyMaterial':assert(Number.isFinite(v)&&v>=0);m.buyAmount=v;return;case 'sellMaterial':return sale.sellMaterial(m,String(v),String(z));
   case 'exportMaterial':{const material=w.materials[z];assert(corp.divisions.get(n)?.warehouses[v]);assert(!material.exports.some(e=>e.division===n&&e.city===v));material.exports.push({division:n,city:v,amount:a[5]});return;}
   case 'cancelExportMaterial': {const material=w.materials[z];material.exports=material.exports.filter(e=>e.division!==n||e.city!==v);return;}
   case 'hasResearched':return research.has(k+c);case 'getResearchCost':return 5e4;case 'research':research.add(k+c);d.researchPoints-=5e4;return;
   case 'throwParty':case 'buyTea':return true;
   case 'makeProduct':{if(k==='--cash-project'){const [,div,city,name,invest,,kept]=a;if(corp.funds<2*invest+kept)return false;rpc(_,fn,div,city,name,invest,invest);return true;}
    spend(v+z,'product development');d.products.set(n,new Product({name:n,createCity:c,designInvestment:v,advertisingInvestment:z}));if(!built){built=i;firstSize=o.size;}return;}
   case 'getProduct':return {...p,...p.cityData[c],productionCost:p.cityData[c].productionCost};
   case 'sellProduct':return sale.sellProduct(p,c,String(v),String(z),false);
   default:throw Error('unknown '+fn+' '+a);
  }
 };
 const api=Function('corpRun','log','recordRunEvents','getCorporationBribeReserve','mult','bn',bare(code)+
  'bn3Reset=companyReset={currentNode:bn,lastAugReset:1,lastNodeReset:1};bnMults={CorporationValuation:mult,CorporationDivisions:1};updateHud=async()=>{};'+
  'return {prep,run2:async ns=>{let round=2;'+(old?oldLoop:'return await runSupplyPhase(ns);')+';return round;},run3:async ns=>{'+
  "const phase=(await getCorp(ns)).nextState;if(phase==='START'){await teaParty(ns);await spendRP(ns);}else await runCashPhase(ns,3);}"+
  ' ,status:()=>fundingStatus}')(rpc,(_,msg)=>logs.push(msg),async()=>{},getCorporationBribeReserve,mult,bn);
 for(i=1;i<=max;i++){
  for(const phase of ['START','PURCHASE','PRODUCTION','EXPORT','SALE']){
   corp.state.nextName=phase;
   if(await api.prep(ns)) {if(round===2)round=await api.run2(ns);else await api.run3(ns);}
   if(phase==='START'){
    let rev=0,exp=0;
    for(const d of corp.divisions.values()){
     for(const o of Object.values(d.offices)){Object.assign(o.employeeJobs,o.employeeNextJobs);o.calculateEmployeeProductivity(corp,d);o.totalSalary=salary*(o.numEmployees*(o.avgIntelligence+o.avgCharisma+o.avgCreativity+o.avgEfficiency)+o.totalExperience);}
     rev+=d.thisCycleRevenue;exp+=d.thisCycleExpenses;d.lastCycleRevenue=d.thisCycleRevenue/10;d.lastCycleExpenses=d.thisCycleExpenses/10;d.thisCycleRevenue=0;d.thisCycleExpenses=Object.values(d.offices).reduce((s,o)=>s+o.totalSalary,0);
    }
    corp.gainFunds(rev,'operating revenue');corp.loseFunds(exp,'operating expenses');corp.revenue=rev/10;corp.expenses=exp/10;
    corp.updateTotalAssets();corp.cycleValuation=corp.determineCycleValuation();corp.determineValuation();min=Math.min(min,corp.funds);
    if(approved && early)break;
   } else {
    for(const d of corp.divisions.values())d.resetImports(phase);
    for(const d of corp.divisions.values()){
     const [r,e]=d.processMaterials(1,corp);const [v]=d.processProducts(1,corp);d.thisCycleRevenue+=r+v;d.thisCycleExpenses+=e;
     if(d.name==='Tobacco' && phase==='SALE' && d.products.get('Prod v1')?.cityData[h].actualSellAmount>0 && !firstSale){firstSale=i;afterHead=d.offices[h].size;beginCash=corp.funds;}
    }
    if(phase==='PURCHASE'){for(const row of restores)rpc(null,'buyMaterial',...row);restores=[];}
   }
  }
  if(firstSale || (approved&&early))break;
 }
 const b=x=>+(x/1e9).toFixed(2);
 return {approved,offerB:b(offer),postB:b(post),built,firstSale,firstSize,afterHead,firstSaleCashB:b(beginCash),minCashB:b(min),rp:rp?.map(Math.floor),plantQuality:Math.round(plantQuality||0),sold:salesAtFunding,phase:round,status:api.status()};
}
const former=await run(prev), updated=await run(current);
console.log(JSON.stringify({former,updated}));
assert(updated.approved && updated.firstSale && updated.rp[0]>=700 && updated.rp[1]>=390);
assert(former.firstSale>0 && updated.firstSale<former.firstSale && updated.offerB>former.offerB && updated.sold>0 && updated.minCashB>0);
for (const [mult,balance] of [[.2,249.253e9],[.001,249.253e9],[.2,45e9],[.001,27.2e9]]) {
  const res=await run(current,mult,{funds:balance,max:1800,early:mult===.2&&balance>100e9});console.log(JSON.stringify({mult,startB:balance/1e9,...res}));
  if (mult===.2 && balance>100e9) assert(res.approved && res.sold>0 && res.rp[0]>=700 && res.rp[1]>=390);
  else assert(res.built && res.firstSale && !res.approved,'The company can sell Tobacco without surrendering equity for a token offer');
  assert(res.minCashB>0);
}
