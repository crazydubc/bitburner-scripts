// Real corporation wrapper/helper with the official division getter, deprecation hook and port clone.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {corpRun} from '../../../utils.js';
import {main as corpMain, prepareCorporationResultForPort} from '../../../bin/corpRun.js';

const root=new URL('../../../',import.meta.url),engine=resolve(process.argv[2]??'../bitburner-engine');
const source=file=>readFileSync(resolve(engine,file),'utf8');
const moduleUrl=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const warnings=[],infos=[];
const deprecationSource=source('src/utils/DeprecationHelper.ts').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const {setDeprecatedProperties,clearWarnings}=Function('Terminal',stripTypeScriptTypes(deprecationSource)+
  ';return {setDeprecatedProperties,clearWarnings:()=>deprecatedWarningsGiven.clear()};')({
    warn:message=>warnings.push(message),info:message=>infos.push(message)});
const corporationSource=source('src/NetscriptFunctions/Corporation.ts');
const start=corporationSource.indexOf('  function getSafeDivision('),end=corporationSource.indexOf('  const warehouseAPI:',start);
assert(start>=0&&end>start);
const getSafeDivision=Function('getRecordKeys','setDeprecatedProperties',
  stripTypeScriptTypes(corporationSource.slice(start,end))+';return getSafeDivision;')(Object.keys,setDeprecatedProperties);
const portSource=source('src/NetscriptPort.ts').replace(/^import .*;\n/gm,'');
const {PortHandle}=await import(moduleUrl('const Settings={MaxPortCapacity:50},NetscriptPorts=new Map();\n'+stripTypeScriptTypes(portSource)));
const oldMain=(await import(moduleUrl(execFileSync('git',['show','9655efa:bin/corpRun.js'],{cwd:root,encoding:'utf8'})))).main;

const expected={name:'Tobacco',industry:'Tobacco',awareness:12,popularity:9,productionMult:1.25,researchPoints:321,
  lastCycleRevenue:1234,lastCycleExpenses:234,thisCycleRevenue:765,thisCycleExpenses:345,numAdVerts:2,
  cities:['Sector-12','Aevum'],products:['Product A','Product B'],makesProducts:true,maxProducts:3};
function division() {
  return getSafeDivision({...expected,offices:{'Sector-12':{},Aevum:{}},
    products:new Map(expected.products.map(name=>[name,{}]))});
}
function harness(main=corpMain,api={getDivision:()=>division()}) {
  warnings.length=infos.length=0;clearWarnings();
  let nextPid=1;
  const running=new Set(),calls=[];
  const ns={print:()=>{},getHostname:()=> 'n00dles',getScriptRam:()=>23.6,getFunctionRamCost:()=>3,
    isRunning:pid=>running.has(pid),getPortHandle:pid=>new PortHandle(pid),
    exec(file,host,options,...args) {
      assert.equal(file,'bin/corpRun.js');assert.equal(host,'home');
      const pid=nextPid++;new PortHandle(pid).clear();running.add(pid);calls.push({options,args});
      queueMicrotask(async()=>{
        let exit;
        try {await main({...ns,pid,args,getHostname:()=> 'home',corporation:api,
          ramOverride:ram=>ram,atExit:fn=>exit=fn});}
        finally {exit();running.delete(pid);}
      });return pid;
    }};
  return {ns,calls};
}

// No direct .type read is required: the old port write alone invokes the game's alias getter.
let h=harness(oldMain);
const old=await corpRun(h.ns,'getDivision','Tobacco');
assert.equal(old.industry,'Tobacco');
assert(warnings.includes('Accessed deprecated function or property: ns.corporation.getDivision().type'));
assert.equal(warnings.length,3);

h=harness();
const result=await corpRun(h.ns,'getDivision','Tobacco');
assert.deepEqual(result,expected);assert.equal(Object.hasOwn(result,'type'),false);
assert.deepEqual(warnings,[]);assert.deepEqual(infos,[]);
assert.equal(h.calls[0].options.ramOverride,23.6);
h=harness();
assert.deepEqual(await corpRun(h.ns,'getDivision','--batch',JSON.stringify([['Tobacco'],['Tobacco']])),[expected,expected]);
assert.deepEqual(warnings,[],'Batched division reads must also omit the deprecated getter');

// Keep the game object intact: its deprecated alias is non-configurable, so delete is not a solution.
const raw=division(),descriptor=Object.getOwnPropertyDescriptor(raw,'type');
assert.equal(descriptor.configurable,false);assert.equal(descriptor.enumerable,true);
prepareCorporationResultForPort('getDivision',raw);
assert.deepEqual(Object.getOwnPropertyDescriptor(raw,'type'),descriptor);
assert.deepEqual(warnings,[]);

// A getter that throws must also be omitted without being evaluated. Preserve future public fields.
const future={...expected,extraSupportedField:{value:42}};
Object.defineProperty(future,'type',{enumerable:true,get:()=>assert.fail('Deprecated getter evaluated')});
h=harness(corpMain,{getDivision:()=>future});
assert.deepEqual(await corpRun(h.ns,'getDivision','Tobacco'),{...expected,extraSupportedField:{value:42}});
h=harness(corpMain,{getDivision:()=>({...expected})});
assert.deepEqual(await corpRun(h.ns,'getDivision','Tobacco'),expected,'Work after the game removes the alias');

// Other results keep their shape, including unrelated type fields, primitive returns and async APIs.
for(const value of [false,0,null,undefined,[],{type:'unrelated',industry:'keep',values:[1,2]}]) {
  h=harness(corpMain,{query:()=>value});
  assert.deepEqual(await corpRun(h.ns,'query'),value);
}
for(const value of [false,0,null,undefined,[]])
  assert.equal(prepareCorporationResultForPort('getDivision',value),value);
h=harness(corpMain,{nextUpdate:async()=>123});assert.equal(await corpRun(h.ns,'nextUpdate'),123);
h=harness(corpMain,{getDivision:()=>{throw Error('Division missing');}});
await assert.rejects(corpRun(h.ns,'getDivision','missing'),/Division missing/);
h=harness(corpMain,{getDivision:()=>({...expected,bad:()=>{}})});
await assert.rejects(corpRun(h.ns,'getDivision','Tobacco'),/Unable to serialize result/);

// Terminate a real home helper from an offloaded caller, with the game's actual single-fire
// atExit/stop ordering and cloned PID port. The parent must get exactly one answer.
const killSource=source('src/Netscript/killWorkerScript.ts');
const k=killSource.indexOf('function stopAndCleanUpWorkerScript(');
assert(k>=0);
const stopWorker=Function('removeWorkerScript','handleUnknownError','ScriptDeath',stripTypeScriptTypes(
  killSource.slice(k,killSource.indexOf('\n}',k)+2))+';return stopAndCleanUpWorkerScript;')(
  ws=>ws.remove(),e=>{throw e;},Error);
const preFix=(await import(moduleUrl(execFileSync('git',['show','00e375c:bin/corpRun.js'],{cwd:root,encoding:'utf8'})))).main;
async function materialOrder(main,orders,mode) {
  const rates=new Map([['Hardware',2],['Robots',0]]),writes=[],running=new Set();
  const ns={print:()=>{},getHostname:()=> 'run4theh111z',getScriptRam:()=>23.6,
    getFunctionRamCost:n=>n==='baseCost'?1.6:n==='corporation.buyMaterial'?20:0,
    isRunning:pid=>running.has(pid),getPortHandle:pid=>new PortHandle(pid),
    exec(file,host,options,...args) {
      assert.equal(file,'bin/corpRun.js');assert.equal(host,'home');assert.equal(options.ramOverride,23.6);
      const pid=101,port=new PortHandle(pid);port.clear();running.add(pid);
      const ws={atExit:new Map(),env:{stopFlag:false,runningFn:''},remove:()=>running.delete(pid)};
      queueMicrotask(async()=>{
        let inCleanup=false;
        try {await main({...ns,pid,args,ramOverride:n=>n,atExit:fn=>ws.atExit.set('default',fn),
          getPortHandle:()=>({write:v=>{writes.push(v);port.write(v);}}),corporation:{
            buyMaterial:(_div,_city,mat,rate)=>{
              if(mode==='invalid'&&mat==='Robots'&&rate>0)throw Error('Invalid material order');
              if(mode==='cleanup-error'&&inCleanup&&mat==='Hardware')throw Error('Warehouse unavailable');
              rates.set(mat,rate);
            },
            nextUpdate:async()=>{
              if(mode==='kill'||mode==='cleanup-error'){inCleanup=true;stopWorker(ws);throw Error('Already stopped');}
              if(mode==='phase-error')throw Error('Corporation API unavailable');
              return mode==='late'?'SALE':'PURCHASE';
            }}});}finally{stopWorker(ws);}
      });return pid;
    }};
  let result,error;try{result=await corpRun(ns,'buyMaterial','--once',JSON.stringify(orders));}catch(e){error=e.message;}
  assert.equal(writes.length,1);return {result,error,rates:Object.fromEntries(rates)};
}
const legacy=[['Tobacco','Sector-12','Hardware',9],['Tobacco','Sector-12','Robots',4]];
let order=await materialOrder(preFix,legacy,'kill');
assert.equal(order.error,'corporation.buyMaterial: corporation.buyMaterial exited before returning a result');
const inputs=[['Water Utilities','Sector-12','Hardware',9,2],['Water Utilities','Sector-12','Robots',4,0]];
for(const mode of ['success','kill','late']){
  order=await materialOrder(corpMain,inputs,mode);assert.equal(order.error,undefined);
  assert.equal(order.result,mode==='success');assert.deepEqual(order.rates,{Hardware:2,Robots:0});
}
order=await materialOrder(corpMain,legacy,'kill');assert.equal(order.result,false);assert.deepEqual(order.rates,{Hardware:0,Robots:0});
for(const [mode,message] of [['invalid','Invalid material order'],['phase-error','Corporation API unavailable'],['cleanup-error','Could not restore material buy rates']]){
  order=await materialOrder(corpMain,inputs,mode);assert.match(order.error,new RegExp(message));
  assert.equal(order.rates.Robots,0,'Continue cleaning up other entries when one fails');
}
console.log('Official division getter, worker cleanup and PID port: deprecated alias avoidance, early-exit reproduction, input-rate restoration, one reply and error propagation passed.');
