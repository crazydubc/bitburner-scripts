// Real reset launch arguments -> actual gang/sleeve buyer -> home purchase helper and receipt.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {purchase} from '../../../utils.js';
import {executePurchase} from '../../../purchase-guard.js';
import {main as purchaseMain} from '../../../bin/purchase.js';

const root=new URL('../../../',import.meta.url),noop=()=>{};
const source=file=>readFileSync(new URL(file,root),'utf8');
const section=(text,start,end)=>{
  const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
  assert(a>=0&&b>a,start);return text.slice(a,b);
};
const moduleUrl=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const before=file=>execFileSync('git',['show','be77c4c:'+file],{cwd:root,encoding:'utf8'});
const oldGuard=moduleUrl(before('purchase-guard.js'));
const oldMain=(await import(moduleUrl(before('bin/purchase.js').replace("'../purchase-guard.js'",JSON.stringify(oldGuard))))).main;

const launches=[];
await Function('ns','getFilePath','log',`return (async()=>{
  const dictSourceFiles={2:1,10:1};
  ${section(source('ascend.js'),'  // STEP 6:','  // STEP 8:')}
})();`)({run:(file,_threads,...args)=>{launches.push({file,args});return 1;},sleep:async()=>{}},name=>name,noop);
const resetReserve=file=>{
  const args=launches.find(launch=>launch.file===file)?.args;
  assert(args?.includes('--reserve'));return args[args.indexOf('--reserve')+1];
};
assert.equal(resetReserve('gangs.js'),'0');
assert.equal(resetReserve('sleeve.js'),'0');

function harness(main=purchaseMain) {
  const state={cash:100,reserve:80,bought:[],requests:[],beforeExecute:noop},ports=new Map();
  let nextPid=1;
  const buy=(kind,...args)=>{state.bought.push([kind,...args]);state.cash-=60;return true;};
  const home={getHostname:()=> 'home',read:()=>String(state.reserve),getServerMoneyAvailable:()=>state.cash,
    getFunctionRamCost:()=>1.6,ramOverride:ram=>ram,
    gang:{getEquipmentCost:()=>60,purchaseEquipment:(...args)=>buy('gang',...args)},
    sleeve:{getSleevePurchasableAugs:()=>[{name:'Aug',cost:60}],purchaseSleeveAug:(...args)=>buy('sleeve',...args)}};
  const ns={print:noop,getHostname:()=> 'n00dles',read:()=>assert.fail('Remote reserve must not be read'),
    getScriptRam:()=>1.6,getFunctionRamCost:home.getFunctionRamCost,
    getPortHandle:id=>({empty:()=>!ports.has(id),read:()=>ports.get(id)}),
    exec(file,host,_options,...args) {
      assert.equal(file,'bin/purchase.js');assert.equal(host,'home');
      const pid=nextPid++;let exit;
      state.requests.push(args);state.beforeExecute();
      main({...home,pid,args,atExit:fn=>exit=fn,getPortHandle:()=>({write:value=>ports.set(pid,value)})});
      exit();return pid;
    }};
  return {ns,home,state};
}
function gangPass(h,reserve=resetReserve('gangs.js')) {
  const bindings={purchase,log:noop,formatMoney:String,
    options:{reserve,'equipment-budget':'1','augmentations-budget':'1'},
    equipments:[{name:'Gear',type:'Equipment',stats:{str:1.5}}],
    getPlayerInfo:async()=>({money:h.state.cash}),getReserve:async()=>h.state.reserve,
    getDict:async()=>({Gear:60}),warfareFinished:false,importantStats:['str'],offStatCostPenalty:50,
    defaultMaxSpendPerTickTransientEquipment:0.05,defaultMaxSpendPerTickPermanentEquipment:0.35};
  const run=Function(...Object.keys(bindings),
    section(source('gangs.js'),'async function tryUpgradeMembers(','let sequentialMisfires')+';return tryUpgradeMembers;')(...Object.values(bindings));
  return run(h.ns,{Member:{name:'Member',str:100,def:100,upgrades:[],augmentations:[]}});
}
function sleevePass(h) {
  const bindings={purchase,log:noop,formatMoney:String,formatDuration:String,
    options:{reserve:resetReserve('sleeve.js'),'buy-cooldown':0,'min-aug-batch':1},
    availableAugs:[[{name:'Aug',cost:60}]],cacheExpiry:[Infinity],lastPurchaseTime:[],lastPurchaseStatusUpdate:[],
    lastSleeveHp:[],lastSleeveShock:[]};
  const run=Function(...Object.keys(bindings),section(source('sleeve.js'),'async function manageSleeveAugs(',
    '\n/** @param {NS} ns\n * @returns {Promise<Task>}')+';return manageSleeveAugs;')(...Object.values(bindings));
  return run(h.ns,0,100);
}
for(const pass of [gangPass,sleevePass]) {
  const old=harness(oldMain);
  await assert.rejects(pass(old),/Purchase failed: ERROR:Error: Invalid purchase budget\/reserve/);
  assert.equal(old.state.bought.length,0,'Reproduce the actual failed purchase before the fix');
  const fixed=harness();await pass(fixed);
  assert.equal(fixed.state.bought.length,1);assert.equal(fixed.state.cash,40);
  assert.equal(JSON.parse(fixed.state.requests[0][3]).reserve,'0','Exercise the old offloaded caller contract unchanged');
}

for(const reserve of [0,'0',' 0 ',40,'40','4e1']) {
  const h=harness();
  const receipt=await purchase(h.ns,'gang','purchaseEquipment',['Member','Gear'],{budget:60,reserve});
  assert.deepEqual(receipt,{result:true,spent:60,cost:60});assert.equal(h.state.cash,40);
}
for(const reserve of ['41','80','1e9']) {
  const h=harness();
  assert.equal((await purchase(h.ns,'gang','purchaseEquipment',['Member','Gear'],{reserve})).spent,0);
  assert.equal(h.state.bought.length,0,'Nonzero numeric strings still protect cash');
}
for(const reserve of ['', ' ', 'bad', '8b', '-1', 'NaN', 'Infinity', '1e999', false, true, [], {}, [0]]) {
  const h=harness();
  await assert.rejects(purchase(h.ns,'gang','purchaseEquipment',['Member','Gear'],{reserve}),/Invalid purchase budget\/reserve/);
  assert.equal(h.state.bought.length,0);
}
for(const value of [NaN,Infinity,-1]) for(const key of ['reserve','budget']) {
  const h=harness();
  assert.throws(()=>executePurchase(h.home,'gang','purchaseEquipment',['Member','Gear'],{[key]:value}),/Invalid purchase budget\/reserve/);
  assert.equal(h.state.bought.length,0);
}
// An omitted/null override must still reread home after the remote quote. Zero is an explicit override.
for(const policy of [{},{reserve:null}]) {
  const h=harness();h.state.reserve=0;h.state.beforeExecute=()=>h.state.reserve=80;
  assert.equal((await purchase(h.ns,'gang','purchaseEquipment',['Member','Gear'],policy)).spent,0);
  assert.equal(h.state.bought.length,0);
}
{
  const h=harness();
  assert.equal((await purchase(h.ns,'gang','purchaseEquipment',['Member','Gear'],{budget:59,reserve:'0'})).spent,0);
  h.state.beforeExecute=()=>h.state.cash=59;
  assert.equal((await purchase(h.ns,'gang','purchaseEquipment',['Member','Gear'],{budget:60,reserve:'0'})).spent,0);
  assert.equal(h.state.bought.length,0,'Numeric reserve support cannot bypass budget or fresh cash checks');
}
console.log('Reset reserve regression reproduced for actual gang/sleeve buyers; numeric overrides, live home reserves, budget/cash bounds and invalid-value rejection passed.');
