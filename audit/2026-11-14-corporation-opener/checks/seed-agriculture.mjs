// Run with Node 24 and the engine checkout as argv[2]. This starts after the common
// six-city/four-seat/two-advert build. It is a controlled market, not a live save.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Division, Warehouse, Material, MaterialInfo, materialNames, sale, bare, build, section, source, CorpEmployeeJob}
  from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';

const root = new URL('../../../', import.meta.url);
const current = readFileSync(new URL('corporation.js', root), 'utf8');
const previous = execFileSync('git', ['show', 'a6d6073:corporation.js'], {cwd: root, encoding: 'utf8'});
const cities = ['Sector-12','Aevum','Volhaven','Chongqing','New Tokyo','Ishima'];
const CityName = Object.fromEntries(cities.map((c,i) => [i ? c : 'Sector12', c]));
const helpers = {CityName, CorpEmployeeJob, getRecordKeys:Object.keys, getRecordValues:Object.values,
  createEnumKeyedRecord:(keys, fn) => Object.fromEntries(Object.values(keys).map(k => [k, fn(k)])),
  getRecordEntries:Object.entries, constructorsForReviver:{}, getKeyList:()=>[], throwIfReachable:assert.fail};
const C = {officeInitialCost:4e9, warehouseInitialCost:5e9, warehouseSizeUpgradeCostBase:1e9, officeInitialSize:3,
  secondsPerMarketCycle:10, valuationLength:10, initialShares:1e9, fundingRoundShares:[.1,.35,.25,.2], fundingRoundMultiplier:[3,2,2,1.5]};
const seatCost = build(section(source('Corporation/helpers.ts'), 'export function calculateOfficeSizeUpgradeCost(',
  'export function calculateMaxAffordableUpgrade('), {corpConstants:C}, 'calculateOfficeSizeUpgradeCost');
const warehouseCost = build(section(source('Corporation/Actions.ts'), 'export function upgradeWarehouseCost(',
  'export function upgradeWarehouse('), {corpConstants:C}, 'upgradeWarehouseCost');
const accept = build(section(source('Corporation/Actions.ts'), 'export function acceptInvestmentOffer(',
  'export function convertPriceString('), {corpConstants:C}, 'acceptInvestmentOffer');
const LongTermFundsSources = build(source('Corporation/data/FundsSource.ts'), {}, 'LongTermFundsSources');
const Corporation = build(source('Corporation/Corporation.ts'), {...helpers, LongTermFundsSources, corpConstants:C,
  currentNodeMults:{CorporationValuation:1}}, 'Corporation');
const Office = build(source('Corporation/OfficeSpace.ts'), helpers, 'OfficeSpace');
const ag = Function('return (' + section(source('Corporation/data/IndustryData.ts'),
  '  [IndustryType.Agriculture]: ', '  [IndustryType.Refinery]: ').split(']: ')[1].trim().replace(/,$/,'') + ')')();
const upgrades = build(source('Corporation/data/CorporationUpgrades.ts'), {
  CorpUpgradeName:new Proxy({}, {get:(_, k) => String(k)})}, 'CorpUpgrades');
const upgradeByName = {'Smart Storage': upgrades.SmartStorage,'Smart Factories':upgrades.SmartFactories,'ABC SalesBots':upgrades.ABCSalesBots};
const one = () => 1;
const ns = {format:{number:String}};

async function run(manager, testCase) {
  const old = manager === previous, upgrades = Object.fromEntries(Object.keys(upgradeByName).map(k=>[k,0]));
  const offices = {}, warehouses = {};
  for (const city of cities) {
    const o = offices[city] = new Office({city,size:4});
    Object.assign(o,{numEmployees:4,totalExperience:300,avgMorale:100,avgEnergy:100,totalSalary:4500});
    o.employeeJobs.Unassigned = o.employeeNextJobs.Unassigned = 4;
    const materials = Object.fromEntries(materialNames.map(n => [n,new Material({name:n})]));
    for (const n of ['Water','Chemicals','Plants','Food']) materials[n].marketPrice *= testCase.price ?? 1;
    for (const n of ['Hardware','Robots','AI Cores','Real Estate']) materials[n].marketPrice *= testCase.boost ?? 1;
    warehouses[city] = Object.assign(Object.create(Warehouse.prototype),{city,level:1,size:100,sizeUsed:0,materials,smartSupplyEnabled:false});
  }
  const division = Object.assign(Object.create(Division.prototype), ag, {name:'Agriculture', industry:'Agriculture',
    researchFactor:ag.scienceFactor, researchPoints:testCase.rp ?? 0, numAdVerts:2, awareness:(3*1.005+3)*1.005, popularity:(1.01+1)*1.01,
    offices, warehouses, products:new Map(), getProductionMultiplier:one,getSalesMultiplier:one,getScientificResearchMultiplier:one,
    getEmployeeCreMultiplier:one,getEmployeeChaMultiplier:one,getEmployeeIntMultiplier:one,getEmployeeEffMultiplier:one,
    calculateRecoupableValue:()=>(ag.startingCost+5*(C.officeInitialCost+C.warehouseInitialCost))/2});
  division.calculateProductionFactors();
  const seed = 150e9 - ag.startingCost - 5*(C.officeInitialCost+C.warehouseInitialCost) - 2.06e9 - 6*seatCost(3,1);
  const corp = Object.assign(Object.create(Corporation.prototype), {funds:seed, divisions:new Map([[division.name,division]]),
    investorShares:5e8,totalShares:1.5e9,numShares:1e9,fundingRound:0,public:false,numSharesSold:0,
    state:{nextName:'START'}, revenue:0,expenses:0,valuationsList:[],valuation:0,totalAssets:0,numberOfOfficesAndWarehouses:12,
    getEmployeeCreMultiplier:one,getEmployeeChaMult:one,getEmployeeIntMult:one,getEmployeeEffMult:one,getScientificResearchMult:one,
    getProductionMultiplier:()=>1+.03*upgrades['Smart Factories'],getSalesMult:()=>1+.01*upgrades['ABC SalesBots'],
    gainFunds:function(n){this.funds+=n;}});
  corp.updateTotalAssets(); corp.previousTotalAssets=corp.totalAssets;
  corp.cycleValuation=corp.determineCycleValuation();corp.valuationsList=Array(10).fill(corp.cycleValuation);corp.determineValuation();
  let revenue=0, expenses=0, cycle=0, acceptCycle=null, amount=null, firstEligible=null, phase, spentGrowth=0;
  let buyRestores=[], minCash=seed, hqSales=0, maxCapital=0, minTarget=0, firstTobacco=null, postCash=null;
  let reservePlan=0;
  const info=()=>({name:division.name, industry:division.industry,cities,products:[],researchPoints:division.researchPoints,
    numAdVerts:2,makesProducts:false,thisCycleExpenses:expenses,productionMult:division.productionMult});
  const company=()=>({funds:corp.funds,public:corp.public,investorShares:corp.investorShares,valuation:corp.valuation,
    revenue:corp.revenue,expenses:corp.expenses,divisions:[division.name],nextState:phase});
  const upgradeCost=n=>upgradeByName[n].basePrice*upgradeByName[n].priceMult**upgrades[n];
  function api(fn,a) {
    const w=warehouses[a[1]], o=offices[a[1]], mat=w?.materials[a[2]];
    switch(fn) {
      case 'getCorporation':return company(); case 'getDivision':return info(); case 'getConstants':return C;
      case 'getIndustryData':return a[0]==='Agriculture'?ag:{startingCost:a[0]==='Tobacco'?20e9:70e9};
      case 'hasResearched':case 'hasUnlock':return false;
      case 'getUnlockCost':return a[0]==='Export'?20e9:5e9;
      case 'hasWarehouse':return !!w; case 'getWarehouse':return {size:w.size,level:w.level,sizeUsed:w.sizeUsed};
      case 'getOffice':return o; case 'setJobAssignment':return o.autoAssignJob(a[2],a[3]);
      case 'getUpgradeLevel':return upgrades[a[0]]; case 'getUpgradeLevelCost':return upgradeCost(a[0]);
      case 'getUpgradeWarehouseCost':return warehouseCost(w.level,1);
      case 'levelUpgrade':spend(upgradeCost(a[0]));upgrades[a[0]]++;resize();return true;
      case 'upgradeWarehouse':spend(warehouseCost(w.level,1));w.level++;resize();return;
      case 'getMaterialData':return MaterialInfo[a[0]]; case 'getMaterial':return {...mat};
      case 'buyMaterial':assert(Number.isFinite(a[3])&&a[3]>=0);mat.buyAmount=a[3];return;
      case 'sellMaterial':return sale.sellMaterial(mat,String(a[3]),String(a[4]));
      case 'getInvestmentOffer':return a[0]==='--bn3-review'?{offer:corp.getInvestmentOffer(),corporation:company()}:corp.getInvestmentOffer();
      case 'acceptInvestmentOffer':
        assert.deepEqual(a,['--if-current',corp.investorShares,corp.valuation,corp.funds,phase]);
        acceptCycle=cycle;amount=corp.getInvestmentOffer().funds;accept(corp);postCash=corp.funds-expenses;
        assert(postCash>=reservePlan);return true;
      default:assert.fail(fn);
    }
  }
  function resize(){for(const w of Object.values(warehouses))w.size=w.level*100*(1+.1*upgrades['Smart Storage']);}
  function spend(n){assert(corp.funds-expenses>=n+5e9-1e-3);corp.funds-=n;spentGrowth+=n;}
  function rpc(_ns, fn, ...a) {
    if (a[0]==='--batch'||a[0]==='--once') {
      const orders=JSON.parse(a[1]);
      if(a[0]==='--once')buyRestores=orders.map(([d,c,m,,rate])=>[d,c,m,rate]);
      return orders.map(row=>api(fn,row));
    }
    return api(fn,a);
  }
  // Use the actual old per-phase SalesBots block, not a guessed spend rate.
  const botBlock=section(previous,'      if (hasCompleteDivisionInfrastructure(div1)) {\n        const upgradeCost','      await ns.corporation.nextUpdate();');
  const m=Function('corpRun','log','recordRunEvents','info',bare(manager)+`
    bn3Reset={currentNode:3}; bnMults={CorporationValuation:1}; teaNeeded=false; indDataDB.Agriculture=${JSON.stringify(ag)};
    for (const c of cities) hasOfficeDB[div1+c]=hasWarehouseDB[div1+c]=true;
    return {refresh:offer=>{investOffer=offer;hasDivDB[div1]=info();pendingInputPurchases=0;},
      getMult,manageOffice,checkInvest,purchase,purchaseBoostMaterials,quoteBn3Stage,
      seedSales:${old?'null':'setSeedSales'},sell,
      grow:async ns=>{${old?'await warehouseUpgrade(ns);await manageRoundOneBoostMaterials(ns)':'await growSeedAgriculture(ns)'}},
      bots:async ns=>{${old?botBlock:''}}};`)(rpc,()=>{},async()=>{},info);
  const configured=new Set();
  for(cycle=1;cycle<=200&&!acceptCycle;cycle++){
    for(phase of ['START','PURCHASE','PRODUCTION','EXPORT','SALE']){
      corp.state.nextName=phase;
      m.refresh(corp.getInvestmentOffer());
      if(m.seedSales)await m.seedSales(ns,configured);
      if(phase==='START'){
        const stage=await m.quoteBn3Stage(ns,1,company(),C);
        minTarget=stage.minimum;
        reservePlan=20e9+5*(C.officeInitialCost+C.warehouseInitialCost)+10e9+2e9+10e9+Math.max(5e9,corp.expenses*30)+seatCost(3,7);
        if(!old)assert(Math.abs(stage.tobaccoCapital-reservePlan)<1);
        maxCapital=Math.max(maxCapital,corp.funds-expenses+corp.getInvestmentOffer().funds);
        if(!firstTobacco&&corp.revenue>0&&corp.funds-expenses+corp.getInvestmentOffer().funds>=reservePlan)firstTobacco=cycle;
        if(!firstEligible&&corp.revenue>0&&corp.funds-expenses+corp.getInvestmentOffer().funds>=stage.minimum)firstEligible=cycle;
        if(await m.checkInvest(ns)===2)break;
        for(const o of Object.values(offices)){
          Object.assign(o.employeeJobs,o.employeeNextJobs);o.calculateEmployeeProductivity(corp,division);
        }
        corp.funds+=revenue-expenses;corp.revenue=revenue/10;corp.expenses=expenses/10;revenue=expenses=0;
        corp.updateTotalAssets();corp.cycleValuation=corp.determineCycleValuation();corp.determineValuation();
        minCash=Math.min(minCash,corp.funds);
        expenses+=Object.values(offices).reduce((s,o)=>s+o.totalSalary,0);
        await m.bots(ns);
        continue; // The engine processes offices at START, material phases only on the other four updates.
      }
      if(phase==='PURCHASE'){await m.purchase(ns);await m.purchaseBoostMaterials(ns);}
      if(phase==='EXPORT'){await m.manageOffice(ns);await m.grow(ns);}
      if(phase==='SALE'&&old)await m.sell(ns);
      await m.bots(ns);
      const [r,e]=division.processMaterials(1,corp);revenue+=r;expenses+=e;
      if(phase==='PURCHASE'){for(const a of buyRestores)api('buyMaterial',a);buyRestores=[];}
      if(phase==='SALE')hqSales+=warehouses['Sector-12'].materials.Plants.actualSellAmount*10;
    }
  }
  assert(minCash>=5e9-.01);assert(hqSales>0);
  return {tobaccoEligible:firstTobacco,fullEligible:firstEligible,accepted:acceptCycle,offerB:amount&&Math.round(amount/1e9),
    spendB:+(spentGrowth/1e9).toFixed(2),minCashB:+(minCash/1e9).toFixed(2),maxCapitalB:+(maxCapital/1e9).toFixed(1),
    postCashB:postCash&&+(postCash/1e9).toFixed(1),targetB:+(minTarget/1e9).toFixed(1),upgrades};
}
for(const [name,opts] of Object.entries({standard:{},researched:{rp:60},expensiveBoosters:{boost:2},weakMarket:{price:.75}})){
  const before=await run(previous,opts), after=await run(current,opts);
  console.log(JSON.stringify({name,before,after}));
  assert(after.accepted&&after.accepted>=after.tobaccoEligible,name);
  if(after.fullEligible)assert.equal(after.accepted,after.fullEligible,name);
  assert(!before.accepted||(after.accepted&&after.accepted<before.accepted),name);
  assert.equal(after.upgrades['ABC SalesBots'],0);assert(after.spendB<before.spendB,name);
}
