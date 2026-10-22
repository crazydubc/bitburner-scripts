// Compare the real dispatcher against the pre-handoff implementation. Sharing may
// occupy reclaimable RAM, but must not change the batches placed on each host.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {main as dispatch} from '../../../bin/serverRun.js';
import {serverRun} from '../../../utils.js';

const previousSource=execFileSync('git',['show','1ead824:bin/serverRun.js'],{encoding:'utf8',cwd:new URL('../../../',import.meta.url)});
const previous=(await import('data:text/javascript;base64,'+Buffer.from(previousSource).toString('base64'))).main;
const actualPerformance=globalThis.performance;
let clock=0;globalThis.performance={now:()=>clock++};
const round=value=>Math.round(value*100)/100;

function harness({home=256,remotes=[128],hacknet=0,withSharing=true,foreign=false}={}) {
  const hosts=new Map([['home',{max:home,base:Math.min(20,home/4)}],
    ...remotes.map((max,i)=>['worker-'+i,{max,base:Math.min(16,max/4)}]),
    ['hacknet-server-0',{max:hacknet,base:0}]]);
  const processes=new Map(),launches=[],kills=[],events=[];
  let nextPid=100,exit=()=>{},record;
  const used=host=>round(hosts.get(host).base+[...processes.values()].filter(p=>p.server===host).reduce((sum,p)=>sum+p.ramUsage*p.threads,0));
  const add=(server,threads,args=['--owner',7],filename='bin/share.js')=>{
    const job={pid:++nextPid,server,threads,args,filename,ramUsage:4.1};processes.set(job.pid,job);return job;
  };
  // An unrelated sharing process is never part of the reclaimable budget.
  if(foreign)add('home',1,['--owner',88]);
  const pids=[];
  if(withSharing)for(const [host,data] of hosts) {
    if(host.startsWith('hacknet'))continue;
    const available=data.max-used(host),buffer=Math.max(host==='home'?64:8,available*0.05);
    const threads=Math.floor((available-buffer)/4.1);
    if(threads>0)pids.push(add(host,threads).pid);
  }
  const initial=new Map([...processes].map(([pid,job])=>[pid,{...job}]));
  const state={onScan:null,onSleep:null,failKill:false};
  const ns={pid:99,args:[],scan(host){state.onScan?.();return host==='home'?[...hosts.keys()].filter(s=>s!=='home'):['home'];},
    hasRootAccess:host=>hosts.has(host),getServerMaxRam:host=>hosts.get(host).max,getServerUsedRam:used,
    getRunningScript:pid=>processes.get(pid)??null,isRunning:pid=>processes.has(pid),
    scp:async()=>true,sleep:async()=>{clock+=1;state.onSleep?.();},
    getHackTime:()=>2500,getGrowTime:()=>8000,getWeakenTime:()=>10000,
    tprintf(){},getPortHandle:()=>({write:value=>record=value}),atExit:fn=>exit=fn,
    kill(pid){
      assert(pids.includes(pid),'Never reclaim a manual/foreign PID');
      if(state.failKill)return false;
      kills.push(pid);events.push(['kill',pid]);return processes.delete(pid);
    },
    exec(file,host,options,...args){
      const ram=file.includes('hack-target')?1.7:1.75;
      assert(Number.isInteger(options.threads)&&options.threads>0);
      assert(used(host)+ram*options.threads<=hosts.get(host).max+1e-8,`Insufficient actual RAM for ${file} on ${host}`);
      const launch={file,host,threads:options.threads,args};launches.push(launch);events.push(['exec',launch]);
      const pid=10000+launches.length;
      processes.set(pid,{pid,filename:file,server:host,threads:options.threads,ramUsage:ram,args});return pid;
    }};
  const run=async(main,args,encoded=JSON.stringify({owner:7,pids}))=>{
    ns.args=[...args,encoded];clock=0;await main(ns);exit();return record;
  };
  return {ns,hosts,processes,launches,kills,events,initial,state,pids,add,run};
}

const counts=(w1=0,g1=0,w2=0,h1=0,w3=0,g2=0,w4=0,bh=0,bw1=0,bg=0,bw2=0,batches=0,hacknet=false)=>
  [false,'n00dles',w1,g1,w2,h1,w3,g2,w4,bh,bw1,bg,bw2,batches,hacknet];

try {
let comparisons=0;
// Preparation, chunk fallback, full batches, tiny-home emergency reserves and hacknet fallback.
for(const size of [
  {home:8,remotes:[16,32,128]}, {home:64,remotes:[32,64]},
  {home:256,remotes:[128,256]}, {home:4096,remotes:[64,1024],hacknet:256},
])for(const args of [counts(1),counts(20),counts(200),counts(1,20,2,18,1,20,2),
  counts(0,0,0,0,0,0,0,3,1,10,1,20),counts(0,0,0,0,0,0,0,10,2,30,3,60,true)]) {
  const reference=harness({...size,withSharing:false}),current=harness(size);
  const expected=await reference.run(previous,args,'');
  assert.deepEqual(await current.run(dispatch,args),expected);
  assert.deepEqual(current.launches,reference.launches,'Reclaimable sharing cannot change hacking placement, threads or delays');
  comparisons++;
}

// A tiny launch fits the existing cushion: every share PID survives.
let h=harness();await h.run(dispatch,counts(1));assert.equal(h.kills.length,0);
for(const pid of h.pids)assert(h.processes.has(pid));

// Only the busy remote needs to hand over RAM; home's bonus stays continuous.
h=harness();const home=h.pids.find(pid=>h.processes.get(pid).server==='home');
const remote=h.pids.find(pid=>h.processes.get(pid).server==='worker-0');
await h.run(dispatch,counts(20));assert.deepEqual(h.kills,[remote]);assert(h.processes.has(home));
assert.equal(h.events[0][0],'kill');assert.equal(h.events[1][0],'exec');

// Duplicate/stale/foreign/manual PIDs never inflate RAM or authorize unrelated kills.
h=harness({foreign:true});
const foreign=[...h.processes.values()].find(job=>job.args[1]===88);
const ordinary=h.add('home',1,['--owner',7],'manual.js');
await h.run(dispatch,counts(300),JSON.stringify({owner:7,pids:[...h.pids,...h.pids,foreign.pid,ordinary.pid,99999,0,-1,'bad']}));
assert(h.processes.has(foreign.pid));assert(h.processes.has(ordinary.pid));
assert.equal(new Set(h.kills).size,h.kills.length);

// Old callers and malformed/incorrect handoffs treat sharing as ordinary occupied RAM.
for(const encoded of [undefined,'','not-json','null','{}','[]',JSON.stringify({owner:7,pids:'all'}),
  JSON.stringify({owner:88,pids:[101,102]}),JSON.stringify({owner:-1,pids:[101,102]})]) {
  h=harness();
  if(encoded===undefined) {h.ns.args=counts(300);await dispatch(h.ns);}
  else await h.run(dispatch,counts(300),encoded);
  assert.equal(h.kills.length,0);for(const pid of h.pids)assert(h.processes.has(pid));
}

// A worker disappearing between the ownership read and census is already free;
// it must not be counted twice or cause over-allocation.
h=harness();h.state.onScan=()=>{for(const pid of h.pids)h.processes.delete(pid);};
const reference=harness({withSharing:false});
await h.run(dispatch,counts(150));await reference.run(previous,counts(150),'');
assert.deepEqual(h.launches,reference.launches);assert.equal(h.kills.length,0);

// Worker loss at a dispatch yield also leaves the ledger valid for later batches.
h=harness({home:65536,remotes:[65536]});let yields=0;
h.state.onSleep=()=>{yields++;for(const pid of h.pids)h.processes.delete(pid);};
const yieldedReference=harness({home:65536,remotes:[65536],withSharing:false});
const manyBatches=counts(0,0,0,0,0,0,0,1,1,1,1,300);
await h.run(dispatch,manyBatches);await yieldedReference.run(previous,manyBatches,'');
assert(yields>0);assert.deepEqual(h.launches,yieldedReference.launches);

// A failed kill must not turn a virtual budget into an exec against occupied RAM.
h=harness();h.state.failKill=true;await h.run(dispatch,counts(100));
for(const pid of h.pids)assert(h.processes.has(pid));

// Transport retains all fifteen positional arguments and appends a primitive string.
const args=counts(1,2,3,4,5,6,7,8,9,10,11,12,true),encoded=JSON.stringify({owner:7,pids:[101]});
let sent;
const transport={print(){},getScriptRam:()=>4.9,exec:(file,host,options,...values)=>{sent=values;return 40;},
  getPortHandle:()=>({empty:()=>false,read:()=>({lastpid:42})})};
assert.equal((await serverRun(transport,...args,encoded)).lastpid,42);assert.deepEqual(sent,[...args,encoded]);
await serverRun(transport,...args);assert.deepEqual(sent,[...args,'']);
console.log(`${comparisons} dispatcher comparisons preserve batch placement/timing; selective reclaim, live-RAM limits, old callers, ownership guards and primitive RPC handoff passed.`);
} finally {globalThis.performance=actualPerformance;}
