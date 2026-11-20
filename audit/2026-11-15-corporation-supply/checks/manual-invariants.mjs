// Exercise the two stateful operations that can affect an already-running company.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {main as helper} from '../../../bin/corpRun.js';
const code=readFileSync(new URL('../../../corporation.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
const h='Sector-12',t='Tobacco',c='Chemical',ag='Agriculture',standard='(-IPROD-IINV/10)';
const industries={Agriculture:{producedMaterials:['Plants','Food'],requiredMaterials:{Chemicals:.2}},
  Tobacco:{requiredMaterials:{Plants:1}},Chemical:{producedMaterials:['Chemicals'],requiredMaterials:{Plants:1}}};
for (const initial of [[],[[c,standard]],[[c,'3']],[[t,'2'],[c,standard]],[[c,'(IPROD+IINV/10)*(-1)'],[t,'2']]]) {
  const stocks={'AgriculturePlants':initial.map(([division,amount])=>({division,city:h,amount})),'ChemicalChemicals':[]};
  const writes=[];
  function rpc(_,method,...args) {
    if (args[0]==='--batch') return JSON.parse(args[1]).map(row=>rpc(_,method,...row));
    const [div,city,other,dest,mat,amount]=args;
    if (method==='getIndustryData') return industries[div];
    if (method==='getMaterial') return {exports:stocks[div+other]};
    assert.equal(city,h);assert.equal(dest,h);const routes=stocks[div+mat];
    if (method==='exportMaterial') {assert(!routes.some(r=>r.division===other));routes.push({division:other,city,amount});}
    else if (method==='cancelExportMaterial') {const i=routes.findIndex(r=>r.division===other);assert(i>=0);routes.splice(i,1);}
    else assert.fail(method);
    writes.push([method,other]);
  }
  const connect=Function('corpRun',code+"; for (const div of [div1,div2,div3]) {hasDivDB[div]={industry:div};hasWarehouseDB[div+'Sector-12']=true;} return connectCashSuppliers;")(rpc);
  const plan={};await connect({},plan);const count=writes.length;await connect({},plan);
  assert.equal(writes.length,count);assert.equal(stocks.ChemicalChemicals[0].division,ag);
  const plants=stocks.AgriculturePlants;
  if (initial[0]?.[1]==='3') assert.deepEqual(plants.map(r=>[r.division,r.amount]),[[c,'3'],[t,standard]]);
  else {assert.deepEqual(plants.map(r=>r.division),[t,c]);for(const [div,amt] of initial) assert.equal(plants.find(r=>r.division===div).amount,amt);}
}
async function upgrade(mutator=()=>{}) {
  const div={name:t,industry:t,cities:[h],products:['Prod v1'],thisCycleExpenses:2e9};
  const corp={public:false,nextState:'EXPORT',investorShares:450e6,divisions:[t],funds:100e9};
  const game={corp,div,price:20e9,progress:25,availableRam:Infinity,calls:[]};mutator(game);
  let close,result;
  await helper({args:['upgradeOfficeSize','--first-design',t,20e9,50e9,'EXPORT',450e6,12],pid:1,
    atExit:f=>close=f,getPortHandle:()=>({write:v=>result=v}),getFunctionRamCost:n=>n==='baseCost'?1.6:n.includes('get')?10:20,
    ramOverride:n=>Math.min(n,game.availableRam),corporation:{getCorporation:()=>corp,getDivision:()=>div,
      getProduct:()=>({developmentProgress:game.progress}),getOfficeSizeUpgradeCost:()=>game.price,
      upgradeOfficeSize:(...a)=>game.calls.push(a)}});
  close();assert.equal(result,game.calls.length>0);return game.calls;
}
assert.deepEqual(await upgrade(),[[t,h,12]]);
for (const change of [g=>g.corp.funds=60e9,g=>g.div.thisCycleExpenses=40e9,g=>g.corp.public=true,
  g=>g.corp.investorShares++,g=>g.corp.nextState='START',g=>g.price++,g=>g.progress=100,g=>g.progress=NaN,
  g=>g.div.products.push('Prod v2'),g=>g.availableRam=23.6]) assert.deepEqual(await upgrade(change),[]);
console.log('FIFO, custom export preservation, repeat setup, current equity, phase, bills, project and RAM guards passed.');
