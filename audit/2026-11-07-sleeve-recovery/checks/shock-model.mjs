// Deterministic comparison using the production planner and the official engine's decay rates.
// node audit/2026-11-07-sleeve-recovery/checks/shock-model.mjs ../bitburner-engine [--write]
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {planSleeveRecovery, getSleeveRepWorkerOrder, assignSleeveRepTargets} from '../../../sleeve.js';
const repo = new URL('../../../', import.meta.url), engine = resolve(process.argv[2] ?? '../bitburner-engine');
const source = path => readFileSync(resolve(engine, path), 'utf8');
function method(path, signature) {
  const s=source(path), i=s.indexOf('  '+signature), j=s.indexOf('\n  }',i);
  assert(i>=0&&j>i);return stripTypeScriptTypes('function '+s.slice(i,j+4).trim());
}
const intel = Function(stripTypeScriptTypes(source('src/PersonObjects/formulas/intelligence.ts')).replace('export ', '')+';return calculateIntelligenceBonus;')();
const ms=Number(source('src/Constants.ts').match(/MilliPerCycle:\s*(\d+)/)[1]);
const processSleeve=Function('CONSTANTS','calculateIntelligenceBonus',method('src/PersonObjects/Sleeve/Sleeve.ts','process(numCycles')+';return process;')({MilliPerCycle:ms},intel);
const recover=Function('calculateIntelligenceBonus',method('src/PersonObjects/Sleeve/Work/SleeveRecoveryWork.ts','process(sleeve:')+';return process;')(intel);
const shockBonus=Function(method('src/PersonObjects/Sleeve/Sleeve.ts','shockBonus()')+';return shockBonus;')();
const augGate=Function('Player','formatSleeveShock',method('src/PersonObjects/Sleeve/Sleeve.ts','checkPreconditionsOfPurchasingAugmentations()')+';return checkPreconditionsOfPurchasingAugmentations;')({bitNodeOptions:{}},String);
assert.equal(augGate.call({shock:0.00001}).success,false);assert.equal(augGate.call({shock:0}).success,true);
// The engine explicitly excludes money from shock scaling for crime and company work.
const scaleSource=source('src/Work/WorkStats.ts').match(/export const scaleWorkStats[\s\S]*?\n};/)[0];
const scale=Function(stripTypeScriptTypes(scaleSource).replace('export ','')+';return scaleWorkStats;')();
const crimePath='src/PersonObjects/Sleeve/Work/SleeveCrimeWork.ts';
const getExp=Function('scaleWorkStats','calculateCrimeWorkStats',method(crimePath,'getExp(sleeve:')+';return getExp;')(
  scale,()=>({money:25,hackExp:1}));
function crimeReturn(shock) {
  const player={karma:0,numPeopleKilled:0};let earned;
  const process=Function('Player','applySleeveGains',method(crimePath,'process(sleeve:')+';return process;')(player,(_,gains)=>earned=gains);
  process.call({cyclesWorked:0,tasksCompleted:0,cyclesNeeded:()=>1,getCrime:()=>({successRate:()=>1,karma:3,kills:1}),
    getExp,resolveNextCompletion(){}},{shock,shockBonus,syncBonus:()=>1},2);
  return {money:earned.money,karma:player.karma,xp:earned.hackExp};
}
assert.deepEqual(crimeReturn(100),{money:25,karma:-3,xp:0});
assert.deepEqual(crimeReturn(0),{money:25,karma:-3,xp:1});
function rates(intelligence) {
  const measure=currentWork=>{const s={shock:100,storedCycles:0,skills:{intelligence},currentWork};
    processSleeve.call(s,1000/ms);return (100-s.shock)*3600;};
  assert.equal(measure(null),0,'An actually idle sleeve stores cycles; do not charge it passive decay');
  return {work:measure({process(){}}),recovery:measure({process:recover})};
}
const parent=execFileSync('git',['show','89bb315:sleeve.js'],{cwd:repo,encoding:'utf8'});
const start=parent.indexOf('export function getStagedShockRecoveryPlan('), end=parent.indexOf('export function autocomplete',start);
assert(start>=0 && end>start);
const historical=Function(parent.slice(start,end).replace('export ','')+';return getStagedShockRecoveryPlan;')();
const rounded=x=>Math.round(x*1000)/1000;
// Choose how long to recover before working for a fixed time window. With fixed rates, moving any
// recovery interval before work never decreases XP. Evaluate both quadratic pieces at their extrema.
function xpWindow(shock,hours,intelligence,afterAug=1) {
  const s=shock/100,q=1-s,rate=rates(intelligence),r=rate.work/100,a=rate.recovery/100;
  const limit=Math.min(hours,s/a), clip=t=>Math.max(0,Math.min(t,limit));
  function xp(t) {
    t=clip(t);const left=Math.max(0,s-a*t),duringShock=Math.min(hours-t,left/r);
    return (1-left)*duringShock+r*duringShock**2/2 + afterAug*(hours-t-duringShock);
  }
  const points=[0,limit,((a-r)*hours-q)/(2*a-r),(s-r*afterAug/a+(afterAug-1))/a,(s-r*hours)/(a-r)].map(clip);
  const t=points.sort((x,y)=>xp(y)-xp(x))[0];
  // Independent one-minute search checks the analytic optimum, including when an aug can be bought.
  for(let probe=0;probe<=limit;probe+=1/60)assert(xp(t)+1e-8>=xp(probe));
  if(afterAug===1) {
    const closed=clip(Math.min(((a-r)*hours-q)/(2*a-r),(s-r/a)/a));
    assert(Math.abs(xp(t)-xp(closed))<1e-8);
  }
  return {horizonHours:hours,initialShock:shock,intelligence,afterAug,recoverHours:rounded(t),switchAtShock:rounded(100*Math.max(0,s-a*t)),
    optimalXpHours:rounded(xp(t)),immediateWorkXpHours:rounded(xp(0)),fullRecoveryFirstXpHours:rounded(xp(limit))};
}
for(const shock of [0,10,33,60,73,100])for(const h of [1,5,10,15,24,36,60])
  for(const i of [0,230])for(const aug of [1,1.25,1.5,2])xpWindow(shock,h,i,aug);
const windows=[10,15,24,36].map(h=>xpWindow(100,h,0));
assert.deepEqual(windows.slice(0,3).map(w=>w.recoverHours),[4,6,9.6]);
assert.equal(windows[0].optimalXpHours,1.62);assert.equal(windows[0].immediateWorkXpHours,0.9);
assert.equal(windows[3].switchAtShock,33.333);
const augmented=xpWindow(100,24,0,2);assert.equal(augmented.switchAtShock,0);
assert.equal(xpWindow(73,5,0).recoverHours,0,'Use remaining time, not elapsed BN age');
function simulate(policy, n, jobs, intelligence, urgentCrime=false) {
  const skills={hacking:100,strength:100,defense:100,dexterity:100,agility:100,charisma:100,intelligence};
  const mults={faction_rep:1,...Object.fromEntries(Object.keys(skills).map(s=>[s+'_exp',1]))};
  const rate=rates(intelligence), sleeves=Array.from({length:n},()=>({shock:100,sync:100,skills,mults,storedCycles:0}));
  const snapshots={}, routes=Array.from({length:jobs},(_,i)=>({faction:'F'+i}));
  const types=Object.fromEntries(routes.map(({faction})=>[faction,['hacking']]));
  const order=sleeves.map((_,i)=>i), horizons=[10,15,24,36,60];
  let live=order.map(()=>({type:'RECOVERY'})), prior={}, t=0, repHours=0, backgroundXpHours=0, backgroundCrimeHours=0;
  let first=null, second=null, all=null, initialWorkers=null;
  for (let pass=0; t <60-1e-8 && pass<16000;pass++) {
    const args={policy,order,repJobs:jobs,urgentCrime,bladeburner:false,keepBackground:false};
    const plan=policy==='work' ? {active:false,workSleeves:order,recoverySleeves:[]} : policy==='historical'
      ? historical(sleeves,live.map(w=>w.type==='RECOVERY'?'recover from shock':null),prior) : planSleeveRecovery(sleeves,live,prior,args);
    const workers=getSleeveRepWorkerOrder(sleeves,plan,false);
    if(initialWorkers===null) initialWorkers=workers.length;
    const assignments=assignSleeveRepTargets(workers,null,routes,types,urgentCrime,live);
    live=order.map(i=>plan.recoverySleeves.includes(i)?{type:'RECOVERY'}:
      assignments[i]?{type:'FACTION',factionName:assignments[i].faction}:{type:'CRIME'});
    const decay=live.map(w=>w.type==='RECOVERY'?rate.recovery:rate.work);
    const dt=Math.min(15/3600,...horizons.filter(h=>h>t+1e-8).map(h=>h-t),...order.filter(i=>sleeves[i].shock>0).map(i=>sleeves[i].shock/decay[i]));
    assert(dt>0 && Number.isFinite(dt));
    for(const i of order) {
      const before=shockBonus.call(sleeves[i]);sleeves[i].shock=Math.max(0,sleeves[i].shock-decay[i]*dt);
      if(sleeves[i].shock<1e-8)sleeves[i].shock=0;
      const gained=(before+shockBonus.call(sleeves[i]))/2*dt;
      if(live[i].type==='FACTION')repHours+=gained;
      else if(live[i].type==='CRIME'){backgroundXpHours+=gained;backgroundCrimeHours+=dt;}
    }
    prior=plan;t+=dt;
    const ready=sleeves.filter(s=>s.shock===0).length;
    if(ready>=1&&first===null)first=rounded(t);if(ready>=2&&second===null)second=rounded(t);
    if(ready===n&&all===null)all=rounded(t);
    const horizon=horizons.find(h=>Math.abs(h-t)<1e-8);
    if(horizon)snapshots[horizon]={augEligible:ready,repWorkerHours:rounded(repHours),backgroundXpWorkerHours:rounded(backgroundXpHours),backgroundCrimeHours:rounded(backgroundCrimeHours)};
  }
  assert.equal(Object.keys(snapshots).length,horizons.length);
  return {initialWorkers,firstAugEligibleHours:first,secondAugEligibleHours:second,allAugEligibleHours:all,snapshots};
}
const cases={};
for(const intelligence of [0,230])for(const [n,jobs] of [[8,2],[1,1]]) {
  const one=cases[`sleeves=${n},repJobs=${jobs},INT=${intelligence}`]={};
  for(const policy of ['historical','staged','auto','parallel','work'])one[policy]=simulate(policy,n,jobs,intelligence);
  assert.deepEqual(one.historical,one.staged,'The staged override reproduces the actual parent schedule');
  assert(one.auto.snapshots[15].repWorkerHours>=one.staged.snapshots[15].repWorkerHours);
  if(n>1) assert(one.auto.snapshots[24].repWorkerHours>one.staged.snapshots[24].repWorkerHours);
  else assert(one.staged.snapshots[36].repWorkerHours>one.auto.snapshots[36].repWorkerHours,
    'A lone worker continuing on rep is better early, but gives up the long-run payoff of full recovery');
}
const example=cases['sleeves=8,repJobs=2,INT=0'];
assert.equal(example.auto.snapshots[24].augEligible,6);assert.equal(example.staged.snapshots[24].augEligible,1);
assert.equal(example.parallel.snapshots[24].augEligible,8);
assert(example.auto.snapshots[15].repWorkerHours>example.staged.snapshots[15].repWorkerHours);
assert.equal(example.auto.firstAugEligibleHours,example.parallel.firstAugEligibleHours);
assert(example.auto.snapshots[15].backgroundCrimeHours<example.staged.snapshots[15].backgroundCrimeHours,'There is a real early background-income tradeoff');
const urgent=Object.fromEntries(['historical','auto','parallel'].map(policy=>[policy,simulate(policy,8,0,0,true).initialWorkers]));
assert.deepEqual(urgent,{historical:7,auto:8,parallel:0});
// Recovery policy applies only after synchronization; preserve the old pool without live job demand.
const sleeves=[{shock:80,sync:100},{shock:90,sync:100},{shock:100,sync:40}];
const opts={policy:'auto',repJobs:0,order:[0,1],bladeburner:false,keepBackground:false};
const live=sleeves.map(()=>({type:'RECOVERY'}));
assert.deepEqual(planSleeveRecovery(sleeves,live,{},opts),historical(sleeves,live.map(()=> 'recover from shock'),{}));
assert.deepEqual(planSleeveRecovery(sleeves,live,{}, {...opts,urgentCrime:true}).workSleeves,[0,1]);
const fleet=Array.from({length:8},()=>({shock:80,sync:100})), order=fleet.map((_,i)=>i);
for(const [keepBackground,bladeburner] of [[true,false],[false,true]])
  assert.equal(planSleeveRecovery(fleet,order.map(()=>null),{}, {...opts,order,repJobs:2,keepBackground,bladeburner}).workSleeves.length,7);
assert.equal(planSleeveRecovery([{shock:90,sync:100}],[null],{}, {...opts,order:[0],bladeburner:true}).workSleeves.length,1);
const report={baseline:'89bb315d46886c144d6bb3b6f46c62e89deb8bff',engine:execFileSync('git',['-C',engine,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  assumptions:'Fresh fully synchronized sleeves, 100 starting shock, constant equal skills/intelligence, no stored cycles, new damage, purchases, training, cash pressure or Bladeburner. Rep slots stay useful. Hours integrate shock-scaled output at fixed base rate; no live BN time prediction.',
  hourlyShockPoints:Object.fromEntries([0,230].map(i=>[i,Object.fromEntries(Object.entries(rates(i)).map(([k,v])=>[k,rounded(v)]))])),
  initialKarmaWorkersAtFullSync:urgent,xpWindows:windows,augmentedExample:augmented,
  remainingTimeExample:xpWindow(73,5,0),cases};
if(process.argv.includes('--write'))writeFileSync(new URL('../comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({hourlyShockPoints:report.hourlyShockPoints,at24h:Object.fromEntries(Object.entries(example).map(([p,r])=>[p,r.snapshots[24]])),
  first:example.auto.firstAugEligibleHours,allStaged:example.staged.allAugEligibleHours,allParallel:example.parallel.allAugEligibleHours,urgent}));
