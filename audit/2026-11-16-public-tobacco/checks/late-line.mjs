// Run with Node 24 and the v3.0.1 engine checkout. Test files are never installed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fixtures} from '../../2026-11-15-corporation-production/checks/cash-production.mjs';
import {source,build,section,industry,CorpEmployeeJob,MaterialInfo} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs';
const root=new URL('../../../',import.meta.url), previous=execFileSync('git',['show','d911381:corporation.js'],{cwd:root,encoding:'utf8'}),current=readFileSync(new URL('corporation.js',root),'utf8');
const cities=['Sector-12','Aevum','Volhaven','Chongqing','New Tokyo','Ishima'],hq=cities[0];
const Product=build(source('Corporation/Product.ts'),{CorpEmployeeJob,MaterialInfo,IndustriesData:{Tobacco:industry},CityName:Object.fromEntries(cities.map((c,i)=>[i?c:'Sector12',c])),
  getRecordKeys:Object.keys,getRecordEntries:Object.entries,constructorsForReviver:{},getRandomIntInclusive:()=>35,
  createEnumKeyedRecord:(keys,fn)=>Object.fromEntries(Object.values(keys).map(k=>[k,fn(k)]))},'Product');
const applyAd=build('function '+section(source('Corporation/Division.ts'),'  applyAdVert(','  // Returns how much of a material').trim(),{getRandomIntInclusive:()=>2},'applyAdVert');
const now=Date.now(), salary=Number(source('Corporation/data/Constants.ts').match(/employeeSalaryMultiplier = ([\d.]+)/)[1]);
const outsideIncome=new Map();
let time=now;Date.now=()=>time;
async function run(code,{funds=250e9,hours=6,ta=false,deadline=hours,goal=0,weak=false}={}) {
  time=now;const f=fixtures(code,{funds,ta}),l=f.lines.Tobacco,{d,offices,products}=l, c=f.corp, ns=f.ns, calls=f.calls;
  if(deadline!==null)f.history.finishAt=now+deadline*3600e3;
  Object.assign(d,{numAdVerts:0,awareness:0,popularity:0,researchPoints:658.559,researchFactor:industry.scienceFactor,productionMult:9.983,getAdvertisingMultiplier:()=>1});
  f.costs.advert=1e9;f.costs.wilson=4e9;c.getAdvertisingMultiplier=()=>1+.005*(f.levels['Wilson Analytics']||0);
  f.costs.applyAd=line=>applyAd.call(line,c);f.costs.applyAd(d);f.costs.applyAd(d);
  for(const [k,o] of Object.entries(offices)){
    const n=k===hq?106:3;Object.assign(o,{size:n,numEmployees:n,totalExperience:n*80.506});
    for(const jobs of [o.employeeJobs,o.employeeNextJobs]){
      for(const j in jobs)jobs[j]=0;
      const a=k===hq?[26,26,17,37]:[1,1,1,0];['Operations','Engineer','Business','Management'].forEach((j,i)=>jobs[j]=a[i]);
    }
    o.totalSalary=salary*n*(o.avgIntelligence+o.avgCharisma+o.avgCreativity+o.avgEfficiency+80.506);
    Object.assign(l.warehouses[k].materials.Plants,{quality:96.03,marketPrice:3117});
  }
  Object.assign(c,{revenue:8.65e6,expenses:.20e6});Object.assign(d,{lastCycleRevenue:4.051e6,lastCycleExpenses:99317});
  products.clear();f.apply();
  const nominal=d.getOfficeProductivity(offices[hq],{forProduct:true})*d.productionMult;
  f.levels['Smart Factories']=Math.max(0,Math.round((19.261/nominal-1)/.03));
  c.getProductionMultiplier=()=>1+.03*f.levels['Smart Factories'];
  const newProduct=(name,v,w)=>{const p=new Product({name,createCity:hq,designInvestment:v,advertisingInvestment:w});p.marketTa2=ta;return p};
  f.costs.startProduct=newProduct;
  for(const [name,rating,price] of [['Prod v2',weak?80:1898,46981],['Prod v13',1938,40366]]){
    const v=1e9,j=offices[hq].employeeProductionByJob,trial=newProduct(name,v,v);trial.createProduct(1e6,j);trial.finishProduct(d);
    const factors=Object.fromEntries(Object.entries(j).map(([k,x])=>[k,x*rating/trial.rating]));
    const p=newProduct(name,v,v);p.createProduct(1e6,factors);p.finishProduct(d);assert(Math.abs(p.rating-rating)<1e-5);
    // Use admissible demand/competition that reproduce the screenshot's price at 19.261/s.
    const volume=19.261*((price-5*3117)/(rating/p.markup))**2;
    const market=volume/(.5*rating**.65*d.getBusinessFactor(offices[hq])*d.getAdvertisingFactors()[0]);
    p.demand=weak&&name==='Prod v2'?35:market/(1-p.competition/100);assert(p.demand>0&&p.demand<=100);
    products.set(name,p);
  }
  const v14=newProduct('Prod v14',1e9,1e9),jobs=offices[hq].employeeProductionByJob;
  v14.createProduct(1,jobs);v14.createProduct(16.59/v14.developmentProgress-1,jobs);products.set(v14.name,v14);
  let spent=0,firstBribe=0,starts=0,retired=[],openingMargin,margin=0,bank=funds,low=funds,seen=0;
  const key=JSON.stringify([ta,weak]);
  const keepProduct=new Set(['Prod v2','Prod v13','Prod v14']);
  for(let i=0;i<Math.round(hours*360);i++){
    time+=10000;f.apply(); c.nextState='START';await f.prepare();c.nextState='PURCHASE';
    if(goal){Object.assign(f.route,{kind:'faction-rep',faction:'Daedalus',targetRep:goal/1e9,updatedAt:time,lastAugReset:f.reset.lastAugReset,lastNodeReset:f.reset.lastNodeReset});
      Object.assign(f.snapshot,{current_node:3,last_aug_reset:f.reset.lastAugReset,generated_at:time,reset_planning:{version:1,reputation:{Daedalus:0}}});}
    await f.prepare();
    for(const w of Object.values(l.warehouses)){w.materials.Plants.stored=0;d.updateWarehouseSizeUsed(w);}
    await f.api.buyCashInputs(ns);let units=0;
    for(const w of Object.values(l.warehouses)){w.materials.Plants.stored=w.materials.Plants.buyAmount*10;units+=w.materials.Plants.stored;}
    d.researchPoints+=.016*Object.values(offices).reduce((s,o)=>s+Math.sqrt(o.employeeProductionByJob['Research & Development']),0);
    c.state.nextName='PRODUCTION';d.processProducts(1,c);
    c.nextState='EXPORT';const cash=c.funds;await f.api.manageOffice(ns);await f.api.manageProducts(ns);await f.api.growCashDivision(ns);
    spent+=cash-c.funds;c.nextState='SALE';await f.api.sellCashOutput(ns);c.state.nextName='SALE';
    const rev=d.processProducts(1,c)[0]/10,exp=units*3117/10+Object.values(offices).reduce((s,o)=>s+o.totalSalary*.5,0);
    d.lastCycleRevenue=rev;d.lastCycleExpenses=exp;
    if(i===5){seen=d.products.get('Prod v2').cityData[hq].actualSellAmount;openingMargin=rev-exp;}
    if(i===5&&code===previous)assert(Math.abs(seen-19.261)<1.5,'HQ initial '+seen+' nominal '+nominal);
    if(!outsideIncome.has(key))outsideIncome.set(key,8.45e6-(rev-exp));
    c.revenue=rev+outsideIncome.get(key);c.expenses=exp;c.funds+=(c.revenue-c.expenses)*10*(1-c.dividendRate);
    for(const [m,div,n] of calls){if(m==='discontinueProduct'){retired.push(n);if(n==='Prod v14')assert(v14.finished);}if(m==='makeProduct')starts++;}
    if(i>Math.round(hours*360)-61)margin+=(c.revenue-c.expenses)/60;
    low=Math.min(c.funds,low);bank=c.funds;if(!firstBribe && bank-Math.max(5e9,600*exp)>=300e9)firstBribe=i+1;
    calls.length=0;
  }
  return {initialHQRate:+seen.toFixed(2),firstTobaccoM:+(openingMargin/1e6).toFixed(2),finalNetM:+(margin/1e6).toFixed(2),
    bankB:+(bank/1e9).toFixed(2),spentB:+(spent/1e9).toFixed(2),minB:+(low/1e9).toFixed(2),rp:Math.round(d.researchPoints),
    ad:d.numAdVerts,wilson:f.levels['Wilson Analytics']||0,firstBribeMinutes:firstBribe?+(firstBribe/6).toFixed(1):null,
    starts,retired,initialLineupStillSelling:[...keepProduct].filter(n=>products.has(n)&&products.get(n).cityData[hq].actualSellAmount>0),rotation:f.api.plan().rotation};
}
for(const ta of [false,true]){
  const old=await run(previous,{ta}),fixed=await run(current,{ta});
  console.log(JSON.stringify({ta,old,fixed}));
  assert(fixed.initialHQRate>19 && old.initialHQRate>19);
  assert(fixed.bankB>old.bankB && fixed.finalNetM>old.finalNetM);
  assert(fixed.starts<old.starts && fixed.rp>old.rp && fixed.ad>old.ad);
  assert(fixed.initialLineupStillSelling.includes('Prod v14'));
  const oldGoal=await run(previous,{ta,goal:300e9}),fixedGoal=await run(current,{ta,goal:300e9});
  console.log(JSON.stringify({goal:300,ta,oldGoal,fixedGoal}));
  assert(fixedGoal.firstBribeMinutes>0 && fixedGoal.firstBribeMinutes<oldGoal.firstBribeMinutes);
  assert(fixedGoal.spentB<=fixed.spentB && fixedGoal.bankB>oldGoal.bankB);
}
const weak=await run(current,{weak:true});
console.log(JSON.stringify({weakRetirements:weak.retired}));
assert.equal(weak.retired[0],'Prod v2','still rotate a weak seller when the new design can pay for downtime');

// Intervening user changes, an invoice or insufficient temporary RAM must not
// translate a prior quote into an actual purchase, even in another division.
for(const fn of ['hireAdVert','levelUpgrade','makeProduct']){
  for(const fault of ['none','invoice','cash','phase','private','lineup','ram','price'].filter(x=>fn!=='makeProduct'||x!=='price')){
    const f=fixtures(current,{funds:30e9,restaurant:true});f.costs.wilson=4e9;f.costs.advert=1e9;
    const l=f.lines.Tobacco, names=JSON.stringify([...l.products.keys()]);
    f.corp.nextState='EXPORT';
    f.intervene(()=>{
      if(fault==='cash')f.corp.funds=1e9;
      if(fault==='invoice')f.lines.Restaurant.d.thisCycleExpenses=28e9;
      if(fault==='phase')f.corp.nextState='START';
      if(fault==='private')f.corp.public=false;
      if(fault==='lineup'){l.products.set('Manual',l.products.get('Prod v7'));l.products.delete('Prod v7');}
      if(fault==='ram')f.limitRam(23.6);
      if(fault==='price')f.costs.advert=1.2e9;
    });
    const result=fn==='makeProduct' ? await f.act(fn,'--cash-project','Tobacco',hq,'Prod v8',1e9,'Prod v5',5e9,'EXPORT',names) :
      await f.act(fn,'--campaign','Tobacco',fn==='hireAdVert'?1e9:4e9,1e9,fn==='hireAdVert'?1:2,5e9,names);
    assert.equal(result,fault==='none',fn+': '+fault);
    assert.equal(f.calls.some(([m])=>m===fn),fault==='none',fn+': '+fault);
    if(fn==='makeProduct')assert.equal(l.products.has('Prod v5'),fault!=='none',fault);
  }
}
console.log('Checked live campaign/design guards, a profitable replacement, selling time, research and protected bribe cash.');
