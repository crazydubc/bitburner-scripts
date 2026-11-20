// Node 24, Steam 3.0.1 engine (3162fd2). This runs outside the game.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {fixtures} from '../../2026-11-15-corporation-production/checks/cash-production.mjs'
import {source,build,section,industry,CorpEmployeeJob,MaterialInfo} from '../../2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs'
import {main as pay} from '../../../bin/bribe-faction.js'
const root=new URL('../../../',import.meta.url), current=readFileSync(new URL('corporation.js',root),'utf8')
const old=execFileSync('git',['show','f451753:corporation.js'],{cwd:root,encoding:'utf8'})
const cities=['Sector-12','Aevum','Volhaven','Chongqing','New Tokyo','Ishima'], hq=cities[0]
const names=['Nuoptimal Nootropic Injector Implants','Speech Processor Implants','Neural Accelerators','FocusWires']
const Product=build(source('Corporation/Product.ts'),{CorpEmployeeJob,MaterialInfo,IndustriesData:{Tobacco:industry},
  CityName:Object.fromEntries(cities.map((c,i)=>[i?c:'Sector12',c])),getRecordKeys:Object.keys,getRecordEntries:Object.entries,
  constructorsForReviver:{},getRandomIntInclusive:()=>35,createEnumKeyedRecord:(keys,fn)=>Object.fromEntries(Object.values(keys).map(k=>[k,fn(k)]))},'Product')
const applyAd=build('function '+section(source('Corporation/Division.ts'),'  applyAdVert(','  // Returns how much of a material').trim(),
  {getRandomIntInclusive:()=>2},'applyAdVert')
const drift=build('function '+section(source('Corporation/Division.ts'),'  processProductMarket(','  processSaleState(').trim(),
  {getRandomIntInclusive:()=>2,IndustryType:{Pharmaceutical:'Pharmaceutical',Software:'Software',Robotics:'Robotics'}},'processProductMarket')
const seats=build(section(source('Corporation/helpers.ts'),'export function calculateOfficeSizeUpgradeCost(','export function calculateMaxAffordableUpgrade('),
  {corpConstants:{officeInitialCost:4e9}},'calculateOfficeSizeUpgradeCost')
const start=Date.now(), salary=Number(source('Corporation/data/Constants.ts').match(/employeeSalaryMultiplier = ([\d.]+)/)[1])
let clock=start;Date.now=()=>clock
async function replay(code,{hours=8,ta=false,mode='mix',target=1.2e12,stepHours=2,locked=false,room=320,deadline=hours,competition=35,dilute=false}={}){
  clock=start;const f=fixtures(code,{funds:3e12,ta}), c=f.corp, ns=f.ns, l=f.lines.Tobacco, {d,products,offices,warehouses}=l
  Object.assign(c,{revenue:17.8e6,expenses:.3e6,investorShares:400e6,valuation:locked?50e12:120e12})
  f.history.finishAt=deadline===null?0:start+deadline*3600e3
  Object.assign(d,{numAdVerts:0,awareness:0,popularity:0,researchPoints:3133,researchFactor:industry.scienceFactor,
    productionMult:9.949,lastCycleRevenue:10.965e6,lastCycleExpenses:75957,getAdvertisingMultiplier:()=>1})
  const price=(k,lvl)=>k==='Wilson Analytics'?4e9*2**lvl:k==='Smart Factories'?2e9*1.06**lvl:names.includes(k)?1e9*1.06**lvl:1e25
  f.costs.upgradePrice=(k,v)=>((mode==='advert-only'&&k!=='Wilson Analytics') ||
    (mode==='production-only'&&k==='Wilson Analytics') || (mode==='design-only'))?1e25:price(k,v)
  f.costs.advert=['production-only','design-only'].includes(mode)?1e25:1e9
  f.costs.seats=(size,n)=>mode==='design-only'||mode==='advert-only'?1e25:seats(size,n)
  c.getAdvertisingMultiplier=()=>1+.005*(f.levels['Wilson Analytics']||0)
  for(const [i,k] of ['getEmployeeCreMultiplier','getEmployeeChaMult','getEmployeeIntMult','getEmployeeEffMult'].entries())
    c[k]=()=>1+.1*(f.levels[names[i]]||0)
  f.costs.applyAd=line=>applyAd.call(line,c)
  for(let i=0;i<18;i++)f.costs.applyAd(d)
  assert(Math.abs(1.06**18-2.854)<.001)
  for(const [key,o] of Object.entries(offices)){
    const n=key===hq?106:3;Object.assign(o,{size:n,numEmployees:n,totalExperience:n*89.508,avgMorale:99.8,avgEnergy:100})
    for(const jobs of [o.employeeJobs,o.employeeNextJobs]){
      for(const k in jobs)jobs[k]=0
      const vals=key===hq?[26,26,17,36,1]:[1,1,1,0,0]
      ;['Operations','Engineer','Business','Management','Research & Development'].forEach((k,i)=>jobs[k]=vals[i])
    }
    const w=warehouses[key];w.size=room;w.level=2
    for(const [n,stored] of Object.entries({Hardware:370.106,'AI Cores':21.563,'Real Estate':9943}))w.materials[n].stored=stored
    Object.assign(w.materials.Plants,{quality:122.27,marketPrice:2413})
  }
  products.clear();f.apply()
  const normal=d.getOfficeProductivity(offices[hq],{forProduct:true})*d.productionMult
  f.levels['Smart Factories']=Math.max(0,Math.round((19.380/normal-1)/.03))
  c.getProductionMultiplier=()=>1+.03*f.levels['Smart Factories']
  const qualitySupply=Object.fromEntries(cities.map(city=>[city,30*d.getOfficeProductivity(offices[city],{forProduct:true})*d.productionMult*c.getProductionMultiplier()]))
  function product(n,a,b){const p=new Product({name:n,createCity:hq,designInvestment:a,advertisingInvestment:b});p.marketTa2=ta;return p}
  f.costs.startProduct=product
  const ratings=[2172,2293,2317],prices=[75762,68518,75679],initial=['Prod v7','Prod v10','Prod v11']
  for(const [i,n] of initial.entries()){
    const j=offices[hq].employeeProductionByJob, t=product(n,1e9,1e9);t.createProduct(1e5,j);t.finishProduct(d)
    const p=product(n,1e9,1e9);p.createProduct(1e5,Object.fromEntries(Object.entries(j).map(([k,v])=>[k,v*ratings[i]/t.rating])));p.finishProduct(d)
    p.demand=19.38*((prices[i]-5*2413)/(p.rating/p.markup))**2/(.5*p.rating**.65*d.getBusinessFactor(offices[hq])*d.getAdvertisingFactors()[0]*.65)
    assert(p.demand>0 && p.demand<=100);products.set(n,p)
  }
  // Settle real orders and books before either manager may spend; outside income is
  // calibrated once against that same opening line, independent of the strategy.
  let other=0, net=0, earned=0, paid=0, invested=0, rep=0, openGoal=false, low=Infinity, resets=0
  const payouts=[], choices=[], design=[], history=[]
  for(let i=-8;i<hours*360;i++){
    clock=start+(i+1)*10000
    if (i>=0) {drift.call(d,1);d.popularity=Math.max(0,d.popularity-.0001)}
    if(i>=0 && i%(stepHours*360)===0 && i>0){f.restart();resets++;openGoal=true;rep=0}
    if(openGoal){
      Object.assign(f.route,{kind:'faction-rep',faction:'Daedalus',targetRep:target/1e9,updatedAt:clock,lastAugReset:f.reset.lastAugReset,lastNodeReset:f.reset.lastNodeReset})
      Object.assign(f.snapshot,{current_node:3,last_aug_reset:f.reset.lastAugReset,generated_at:clock,reset_planning:{version:1,reputation:{Daedalus:rep}}})
    }
    f.apply();c.nextState='START';await f.prepare();c.nextState='PURCHASE';await f.prepare()
    for(const w of Object.values(warehouses))d.updateWarehouseSizeUsed(w)
    await f.api.buyCashInputs(ns);let consumed=0
    for(const [city,w] of Object.entries(warehouses)){
      const m=w.materials.Plants;const add=Math.min(m.buyAmount*10,Math.max(0,w.size-w.sizeUsed)/MaterialInfo.Plants.size)
      if(dilute && add>0){
        const local=Math.min(add,qualitySupply[city])
        m.quality=(m.stored*m.quality+local*122.27+(add-local))/(m.stored+add)
      }
      m.stored+=add;consumed+=add
    }
    d.researchPoints+=.016*Object.values(offices).reduce((s,o)=>s+Math.sqrt(o.employeeProductionByJob['Research & Development']),0)
    const underway=[...products.values()].find(p=>!p.finished)
    c.state.nextName='PRODUCTION';d.processProducts(1,c)
    if(underway?.finished)underway.competition=competition
    c.nextState='EXPORT'
    const bank=c.funds
    if(i>=0){
      await f.api.manageOffice(ns);await f.api.manageProducts(ns);await f.api.growCashDivision(ns)
      invested+=bank-c.funds
      if(c.funds<bank&&choices.length<20)choices.push([i,f.api.plan().capitalNote||'existing policy',Math.round((bank-c.funds)/1e9)])
      for(const [fn,,ct,n,a,b] of f.calls)if(fn==='makeProduct')design.push([n,(a+b)/1e9])
    }
    c.nextState='SALE';await f.api.sellCashOutput(ns);c.state.nextName='SALE'
    const rev=d.processProducts(1,c)[0]/10,exp=consumed*2413/10+Object.values(offices).reduce((s,o)=>s+
      salary*o.numEmployees*(o.avgIntelligence+o.avgCharisma+o.avgCreativity+o.avgEfficiency+o.totalExperience/o.numEmployees)*.5,0)
    d.lastCycleRevenue=rev;d.lastCycleExpenses=exp
    if(i===-1){other=17.5e6-(rev-exp);c.funds=3e12;assert(Math.abs(products.get(initial[0]).cityData[hq].actualSellAmount-19.38)<.5)}
    c.revenue=rev+other;c.expenses=exp;net=c.revenue-exp
    if(i>=0){const income=10*(net>0?net*(1-c.dividendRate):net);earned+=income;c.funds+=income}
    if(i>=0 && openGoal){
      let reply,cb
      await pay({args:['Daedalus',target/1e9,5,c.investorShares],pid:42,getPortHandle:()=>({write:r=>reply=r}),atExit:h=>cb=h,
        singularity:{getFactionRep:()=>rep},corporation:{getCorporation:()=>c,getDivision:()=>d,getConstants:()=>({bribeThreshold:100e12,bribeAmountPerReputation:1e9}),
          bribe:(_,amount)=>{assert(amount<=c.funds);c.funds-=amount;rep+=amount/1e9;paid+=amount;return true}}})
      cb();assert.equal(typeof reply,'object')
      if(reply.success){payouts.push(i/360);openGoal=false;f.route.kind='done'}
    }
    if(i>=0){low=Math.min(low,c.funds);if((i+1)%360===0)history.push(Math.round(net/1e6))}
    f.calls.length=0
  }
  const expected=3e12+earned-invested-paid
  assert(Math.abs(c.funds-expected)<Math.max(2,Math.abs(c.funds)*1e-12),JSON.stringify({actual:c.funds,expected,earned,invested,paid}))
  return {ta,mode,resets,payouts,netM:+(net/1e6).toFixed(1),earnedB:Math.round(earned/1e9),investedB:Math.round(invested/1e9),
    paidB:paid/1e9,endB:Math.round(c.funds/1e9),minB:Math.round(low/1e9),history,design,choices}
}
for(const ta of [false,true]){
  const a=await replay(old,{ta}), b=await replay(current,{ta})
  console.log(JSON.stringify({ta,old:a,mix:b}))
  assert(b.netM>a.netM && b.earnedB>a.earnedB && b.earnedB-b.investedB>a.earnedB-a.investedB)
  assert(b.minB>=5 && a.paidB===2400 && b.paidB===3600 && b.resets===3)
}
for(const mode of ['design-only','advert-only','production-only']){
  const b=await replay(current,{mode})
  console.log(JSON.stringify({alternative:mode,netM:b.netM,earnedB:b.earnedB,paidB:b.paidB,endB:b.endB,investedB:b.investedB}))
}
const locked=await replay(current,{hours:2,stepHours:1,room:170,locked:true,competition:70,deadline:null,dilute:true})
assert.equal(locked.paidB,0);assert(locked.investedB>0 && locked.minB>=5 && locked.netM>17.5)
console.log(JSON.stringify({lockedValuation:{netM:locked.netM,earnedB:locked.earnedB,paidB:locked.paidB,investedB:locked.investedB}}))
const ending=await replay(current,{hours:.1,deadline:0})
assert.equal(ending.investedB,0);assert.deepEqual(ending.design,[])
for(const kind of ['employees','factory'])for(const fault of ['none','ram','invoice','payout','phase','private','price','lineup']){
  const f=fixtures(current,{funds:100e9,restaurant:true}), line=f.lines.Tobacco, lineup=JSON.stringify([...line.products.keys()])
  f.corp.nextState='EXPORT'
  f.costs.upgradePrice=(k,l)=>1e9*1.06**l
  f.intervene(()=>{
    if(fault==='ram')f.limitRam(23.6)
    if(fault==='invoice')f.lines.Restaurant.d.thisCycleExpenses=98e9
    if(fault==='payout')f.corp.funds=5e9
    if(fault==='phase')f.corp.nextState='SALE'
    if(fault==='private')f.corp.public=false
    if(fault==='price')f.costs.upgradePrice=()=>2e9
    if(fault==='lineup')line.products.delete('Prod v6')
  })
  const count=kind==='employees'?4:1
  const ok=await f.act('levelUpgrade','--line-capital','Tobacco',kind,2,JSON.stringify(Array(count).fill(1e9)),5e9,lineup)
  assert.equal(ok,fault==='none',kind+'/'+fault)
  assert.equal(f.calls.filter(([m])=>m==='levelUpgrade').length,fault==='none'?count*2:0)
}
console.log('Three installs, repeated payouts, locked valuation, near node exit and funding/phase/RAM race checks passed.')
