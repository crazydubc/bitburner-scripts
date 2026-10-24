// Run the actual cycle and policy with official API RAM costs and controlled UI/game responses.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {firstBn1, displayedNumber, planBn1Augmentations, NF, BN1_SESSION, bn1Paused} from '../../../bn1-policy.js';
import {main as casinoMain} from '../../../bn1-casino.js';
import {main as stockMain} from '../../../bin/bn1-stock.js';
import {executePurchase} from '../../../purchase-guard.js';
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const engine = resolve(process.argv[2] ?? '../bitburner-engine');
const costsSource = readFileSync(resolve(engine, 'src/Netscript/RamCostGenerator.ts'), 'utf8')
  .replace('import { Player } from "@player";', 'const Player={bitNodeN:1,activeSourceFileLvl:()=>0};')
  .replace('import { NSFull } from "../NetscriptFunctions";', '');
const {getRamCost, RamCostConstants} = await import(url(stripTypeScriptTypes(costsSource)));
let source = readFileSync(new URL('../../../bn1-auto.js', import.meta.url), 'utf8')
  .replace("import {createBn1UI} from './bn1-ui.js';", 'const createBn1UI=(ns,...args)=>ns.fixtureUI(...args);');
for (const name of ['utils','bn1-policy','bn1-guide','augmentation-reset-policy'])
  source = source.replace(`'./${name}.js'`, JSON.stringify(new URL(`../../../${name}.js`, import.meta.url).href));
const {main} = await import(url(source+'\n//# sourceURL=bn1-auto-fixture.js'));
const reset = {currentNode:1, lastAugReset:1, lastNodeReset:1, ownedSF:new Map(), ownedAugs:new Map()};
assert(firstBn1(reset));
for (const changed of [{currentNode:4},{ownedSF:new Map([[1,1]])},{ownedSF:new Map([[4,1]])}])
  assert(!firstBn1({...reset,...changed}));
for (const [text,minimum] of [['$1.234b',1.23449e9],['12.500k rep',12500.49],['$1,234.00',1234.004],['$1.000Q',1e18],['1.000e+6',1e6]])
  assert(displayedNumber(text)>=minimum,text);
for (const text of ['$1,25b','$1.250,00','NaN','∞']) assert.throws(()=>displayedNumber(text));
const row = (name,cost,rep=1000,extra={})=>({name,cost,rep,faction:'CyberSec',description:'hacking skill',...extra});
const base = {rows:[row('BitWire',1e6),row(NF,1e5)], installed:[],queued:[],money:2e6,reputation:{CyberSec:1000}};
assert.deepEqual(planBn1Augmentations(base).bundle.map(r=>r.name),['BitWire',NF]);
assert.equal(planBn1Augmentations({...base,rows:[row('BitWire',1e6,1000.5,{repMet:true})]}).bundle.length,1);
assert.equal(planBn1Augmentations({...base,rows:[row('Tier 2',1e6,1000,{missingPrereqs:true})]}).bundle.length,0);
assert.equal(planBn1Augmentations({...base,queued:[{name:NF,levels:10}],rows:[]}).readyUtility,1.5);
assert.equal(planBn1Augmentations({...base,rows:[row('Expensive',2e6),row('Cheap',1e6)],money:3e6}).bundle.length,1,'Account for purchase inflation');
assert.equal(planBn1Augmentations({...base,rows:[row('BitWire',1e6,1001),row('BitWire',1e6,1000,{faction:'NiteSec'})],reputation:{CyberSec:0,NiteSec:1000}}).bundle[0].faction,'NiteSec');
assert.throws(()=>planBn1Augmentations({...base,reputation:{}}),/reputation/);

function market(options={}) {
  let result,exit;
  stockMain({pid:1,getPortHandle:()=>({write:r=>result=r}),atExit:fn=>exit=fn,
    stock:{hasWSEAccount:()=>options.wse??true,hasTixApiAccess:()=>options.tix??true,getSymbols:()=>['ECP'],
      getPosition:()=>{if(options.error)throw Error('Invalid stock symbol: ECP');return options.position??[0,0,0,0];},
      getBidPrice:()=>100000,getAskPrice:()=>200000}});
  exit();return result;
}
assert.deepEqual(market({wse:false}),{known:true,shares:0,value:0});
assert(!market({tix:false}).known);assert(!market({error:true}).known);
assert(market({position:[0,0,1,150000]}).shares>0,'A zero-valued portfolio can still contain shares');
assert(!market({position:[NaN,0,0,0]}).known);

async function cycle(options={}) {
  let now=1000,allocated=8,used=RamCostConstants.Base,maxUsed=used,homeRam=options.ram??8,
    money=options.money??10e9,casino=options.casino??10e9,installed=false,stopped=false;
  const calls=[],messages=[],allocations=[],charged=new Set(),exits=[],ports=new Map(),processes=new Map();
  const owned=options.owned??new Map(),info={...reset,ownedAugs:owned,...options.reset};
  const queued=[],factions=options.factions??['CyberSec'];
  const player=()=>({money,city:cityName,factions:[...factions],skills:{hacking:options.hacking??50}});
  let cityName=options.city??'Aevum',pid=100;
  const ui={
    check(){},terminal:async()=>calls.push('terminal'),mug:async()=>{calls.push('mug');money=250001;},
    travel:async dest=>{calls.push('travel:'+dest);if(cityName!==dest)money-=200000;cityName=dest;},
    store:async(kind,budget)=>{calls.push('store:'+kind);if(kind!=='ram')return true;if(homeRam>=128||await budget()<1e6)return false;money-=1e6;homeRam*=2;return true;},
    study:async()=>calls.push('study'),work:async f=>calls.push('work:'+f),joinInvitations:async()=>{},
    command:async text=>calls.push('command:'+text),
    snapshot:async()=>{now+=options.snapshotMs??0;return {queued:structuredClone(queued),rows:[
      row('BitWire',1e6,1000,{owned:queued.some(q=>q.name==='BitWire')}),
      row(NF,queued.length?1e20:1e5),row('Distant goal',1e15,1e12)],reputation:{CyberSec:1000}};},
    queue:async()=>structuredClone(queued),buy:async r=>{calls.push('buy:'+r.name);money-=r.cost;queued.push({name:r.name,levels:1});return true;},
    install:async verify=>{await verify();calls.push('install');installed=true;},
  };
  const raw={pid:11,flags:schema=>Object.fromEntries(schema.map(([k,v])=>[k,k==='stop'?(options.stop??v):v])),
    getHostname:()=>options.host??'home',getResetInfo:()=>info,getPlayer:player,getMoneySources:()=>({sinceInstall:{casino}}),
    fixtureUI:()=>ui,ramOverride:n=>{allocated=n;allocations.push(n);return n;},
    disableLog(){},print(){},tprint:t=>messages.push(t),atExit:fn=>exits.push(fn),
    scan:host=>host==='home'?['remote']:['home'],
    ps:host=>[...(host===(options.host??'home')?[{filename:'bn1-auto.js',pid:11,args:[]}]:options.offloaded?[{filename:'autopilot.js',pid:12,args:[]}]:[]),
      ...[...processes].filter(([,p])=>p.host===host).map(([pid,p])=>({pid,...p}))],
    getServer:host=>({maxRam:host==='home'?homeRam:16,ramUsed:host===(options.host??'home')?allocated:0,requiredHackingSkill:9999,numOpenPortsRequired:5,hasAdminRights:true}),
    getScriptRam:()=>4,getScriptName:()=> 'bn1-auto.js',fileExists:()=>true,hasTorRouter:()=>true,read:()=> '8000000000',
    isRunning:pid=>{assert(Number.isInteger(pid),'Never pass an absent PID to isRunning');return pid===11||pid===options.otherPid||processes.has(pid);},
    exec:(file,host,config,...args)=>{calls.push('exec:'+file);const child=++pid;
      if(file==='bin/reserve.js')ports.set(child,options.reserveError?'ERROR:Unreadable home reserve':8e9);
      else if(file==='bin/bn1-stock.js')ports.set(child,market({error:options.marketError}));
      else if(file==='infiltrate.js'){assert.equal(args[args.indexOf('--bn1-controller')+1],11);if(options.infiltrationMs)processes.set(child,{filename:file,host,args,exitAt:now+options.infiltrationMs});}
      else processes.set(child,{filename:file,host,args});return child;},
    getPortHandle:pid=>({empty:()=>!ports.has(pid),read:()=>ports.get(pid)}),
    kill:pid=>{calls.push('kill:'+pid);processes.delete(pid);},
    spawn:(file,config)=>{calls.push('spawn:'+file);assert.equal(config.spawnDelay,0);assert.equal(config.ramOverride,options.host?16:6.5);},
    sleep:async ms=>{now+=ms;for(const[pid,p]of processes)if(p.exitAt&&now>=p.exitAt)processes.delete(pid);if(now>250000){stopped=true;globalThis.window[BN1_SESSION].stop=true;}},
    ui:{openTail(){},resizeTail(){},setTailTitle(){}},
  };
  // Charge each API once, using the game's effective BN1/SF0 table. ns.fixtureUI is test-only.
  const wrap=(object,path=[])=>new Proxy(object,{get(target,key){const value=target[key],keys=[...path,key];
    if(typeof value==='function')return(...args)=>{
      const name=keys.join('.');if(name!=='fixtureUI'&&!charged.has(name)){used+=getRamCost(keys,true);charged.add(name);}
      maxUsed=Math.max(maxUsed,used);assert(used<=allocated+1e-9,`${name}: ${used} GB exceeds ${allocated} GB`);
      return value(...args);
    };return key==='ui'?wrap(value,keys):value;
  }});
  const saved=Date.now;Date.now=()=>now;globalThis.window={document:{},[BN1_SESSION]:options.session};
  try{await main(wrap(raw));}finally{exits.forEach(fn=>fn());Date.now=saved;delete globalThis.window;}
  return {calls,messages,installed,stopped,allocations,maxUsed,homeRam};
}
{
  const f=await cycle({casino:0,money:0,city:'Sector-12'});
  assert.deepEqual(f.calls,['mug','travel:Aevum','terminal','spawn:bn1-casino.js']);
  assert.deepEqual(f.allocations,[8]);assert(f.maxUsed<=8);
}
{
  const f=await cycle({offloaded:true});
  assert(f.installed,JSON.stringify(f.messages));assert.equal(f.homeRam,128);
  assert(!f.calls.includes('exec:autopilot.js'),'Reuse offloaded autopilot');
  assert(f.calls.includes('exec:stockmaster.js'));assert(f.calls.includes('exec:infiltrate.js'));
  assert(f.calls.indexOf('buy:BitWire')<f.calls.indexOf('install'));assert(!f.calls.some(c=>c.startsWith('kill:')));
  assert.deepEqual(f.allocations,[8,16]);assert(f.maxUsed<=16);
}
{
  const f=await cycle({infiltrationMs:120000,snapshotMs:1000});assert(f.installed,'Long single runs must leave enough ETA samples to reset');
}
{
  const f=await cycle({marketError:true});assert(!f.installed);assert(f.stopped);
  assert(f.messages.some(m=>m.includes('Stock holdings unavailable')));assert(f.calls.includes('work:CyberSec'));
}
{
  const f=await cycle({reset:{currentNode:4}});assert.equal(f.calls.length,0);assert(!f.installed);
}
{
  let purchases=0;
  const ns={getHostname:()=> 'home',read:()=> '0',getServerMoneyAvailable:()=>1e12,
    hacknet:{getPurchaseNodeCost:()=>100,purchaseNode:()=>{purchases++;return 0;}}};
  globalThis.window={[BN1_SESSION]:{spendLock:true,stop:false,expires:Date.now()+1000}};
  assert.equal(executePurchase(ns,'hacknet','purchaseNode',[]).result,-1);assert.equal(purchases,0);
  globalThis.window[BN1_SESSION].expires=0;
  assert.equal(executePurchase(ns,'hacknet','purchaseNode',[]).result,0);assert.equal(purchases,1);
  delete globalThis.window;
}
{
  const stopped={stop:false},killed=[];
  globalThis.window={document:{},[BN1_SESSION]:stopped};
  await main({ramOverride(){},flags:()=>({stop:true}),getHostname:()=> 'home',tprint(){},print(){},
    getResetInfo:()=>reset,scan:()=>[],ps:()=>[{filename:'bn1-casino.js',pid:51},{filename:'autopilot.js',pid:52},{filename:'stockmaster.js',pid:53}],
    kill:pid=>killed.push(pid)});
  assert(stopped.stop);assert.deepEqual(killed,[51]);delete globalThis.window;
}
{
  const remote=await cycle({host:'remote',offloaded:true});
  assert(remote.installed,JSON.stringify(remote.messages));assert(remote.maxUsed<=16);
  assert(remote.calls.includes('exec:bin/reserve.js'),'Read the authoritative home reserve before remote spending');
  assert.deepEqual(remote.allocations,[8,16,16]);
  const bootstrap=await cycle({host:'remote',offloaded:true,casino:0,money:0,city:'Sector-12'});
  assert(bootstrap.calls.includes('spawn:bn1-casino.js'));assert.deepEqual(bootstrap.allocations,[8,16]);
  const unavailable=await cycle({host:'remote',offloaded:true,reserveError:true});
  assert(!unavailable.installed);assert(unavailable.messages.some(m=>m.includes('valid reserve')));
  assert(bn1Paused(reset,{paused:true,lastAugReset:1,lastNodeReset:1}));
  const resumed=await cycle({offloaded:true,session:{paused:true,stop:true,lastAugReset:1,lastNodeReset:1}});
  assert(resumed.installed,'Manual restart clears a pause even when it has no PID');
  const duplicate=await cycle({otherPid:42,session:{pid:42,lastAugReset:1,lastNodeReset:1}});
  assert.equal(duplicate.calls.length,0);assert(duplicate.messages.some(m=>m.includes('already running')));
  assert(!bn1Paused({...reset,lastAugReset:2},{paused:true,lastAugReset:1,lastNodeReset:1}));
}
console.log('BN1 cycle: 8 GB bootstrap, 16 GB remote/running budget, live home reserves, offloaded autopilot reuse, handoffs, stock verification/hold, goal reset, ordinary-before-NF planning, and first-run gating pass.');

// Exercise the real casino wrapper on home and remotely, without any overlapping home RPC.
for(const host of ['home','remote']) {
  const exits=new Map();globalThis.window={};
  const calls=[],charged=new Set();let used=RamCostConstants.Base,allocation=6.5,flips=0,playerReads=0;
  const control=fn=>({textContent:'fixture',__reactProps$fixture:{onClick:fn}});
  const tails=control(()=>flips++),heads=control(()=>flips++),noop=control(()=>{});
  const input={value:0,__reactProps$fixture:{onChange(){}}};
  const doc={querySelectorAll:()=>[],evaluate:xpath=>({singleNodeValue:
    xpath.includes('Do something else')?null:xpath.includes("'Iker Molina Casino'")?noop:
    xpath.includes("'coin flip'")?noop:xpath.includes("'Tail!'")?tails:xpath.includes("'Head!'")?heads:
    xpath.includes("@type='number'")?input:xpath.includes("text() = 'Tail'")?{}:
    xpath.includes("text() = 'Head'")?null:xpath.includes("'City'")?noop:null})};
  globalThis.document=doc;globalThis.XPathResult={FIRST_ORDERED_NODE_TYPE:1};
  const ns={pid:44,ramOverride:n=>allocation=n,getHostname:()=>host,getResetInfo:()=>reset,
    getMoneySources:()=>({sinceInstall:{casino:flips>1024?10e9:0}}),getPlayer:()=>{playerReads++;return {city:'Aevum',money:10000};},
    sleep:async()=>{},disableLog(){},atExit(fn,id='default'){exits.set(id,fn);},clearPort(){},writePort(){},print(){},tprint(){},printf(){},toast(){},
    spawn:(file,config)=>calls.push([file,config]),ui:{getGameInfo:()=>({versionNumber:51}),openTail(){},closeTail(){}}};
  const wrap=(obj,path=[])=>new Proxy(obj,{get(target,key){const value=target[key],keys=[...path,key];
    if(typeof value==='function')return(...args)=>{const name=keys.join('.');if(!charged.has(name)){used+=getRamCost(keys,true);charged.add(name);}
      assert(used<=allocation+1e-9,`${name}: casino used ${used} of ${allocation} GB`);return value(...args);};
    return key==='ui'?wrap(value,keys):value;
  }});
  await casinoMain(wrap(ns));assert.equal(playerReads,1);assert.equal(flips,1025);
  assert.deepEqual(calls,[['bn1-auto.js',{threads:1,spawnDelay:0,ramOverride:host==='home'?8:16}]]);assert(used<=6.5);assert.equal(allocation,host==='home'?6.5:16);
  assert(exits.has('bn1-casino')&&exits.has('default'),'Controller cleanup must not replace coinflip cleanup');
  for(const exit of exits.values())exit();
  assert(globalThis.window[BN1_SESSION].stop);assert(bn1Paused(reset),'Hold off relaunch while the spawned controller starts');
  delete globalThis.window;delete globalThis.document;delete globalThis.XPathResult;
}
console.log('Real coinflip wrapper: home/remote handoffs, sampling/winning, <=6.5 GB API usage, and a retained 16 GB remote allocation pass.');
