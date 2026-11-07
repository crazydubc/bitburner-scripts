// Exercise the production exit gate, manager and home-state RPC against one in-memory game.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import * as policy from '../../../progression.js';
import * as rep from '../../../faction-route-planner.js';
import {main as stateMain} from '../../../bin/intel-farm-state.js';
import {executePurchase} from '../../../purchase-guard.js';
const root=new URL('../../../',import.meta.url), src=f=>readFileSync(new URL(f,root),'utf8'), engine=resolve(process.argv[2]??'../bitburner-engine');
const bare=s=>s.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm,'').replace(/^export /gm,'');
const official=readFileSync(resolve(engine,'src/PersonObjects/formulas/skill.ts'),'utf8');
const {calculateExp,calculateSkill}=Function('clampNumber',bare(stripTypeScriptTypes(official,{mode:'transform'}))+';return {calculateExp,calculateSkill}')((n,lo)=>Math.max(n,lo));
const auto=src('autopilot.js'),finishCode=auto.slice(auto.indexOf('  async function checkIfBnIsComplete(ns)'),auto.indexOf('  function getHardCodedBNMultis'));
const noop=()=>{},Stop=Symbol(),day=86400000;
function game(node=10,sf10=2) {
  const reset={currentNode:node,lastNodeReset:10000,lastAugReset:50000,ownedSF:new Map([[4,3],[5,1],[10,sf10]]),bitNodeOptions:{sourceFileOverrides:new Map()}};
  const files=new Map(), log=[],calls=[],tasks=Array(8).fill(null),implants=Array.from({length:8},()=>[]),shop=[];
  const g={now:day,cash:1e12,reserve:8e9,wd:false,bb:false,cost:Infinity,exits:0,count:8,ramError:false,augError:false,travelFail:-1};
  const sl=Array.from({length:8},(_,i)=>({memory:100,sync:100,shock:0,hp:{current:100,max:100},city:'Sector-12',
    skills:{hacking:10,strength:10,defense:10,dexterity:10,agility:10,charisma:10,intelligence:i===0?70:150},exp:{intelligence:calculateExp(i===0?70:150)},mults:{crime_success:1}}));
  const Clock=class extends Date{static now(){return g.now;}};
  const player={money:g.cash,factions:[],skills:{intelligence:100,hacking:4000}};
  const state=Function('runScriptLocal','getFilePath','return ('+policy.intelFarmState.toString()+')')(async(_,file,persistent,args)=>{
    assert.equal(file,'bin/intel-farm-state.js');assert.equal(persistent,false);if(g.ramError)throw Error('Cannot run helper');
    let end,output;await stateMain({pid:9,args,getResetInfo:()=>reset,getHostname:()=>'home',read:f=>files.get(f)??'',write:async(f,v)=>files.set(f,v),atExit:f=>end=f,getPortHandle:()=>({write:v=>output=v})});end();return output;
  },f=>f);
  const api=async(_,m,i,...a)=>{
    if(m==='getSleeveCost')return g.cost;if(m==='getNumSleeves')return g.count;
    if(m==='getSleeve')return structuredClone(sl[i]);if(m==='getTask')return structuredClone(tasks[i]);
    if(m==='getSleeveAugmentations')return g.augError?'ERROR':implants[i].slice();
    if(m==='getSleevePurchasableAugs')return shop.filter(a=>!implants[i].includes(a.name)).map(a=>({...a}));
    if(m.startsWith('setTo')){calls.push([m,i,...a]);tasks[i]=m==='setToUniversityCourse'||m==='setToGymWorkout'?{type:'CLASS',location:a[0],classType:a[1]}:
      m==='setToCommitCrime'?{type:'CRIME',crimeType:a[0]}:m==='setToSynchronize'?{type:'SYNCHRO'}:m==='setToShockRecovery'?{type:'RECOVERY'}:null;return true;}
    throw Error(m);
  };
  const settings={'bn10-sleeve-int-per-hour':6,'bn10-sleeve-return-percent':.5};
  const ns={args:[],getScriptName:()=>'autopilot.js',getHostname:()=>'home',scan:()=>['w0r1d_d43m0n'],getServerRequiredHackingLevel:()=>3000,hasRootAccess:()=>g.wd,
    enums:{UniversityClassType:{algorithms:'Algorithms',leadership:'Leadership'},CityName:{Sector12:'Sector-12',Volhaven:'Volhaven'},LocationName:{Sector12PowerhouseGym:'Powerhouse Gym',VolhavenZBInstituteOfTechnology:'ZB Institute of Technology'}},
    heart:{break:()=>-54000},read:()=>'',tprint:s=>log.push(s),sleep:async()=>{throw Stop;}};
  const common={...policy,...rep,Date:Clock,intelFarmState:state,log:(_,s)=>log.push(s),sleeveRun:api};
  const gate=()=>{const b={...common,shouldIntelFarm:false,waitingForFinalStudy:false,resetInfo:reset,options:settings,player,unlockedSFs:{4:3},hasCompletedBladeburner:async()=>g.bb,
    nextRecommendedBn:6,destroyWD:async()=>{g.exits++},noteMilestones:async()=>{}};
    return Function(...Object.keys(b),'let wdHack=null,nextFinalStudyRead=0,nextFinalStudyNotice=0;'+finishCode+';return checkIfBnIsComplete')(...Object.values(b));};
  const manager=()=>{const b={...common,getConfiguration:(_,schema)=>({...Object.fromEntries(schema),'disable-follow-player':true}),disableLogs:noop,findPids:async()=>[1],
    getOwnedAugs:async()=>[],getReserve:async()=>g.reserve,getPlayerInfo:async()=>({...player,money:g.cash}),getReset:async()=>reset,getActiveSourceFiles:async()=>Object.fromEntries(reset.ownedSF),
    formatMoney:String,formatDuration:String,singRun:async(_,m)=>{if(m==='getCurrentWork')return null;if(m==='getCrimeStats')return {difficulty:1,strength_success_weight:1};throw Error(m);},
    purchase:async(_,namespace,method,args,p)=>executePurchase({getHostname:()=>'home',read:()=>String(g.reserve),getServerMoneyAvailable:()=>g.cash,sleeve:{
      getSleevePurchasableAugs:i=>shop.filter(a=>!implants[i].includes(a.name)),
      purchaseSleeveAug:(i,name)=>{g.cash-=shop.find(a=>a.name===name).cost;implants[i].push(name);calls.push(['buy',i,name]);return true;},
      travel:(i,city)=>{if(i===g.travelFail)return false;g.cash-=200000;sl[i].city=city;tasks[i]=null;calls.push(['travel',i,city]);return true;}
    }},namespace,method,args,p)};
    return Function(...Object.keys(b),bare(src('sleeve.js'))+';return {main,mainLoop}')(...Object.values(b));};
  return {g,reset,sl,settings,ns,files,log,calls,tasks,implants,shop,state,gate,manager,player};
}
const file='/data/bn10-final-sleeve-intel.json', rule={minRate:6,minReturn:.5};
const armed=h=>JSON.parse(h.files.get(file)).status;
const isClass=t=>t?.type==='CLASS'&&t.location==='ZB Institute of Technology'&&t.classType==='Computer Science';
for (const [node,owned,skip] of [[1,2,false],[7,2,false],[10,0,false],[10,1,false],[10,3,false],[10,2,true]]) {
  const h=game(node,owned);h.g.bb=true;if(skip)h.settings['bn10-sleeve-int-per-hour']=0;
  await h.gate()(h.ns);assert.equal(h.g.exits,1);assert(!h.files.has(file));
}
for(const change of [h=>h.reset.bitNodeOptions.disableSleeveExpAndAugmentation=true,h=>{h.reset.ownedSF.delete(5);h.player.skills.intelligence=0;},h=>h.reset.bitNodeOptions.sourceFileOverrides.set(10,2)]) {
  const h=game();change(h);h.g.bb=true;await h.gate()(h.ns);assert.equal(h.g.exits,1);assert(!h.files.has(file));
}
for(const change of [h=>h.g.count=7,h=>h.sl[7].memory=99,h=>h.g.cost=1e17,h=>h.reset.ownedSF=null]) {const h=game();h.g.wd=true;change(h);await h.gate()(h.ns);assert.equal(h.g.exits,0);assert(!h.files.has(file));}
const h=game();let worker=h.manager(),check=h.gate();const run=async()=>{await assert.rejects(worker.main(h.ns),e=>e===Stop);assert(!h.log.some(l=>l.includes('unexpected error')),h.log.join('\n'));};
const tick=async(ms=10000,rate=1152)=>{
  const share=h.tasks.filter(isClass).length/8;
  for(const s of h.sl){s.exp.intelligence+=ms/3600000*share*rate;s.skills.intelligence=calculateSkill(s.exp.intelligence);}
  h.g.now+=ms;await worker.mainLoop(h.ns);
};
for(const s of h.sl){s.skills.intelligence=10;s.exp.intelligence=calculateExp(10);}
await run();assert(!h.tasks.some(isClass),'No early fixed-target study in BN10.3 even when every sleeve is below the ordinary target');await check(h.ns);assert(!h.files.has(file));
h.sl.forEach((s,i)=>{s.skills.intelligence=i===0?70:150;s.exp.intelligence=calculateExp(s.skills.intelligence);});
h.files.set('/data/intel-farm-state.json','{"status":"complete"}');h.files.set('/data/sleeve-intel-farm-state.json','{"status":"complete","target":50}');
h.g.wd=true;h.g.ramError=true;assert.equal(await check(h.ns),'sleeve-study');assert.equal(h.g.exits,0);
h.g.now+=16000;h.g.ramError=false;assert.equal(await check(h.ns),'sleeve-study');assert.equal(armed(h),'farming');
h.sl[6].shock=2;h.sl[7].sync=98;await tick(16000);assert.equal(h.tasks[6].type,'RECOVERY');assert.equal(h.tasks[7].type,'SYNCHRO');assert(!h.tasks.some(isClass));
h.sl[6].shock=0;h.sl[7].sync=100;await tick(31000);assert(!h.tasks.some(isClass),'Empty shop alone is not proof of installed implants');
h.shop.push({name:'A',cost:1e6},{name:'B',cost:2e6});h.g.cash=h.g.reserve+100;await tick(61000);assert(!h.tasks.some(isClass));assert(h.implants.every(a=>!a.length));
h.g.cash=1e12;h.g.augError=true;await tick(61000);assert(h.implants.every(a=>a.length===2));assert(!h.tasks.some(isClass),'RPC error is not an empty augmentation list');
h.g.augError=false;h.g.travelFail=3;await tick(61000);assert(!h.tasks.some(isClass));h.g.travelFail=-1;await tick(61000);
assert.equal(h.tasks.filter(isClass).length,8);
assert(h.calls.findIndex(a=>a[0]==='setToUniversityCourse')>h.calls.findLastIndex(a=>a[0]==='buy'));
const cash=h.g.cash;
for(let i=0;i<32;i++)await tick();
assert.equal(armed(h),'farming');assert.equal(h.g.cash,cash);assert(h.log.some(l=>l.includes('levels/h')&&l.includes('Low windows: 0/2')));
for(const s of h.sl)s.exp.intelligence=calculateExp(150);
h.tasks[6]={type:'CRIME',crimeType:'Mug'};await tick(); // manual interruption invalidates the measuring window.
for(let i=0;i<32;i++)await tick();assert.equal(armed(h),'farming');assert(h.log.some(l=>l.includes('Low windows: 1/2')));assert.equal(await check(h.ns),'sleeve-study');
worker=h.manager();await run();for(let i=0;i<31;i++)await tick();assert.equal(armed(h),'farming','A restart cannot reuse an old half-complete decision');
// A new augmentation becomes available: do not publish low returns until purchasing and re-verifying it.
h.shop.push({name:'C',cost:3e6});for(let i=0;i<8;i++)await tick();assert(h.implants.every(a=>a.includes('C')));assert.equal(armed(h),'farming');
for(let i=0;i<32;i++)await tick();assert.equal(armed(h),'farming');
for(let i=0;i<33;i++)await tick();assert.equal(armed(h),'complete');
const done=JSON.parse(h.files.get(file));assert(policy.finalStudyProof(done.report,6,.5,h.reset.lastAugReset));assert(done.report.levelsPerHour<6&&done.report.returnPercent<.5);
assert.equal(h.files.get('/data/intel-farm-state.json'),'{"status":"complete"}');assert.equal(h.files.get('/data/sleeve-intel-farm-state.json'),'{"status":"complete","target":50}');
await check(h.ns);assert.equal(h.g.exits,1);h.g.wd=false;h.g.bb=true;await h.gate()(h.ns);assert.equal(h.g.exits,2,'Both victory paths require valid evidence');
h.settings['bn10-sleeve-int-per-hour']=7;assert.equal(await h.gate()(h.ns),'sleeve-study');assert.equal(JSON.parse(h.files.get(file)).minRate,7);
h.settings['bn10-sleeve-int-per-hour']=6;h.files.set(file,JSON.stringify(done));
h.reset.lastAugReset++;assert.equal(await h.gate()(h.ns),'sleeve-study');assert.equal(armed(h),'farming','A changed installation triggers a fresh measurement');
await assert.rejects(h.state(h.ns,{status:'complete',...rule,report:done.report},'bn10-final'));
h.reset.lastNodeReset++;assert.equal((await h.state(h.ns,undefined,'bn10-final')).status,'prepare');
// Equal displayed levels can hide substantial XP. One high signal alone preserves the run.
function sampleAt(level,rate,rule,cycles=61) {let s=null,report=null;const start=calculateExp(level);
  for(let k=0;k<=cycles;k++){const m=policy.sampleFinalStudy(s,k*10000,start+rate*k/360,5,rule);s=m.next;if(m.report)report=m.report;}
  return {s,report};}
for(const r of [{minRate:.001,minReturn:100},{minRate:1e6,minReturn:.00001}]) assert.equal(sampleAt(150,1152,r).report.low,0);
const x=sampleAt(150,1152,rule);assert.equal(x.report.low,2);assert(x.report.levelsPerHour>0&&x.report.levelsPerHour<1);
for(const [t,xp,aug] of [[x.s.seen+61000,x.s.lastXp,5],[x.s.seen+10000,x.s.lastXp-1,5],[x.s.seen+10000,x.s.lastXp,6]]) {
  assert.equal(policy.sampleFinalStudy(x.s,t,xp,aug,rule).next.low,0);
}
assert.equal(sampleAt(150,0,rule).report,null);assert(!policy.finalStudyProof({...done.report,low:1},6,.5,done.report.augReset));
assert.equal(policy.sampleFinalStudy(x.s,x.s.seen+5000,x.s.lastXp,5,rule).next.low,0,'A partially paused observation cannot count as a low-return window');
console.log('BN10.3 hacking and Bladeburner exits, augment-first full-fleet scheduling, guarded purchases, timed level/ROI returns, configuration/reset isolation and interrupted study passed.');
