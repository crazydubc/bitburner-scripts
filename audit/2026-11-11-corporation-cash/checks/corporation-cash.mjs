// Three divisions, six cities each, actual manager/RPC and official material purchase/sale code.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {main as corpMain} from '../../../bin/corpRun.js';
import {Division, Warehouse, Material, MaterialInfo, materialNames, sale, bare, source} from
  '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';

const root=new URL('../../../',import.meta.url), current=readFileSync(new URL('corporation.js',root),'utf8');
const previous=execFileSync('git',['show','7e70a86:corporation.js'],{cwd:root,encoding:'utf8'});
const cities=['Sector-12','Aevum','Volhaven','Chongqing','New Tokyo','Ishima'];
const names=['Agriculture','Chemical','Tobacco'], boosts=['Hardware','Robots','AI Cores','Real Estate'];
const data=Object.fromEntries([...names.map(name=>[name,name]),['Water Utilities','Water'],['Computer Hardware','Computers']]
  .map(([name,key])=>[name,Function('return '+source('Corporation/data/IndustryData.ts')
  .match(new RegExp('\\[IndustryType\\.'+key+'\\]: (\\{[\\s\\S]*?\\n  \\}),'))[1])()]));
const near=(a,b,message='')=>assert(Math.abs(a-b)<=.01,message||`${a} != ${b}`);

function fixture(code=current,{funds=20e9,unpaid=0,ready=false,which=names}={}) {
  const divisions=new Map(), calls=[], info=new Map();
  const corp={funds,state:{nextName:'PURCHASE'},divisions,getProductionMultiplier:()=>1,getSalesMult:()=>1,getScientificResearchMult:()=>1};
  let phaseRace=false,stopDuringOrder=false,portResult,exitHook;
  for(const name of which){
    const offices={},warehouses={};
    for(const city of cities){
      offices[city]={city,totalSalary:0,numEmployees:10,avgEnergy:100,maxEnergy:100,avgMorale:100,maxMorale:100,
        employeeProductionByJob:{Operations:1000,Engineer:1000,Management:1000,Business:1000,'Research & Development':0}};
      warehouses[city]=Object.assign(Object.create(Warehouse.prototype),{city,size:name==='Chemical'?500:2400,sizeUsed:0,
        materials:Object.fromEntries(materialNames.map(mat=>[mat,new Material({name:mat})])),smartSupplyEnabled:false,smartSupplyStore:0});
    }
    const products=new Map();
    if(name==='Tobacco')products.set('Prod v1',{name:'Prod v1',creationCity:'Sector-12',finished:ready,developmentProgress:ready?100:57.79,
      size:ready?.05:0,rating:50,requiredMaterials:{Plants:1},cityData:Object.fromEntries(cities.map(city=>[city,
        {stored:0,productionAmount:0,actualSellAmount:0,desiredSellAmount:0,desiredSellPrice:'MP',productionCost:3000}]))});
    const div=Object.assign(Object.create(Division.prototype),data[name],{name,industry:name,offices,warehouses,products,
      thisCycleExpenses:name===which[0]?unpaid:0,awareness:50,popularity:50,researchPoints:1000,
      getScientificResearchMultiplier:()=>1,getSalesMultiplier:()=>1,getProductionMultiplier:()=>1,getProductProductionMultiplier:()=>1});
    divisions.set(name,div);div.calculateProductionFactors();
    for(const wh of Object.values(warehouses))div.updateWarehouseSizeUsed(wh);
    info.set(name,{name,industry:name,cities,makesProducts:!!data[name].makesProducts,products:[...products.keys()]});
  }
  const process=phase=>{
    corp.state.nextName=phase;
    let cost=0,revenue=0;
    for(const div of divisions.values()){
      const [r,c]=div.processMaterials(1,corp);div.thisCycleExpenses+=c;cost+=c;revenue+=r;
    }
    corp.state.nextName={PURCHASE:'PRODUCTION',SALE:'START'}[phase]??phase;
    return {cost,revenue};
  };
  const rpc=(_,fn,...args)=>{
    if(args[0]==='--batch'){
      const result=JSON.parse(args[1]).map(a=>rpc(_,fn,...a));
      if(phaseRace&&fn==='getDivision')corp.state.nextName='START';
      return result;
    }
    if(args[0]==='--once')return (async()=>{
      await corpMain({pid:1,args:[fn,...args],atExit:f=>exitHook=f,getPortHandle:()=>({write:v=>portResult=v}),ramOverride:v=>v,
        getFunctionRamCost:n=>n==='baseCost'?1.6:n.endsWith('nextUpdate')?2:20,
        corporation:{buyMaterial:(...a)=>rpc(_,fn,...a),nextUpdate:async()=>{
          if(stopDuringOrder){exitHook();throw Error('Interrupted order');}
          const next=corp.state.nextName;if(next==='PURCHASE')process(next);return next;
        }}});
      exitHook();if(typeof portResult==='string'&&portResult.startsWith('ERROR:'))throw Error(portResult);
      return portResult;
    })();
    calls.push([fn,...args]);
    const [name,city,mat,q]=args,div=divisions.get(name),wh=div?.warehouses[city],material=wh?.materials[mat];
    switch(fn){
      case 'getCorporation':return {funds:corp.funds,divisions:[...divisions.keys()],nextState:corp.state.nextName,
        public:false,revenue:40e6,expenses:0};
      case 'getDivision':return {...info.get(name),thisCycleExpenses:div.thisCycleExpenses};
      case 'hasWarehouse':return !!wh;
      case 'getWarehouse':return {size:wh.size,sizeUsed:wh.sizeUsed};
      case 'getOffice':return div.offices[city];
      case 'getIndustryData':return data[name];
      case 'getMaterialData':return MaterialInfo[name];
      case 'getMaterial':return {...material,desiredBuyAmount:material.buyAmount};
      case 'getProduct':{const p=div.products.get(mat);return {...p,...p.cityData[city]};}
      case 'getUpgradeLevel':return 0;
      case 'hasResearched':return false;
      case 'buyMaterial':assert(Number.isFinite(q)&&q>=0);material.buyAmount=q;return;
      case 'sellMaterial':return sale.sellMaterial(material,String(q),String(args[4]));
      case 'buyTea':corp.funds-=div.offices[city].numEmployees*500000;return true;
      case 'throwParty':corp.funds-=div.offices[city].numEmployees*mat;return 1+mat/1e7;
      default:assert.fail('Unexpected RPC '+fn);
    }
  };
  const manager=Function('corpRun','infos','log',bare(code)+`;investOffer={round:2,funds:0};bnMults={CorporationValuation:1};
    for(const info of infos){hasDivDB[info.name]=info;for(const city of info.cities)hasOfficeDB[info.name+city]=hasWarehouseDB[info.name+city]=true;}
    return {optimizeMats,purchase,corpFunds,teaParty,checkInvest,purchaseBoostMaterials:typeof purchaseBoostMaterials==='function'?purchaseBoostMaterials:null,
      review:()=>investmentReview,
      stopBoostPurchases:typeof stopBoostPurchases==='function'?stopBoostPurchases:null};`)(rpc,[...info.values()],()=>{});
  const assets=()=>[...divisions.values()].flatMap(div=>cities.flatMap(city=>boosts.map(mat=>div.warehouses[city].materials[mat])));
  return {corp,divisions,calls,manager,process,assets,act:async method=>{const r=await manager[method]({});
      return method==='optimizeMats'&&manager.purchaseBoostMaterials?manager.purchaseBoostMaterials({}):r;},
    setPhaseRace:()=>phaseRace=true,interrupt:()=>stopDuringOrder=true,
    unpaid:()=>[...divisions.values()].reduce((sum,div)=>sum+div.thisCycleExpenses,0)};
}

const old=fixture(previous);await old.act('purchase');await old.act('optimizeMats');old.process('PURCHASE');
const oldBalance=old.corp.funds-old.unpaid();assert(oldBalance < -50e9,'Reproduce borrowing for boosters during first-product design');

const fixed=fixture();await fixed.act('purchase');await fixed.act('optimizeMats');
const initialBills=fixed.unpaid();
near(fixed.corp.funds,20e9,'Purchases are billed at START, not immediately');
assert(fixed.unpaid()<=15e9+.01);assert(fixed.corp.funds-fixed.unpaid()>=5e9-.01);
assert(fixed.assets().every(m=>m.buyAmount===0),'No booster buy rate remains after PURCHASE');
const before=fixed.assets().map(m=>m.stored);
fixed.process('PURCHASE');assert.deepEqual(fixed.assets().map(m=>m.stored),before,'A second unattended cycle cannot repeat the booster order');
assert(await fixed.act('corpFunds')<=.01,'Capital purchases cannot spend the billed material money again');

for(const funds of [-91.883e9,0,5e9,NaN]){
  const f=fixture(current,{funds});await f.act('optimizeMats');
  assert(f.assets().every(m=>m.stored===0&&m.buyAmount===0),'Never buy boosters with unavailable cash');
}
const billed=fixture(current,{funds:20e9,unpaid:13e9});await billed.act('optimizeMats');
assert(billed.unpaid()<=15e9+.01);near(await billed.act('corpFunds'),0);
const inputs=fixture(current,{ready:true});await inputs.act('purchase');await inputs.act('optimizeMats');
assert(inputs.unpaid()<=15e9+.01,'Fund Plants/other recipe inputs before boosters');
assert(inputs.divisions.get('Tobacco').warehouses['Sector-12'].materials.Plants.stored>0);
const dualUse=fixture(current,{which:['Water Utilities']});await dualUse.act('purchase');await dualUse.act('optimizeMats');
assert(Object.values(dualUse.divisions.get('Water Utilities').warehouses).every(wh=>wh.materials.Hardware.stored>0),
  'Do not cancel Hardware recipe inputs while balancing boosters');
assert(dualUse.unpaid()<=15e9+.01);
const produced=fixture(current,{which:['Computer Hardware']});
for(const wh of Object.values(produced.divisions.get('Computer Hardware').warehouses))
  sale.sellMaterial(wh.materials.Hardware,'MAX','MP');
await produced.act('purchase');await produced.act('optimizeMats');
assert(Object.values(produced.divisions.get('Computer Hardware').warehouses).every(wh=>wh.materials.Hardware.desiredSellAmount==='MAX'),
  'Do not replace manufactured Hardware sales with booster retention orders');
const rich=fixture(current,{funds:1e15});await rich.act('optimizeMats');assert(rich.unpaid()>15e9);
assert(Object.values(rich.divisions.get('Tobacco').warehouses).every(wh=>boosts.every(n=>wh.materials[n].stored>0)),
  'Adequate cash retains all four Tobacco booster targets');
const planned=fixture(current,{funds:1e15});planned.corp.state.nextName='EXPORT';
await planned.manager.optimizeMats({});assert(planned.assets().every(m=>m.stored===0&&m.buyAmount===0));
planned.corp.state.nextName='PURCHASE';planned.corp.funds=6e9;planned.assets().forEach(m=>m.marketPrice*=2);
await planned.act('purchaseBoostMaterials');assert(planned.unpaid()<=1e9+.01,'Reprice/rebudget the prepared targets at PURCHASE');

const stale=fixture();stale.assets().forEach(m=>m.buyAmount=5000);await stale.act('stopBoostPurchases');stale.process('PURCHASE');
assert(stale.assets().every(m=>m.stored===0&&m.buyAmount===0),'Clear old standing orders in every managed city on restart');
const late=fixture();late.corp.state.nextName='SALE';await late.act('optimizeMats');
assert(late.assets().every(m=>m.stored===0&&m.buyAmount===0),'A late plan must not leave rates waiting for a later purchase');
const race=fixture();race.setPhaseRace();await race.act('optimizeMats');
assert(race.assets().every(m=>m.stored===0&&m.buyAmount===0),'A START transition invalidates the cash/bills snapshot');
const interrupted=fixture();interrupted.interrupt();await assert.rejects(interrupted.act('optimizeMats'),/Interrupted order/);
assert(interrupted.assets().every(m=>m.buyAmount===0),'atExit cancels even an interrupted order');

// The post-design snapshot: preserve existing productive assets while cash recovers naturally.
const debt=fixture(current,{funds:-72e9,which:['Tobacco'],ready:true});
for(const wh of Object.values(debt.divisions.get('Tobacco').warehouses)){
  [6112.783333333,0,12604.011286646699,114859.4].forEach((q,i)=>wh.materials[boosts[i]].stored=q);
  debt.divisions.get('Tobacco').updateWarehouseSizeUsed(wh);
}
await debt.act('optimizeMats');
assert(debt.assets().every(m=>m.buyAmount===0));
assert(debt.assets().filter(m=>m.stored>0).every(m=>m.desiredSellAmount!=='MAX'),'No blanket debt liquidation');
const health=fixture(current,{funds:20e9,unpaid:19.999e9});
for(const div of health.divisions.values())for(const office of Object.values(div.offices))office.avgEnergy=office.avgMorale=10;
await health.act('teaParty');near(health.corp.funds,20e9,'Do not spend outstanding bills on unaffordable parties');

// Investment reviews pause booster spending while continuing to buy production inputs.
const review=fixture(current,{ready:true});await review.act('checkInvest');
assert.equal(review.manager.review()?.round,2,'The real round-two policy starts the review');
await review.act('purchase');await review.act('optimizeMats');review.process('PURCHASE');
assert(review.assets().every(m=>m.buyAmount===0&&m.stored===0));
assert(review.divisions.get('Tobacco').warehouses['Sector-12'].materials.Plants.stored>0);
assert.equal(await review.act('corpFunds'),0);
for(const div of review.divisions.values())for(const office of Object.values(div.offices))office.avgEnergy=office.avgMorale=90;
await review.act('teaParty');assert(review.calls.some(([fn])=>fn==='buyTea'));

// Run the actual round-two PURCHASE block with Agriculture blocked. Tobacco must still rebalance.
const block=current.slice(current.indexOf('      if (nState === "PURCHASE") {',current.indexOf('    while (round === 2)')),
  current.indexOf('      if (nState === "START") {',current.indexOf('    while (round === 2)')));
let selected;
await Object.getPrototypeOf(async function(){}).constructor('purchaseBoostMaterials',`const ns={},nState='PURCHASE',div1='Agriculture',div2='Chemical',div3='Tobacco',industries=['Agriculture','Chemical','Tobacco'];
  const hasDivDB={},hasDiv2=false,teaNeeded=true;
  const purchase=async()=>{},corpFunds=async()=>0,corpRun=async(_,fn)=>fn==='getMaterial'?{stored:0}:fn==='getOffice'?{employeeJobs:{Business:0}}:1e9;
  ${block}`)(async(_,divs)=>selected=divs);
assert.deepEqual(selected,['Tobacco']);
console.log(JSON.stringify({oldBalanceAfterStart:oldBalance,fixedBoosterAndInputBills:initialBills,cashBeforeStart:fixed.corp.funds,
  healthyCashAfterStart:fixed.corp.funds-initialBills,scope:'3 divisions / 18 warehouses, official purchase processing'}));
console.log('Shared cash budget, unpaid bills, inputs, interrupted/late/repeated orders, restart, health reserve and independent Tobacco routing passed.');
