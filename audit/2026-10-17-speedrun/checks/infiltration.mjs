import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseInfiltration, freshInfiltrationTarget, infiltrationAlternativeIncome, INFILTRATION_ACK, INFILTRATION_TARGET, INFILTRATION_LEASE, INFILTRATION_HISTORY} from '../../../infiltration-policy.js';
import {infiltrationView, finishInfiltrationStage, infiltrationDemand, selectInfiltrationFaction, idleInfiltrationScreen} from '../../../infiltration-ui.js';
import {main as quotes} from '../../../bin/infiltration-locations.js';
import {main as control} from '../../../bin/infiltration-control.js';

const player = {city:'Aevum',money:10e9,factions:['CyberSec','NiteSec']};
const reset = {currentNode:1,lastAugReset:100,lastNodeReset:50,ownedSF:new Map(),ownedAugs:new Map()};
const target = {kind:'faction-rep',faction:'CyberSec',targetRep:10000,repRate:10,lastAugReset:100,lastNodeReset:50,updatedAt:10000};
const location = (name,levels=5,difficulty=1,rep=1000,cash=1e9,city='Aevum') => ({location:{name,city},maxClearanceLevel:levels,difficulty,reward:{tradeRep:rep,sellCash:cash}});
const base = {locations:[location('Easy'),location('Impossible',5,3.5),location('Far',5,0,1e6,1e12,'Volhaven')],player,target,rep:0,moneyTarget:20e9};
assert.equal(chooseInfiltration(base).company,'Easy');
assert.equal(chooseInfiltration({...base,demand:0.79}),null);
assert.equal(chooseInfiltration({...base,demand:null}),null);
assert.equal(chooseInfiltration({...base,remainingMs:5000}),null);
assert.equal(chooseInfiltration({...base,target:{...target,repRate:10000}}),null);
assert.equal(chooseInfiltration({...base,target:null,income:1e12}),null);
assert.equal(chooseInfiltration({...base,target:null,moneyTarget:10e9}),null);
assert.equal(chooseInfiltration({...base,target:null,locations:[location('Zero',5,0,1000,0)]}),null);
assert.equal(chooseInfiltration({...base,rep:9900,locations:[location('Slow',30,0,1e6),location('Fast',5,0,1000)]}).company,'Fast');
assert.equal(freshInfiltrationTarget(target,reset,player.factions,20000),true);
for (const changed of [{lastAugReset:101},{lastNodeReset:51},{updatedAt:1},{faction:'Daedalus'},{targetRep:NaN}])
  assert.ok(!freshInfiltrationTarget({...target,...changed},reset,player.factions,100000));

const defaults = Object.fromEntries([['auto',false],['single',false],['stop',false],['status',false],['quiet',true],['company',''],['faction','CyberSec'],['target-rep',0],['money-target',20e9],['time',120000],['max-runs',3],['min-demand',0.8],['scheduled',false],['soa',false],['aug-count-target',30],['cooldown',60000]]);
let soaSource=readFileSync(new URL('../../../infiltration-soa.js',import.meta.url),'utf8')
  .replace("import { singRun, purchase } from './utils.js';",'const singRun=(ns,fn,...args)=>ns.sing(fn,...args); const purchase=(ns,...args)=>ns.purchase(...args);');
for(const name of ['infiltration-policy','infiltration-ui']) soaSource=soaSource.replace(`'./${name}.js'`,JSON.stringify(new URL(`../../../${name}.js`,import.meta.url).href));
const soaUrl='data:text/javascript;base64,'+Buffer.from(soaSource).toString('base64');
let source=readFileSync(new URL('../../../infiltrate.js',import.meta.url),'utf8')
  .replace("import { singRun, runScriptLocal } from './utils.js';",'const singRun=(ns,fn,...args)=>ns.sing(fn,...args); const runScriptLocal=async(ns,script,ignore,args)=>ns.infiltration.getPossibleLocations().filter(x=>x.city===args[0]).map(x=>ns.infiltration.getInfiltration(x.name));')
  .replace("'./infiltration-soa.js'",JSON.stringify(soaUrl));
for (const name of ['infiltration-policy','infiltration-ui']) source=source.replace(`'./${name}.js'`,JSON.stringify(new URL(`../../../${name}.js`,import.meta.url).href));
const {main}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

// A minimal DOM/React adapter executes the actual runner and its real UI navigation functions.
function fixture(options={}) {
  let screen=options.initialScreen??'terminal', model, displayStage, selected='NiteSec', pendingFaction, now=100000;
  let starts=0, successes=0, claims=0, cancels=0, nativeKeys=0, demand=100, sleeps=0;
  let cityClicks=0, companyClicks=0, entryClicks=0, pendingScreen, renderAt, companyRenderedAt=now, dialog=false;
  const companyName=options.companyName??'Easy';
  const navigate=(next,delay=0)=>{
    if(delay){pendingScreen=next;renderAt=now+delay;}
    else {screen=next;if(next==='company')companyRenderedAt=now;}
  };
  const files=new Map(), messages=[], exit=[];
  const p={...player,factions:[...player.factions]};
  const rep={CyberSec:0,NiteSec:0};
  const el=(textContent,click) => ({textContent,disabled:false,getAttribute:()=>null,...(click?{__reactProps$fixture:{onClick:click}}:{})});
  const city=el('City',()=>{cityClicks++;navigate('city',options.cityDelay);});
  const company=el(companyName,()=>{companyClicks++;navigate('company',options.companyDelay);}); company.getAttribute=()=>companyName;
  const start=el('Start',()=>{starts++;model.stage={};displayStage=model.stage;screen='game';});
  const open=el('Infiltrate Company',()=>{
    entryClicks++;navigate('intro',options.introDelay); model={location:{name:companyName},level:1,maxLevel:3,startingDifficulty:1,stage:{},results:'',
      onFailure(){this.results+='✗';},
      onSuccess(){assert.equal(this,model);successes++;this.results+='✓';this.stage={};this.level++;
        if(this.level>3) screen='victory'; else screen='countdown';displayStage=this.stage;},
      cancel(){cancels++;screen='city';},
    };
  });
  Object.defineProperty(open,'disabled',{get:()=>now<companyRenderedAt+(options.controlDelay??0)});
  const sell=el('Sell for $1b',()=>{claims++;p.money+=1e9;screen='city';f.onReward?.();});
  const trade=el('Trade for 1000 reputation',()=>{claims++;rep[selected]+=1000;screen='city';f.onReward?.();});
  const combo={__reactFiber$fixture:{memoizedProps:{value:selected,children:[false,[{props:{value:'CyberSec'}},{props:{value:'NiteSec'}}]],onChange:event=>{pendingFaction=event.target.value;}}}};
  const scope={querySelectorAll:selector=>selector==='li'?[el(`Market demand: ${demand}%`)]:selector==='button'?(screen==='intro'?[start]:[trade,sell]):[],
    querySelector:selector=>selector==='[role="combobox"]'?combo:null};
  function headings() {
    if(screen==='company') {
      const heading=el(options.animatedHeading?'N?tl!nk T@chn0logies':options.wrongCompany??companyName);
      heading.__reactFiber$fixture={memoizedProps:{},return:{memoizedProps:{location:{name:options.wrongCompany??companyName}}}};
      return [heading];
    }
    const titles={intro:`Infiltrating ${companyName}`,game:options.gameTitle??'Type it backward',countdown:'Get Ready!',victory:'Infiltration successful!'};
    if(!titles[screen])return [];
    const h=el(titles[screen]);h.closest=()=>scope;
    h.__reactFiber$fixture={memoizedProps:{},return:{memoizedProps:{state:model,stage:displayStage}}};
    return [h];
  }
  const doc={getElementById:()=>screen==='terminal'?{}:null,querySelector:selector=>selector==='[role="dialog"]' && dialog?{}:null,querySelectorAll:selector=>{
    if(selector==='.MuiModal-root')return f.modals??[];
    if(selector==='h4' || selector==='h4, h5')return headings();
    if(selector==='p')return screen==='city'?[el('Aevum')]:[];
    if(selector==='[role="button"]')return options.hideCity?[]:[city];
    if(selector==='span[aria-label]')return screen==='city' && !options.listCity?[company]:[];
    if(selector==='button')return screen==='company'?[open,el('Return to World')]:screen==='city' && options.listCity?[company]:[];
    throw Error('Unexpected unscoped selector '+selector);
  }};
  const ns={pid:17,flags:()=>({...defaults,...options}),getHostname:()=> 'home',getResetInfo:()=>reset,isRunning:()=>true,
    read:file=>files.get(file)??'',write:async(file,value)=>{files.set(file,value);},
    getMoneySources:()=>({sinceInstall:{casino:10e9}}),getPlayer:()=>({...p}),getTotalScriptIncome:()=>[0,0],
    infiltration:{getPossibleLocations:()=>[{name:companyName,city:'Aevum'}],getInfiltration:()=>location(companyName)},
    print:message=>messages.push(message),tprint:message=>messages.push(message),atExit:fn=>exit.push(fn),
    sing:async(fn,faction)=>fn==='getCurrentWork'?{type:'FACTION',factionName:'CyberSec'}:rep[faction],
    sleep:async ms=>{now+=ms;if(++sleeps>10000)throw Error('Unbounded runner');
      if(pendingScreen && now>=renderAt){navigate(pendingScreen);pendingScreen=null;}
      if(pendingFaction){selected=pendingFaction;pendingFaction=null;combo.__reactFiber$fixture.memoizedProps.value=selected;}
      if(screen==='countdown'){model.stage={};displayStage=model.stage;screen='game';}
      await f.onSleep?.();},
  };
  const f={ns,doc,files,messages,rep,get model(){return model;},get screen(){return screen;},set screen(v){screen=v;},
    set demand(v){demand=v;},set dialog(v){dialog=v;},get now(){return now;},
    get counts(){return {starts,successes,claims,cancels,nativeKeys,cityClicks,companyClicks,entryClicks};},
    async run(){const saved=Date.now;Date.now=()=>now;globalThis.window={document:doc};try{await main(ns);}finally{exit.forEach(fn=>fn());Date.now=saved;delete globalThis.window;}},
  };
  return f;
}
{
  const f=fixture();await f.run();
  assert.equal(f.counts.starts,1);assert.equal(f.counts.successes,3);assert.equal(f.counts.claims,1);
  assert.equal(f.rep.CyberSec,1000);assert.equal(f.rep.NiteSec,0);assert.equal(f.counts.cancels,0);
  assert.equal(JSON.parse(f.files.get(INFILTRATION_HISTORY)).Easy.games,1);
  assert.equal(JSON.parse(f.files.get(INFILTRATION_LEASE)).expires,0);
}
{
  const f=fixture({auto:true,'max-runs':2});await f.run();assert.equal(f.counts.claims,2);
}
{
  const f=fixture({faction:''});await f.run();assert.equal(f.counts.claims,1);assert.equal(f.rep.CyberSec,0);
}
// Navigation must wait for React, accept backdoor text animation, and click each transition once.
for(const listCity of [false,true]) {
  const f=fixture({companyName:'NetLink Technologies',company:'NetLink Technologies',listCity,
    cityDelay:850,companyDelay:1200,controlDelay:350,introDelay:2500,animatedHeading:true});
  await f.run();assert.equal(f.counts.claims,1);assert.equal(f.rep.CyberSec,1000);
  assert.equal(f.counts.cityClicks,1);assert.equal(f.counts.companyClicks,1);assert.equal(f.counts.entryClicks,1);
}
{
  const f=fixture({initialScreen:'company',hideCity:true,animatedHeading:true});
  await f.run();assert.equal(f.counts.claims,1);assert.equal(f.counts.cityClicks,0);assert.equal(f.counts.companyClicks,0);
}
for(const options of [{cityDelay:6000},{companyDelay:6000},{wrongCompany:'Other Company',animatedHeading:true},{controlDelay:6000}]) {
  const f=fixture(options);await f.run();assert.equal(f.counts.entryClicks,0);assert.equal(f.counts.starts,0);
  assert.ok(f.messages.some(m=>m.includes('timed out after 5s')));assert.ok(f.now<=105000);
  assert.equal(JSON.parse(f.files.get(INFILTRATION_LEASE)).expires,0);
}
for(const options of [{cityDelay:1000},{companyDelay:1000}]) {
  const f=fixture(options);f.onSleep=()=>{globalThis.window.__bitburnerScriptsInfiltration.stop=true;};
  await f.run();assert.equal(f.counts.entryClicks,0);assert.ok(f.messages.some(m=>m.includes('navigation cancelled')));
}
{
  const f=fixture({cityDelay:4900,companyDelay:4900,time:9500});await f.run();assert.equal(f.counts.companyClicks,1);
  assert.equal(f.counts.starts,0);assert.equal(f.now,109500);
  assert.ok(f.messages.some(m=>m.includes('navigation cancelled')));
}
{
  const f=fixture({companyDelay:1000});f.onSleep=()=>{f.dialog=true;};
  await f.run();assert.equal(f.counts.entryClicks,0);assert.ok(f.messages.some(m=>m.includes('interrupted by a dialog')));
}
{
  const f=fixture({companyName:'NetLink Technologies',faction:'NetLink Technologies'});
  await f.run();assert.equal(f.counts.companyClicks,0);
  assert.ok(f.messages.some(m=>m.includes('--company "NetLink Technologies"') && m.includes('reputation recipient')));
  const g=fixture({companyName:'NetLink Technologies',company:'NetLink Technologies',faction:''}),get=g.ns.getPlayer;
  g.ns.getPlayer=()=>({...get(),factions:[],jobs:{}});await g.run();assert.equal(g.counts.claims,1,'Cash infiltration needs no faction or job');
}
{
  const f=fixture();f.demand=70;await f.run();assert.equal(f.counts.starts,0);assert.ok(f.counts.cancels>0);
}
{
  const f=fixture();f.ns.getMoneySources=()=>({sinceInstall:{casino:9e9}});await f.run();assert.equal(f.counts.starts,0);
}
{
  const f=fixture();f.onSleep=()=>{if(f.screen==='game')globalThis.window.__bitburnerScriptsInfiltration.stop=true;};
  await f.run();assert.equal(f.counts.claims,0);assert.ok(f.counts.cancels>0);
}
{
  const f=fixture();f.onSleep=()=>{if(f.screen==='game')f.screen='other';};
  await f.run();assert.equal(f.counts.claims,0);assert.ok(f.messages.some(m=>m.includes('yielding control')));
}
{
  const f=fixture();f.onSleep=()=>{if(f.screen==='game')f.model.onFailure();};
  await f.run();assert.equal(f.counts.claims,0);assert.ok(f.messages.some(m=>m.includes('stage failed')));
}
{
  const f=fixture({'target-rep':1000});await f.run();assert.equal(f.counts.starts,0);
  const g=fixture({'target-rep':1000,auto:true});g.ns.getResetInfo=()=>({...reset,currentNode:4});await g.run();assert.equal(g.counts.claims,1);
}
{
  const f=fixture({scheduled:true});f.files.set(INFILTRATION_LEASE,JSON.stringify({retryAfter:200000}));await f.run();assert.equal(f.counts.starts,0);
}
{
  const f=fixture();f.ns.getResetInfo=()=>({...reset,currentNode:4});f.ns.sing=async()=>({type:'GRAFTING'});await f.run();assert.equal(f.counts.starts,0);
}
// A stale displayed stage must not advance the live model twice or skip a countdown.
{
  let calls=0;const model={stage:{},onSuccess(){calls++;this.stage={};}}, old=model.stage, handled=new WeakSet();
  const view={kind:'game',model,stage:old};
  assert.equal(finishInfiltrationStage(view,handled),true);
  assert.equal(finishInfiltrationStage(view,handled),false);assert.equal(calls,1);
  assert.equal(infiltrationView({querySelectorAll:()=>[{textContent:'Save successful!',__reactFiber$trap:{memoizedProps:{onSuccess(){assert.fail('unscoped callback');}}}}]},'Easy'),null);
}
// A killed script must never strand a lease, and this helper must not clear unrelated port state.
for(const [expires,live,expected] of [[Date.now()+5000,true,true],[Date.now()-1,true,false],[Date.now()+5000,false,false]]) {
  let callback,result;
  await control({pid:42,args:['lease'],read:()=>JSON.stringify({pid:17,expires}),isRunning:()=>live,
    getPortHandle:()=>({write:value=>{result=value;}}),atExit:fn=>{callback=fn;}});callback();assert.equal(result,expected);
}
assert.equal(infiltrationAlternativeIncome(10,{casino:1e12,infiltration:1e9,corporation:1000,stock:500},100),15);
assert.equal(infiltrationAlternativeIncome(25,{corporation:1000},100),25);
for(const gameTitle of ['Attack after the sentinel drops his guard and is distracted. Do not alert him!',
  'Enter the Code!', 'Close the brackets', 'Say something nice about the guard', 'Remember all the mines!',
  'Mark all the mines!', 'Match the symbols!', 'Cut the wires with the following properties! (keyboard 1 to 9)']) {
  const f=fixture({gameTitle});await f.run();assert.equal(f.counts.claims,1,gameTitle);
}
{
  const f=fixture({scheduled:true});f.ns.getResetInfo=()=>({...reset,currentNode:4});
  f.files.set(INFILTRATION_TARGET,JSON.stringify({...target,pid:99,updatedAt:f.now}));
  let acknowledged=false;
  f.onSleep=()=>{
    assert.ok(acknowledged || f.counts.starts===0,'Do not enter a game before the planner acknowledges the pause');
    if(!acknowledged && f.now>=101000){
      f.files.set(INFILTRATION_ACK,JSON.stringify({pid:17,workerPid:99,at:f.now}));acknowledged=true;
    }
  };
  await f.run();assert.ok(acknowledged);assert.equal(f.counts.claims,1);
}
{
  const f=fixture({faction:'Unlisted Faction'}), get=f.ns.getPlayer;
  f.ns.getPlayer=()=>({...get(),factions:['Unlisted Faction']});
  await f.run();assert.equal(f.counts.claims,0);assert.equal(f.screen,'victory');assert.equal(f.counts.cancels,0);
}
{
  const f=fixture();f.onSleep=async()=>{if(f.screen==='game')await main({...f.ns,flags:()=>({...defaults,stop:true})});};
  await f.run();assert.equal(f.counts.claims,0);assert.ok(f.counts.cancels>0);
}
{
  let done, result, calls=[];
  await quotes({pid:3,args:['Aevum'],atExit:fn=>{done=fn;},getPortHandle:()=>({write:value=>{result=value;}}),
    infiltration:{getPossibleLocations:()=>[{name:'Easy',city:'Aevum'},{name:'Far',city:'Volhaven'}],
      getInfiltration:name=>{calls.push(name);return location(name);}}});done();
  assert.deepEqual(calls,['Easy']);assert.equal(result[0].location.name,'Easy');
}
{
  const f=fixture({scheduled:true,faction:'','money-target':10e9});f.ns.getResetInfo=()=>({...reset,currentNode:4});
  f.files.set(INFILTRATION_TARGET,JSON.stringify({...target,pid:99,updatedAt:f.now}));
  f.ns.sing=async fn=>fn==='getCurrentWork'?{type:'FACTION'}:f.files.has(INFILTRATION_ACK)?target.targetRep:0;
  f.onSleep=()=>f.files.set(INFILTRATION_ACK,JSON.stringify({pid:17,workerPid:99,at:f.now}));
  await f.run();assert.equal(f.counts.starts,0,'Recheck reputation after waiting for planner acknowledgement');
}
{
  const code=readFileSync(new URL('../../../work-for-faction2.js',import.meta.url),'utf8');
  const from=code.indexOf('  async function infiltrationOwnsScreen()'),to=code.indexOf('  while (true)',from);
  const probe=Function('infiltrationEnabled','runScriptLocal','ns',code.slice(from,to)+';return infiltrationOwnsScreen;');
  assert.equal(await probe(true,async()=>{throw Error('home full');},{pid:99})(),false);
  assert.equal(await probe(true,async()=>true,{pid:99})(),true);
  assert.equal(await probe(false,()=>assert.fail('Disabled integration must not call a helper'),{pid:99})(),false);
}
console.log('Infiltration selection, delayed/animated company UI, bounded navigation, UI scope, once-per-stage advancement, reward faction, bounded repeat, cancellation, casino gate, target, and lease checks passed.');

// Execute the real runner plus progression manager: first reward creates the invite,
// later games award both CyberSec and SoA rep, then the final claim queues WKS.
for(const invitation of ['suppressed','reward-popup','initial-popup']) {
  const {SOA_FACTION,SOA_WKS,soaAugmentationQuote,INFILTRATION_PROGRESS}=await import('../../../infiltration-policy.js');
  const f=fixture({soa:true,auto:true,'max-runs':3});
  let joined=false,invited=false,soaRep=0,cash=10e9;const owned=[],purchases=[];
  const invite=()=>{
    invited=true;
    if(invitation==='suppressed')return;
    const element=textContent=>({textContent});
    f.modals=[{getAttribute:()=>null,querySelector:()=>null,querySelectorAll:selector=>
      selector==='h4'?[element('You received a faction invitation.')]:
      selector==='p'?[element(`Would you like to join ${SOA_FACTION}?`)]:
      selector==='button'?[{...element('Join'),getAttribute:()=>null,__reactProps$invite:{onClick:()=>{
        joined=true;invited=false;f.modals=[];
      }}}]:[]}];
  };
  if(invitation==='initial-popup')invite();
  f.files.set('reserve.txt','8000000000');
  f.ns.getResetInfo=()=>({...reset,currentNode:4});
  f.ns.getPlayer=()=>({...player,money:cash,factions:[...player.factions,...(joined?[SOA_FACTION]:[])]});
  f.ns.sing=async(fn,name)=>{
    if(fn==='getCurrentWork')return null;
    if(fn==='checkFactionInvitations')return invited?[SOA_FACTION]:[];
    if(fn==='joinFaction'){assert.equal(name,SOA_FACTION);joined=true;invited=false;return true;}
    if(fn==='getOwnedAugmentations')return [...owned];
    if(fn==='getAugmentationPrice')return soaAugmentationQuote(owned).cost;
    if(fn==='getAugmentationRepReq')return soaAugmentationQuote(owned).rep;
    if(fn==='getFactionRep')return name===SOA_FACTION?soaRep:f.rep[name];
    assert.fail(fn);
  };
  f.ns.purchase=async(namespace,method,args,policy)=>{
    assert.equal(namespace,'singularity');assert.equal(method,'purchaseAugmentation');assert.equal(args[0],SOA_FACTION);
    const quote=soaAugmentationQuote(owned);assert.ok(cash-quote.cost>=8e9);assert.ok(quote.cost<=policy.budget);
    cash-=quote.cost;owned.push(args[1]);purchases.push(args[1]);return {result:true,spent:quote.cost};
  };
  f.onReward=()=>{if(joined)soaRep+=invitation==='initial-popup'?4000:6000;else invite();};
  await f.run();
  assert.equal(f.counts.claims,3);assert.equal(f.rep.CyberSec,3000);assert.equal(soaRep,12000);
  assert.equal(joined,true);assert.deepEqual(purchases,[SOA_WKS]);assert.ok(cash>=8e9);
  assert.deepEqual(JSON.parse(f.files.get(INFILTRATION_PROGRESS)).owned,[SOA_WKS]);
}
console.log('Automatic SoA invitation, concurrent rewards, WKS-first guarded purchase, and progression status checks passed.');
