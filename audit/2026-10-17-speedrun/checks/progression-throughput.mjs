import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {singReadMany} from '../../../utils.js';
import {main as bulkMain} from '../../../bin/singReadMany.js';
import {affordableCloudUpgrade} from '../../../host-manager.js';
import {executePurchase} from '../../../purchase-guard.js';
import {factionWorkerDelay} from '../../../work-for-faction2.js';
import {getDefaultDesiredStats,buildDesiredAugSet,buildAugUtilityMap} from '../../../faction-route-planner.js';

const root=new URL('../../../',import.meta.url);
const source=file=>readFileSync(new URL(file,root),'utf8');
const oldWorker=execFileSync('git',['show','3984b1a:work-for-faction2.js'],{cwd:root,encoding:'utf8'});
const worker=source('work-for-faction2.js');
const section=(text,start,end)=>{
  const first=text.indexOf(start),last=text.indexOf(end,first+start.length);
  assert.ok(first>=0 && last>first,`Missing ${start}`);return text.slice(first,last);
};

// Real parent -> helper -> PID-port path. Only the game transport/APIs are fixtures.
function bulkHarness(api={},functionCost=4,limit=Infinity) {
  const ports=new Map(),running=new Set(),launches=[];let pid=0;
  const ns={print:()=>{},getScriptRam:()=>6.6,getFunctionRamCost:name=>name==='baseCost'?1.6:functionCost,
    singularity:api,isRunning:id=>running.has(id),
    getPortHandle:id=>{
      if(!ports.has(id)){const values=[];let resolve;
        ports.set(id,{empty:()=>!values.length,read:()=>values.shift(),
          write:value=>{values.push(structuredClone(value));resolve?.();},nextWrite:()=>new Promise(r=>resolve=r)});}
      return ports.get(id);
    },
    exec(file,host,options,...args){
      assert.equal(file,'bin/singReadMany.js');assert.equal(host,'home');assert.ok(args.every(a=>typeof a==='string'));
      const id=++pid;launches.push({options,args});running.add(id);
      queueMicrotask(async()=>{let exit;
        try{await bulkMain({...ns,pid:id,args,atExit:fn=>exit=fn,ramOverride:ram=>Math.min(ram,limit)});}
        finally{exit();running.delete(id);}
      });return id;
    }};
  return {ns,launches};
}
for(const cost of [1,4,16,64,256]) {
  const h=bulkHarness({getFactionFavor:name=>name.length},cost);
  assert.deepEqual(await singReadMany(h.ns,'getFactionFavor',['CyberSec','Daedalus','CyberSec']),{CyberSec:8,Daedalus:8});
  assert.equal(h.launches.length,1);assert.equal(h.launches[0].options.ramOverride,Math.max(6.6,1.6+cost));
}
{
  const h=bulkHarness({getAugmentationStats:name=>({hacking:name.length})});
  const names=Array.from({length:600},(_,i)=>'Aug'+i),values=await singReadMany(h.ns,'getAugmentationStats',names);
  assert.equal(h.launches.length,2);assert.equal(Object.keys(values).length,600);
  assert.deepEqual(values.Aug599,{hacking:6});
  await assert.rejects(singReadMany(h.ns,'getAugmentationStats',[undefined]),/nonempty names/);
  assert.deepEqual(await singReadMany(h.ns,'getAugmentationStats',[]),{});assert.equal(h.launches.length,2);
}
{
  let calls=0;const h=bulkHarness({getFactionRep:()=>{calls++;return 10;}},64,6.6);
  await assert.rejects(singReadMany(h.ns,'getFactionRep',['CyberSec']),/Insufficient RAM/);assert.equal(calls,0);
  const mutation=bulkHarness({purchaseAugmentation:()=>assert.fail('Bulk helper must never mutate game state')});
  await assert.rejects(singReadMany(mutation.ns,'purchaseAugmentation',['CyberSec']),/Unsupported Singularity read/);
  const failure=bulkHarness({getFactionRep:()=>{throw Error('API unavailable');}});
  await assert.rejects(singReadMany(failure.ns,'getFactionRep',['CyberSec']),/API unavailable/);
  const serialization=bulkHarness({getFactionRep:()=>()=>{}});
  await assert.rejects(singReadMany(serialization.ns,'getFactionRep',['CyberSec']),/Unable to serialize/);
}
// Execute faction-manager's actual table builder: 490 reads require seven launches, not 490.
{
  let reads=0;const methods=['getAugmentationsFromFaction','getFactionRep','getFactionFavor',
    'getAugmentationRepReq','getAugmentationPrice','getAugmentationStats','getAugmentationPrereq'];
  const h=bulkHarness(Object.fromEntries(methods.map(method=>[method,name=>{reads++;return name;}])));
  const build=Function('singReadMany',section(source('faction-manager.js'),'async function buildLib(','/**\n * Report productive')+';return buildLib;')(singReadMany);
  for(const method of methods){const items=Array.from({length:method.startsWith('getAugmentation')&&method!=='getAugmentationsFromFaction'?100:30},(_,i)=>'Name'+i);
    const result=await build(h.ns,items,method);assert.equal(result.Name0,'Name0');assert.equal(Object.keys(result).length,items.length);}
  assert.equal(reads,490);assert.equal(h.launches.length,7);
}

// Run the actual data refresh twice: metadata stays cached but favor must reflect a Go/export reward.
async function favorRefresh(code) {
  const live={favor:149,reads:{}};
  const definitions=section(code,'  async function loadData()','  async function measureRepGainRate(')+
    section(code,'  function refreshDonationFactions()','  async function joinFaction(');
  const make=Function('live','getDefaultDesiredStats','buildDesiredAugSet','buildAugUtilityMap',`
    const ns={},sourceFiles={},FACTIONS=['Daedalus','CyberSec'],resetInfo={currentNode:4,lastAugReset:1},favorToDonate=150,
      desiredStatOverrides=[],namedDesiredAugs=[],priorityAugs=[],CANNOT_DONATE=new Set();
    let pendingInvites=[],playerInfo={},playerInGang=false,factionAugs={},factionFavor={},factionRep={},staticFactionKey='',
      staticGangFaction,augmentationNames=[],augRepReqs={},augStats={},augPrereqs={},ownedAugs=[],installedAugs=[],
      gangFaction=null,gangAugs=new Set(),desiredAugSet=new Set(),augUtility={},donationFactions=new Set();
    const requireArray=(x)=>x,requireObject=x=>x,isApiError=()=>false,isTrue=x=>x===true,asArray=x=>Array.isArray(x)?x:[];
    const singRun=async()=>[],getPlayerInfo=async()=>({factions:['Daedalus']}),getOwnedAugs=async()=>[],joinUsefulInvitations=async()=>{};
    const buildLibSing=async(fn,items)=>{live.reads[fn]=(live.reads[fn]??0)+1;return Object.fromEntries(items.map(name=>[name,
      fn==='getFactionFavor'?live.favor:fn==='getAugmentationsFromFaction'?['The Red Pill']:fn==='getAugmentationStats'?{}:
      fn==='getAugmentationPrereq'?[]:fn==='getAugmentationRepReq'?2500000:0]));};
    ${definitions}
    return {step:loadData,state:()=>({favor:factionFavor.Daedalus,donations:[...donationFactions]})};`);
  const check=make(live,getDefaultDesiredStats,buildDesiredAugSet,buildAugUtilityMap);
  await check.step();assert.deepEqual(check.state().donations,[]);
  live.favor=150;await check.step();
  assert.equal(live.reads.getAugmentationsFromFaction,1,'Static offerings should remain cached');
  return check.state();
}
assert.equal((await favorRefresh(oldWorker)).favor,149,'Reproduce the old stale-favor behavior');
assert.deepEqual(await favorRefresh(worker),{favor:150,donations:['Daedalus']});

// Execute the real worker loop with a fake clock; progress and screen handoffs must meet their deadlines.
async function timing(code,withLease=false) {
  const live={now:0,plans:[],acks:[],published:[],end:withLease?40000:31000};
  const loop=code.slice(code.indexOf('  let nextPlan = 0;'),code.lastIndexOf('\n}'));
  const STOP=Symbol('stop');
  const run=Function('live','STOP','factionWorkerDelay',`return (async()=>{
    const Date={now:()=>live.now},LOOP_SLEEP=30000,PROGRESS_CHECK_INTERVAL=5000,resetInfo={lastAugReset:1,lastNodeReset:1},
      infiltrationEnabled=true,repRateCache={CyberSec:1};
    let activePlan=null,requestedReplanDelay=60000;
    const ns={pid:17,sleep:async ms=>{live.now+=ms;if(live.now>live.end)throw STOP;}},log=()=>{},getErrorInfo=String;
    const planAndAct=async()=>{live.plans.push(live.now);activePlan={kind:'faction-rep',faction:'CyberSec',targetRep:live.plans.length*100};};
    const singRun=async(_ns,fn)=>fn==='getFactionRep'?(live.now>=2000?100:0):{type:'FACTION',factionName:'CyberSec'};
    const runScriptLocal=async(_ns,file,persistent,args)=>{
      if(args[0]==='target'){live.published.push(JSON.parse(args[1]));return true;}
      if(${withLease} && live.now>=2000 && live.now<35000){live.acks.push(live.now);return true;}return false;
    };
    ${loop}
  })();`);
  await assert.rejects(run(live,STOP,factionWorkerDelay),e=>e===STOP);return live;
}
assert.equal((await timing(oldWorker)).plans[1],30000);
const fast=await timing(worker);assert.equal(fast.plans[1],5000);assert.equal(fast.published.length,2,'Do not republish unchanged plans every poll');
assert.equal((await timing(oldWorker,true)).acks[0],30000);
const paused=await timing(worker,true);assert.equal(paused.acks[0],5000);assert.equal(paused.plans[1],35000);
assert.equal(factionWorkerDelay(0,15000,0,null,false),15000,'Invite planning should honor its 15-second deadline');

// Actual host-manager pass and shared purchase guard: one affordable jump, same reserve/pass budget.
{
  let money=1e9,ram=2,spent=0,upgrades=0;
  const ns={getHostname:()=> 'home',read:()=>String(8e8),getServerMoneyAvailable:()=>money,getServerMaxRam:()=>ram,sleep:async()=>{},
    cloud:{getServerNames:()=>['worker'],getServerLimit:()=>1,getRamLimit:()=>2**20,
      getServerUpgradeCost:(_host,size)=>(size-ram)*1000,
      upgradeServer:(_host,size)=>{const cost=(size-ram)*1000;money-=cost;spent+=cost;ram=size;upgrades++;return true;}}};
  const pass=Function('getActiveSourceFiles','getReserve','purchase','affordableCloudUpgrade',
    source('host-manager.js').slice(source('host-manager.js').indexOf('async function tryUpgradeRam(ns)'))+';return tryUpgradeRam;')(
      async()=>({}),async()=>8e8,async(ns,space,method,args,policy)=>executePurchase(ns,space,method,args,policy),affordableCloudUpgrade);
  await pass(ns);assert.equal(upgrades,1);assert.equal(ram,131072);assert.equal(spent,131070000);assert.ok(money>=8e8);
}
assert.equal(affordableCloudUpgrade(2,1024,1e6,()=>-1),null);
assert.equal(affordableCloudUpgrade(2,1024,1e6,()=>NaN),null);
assert.equal(affordableCloudUpgrade(2,1024,NaN,()=>1),null);
assert.equal(affordableCloudUpgrade(1024,1024,1e6,()=>1),null);

if(process.argv[2]) {
  const engine=resolve(process.argv[2]);
  const costs=readFileSync(resolve(engine,'src/Netscript/RamCostGenerator.ts'),'utf8')
    .replace('import { Player } from "@player";', 'export const Player={bitNodeN:1,sf4:3,activeSourceFileLvl(){return this.sf4;}};')
    .replace('import { NSFull } from "../NetscriptFunctions";','');
  const {getRamCost,RamCostConstants,Player}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(costs)).toString('base64'));
  const dynamic=readFileSync(resolve(engine,'src/Netscript/NetscriptHelpers.tsx'),'utf8').match(/function updateDynamicRam[\s\S]+?\n}/)[0];
  const enforce=Function('RamCostConstants',`const log=()=>{},errorMessage=(_ctx,msg)=>new Error(msg),formatRam=String,
    killWorkerScript=ws=>{ws.killed=true;};${stripTypeScriptTypes(dynamic)};return updateDynamicRam;`)(RamCostConstants);
  const methods=['getAugmentationsFromFaction','getFactionRep','getFactionFavor','getAugmentationRepReq',
    'getAugmentationPrice','getAugmentationStats','getAugmentationPrereq','getCrimeChance'];
  for(const [node,sf4] of [[1,1],[1,2],[1,3],[4,0]])for(const method of methods) {
    Player.bitNodeN=node;Player.sf4=sf4;
    const cost=name=>name==='baseCost'?RamCostConstants.Base:getRamCost(name.split('.'),true);
    const required=Math.max(6.6,cost('baseCost')+cost('singularity.'+method));
    const ws={dynamicRamUsage:RamCostConstants.Base,dynamicLoadedFns:{},scriptRef:{ramUsage:required,threads:1}};
    let calls=0,result,exit;const names=Array.from({length:150},(_,i)=>'Name'+i);
    const raw={pid:42,args:[method,JSON.stringify(names)],getPortHandle:()=>({write:value=>{result=structuredClone(value);}}),
      atExit:fn=>{exit=fn;},getFunctionRamCost:cost,
      ramOverride:value=>{assert.ok(value<=required+1e-9);assert.ok(value+1e-9>=ws.dynamicRamUsage);ws.scriptRef.ramUsage=value;return value;},
      singularity:{[method]:name=>{calls++;return name;}}};
    const wrap=(object,path=[])=>new Proxy(object,{get(target,key){const value=target[key],parts=[...path,key];
      if(typeof value==='function')return(...args)=>{enforce({workerScript:ws,function:key,functionPath:parts.join('.')},getRamCost(parts,true));return value(...args);};
      return key==='singularity'?wrap(value,parts):value;
    }});
    await bulkMain(wrap(raw));exit();
    assert.equal(calls,names.length);assert.deepEqual(result,Object.fromEntries(names.map(name=>[name,name])));
    assert.ok(!ws.killed);assert.ok(ws.dynamicRamUsage<=required+1e-9);
  }
  // Actual official cost curve, including BN softcaps: the jump equals all intermediate price differences.
  const purchases=readFileSync(resolve(engine,'src/Server/ServerPurchases.ts'),'utf8');
  const formula=stripTypeScriptTypes(section(purchases,'export function getCloudServerCost(', 'export const getCloudServerUpgradeCost'),{mode:'transform'}).replace('export ','');
  const make=Function('currentNodeMults',`const ServerConstants={BaseCostFor1GBOfRamServer:55000},getCloudServerMaxRam=()=>2**20,
    isPowerOfTwo=x=>Number.isInteger(Math.log2(x));${formula}return getCloudServerCost;`);
  for(const CloudServerCost of [0.1,1,10])for(const CloudServerSoftcap of [1,1.3,1.7]) {
    const cost=make({CloudServerCost,CloudServerSoftcap});
    for(const current of [2,64,1024])for(const budget of [0,1e6,1e9,1e12]){
      const quote=size=>cost(size)-cost(current);
      const sizes=Array.from({length:20-Math.log2(current)},(_,i)=>2**(Math.log2(current)+i+1));
      const expected=sizes.filter(size=>quote(size)<=budget).at(-1),actual=affordableCloudUpgrade(current,2**20,budget,quote);
      assert.equal(actual?.ram,expected);
      if(actual){let total=0;for(let ram=current*2;ram<=actual.ram;ram*=2)total+=cost(ram)-cost(ram/2);
        assert.ok(Math.abs(total-actual.cost)<=Math.max(0.01,actual.cost*1e-12));}
    }
  }
}
console.log('Faction bulk transport/RAM/errors, 490-to-7 helper launches, live favor refresh, 5-second progress/lease deadlines, and guarded direct cloud upgrades passed.');
