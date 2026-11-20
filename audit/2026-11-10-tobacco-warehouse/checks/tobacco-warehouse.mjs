// Production manager and pinned Bitburner purchase/export/production/sale code; no live save.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {main as corpMain} from '../../../bin/corpRun.js';
const root=new URL('../../../',import.meta.url), engine=resolve(process.argv[2]??'../bitburner-engine');
const source=f=>readFileSync(resolve(engine,'src',f),'utf8'), current=readFileSync(new URL('corporation.js',root),'utf8');
const bare=s=>s.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm,'').replace(/^export /gm,'');
const build=(text,deps,out)=>Function(...Object.keys(deps),bare(stripTypeScriptTypes(text,{mode:'transform'}))+';return '+out)(...Object.values(deps));
const section=(text,a,b)=>{const start=text.indexOf(a),end=text.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return text.slice(start,end);};
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
const MaterialInfo=build(source('Corporation/MaterialInfo.ts'),{},'MaterialInfo');
const {CorpEmployeeJob}=build(source('Corporation/Enums.ts'),{},'({CorpEmployeeJob})');
const constructorsForReviver={},materialNames=Object.keys(MaterialInfo);
const Material=build(source('Corporation/Material.ts'),{MaterialInfo,materialNames,constructorsForReviver},'Material');
const industry=Function('return ('+section(source('Corporation/data/IndustryData.ts'),'  [IndustryType.Tobacco]: ','  [IndustryType.Water]: ').split('  [IndustryType.Tobacco]: ')[1].trim().replace(/,$/,'')+')')();
const sale=build(section(source('Corporation/Actions.ts'),'export function convertPriceString(', 'export function setSmartSupply('),{},'({sellMaterial,sellProduct})');
const calculateMarkupMultiplier=build(source('Corporation/helpers.ts').slice(source('Corporation/helpers.ts').indexOf('export function calculateMarkupMultiplier(')),{},'calculateMarkupMultiplier');
const calculateEffectWithFactors=build(source('utils/calculateEffectWithFactors.ts'),{},'calculateEffectWithFactors');
const corpConstants={secondsPerMarketCycle:10,baseProductProfitMult:5,materialNames};
const deps={Material,MaterialInfo,CorpEmployeeJob,corpConstants,constructorsForReviver,calculateMarkupMultiplier,calculateEffectWithFactors,
 getKeyList:()=>[],getRecordKeys:Object.keys,getRecordEntries:Object.entries,getRecordValues:Object.values,dialogBoxCreate:assert.fail,exceptionAlert:assert.fail,throwIfReachable:assert.fail};
const Division=build(source('Corporation/Division.ts'),deps,'Division'), Warehouse=build(source('Corporation/Warehouse.ts'),deps,'Warehouse');
const city='Sector-12',name='Prod v1',boosts=['Hardware','Robots','AI Cores','Real Estate'];
const reported=[563.640,541.5,543.7,591.155],units=reported.map((space,i)=>Math.round(space/MaterialInfo[boosts[i]].size));
assert.deepEqual(units,[9394,1083,5437,118231]);assert.equal(MaterialInfo.Plants.size,.05);
function fixture(code,{packed=false,progress=100,staff=100,round=2,type='Tobacco'}={}) {
 const nameDiv=type, materials=Object.fromEntries(materialNames.map(n=>[n,new Material({name:n})]));
 const wh=Object.assign(Object.create(Warehouse.prototype),{city,materials,size:2240,sizeUsed:0,smartSupplyEnabled:false,smartSupplyStore:0});
 const office={city,totalSalary:0,employeeProductionByJob:{Operations:staff,Engineer:staff,Management:staff,Business:staff,'Research & Development':0}};
 const data={productionAmount:0,actualSellAmount:0,desiredSellAmount:0,desiredSellPrice:'',stored:0,productionLimit:null,effectiveRating:0,productionCost:0};
 const prod={name,creationCity:city,developmentProgress:progress,finished:progress===100,size:MaterialInfo.Plants.size,rating:50,markup:1,competition:50,demand:50,
   uiMarketPrice:{},requiredMaterials:{Plants:1},cityData:{[city]:data}};
 const div=Object.assign(Object.create(Division.prototype),industry,{name:nameDiv,industry:type,awareness:20,popularity:20,researchPoints:1e4,
   offices:{[city]:office},warehouses:{[city]:wh},products:new Map([[name,prod]]),producedMaterials:[],
   getScientificResearchMultiplier:()=>1,getSalesMultiplier:()=>1,getProductionMultiplier:()=>1,getProductProductionMultiplier:()=>1});
 const corp={funds:1e20,state:{nextName:'PURCHASE'},divisions:new Map([[nameDiv,div]]),getProductionMultiplier:()=>1,getSalesMult:()=>1,getScientificResearchMult:()=>1};
 if(packed)boosts.forEach((n,i)=>materials[n].stored=units[i]);
 div.updateWarehouseSizeUsed(wh);div.calculateProductionFactors();
 const calls=[],info={name:nameDiv,industry:type,makesProducts:true,products:[name]};
 const rpc=(_,fn,...a)=>{
   if(a[0]==='--batch')return JSON.parse(a[1]).map(args=>rpc(_,fn,...args));
   if(a[0]==='--once')return (async()=>{let finish,result;
     await corpMain({args:[fn,...a],pid:1,ramOverride:v=>v,getFunctionRamCost:f=>f==='baseCost'?1.6:f.endsWith('nextUpdate')?2:20,
       getPortHandle:()=>({write:v=>result=v}),atExit:f=>finish=f,corporation:{
         [fn]:(...args)=>rpc(_,fn,...args),nextUpdate:async()=>{materialsPhase('PURCHASE');return 'PURCHASE';}}});
     finish();assert.equal(result,true);return result;})();
   calls.push([fn,...a]);switch(fn) {
   case 'getCorporation':return {funds:corp.funds,divisions:[nameDiv],nextState:corp.state.nextName};
   case 'getWarehouse':return {size:wh.size,sizeUsed:wh.sizeUsed};
   case 'getProduct':{const p=div.products.get(a[2]);return {...p.cityData[city],rating:p.rating,developmentProgress:p.developmentProgress,size:p.size};}
   case 'getOffice':return office;case 'getDivision':return {...info,thisCycleExpenses:0,products:[...div.products.keys()]};case 'getIndustryData':return industry;
   case 'getUpgradeLevel':return 0;case 'hasResearched':return false;
   case 'getMaterialData':return MaterialInfo[a[0]];case 'getMaterial':return {...materials[a[2]]};
   case 'buyMaterial':assert(Number.isFinite(a[3])&&a[3]>=0);materials[a[2]].buyAmount=a[3];return;
   case 'sellMaterial':return sale.sellMaterial(materials[a[2]],String(a[3]),String(a[4]));
   case 'sellProduct':return sale.sellProduct(prod,a[1],String(a[3]),String(a[4]),false);
   default:assert.fail('Unexpected API '+fn);}};
 const ns={corporation:new Proxy({},{get:(_,fn)=>(...args)=>rpc(null,fn,...args)})};
 const manager=Function('corpRun','info','city',bare(code)+`;hasDivDB[info.name]=info;hasOfficeDB[info.name+city]=hasWarehouseDB[info.name+city]=true;
   researchedDB["Market Research - Demand"]=researchedDB["Market Data - Competition"]=true;investOffer={round:${round}};
   return {purchase,sell,optimizeMats,purchaseBoostMaterials:typeof purchaseBoostMaterials==="function"?purchaseBoostMaterials:null,
     getBoostMaterialTargets:typeof getBoostMaterialTargets==="function"?getBoostMaterialTargets:null,maxProduced};`)(rpc,info,city);
 const materialsPhase=(phase,cycles=1)=>{corp.state.nextName=phase;return div.processMaterials(cycles,corp);};
 const productPhase=phase=>{corp.state.nextName=phase;return prod.finished?div.processProduct(1,prod,corp):0;};
 // Real exporting division with an unconditional shipment; this is stronger than the IPROD-based route when consumption is zero.
 const upstream=Object.assign(Object.create(Division.prototype),div,{name:'Source',products:new Map()});
 const sourceWarehouse=Object.assign(Object.create(Warehouse.prototype),wh,{materials:Object.fromEntries(materialNames.map(n=>[n,new Material({name:n})]))});
 sourceWarehouse.materials.Plants.stored=1e4;sourceWarehouse.materials.Plants.exports=[{division:nameDiv,city,amount:'10'}];
 upstream.warehouses={[city]:sourceWarehouse};upstream.updateWarehouseSizeUsed(sourceWarehouse);corp.divisions.set('Source',upstream);
 const attemptImport=()=>{corp.state.nextName='EXPORT';const before=materials.Plants.stored;upstream.processMaterials(1,corp);return materials.Plants.stored-before;};
 return {manager,wh,materials,prod,data,div,calls,info,materialsPhase,productPhase,attemptImport,
  act:async method=>{const r=await manager[method](ns);return method==='optimizeMats'&&manager.purchaseBoostMaterials
    ?manager.purchaseBoostMaterials(ns):r;},targets:()=>manager.getBoostMaterialTargets(ns,nameDiv,city)};
}
export {Division, Warehouse, Material, MaterialInfo, materialNames, industry, sale, bare, build, section, source, CorpEmployeeJob};
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
const sumSpace=targets=>boosts.reduce((a,n)=>a+targets[n]*MaterialInfo[n].size,0);
if(process.argv.includes('--compare-baseline')){
 const historical=ref=>execFileSync('git',['show',ref+':corporation.js'],{cwd:root,encoding:'utf8'});
 // Exercise the January synchronous script, the 2.0 RAM helpers, August extraction/round change, and PR parent.
 for(const ref of ['24b6f09','214f981','83dbea2','c7efc82','f35f675']){
   const code=historical(ref);
   for(const [progress,staff] of [[90,100],[100,0]]) {
     const f=fixture(code,{progress,staff});await f.act('optimizeMats');f.materialsPhase('PURCHASE');
     assert.deepEqual(boosts.map(n=>Math.round(f.materials[n].stored)),units,ref);near(f.wh.sizeUsed,2239.995);
   }
   for(const [staff,round] of [[100,2],[10000,3],[10000,4],[1e10,2]]) {
     const a=fixture(code,{staff,round}),b=fixture(current,{staff,round});
     await a.act('optimizeMats');await b.act('optimizeMats');
     // Except for at most one whole unit when nearest rounding would consume reserved production space.
     const div=round>=4?100:10;
     const bought=(f,n)=>f.calls.find(([fn,,,mat,q])=>fn==='buyMaterial'&&mat===n&&q>0)?.[4]??0;
     for(const n of boosts)assert(Math.abs(bought(a,n)-bought(b,n))*div<=1+1e-7,ref+' '+n);
   }
 }
 const old=historical('f35f675');
 const f=fixture(old,{packed:true});sale.sellProduct(f.prod,city,'MAX','MP',false);
 for(let i=0;i<3;i++){await f.act('purchase');f.materialsPhase('PURCHASE');assert.equal(f.attemptImport(),0);f.productPhase('PRODUCTION');
   f.materialsPhase('SALE');assert.equal(f.productPhase('SALE'),0);near(f.wh.sizeUsed,2239.995);}
}
const startup=fixture(current,{progress:90}),running=fixture(current);
assert.deepEqual(await startup.targets(),await running.targets(),'Forecast the first product before it finishes, using the staffed office');
const reserve=await running.manager.maxProduced({},'Tobacco',city)*1.01;
assert(reserve>0&&reserve<224);
const normalBudget=2240-sumSpace(await running.targets());
assert(normalBudget>=reserve-1e-7&&normalBudget<reserve+1,'Keep the historical production reserve, not a fixed 10%');
await startup.act('optimizeMats');startup.materialsPhase('PURCHASE');assert(startup.wh.size-startup.wh.sizeUsed>=reserve-1e-7);
const idle=fixture(current,{staff:0});const idleReserve=2240-sumSpace(await idle.targets());
assert(idleReserve>=.1*1.01&&idleReserve<1,'R&D-only office retains seed space for at least one input and output');
const crowded=fixture(current,{progress:90});crowded.materials.Water.stored=10000;crowded.div.updateWarehouseSizeUsed(crowded.wh);
assert(sumSpace(await crowded.targets())<=2240-500-reserve+1e-7,'Other stored goods consume space too');
const busy=fixture(current,{staff:1e10});const demandSpace=await busy.manager.maxProduced({},'Tobacco',city)*1.01;
assert(demandSpace>224);assert(sumSpace(await busy.targets())<=Math.max(0,2240-demandSpace)+1e-8,'Keep larger production forecasts');
const multi=fixture(current,{staff:10000});multi.data.stored=45;
multi.div.products.set('Prod v2',{...multi.prod,name:'Prod v2',cityData:{[city]:{...multi.data,stored:132}}});
multi.div.products.set('Prod v3',{...multi.prod,name:'Prod v3',finished:false,developmentProgress:88,size:0,cityData:{[city]:{...multi.data,stored:0}}});
multi.div.updateWarehouseSizeUsed(multi.wh);
const historicalSpace=await multi.manager.maxProduced({},'Tobacco',city)*1.01;
const planned=2240-sumSpace(await multi.targets());assert(planned>=historicalSpace-1e-7&&planned<historicalSpace+1,'Two finished products and their unsold stock; in-progress v3 is not a third production line');
const f=fixture(current,{packed:true});near(f.wh.size-f.wh.sizeUsed,.005);assert.equal(f.attemptImport(),0);
boosts.forEach(n=>f.materials[n].buyAmount=5);await f.act('purchase');
assert(boosts.every(n=>f.materials[n].buyAmount===0));
assert(boosts.every(n=>f.materials[n].desiredSellPrice==='MP'&&f.materials[n].desiredSellAmount!=='MAX'));
f.materialsPhase('PURCHASE');assert.equal(f.materials.Plants.stored,0);
f.materialsPhase('SALE');assert(f.wh.size-f.wh.sizeUsed>=MaterialInfo.Plants.size);
await f.act('purchase');assert(f.materials.Plants.buyAmount>0);f.materialsPhase('PURCHASE');assert(f.materials.Plants.stored>0);
f.productPhase('PRODUCTION');assert(f.data.stored>0&&f.data.productionAmount>0);
assert(f.attemptImport()>0,'The reported warehouse now accepts imported Plants as well');
await f.act('sell');const revenue=f.productPhase('SALE');assert(revenue>0&&f.data.actualSellAmount>0,'Product revenue, not income from selling boosters');
assert.equal(f.wh.size,2240,'No warehouse purchase needed');
const guard=fixture(current,{packed:true});await guard.act('purchase');
const limit=await guard.targets();
for(let i=0;i<80;i++)guard.materialsPhase('SALE',i%2===0?20:1);
for(const n of boosts)assert(guard.materials[n].stored>=limit[n]-1e-7,'Lingering sale order must preserve '+n);
assert(guard.wh.size-guard.wh.sizeUsed>=2240-sumSpace(limit)-.01);
// The normal optimizer buys only in PURCHASE; its targets agree with the input-space recovery.
const normal=fixture(current,{packed:true});let receipts=0;
for(let i=0;i<3;i++){
  await normal.act('purchase');normal.materialsPhase('PURCHASE');normal.productPhase('PRODUCTION');
  await normal.act('optimizeMats');await normal.act('sell');normal.materialsPhase('SALE');receipts+=normal.productPhase('SALE');
}
assert(receipts>0&&normal.wh.size===2240);
const unrelated=fixture(current);unrelated.materials.Water.stored=2240/MaterialInfo.Water.size;unrelated.div.updateWarehouseSizeUsed(unrelated.wh);
await unrelated.act('purchase');assert(!unrelated.calls.some(([fn,,,mat])=>['buyMaterial','sellMaterial'].includes(fn)&&mat==='Water'));
const lopsided=fixture(current);lopsided.materials['Real Estate'].stored=448000;lopsided.div.updateWarehouseSizeUsed(lopsided.wh);
const desiredTotal=sumSpace(await lopsided.targets());await lopsided.act('purchase');
for(let i=0;i<90;i++)lopsided.materialsPhase('SALE',10);
assert(boosts.every(n=>lopsided.materials[n].buyAmount===0),'The recovery pass must not purchase boosters');
assert(lopsided.wh.sizeUsed>=desiredTotal-1e-5&&lopsided.wh.sizeUsed<desiredTotal+.05,'Only enough surplus space for the calculated batch');
const clean=fixture(current);await clean.act('purchase');assert(!clean.calls.some(([fn,,,mat])=>['buyMaterial','sellMaterial'].includes(fn)&&boosts.includes(mat)));
const other=fixture(current,{type:'Restaurant',progress:90});
near(sumSpace(await other.targets()),2239.995); // Same weights supplied to isolate the Tobacco-only policy.
const bad=fixture(current,{packed:true});bad.materials.Hardware.stored=NaN;
await bad.act('purchase');assert(!bad.calls.some(([fn,,,mat])=>['buyMaterial','sellMaterial'].includes(fn)&&boosts.includes(mat)));
console.log('Tobacco warehouse: working space, recovery of 2239.995/2240, imports, production, product sales and bounded booster orders passed.');
}
