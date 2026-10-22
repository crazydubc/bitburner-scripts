import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createShareController, getShareContext, shareContextRam, shareBuffer, validShareOptions,
  SHARE_DEFAULTS, SHARE_WORKER} from '../../../share-controller.js';
import {main as contextMain} from '../../../bin/share-context.js';
import {main as shareMain} from '../../../bin/share.js';
import {getRemoteScriptFiles} from '../../../utils.js';

const actualNow=Date.now;let now=1_000_000;
Date.now=()=>now;
try {
assert(validShareOptions(SHARE_DEFAULTS));
for(const options of [{'share-mode':'invalid'},{'share-home-buffer':NaN},{'share-host-buffer':-1},{'share-buffer-fraction':1.1}])
  assert(!validShareOptions({...SHARE_DEFAULTS,...options}));
assert.equal(shareBuffer('home',128),64);assert.equal(shareBuffer('remote',128),8);
assert.equal(shareBuffer('home',8192),409.6);assert.equal(shareBuffer('remote',8192),409.6);
assert(getRemoteScriptFiles('kernel.js').includes('share-controller.js'));
const downloader=readFileSync(new URL('../../../git-pull.js',import.meta.url),'utf8');
assert(downloader.includes("'share-controller.js'"));assert(downloader.includes("'bin/share-context.js'"));

function harness({mode='on',sourceFiles={},currentNode=0,home=256,remote=128,work=null,tasks=[],sf4cost=0.5}={}) {
  const hosts=new Map([
    ['home',{maxRam:home,base:20,cpuCores:8}],['worker',{maxRam:remote,base:16,cpuCores:1}],
    ['tiny',{maxRam:8,base:0}],['unrooted',{maxRam:1024,base:0,root:false}],['hacknet-server-0',{maxRam:512,base:0}],
  ]);
  const processes=new Map(),ports=new Map(),launches=[],kills=[],logs=[],errors=[];
  const state={work,tasks,missing:false,copyFails:false,execFails:false,onCopy:null,helperReads:0};
  let nextPid=1000;
  const options={...SHARE_DEFAULTS,'share-mode':mode};
  const used=host=>hosts.get(host).base+[...processes.values()].filter(p=>p.host===host).reduce((sum,p)=>sum+p.ram*p.threads,0);
  const port=id=>{
    if(!ports.has(id)){const data=[];let resolve;ports.set(id,{empty:()=>!data.length,read:()=>data.shift(),
      write:value=>{data.push(structuredClone(value));resolve?.();},nextWrite:()=>new Promise(r=>resolve=r)});}
    return ports.get(id);
  };
  const costs={'baseCost':1.6,'singularity.getCurrentWork':sf4cost,'sleeve.getNumSleeves':4,'sleeve.getTask':4};
  const ns={pid:7,print:value=>logs.push(value),getPortHandle:port,sleep:async ms=>{now+=ms;},
    getFunctionRamCost:fn=>{assert(fn in costs,fn);return costs[fn];},
    getServerMaxRam:host=>hosts.get(host).maxRam,getServerUsedRam:used,
    getScriptRam:file=>file===SHARE_WORKER?4.1:file==='bin/scp.js'?2.2:state.missing?0:1.6,
    isRunning:pid=>pid===7||processes.has(pid),
    kill:pid=>{assert(processes.has(pid),'Only a live, owned worker may be killed');kills.push(pid);processes.delete(pid);return true;},
    exec(file,host,opts,...args){
      assert(args.every(arg=>['boolean','number','string'].includes(typeof arg)));
      if(file===SHARE_WORKER&&state.execFails&&host==='worker')return 0;
      const ram=opts.ramOverride??ns.getScriptRam(file),threads=opts.threads;
      assert(used(host)+ram*threads<=hosts.get(host).maxRam+1e-8,`${file}: launch exceeds free RAM on ${host}`);
      const pid=++nextPid,process={pid,file,host,ram,threads,args};processes.set(pid,process);launches.push(process);
      if(file===SHARE_WORKER){
        assert.deepEqual(args,['--owner',7]);
        const availableBeforeLaunch=hosts.get(host).maxRam-used(host)+ram*threads;
        assert(hosts.get(host).maxRam-used(host)>=shareBuffer(host,availableBeforeLaunch,options)-1e-8);
        return pid;
      }
      queueMicrotask(async()=>{
        let onExit=()=>{};
        try {
          if(file==='bin/scp.js') {state.onCopy?.(args[1]);port(pid).write(!state.copyFails);}
          else {
            assert.equal(file,'bin/share-context.js');state.helperReads++;
            let charged=1.6;const chargedApis=new Set();
            const charge=fn=>{if(!chargedApis.has(fn)){chargedApis.add(fn);charged+=costs[fn];}
              assert(charged<=process.ram+1e-8,`Helper RAM underallocated: ${fn}`);};
            await contextMain({...ns,pid,args,atExit:fn=>onExit=fn,
              ramOverride:value=>{assert(used(host)-process.ram+value<=hosts.get(host).maxRam+1e-8);process.ram=value;return value;},
              singularity:{getCurrentWork:()=>{charge('singularity.getCurrentWork');if(state.work instanceof Error)throw state.work;return state.work;}},
              sleeve:{getNumSleeves:()=>{charge('sleeve.getNumSleeves');return state.tasks.length;},
                getTask:i=>{charge('sleeve.getTask');return state.tasks[i];}},
            });
          }
        } catch(error){errors.push(error);port(pid).write(`ERROR:${String(error)}`);}
        finally{onExit();processes.delete(pid);}
      });
      return pid;
    },
  };
  const servers=()=>[...hosts].map(([hostname,h])=>({hostname,...h,hasAdminRights:h.root!==false}));
  const workers=()=>[...processes.values()].filter(p=>p.file===SHARE_WORKER);
  return {ns,hosts,processes,launches,kills,logs,errors,state,used,servers,workers,options,
    controller:createShareController(ns,options,sourceFiles,currentNode)};
}

// No 1.2 TB gate. Pack all usable RAM, preserving buffers, manual jobs, and hash production.
let h=harness();h.processes.set(99,{pid:99,file:'manual.js',host:'worker',ram:8,threads:1,args:[]});
assert(await h.controller.update(h.servers(),()=>true));
assert.deepEqual(h.workers().map(p=>p.host).sort(),['home','worker']);
for(const host of ['home','worker']){
  const free=h.hosts.get(host).maxRam-h.used(host),buffer=shareBuffer(host,h.hosts.get(host).maxRam);
  assert(free>=buffer-1e-8);assert(free-buffer<4.1+1e-8,'No extra share thread fits beyond the buffer');
}
const starts=h.launches.length;
await h.controller.update(h.servers(),()=>true);assert.equal(h.launches.length,starts,'Throttle allocation sweeps');
now+=2100;await h.controller.update(h.servers(),()=>true);assert.equal(h.launches.length,starts,'Stable workers are not restarted');
h.hosts.get('home').base+=40;now+=2100;await h.controller.update(h.servers(),()=>true);
assert(h.hosts.get('home').maxRam-h.used('home')>=64-1e-8,'Reclaim sharing when another consumer uses the buffer');
h.hosts.get('worker').base-=8;now+=2100;await h.controller.update(h.servers(),()=>true);
assert(h.hosts.get('worker').maxRam-h.used('worker')<8+4.1+1e-8,'Expand to use released RAM');
h.controller.stop();assert.equal(h.workers().length,0);assert(h.processes.has(99));assert(!h.kills.includes(99));
assert.equal(h.errors.length,0);

// Reported BN4.1 case: 4 TB home (next upgrade ~$32b), 97 GB free during faction work.
// A percentage of installed RAM must not reserve all free RAM on a busy large host.
h=harness({mode:'auto',currentNode:4,sourceFiles:{4:3},home:4096,remote:0,
  work:{type:'FACTION',factionName:'CyberSec'}});
h.hosts.get('home').base=4096-97;
assert(await h.controller.update(h.servers(),()=>true));
assert.equal(h.workers().length,1);assert.equal(h.workers()[0].threads,8);
assert(Math.abs((h.hosts.get('home').maxRam-h.used('home'))-64.2)<1e-8);
const steadyPid=h.workers()[0].pid;
for(let tick=0;tick<36;tick++) {
  now+=5001;assert(await h.controller.update(h.servers(),()=>true));
  assert.equal(h.workers()[0].pid,steadyPid,'Keep sharing beyond one 10s cycle while faction work and capacity remain');
}
h.state.work={type:'COMPANY'};now+=5001;
assert.equal(await h.controller.update(h.servers(),()=>true),false);assert.equal(h.workers().length,0);

// The percentage cushion scales with the reclaimable spare pool, including our own workers.
// Repeated sweeps must neither gradually consume the buffer nor resize stable allocations.
for(const fraction of [0.05,0.25,1]) {
  h=harness({home:8192,remote:4096});h.options['share-buffer-fraction']=fraction;
  const available=new Map([...h.hosts].map(([host,data])=>[host,data.maxRam-h.used(host)]));
  await h.controller.update(h.servers(),()=>true);
  const pids=h.workers().map(worker=>worker.pid);
  for(const host of ['home','worker']) {
    const free=h.hosts.get(host).maxRam-h.used(host),buffer=shareBuffer(host,available.get(host),h.options);
    assert(free>=buffer-1e-8);assert(free-buffer<4.1+1e-8);
  }
  for(let tick=0;tick<5;tick++) {
    now+=2100;await h.controller.update(h.servers(),()=>true);
    assert.deepEqual(h.workers().map(worker=>worker.pid),pids);
  }
  h.controller.stop();
}

// BN1 cannot report manual work before SF4. Auto must still offer spare-RAM sharing,
// even if sleeves are available but idle; an explicit off must always win.
for(const sourceFiles of [{},{1:1},{1:2,10:1}]) {
  h=harness({mode:'auto',currentNode:1,sourceFiles});h.state.missing=true;
  assert(await h.controller.update(h.servers(),()=>true));assert(h.workers().length>0);
  assert.equal(h.state.helperReads,0,'No unavailable player-work polling or unnecessary sleeve helper');
  assert(h.logs.some(s=>s.includes('BN1 before SF4')));
  h.controller.stop();assert.equal(h.workers().length,0);
}
for(const currentNode of [0,1,2,4,9,10]) {
  h=harness({mode:'off',currentNode,sourceFiles:{4:3},work:{type:'FACTION',factionName:'CyberSec'}});
  assert.equal(await h.controller.update(h.servers(),()=>true),false);assert.equal(h.launches.length,0);
  if(currentNode!==1) {
    h=harness({mode:'auto',currentNode});
    assert.equal(await h.controller.update(h.servers(),()=>true),false);assert.equal(h.launches.length,0);
  }
}
h=harness({mode:'off',currentNode:1});
assert.equal(await h.controller.update(h.servers(),()=>true),false);assert.equal(h.launches.length,0);

// Work follows current player/sleeve tasks, including partial-benefit security and field work.
for(const currentNode of [1,4,5])for(const factionWorkType of ['hacking','field','security']){
  h=harness({mode:'auto',currentNode,sourceFiles:{4:3},work:{type:'FACTION',factionName:'CyberSec',factionWorkType,nextCompletion:Promise.resolve()}});
  assert(await h.controller.update(h.servers(),()=>true));assert(h.workers().length>0);assert.equal(h.state.helperReads,1);
  h.state.work={type:'COMPANY',companyName:'ECorp'};now+=5001;
  assert.equal(await h.controller.update(h.servers(),()=>true),false);assert.equal(h.workers().length,0);
  assert.equal(h.errors.length,0);
}
for(const currentNode of [1,4,5])for(const level of [1,2,3])for(const work of [null,{type:'CRIME'},{type:'CLASS'},{type:'COMPANY'}]){
  h=harness({mode:'auto',currentNode,sourceFiles:{4:level},work});
  assert.equal(await h.controller.update(h.servers(),()=>true),false);assert.equal(h.workers().length,0);
}
h=harness({mode:'auto',sourceFiles:{10:1},tasks:[{type:'FACTION',factionName:'NiteSec'},{type:'CRIME'}]});
assert(await h.controller.update(h.servers(),()=>true));assert(h.logs.some(s=>s.includes('sleeve 0: NiteSec')));h.controller.stop();
h=harness({mode:'auto',sourceFiles:{4:3,10:1},work:new Error('no player access'),tasks:[{type:'FACTION',factionName:'NiteSec'}]});
assert(await h.controller.update(h.servers(),()=>true));h.controller.stop();
for(const mode of ['auto','off']){
  h=harness({mode});assert.equal(await h.controller.update(h.servers(),()=>true),false);assert.equal(h.launches.length,0);
}

// Effective SF4 costs are preallocated. Missing helpers and RAM shortages are optional failures.
for(const sf4cost of [0.5,2,8])for(const sleeves of [false,true]){
  h=harness({sf4cost,work:{type:'FACTION',factionName:'CyberSec'},tasks:[null]});
  const sf={4:1,...(sleeves?{10:1}:{})};
  assert.equal((await getShareContext(h.ns,sf)).active,true);
  const launch=h.launches[0];assert.equal(launch.ram,1.6+sf4cost+(sleeves?8:0));
  assert.equal(shareContextRam(h.ns,true,sleeves),launch.ram);assert.equal(h.errors.length,0);
}
h=harness({home:32});h.hosts.get('home').base=31;
assert.equal(await getShareContext(h.ns,{4:1}),null);assert.equal(h.launches.length,0);
h=harness();h.state.missing=true;assert.equal(await getShareContext(h.ns,{4:3}),null);

// SCP is an asynchronous boundary: new allocations and batch completion must be rechecked.
h=harness();let running=true;h.state.onCopy=()=>running=false;
assert.equal(await h.controller.update(h.servers(),()=>running),false);assert.equal(h.workers().length,0);
h=harness();h.state.onCopy=host=>h.hosts.get(host).base=120;
await h.controller.update(h.servers(),()=>true);assert(!h.workers().some(p=>p.host==='worker'));h.controller.stop();
for(const failure of ['copyFails','execFails']){
  h=harness();h.state[failure]=true;await h.controller.update(h.servers(),()=>true);
  assert(!h.workers().some(p=>p.host==='worker'));assert(h.workers().some(p=>p.host==='home'));h.controller.stop();
}
h=harness();await h.controller.update(h.servers(),()=>true);now+=2100;
await h.controller.update(h.servers().filter(s=>s.hostname!=='worker'),()=>true);
assert(!h.workers().some(p=>p.host==='worker'));h.controller.stop();

// Continuous managed share calls have no added sleep; loss of the owner ends at the current cycle.
let shares=0;
await shareMain({args:[],share:async()=>{shares++;}});assert.equal(shares,1);
shares=0;await shareMain({args:['--owner',7],isRunning:pid=>{assert.equal(pid,7);return shares<3;},share:async()=>{shares++;}});
assert.equal(shares,3);
shares=0;await shareMain({args:['--owner',7],isRunning:()=>false,share:async()=>{shares++;}});assert.equal(shares,0);

// Execute the real kernel in BN1 with default auto through two dispatches.
// The second census must see no owned sharing, including without Singularity access.
const source=readFileSync(new URL('../../../kernel.js',import.meta.url),'utf8');
const transport=`
  const getConfiguration=()=>({...${JSON.stringify(SHARE_DEFAULTS)}});
  const log=()=>{},getErrorInfo=String,getReset=async()=>({currentNode:1}),getPlayerInfo=async()=>({skills:{hacking:100}});
  const getOptimalTarget=async()=>({hostname:'n00dles',hackDifficulty:1,minDifficulty:1,moneyAvailable:1e6});
  const getServ=getOptimalTarget,getServers=async ns=>{ns.audit.census();return ns.audit.servers();};
  const getServerAvailRam=async(ns,host)=>ns.getServerMaxRam(host)-ns.getServerUsedRam(host),getServerMaxRam=async(ns,host)=>ns.getServerMaxRam(host);
  const getHackP=async()=>({H1:1,W1:1,G1:1,W2:1}),getGrowThreads=async()=>0,getActiveSourceFiles=async()=>({13:1});
  const getBNMults=async()=>({CloudServerLimit:1}),getPortCrackers=()=>{};
  const serverRun=async ns=>ns.audit.dispatch(),stanekRun=()=>{throw Error('Stanek must not take RAM before useful sharing');};
  const doSCP=()=>{throw Error('No Stanek workers expected');},doGetServerMinSec=async()=>1,doGetServerCurSec=async()=>1;
`;
const kernel=await import('data:text/javascript;base64,'+Buffer.from(source.replace(/import \{[\s\S]*?\} from '\.\/utils.js'/,transport)
  .replace("'./share-controller.js'",JSON.stringify(new URL('../../../share-controller.js',import.meta.url).href))).toString('base64'));
h=harness();let dispatches=0,censuses=0,sleeps=0,batchAlive=false,onExit;
const STOP=new Error('kernel observed');
const inheritedIsRunning=h.ns.isRunning;
h.ns.isRunning=pid=>pid===500?batchAlive:inheritedIsRunning(pid);
h.ns.getMoneySources=()=>({sinceInstall:{}});h.ns.weakenAnalyze=()=>0.05;h.ns.getHackTime=()=>1000;
h.ns.atExit=fn=>onExit=fn;
h.ns.sleep=async ms=>{now+=ms;if(ms===5000)throw STOP;if(ms===100&&++sleeps>=3)batchAlive=false;};
h.ns.audit={servers:h.servers,census(){assert.equal(h.workers().length,0);censuses++;},dispatch(){
  assert.equal(h.workers().length,0);if(++dispatches===2)throw STOP;batchAlive=true;return {batches:0,lastpid:500,recalc:false};}};
await assert.rejects(kernel.main(h.ns),error=>error===STOP);
assert.equal(dispatches,2);assert.equal(censuses,2);assert(h.launches.some(p=>p.file===SHARE_WORKER));
assert.equal(h.workers().length,0);onExit();assert.equal(h.errors.length,0);
console.log('BN-aware auto/explicit overrides, work/sleeve eligibility, buffers, maximal spare allocation, resize/reclaim, continuous workers, RAM-aware RPC, and actual two-batch kernel cleanup passed.');
} finally { Date.now=actualNow; }
