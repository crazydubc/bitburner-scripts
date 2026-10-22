// Execute the official symbol/position APIs with an empty or incomplete market,
// then exercise the real helper, RPC, valuation fallback and complete HUD reader.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {getStocksValue} from '../../../utils.js';
import {main as snapshotMain} from '../../../bin/getStockValue.js';
import {main as stockMain} from '../../../bin/stockRun.js';
import {main as accessMain} from '../../../bin/hasTixApi.js';
import {main as availableMain} from '../../../bin/getServerAvailRam.js';
import {evaluateAugmentationReset} from '../../../augmentation-reset-policy.js';

const engine=resolve(process.argv[2]??'../bitburner-engine');
const engineSource=file=>readFileSync(resolve(engine,'src',file),'utf8');
const enums=engineSource('StockMarket/Enums.ts');
const symbolCode=stripTypeScriptTypes(enums.slice(enums.indexOf('export const StockSymbol ='))).replace(/^export /gm,'');
const StockSymbol=Function('LocationName',symbolCode+';return StockSymbol;')(new Proxy({},{get:(_,name)=>name}));
const apiSource=engineSource('NetscriptFunctions/StockMarket.ts');
const apiCode=stripTypeScriptTypes(apiSource.slice(apiSource.indexOf('export const getStockFromSymbol'))).replace(/^export /gm,'');
const makeApi=Function('Player','StockSymbol','SymbolToStockMap','helpers','setRemovedFunctions',apiCode+';return NetscriptStockMarket();');
const methods={'bin/getStockValue.js':snapshotMain,'bin/stockRun.js':stockMain,
  'bin/hasTixApi.js':accessMain,'bin/getServerAvailRam.js':availableMain};

function harness(free=128) {
  const Player={hasTixApiAccess:true},market={},calls=[],sleeps=[],ports=new Map(),processes=new Map();
  const state={onSleep:null,failure:null,now:1_000_000};let nextPid=100;
  const api=makeApi(Player,StockSymbol,market,{
    string:(_,__,value)=>String(value),errorMessage:(ctx,message)=>new Error(`stock.${ctx.function}: ${message}`),
  },()=>{});
  const stock=new Proxy({},{get(_,name){return (...args)=>{
    if(state.failure&&name==='getPosition')throw state.failure;
    return api[name]({function:name})(...args);
  };}});
  const populate=()=>{
    for(const symbol of Object.values(StockSymbol))market[symbol]={
      playerShares:0,playerAvgPx:0,playerShortShares:0,playerAvgShortPx:0,getBidPrice:()=>100,getAskPrice:()=>180,
    };
    market.ECP.playerShares=10_000;market.ECP.playerAvgPx=100;
    market.MGCP.playerShortShares=20_000;market.MGCP.playerAvgShortPx=200;
  };
  const port=pid=>{
    if(!ports.has(pid)){const values=[];let ready;ports.set(pid,{empty:()=>!values.length,read:()=>values.shift(),
      write:value=>{values.push(structuredClone(value));ready?.();},nextWrite:()=>new Promise(resolve=>ready=resolve)});}
    return ports.get(pid);
  };
  const sizes={'bin/getStockValue.js':9.65,'bin/stockRun.js':5.6,'bin/hasTixApi.js':1.65,'bin/getServerAvailRam.js':1.7};
  const used=()=>[...processes.values()].reduce((a,b)=>a+b,0);
  const ns={stock,print(){},getPortHandle:port,isRunning:pid=>processes.has(pid),
    getScriptRam:file=>sizes[file],getFunctionRamCost:name=>name==='baseCost'?1.6:4,
    getServerMaxRam:()=>free,getServerUsedRam:used,
    sleep:async ms=>{sleeps.push(ms);state.now+=ms;state.onSleep?.();},
    exec(file,host,options,...args){
      assert.equal(host,'home');assert(file in methods);assert(args.every(arg=>['string','number','boolean'].includes(typeof arg)));
      const allocated=options.ramOverride??sizes[file];assert(used()+allocated<=free+1e-9);
      const pid=++nextPid;processes.set(pid,allocated);calls.push([file,...args]);
      queueMicrotask(async()=>{
        let exit=()=>{};
        try {await methods[file]({...ns,pid,args,atExit:fn=>exit=fn,ramOverride:ram=>{assert(ram<=allocated);return ram;}});}
        finally{exit();processes.delete(pid);}
      });return pid;
    }};
  return {ns,Player,market,stock,state,calls,sleeps,populate};
}
const expected=10_000*100-100_000+20_000*(400-180)-100_000;

// The real engine reproduces the reported mismatch: ECP is listed but unreadable.
let h=harness();assert(h.stock.getSymbols().includes('ECP'));
assert.throws(()=>h.stock.getPosition('ECP'),/stock.getPosition: Invalid stock symbol: ECP/);
let result,onExit;
await snapshotMain({...h.ns,pid:1,atExit:fn=>onExit=fn,getPortHandle:()=>({write:value=>result=value})});onExit();
assert.match(result,/ERROR:.*stock.getPosition: Invalid stock symbol: ECP/);

for(const free of [8,128]) {
  // Recover after a yield, using a fresh complete snapshot through either RAM path.
  h=harness(free);h.state.onSleep=h.populate;
  assert.equal(await getStocksValue(h.ns),expected);assert.deepEqual(h.sleeps,[250]);
  assert.equal(h.calls.some(([file])=>file==='bin/getStockValue.js'),free>=9.65);

  // A later unavailable symbol must discard previously accumulated value before retrying.
  h=harness(free);h.populate();delete h.market.MGCP;
  h.state.onSleep=()=>{h.populate();h.market.ECP.playerShares=20_000;};
  assert.equal(await getStocksValue(h.ns),expected+1_000_000);assert.deepEqual(h.sleeps,[250]);

  // Persistent failure stays unknown. It cannot be passed to purchase/reset callers as zero or a partial portfolio.
  h=harness(free);h.populate();delete h.market.MGCP;
  await assert.rejects(getStocksValue(h.ns),/Invalid stock symbol: MGCP/);
  assert.deepEqual(h.sleeps,[250,250]);
  assert.equal(h.calls.filter(([file])=>file==='bin/hasTixApi.js').length,3);

  // Unexpected errors and invalid data fail immediately, rather than retrying or hiding corruption.
  h=harness(free);h.populate();h.state.failure=new Error('unexpected market error');
  await assert.rejects(getStocksValue(h.ns),/unexpected market error/);assert.equal(h.sleeps.length,0);
  h=harness(free);h.populate();h.market.ECP.playerShares=NaN;
  await assert.rejects(getStocksValue(h.ns),/Invalid position for ECP/);assert.equal(h.sleeps.length,0);

  // Known lack of API access and a genuinely empty portfolio retain their zero-value behavior.
  h=harness(free);h.Player.hasTixApiAccess=false;assert.equal(await getStocksValue(h.ns),0);assert.equal(h.calls.length,1);
  h=harness(free);h.Player.hasTixApiAccess='ERROR:Access check failed';
  await assert.rejects(getStocksValue(h.ns),/Invalid stock access result/);assert.equal(h.sleeps.length,0);
  h=harness(free);h.populate();h.market.ECP.playerShares=0;h.market.MGCP.playerShortShares=0;
  assert.equal(await getStocksValue(h.ns),0);
  h=harness(free);h.state.onSleep=()=>h.Player.hasTixApiAccess=false;
  assert.equal(await getStocksValue(h.ns),0);assert.deepEqual(h.sleeps,[250]);
}

// Execute the entire actual HUD-data reader, including first-render collection,
// share power, script income, reserve and later rows following a failed stock read.
const stats=readFileSync(new URL('../../../stats.js',import.meta.url),'utf8');
const start=stats.indexOf('async function getHudData('),end=stats.indexOf('\n/** @param {number} value',start);
assert(start>=0&&end>start);
h=harness();const warnings=[];let stockmasterHud=false;
const bindings={getStocksValue,getReserve:async()=>8e9,getPlayerInfo:async()=>({skills:{intelligence:0}}),
  log:(_,message)=>warnings.push(message),doc:{getElementById:()=>stockmasterHud?{}:null},
  formatMoney:value=>`$${value}`,formatNumberShort:String,formatNumber:String,formatDuration:String,
  Date:{now:()=>h.state.now}};
const hud=Function(...Object.keys(bindings),`let nextStockWarning=0,playerInBladeburner=false;
  const resetInfo={lastAugReset:0},getGangInfo=async()=>false;
  ${stats.slice(start,end)};return getHudData;`)(...Object.values(bindings));
const ns={...h.ns,getTotalScriptIncome:()=>[123,0],getTotalScriptExpGain:()=>45,
  getSharePower:()=>1.5,heart:{break:()=>0},corporation:{hasCorporation:()=>false}};
const options={'hide-RAM-utilization':true};
for(let tick=0;tick<4;tick++) {
  const rows=await hud(ns,4,{},options);h.state.now+=1000;
  assert.deepEqual(rows.find(row=>row[0]==='Stock').slice(0,3),['Stock',true,'Unavailable']);
  assert.equal(rows.find(row=>row[0]==='Scr Inc')[2],'$123/sec');
  assert.equal(rows.find(row=>row[0]==='Share Pwr')[2],'1.5');
  assert.equal(rows.find(row=>row[0]==='Reserve')[2],'8000000000');
  assert(rows.some(row=>row[0]==='Last Reset'));
}
assert.equal(warnings.length,1,'Different failed helper PIDs cannot cause per-second log spam');
h.state.now+=60_001;await hud(ns,4,{},options);assert.equal(warnings.length,2);
h.populate();assert.equal((await hud(ns,4,{},options)).find(row=>row[0]==='Stock')[2],`$${expected}`);
const calls=h.calls.length;
assert.equal((await hud(ns,4,{}, {...options,'hide-stocks':true})).find(row=>row[0]==='Stock')[1],false);
stockmasterHud=true;assert.equal((await hud(ns,4,{},options)).find(row=>row[0]==='Stock')[1],false);
assert.equal(h.calls.length,calls,'Hidden/stockmaster-owned rows do not trigger valuation');

const source=file=>readFileSync(new URL('../../../'+file,import.meta.url),'utf8');
const section=(code,begin,end)=>{
  const a=code.indexOf(begin),b=code.indexOf(end,a);assert(a>=0&&b>a,begin);return code.slice(a,b);
};
const manager=source('faction-manager.js');
// Execute the actual entire startup, output writer and purchase function. Gathering/displaying
// unrelated faction/aug data is stubbed; valuation still uses the real RPC and official market API.
function factionFixture() {
  const market=harness(),live={flags:{},logs:[],steps:[],files:new Map(),copied:[],bought:0};
  const definitions=section(manager,'// PLAYER CONFIGURATION CONSTANTS','export function autocomplete')+
    section(manager,'export async function main(ns)','async function getGangInfo(ns)').replace('export ','')+
    section(manager,'async function purchaseDesiredAugs(ns)','function displayJoinedFactionSummary(ns)');
  const bindings={getStocksValue,FACTIONS_WITHOUT_DONATIONS:new Set(),SOA_AUGS:[],INFILTRATION_TARGET:'target',
    getConfiguration:(_,schema)=>({...Object.fromEntries(structuredClone(schema)),...live.flags}),
    findPids:async()=>[42],getPlayerInfo:async()=>({money:100e6,factions:['CyberSec'],skills:{hacking:200}}),
    getReset:async()=>({currentNode:4,lastAugReset:1000,lastNodeReset:1000}),getActiveSourceFiles:async()=>({4:1}),
    getGangInfo:async()=>false,getOwnedAugs:async(_,pending)=>pending?['NeuroFlux Governor','BitWire']:['NeuroFlux Governor'],
    getBNMults:async()=>({}),doSCP:async(...args)=>live.copied.push(args.slice(1)),
    log:(_,message)=>live.logs.push(message),formatMoney:String,formatNumberShort:String};
  const main=Function('live',...Object.keys(bindings),definitions+`
    const unshorten=x=>x,displayFactionSummary=()=>{},displayJoinedFactionSummary=()=>{};
    const getCostString=String,getTotalCost=augs=>augs.length*1e6;
    const getDonationFavorProgress=()=>[{faction:'CyberSec',ready:false}],getGoFavorTargets=()=>[{faction:'CyberSec'}];
    const getResetPlanningSnapshot=()=>({version:1,wealth:playerData.money+stockValue});
    const updateFactionData=async()=>{live.steps.push('factions');};
    const updateAugmentationData=async()=>{nfLevelPurchased=1;live.steps.push('augmentations');};
    const joinFactions=async()=>{live.steps.push('join');return 0;};
    const manageUnownedAugmentations=async()=>{
      live.steps.push('plan');live.budget=playerData.money+stockValue;
      purchaseableAugs=[{name:'DataJack',getFromJoined:()=> 'CyberSec'}];
    };
    return main;`)(live,...Object.values(bindings));
  const ns={...market.ns,ramOverride:()=>24,getFavorToDonate:()=>150,getHostname:()=> 'the-hub',read:()=>'',
    write:(file,value)=>live.files.set(file,value),
    singularity:{purchaseAugmentation:()=>{live.bought++;return true;},donateToFaction:()=>assert.fail('Unexpected donation')}};
  return {market,live,step:()=>main(ns),snapshot:()=>JSON.parse(live.files.get('/Temp/affordable-augs.txt'))};
}
const f=factionFixture();
await f.step();
assert.deepEqual(f.live.steps,['factions','augmentations','join','plan']);
assert.equal(f.live.budget,100e6);assert.equal(f.snapshot().stock_value_known,false);assert.equal(f.snapshot().stock_value,null);
assert.equal(f.snapshot().reset_planning.wealth,100e6);
assert.deepEqual(f.snapshot().affordable_augs,['DataJack']);assert.equal(f.snapshot().go_favor_targets[0].faction,'CyberSec');
assert(f.live.copied.some(args=>args[0]==='/Temp/affordable-augs.txt'&&args[1]==='home'&&args[2]==='the-hub'));
assert(f.live.logs.some(message=>message.includes('planning augmentations using cash only')));
f.market.populate();await f.step();
assert.equal(f.snapshot().stock_value_known,true);assert.equal(f.snapshot().stock_value,expected);
assert.equal(f.snapshot().reset_planning.wealth,100e6+expected);
delete f.market.market.ECP;await f.step();
assert.equal(f.snapshot().stock_value_known,false,'A prior successful run cannot leave stale stock state');
assert.equal(f.snapshot().stock_value,null);assert.equal(f.live.budget,100e6);
f.live.flags={purchase:true};await f.step();assert.equal(f.live.bought,0);
assert(f.live.logs.some(message=>message.includes('Cannot verify stock holdings')));
f.market.populate();await f.step();assert.equal(f.live.bought,0,'Existing liquidate-before-purchase guard still applies');
f.market.Player.hasTixApiAccess=false;await f.step();assert.equal(f.live.bought,1,'Known lack of TIX retains normal cash purchases');
f.market.Player.hasTixApiAccess=true;delete f.market.market.ECP;
const reads=f.market.calls.length;f.live.flags={purchase:true,'ignore-stocks':true};await f.step();
assert.equal(f.live.bought,2);assert.equal(f.market.calls.length,reads,'Explicit cash-only purchase override still works');
f.live.flags={'ignore-stocks':true};await f.step();
assert.equal(f.snapshot().stock_value_known,false,'Ignoring stocks is not proof of an empty portfolio');

const autopilot=source('autopilot.js');
// Execute all actual installation branches, including milestones that precede the ordinary ETA policy.
function installFixture() {
  const live={known:true,snapshot:{stock_value_known:false},elapsed:600_000,names:['BitWire'],installed:40,
    favor:[],installs:0,reserves:0,deadlines:[],logs:[],state:{identity:'4:1000',samples:[{at:1,wealth:99}],wait:{key:'old'}}};
  const definitions=section(autopilot,'  function updateAugMomentum(','  /** Retrieves')+
    section(autopilot,'  function warnAboutFactionManagerOutput(','  /** Read queued')+
    section(autopilot,'  function getPendingAugmentationCounts(','  /** Logic to detect')+
    section(autopilot,'  async function maybeInstallAugmentations(','  /** Logic to detect if it\'s a good time');
  const create=Function('live','evaluateAugmentationReset',`
    const ns={getHostname:()=> 'remote'},NEUROFLUX='NeuroFlux Governor',unlockedSFs={4:1},MAX_AUGMENTATION_WAIT=14400000;
    const resetInfo={currentNode:4,lastAugReset:1000},factionManagerOutputFile='queue',augTRP='The Red Pill';
    const installedAugmentations=[],have4sApi=true,shouldIntelFarm=false,wdHack=null,resetDecisionState=live.state;
    const bitNodeMults={DaedalusAugsRequirement:30},Date={now:()=>1000+live.elapsed};
    const augMomentum={lastAugCount:0,bestRate:0,nextExpectedAug:0};
    let lastResetDecisionLog='',nextResetDecisionLog=0,lastFactionManagerWarning=0,currentMoneyReserve,
      lastInvestmentDeadline,nextInvestmentDeadlineAttempt=0,playerInstalledAugCount;
    const getTimeInAug=()=>live.elapsed,getAugmentationCycleStart=()=>1000,formatDuration=String;
    const log=(_,message)=>live.logs.push(message),doSCP=async()=>{},resetAugTrackersIfNeeded=()=>{};
    const getFactionManagerOutput=()=>({affordable_augs:live.names,awaiting_install_augs:[],generated_at:Date.now(),
      current_node:4,last_aug_reset:1000,total_rep_cost:0,total_aug_cost:1,
      reset_planning:{version:1,wealth:100,hacking:200,readyUtility:2,reputation:{CyberSec:0},goals:[]},...live.snapshot});
    const getFreshDonationFavorProgress=()=>live.favor,setReserve=async()=>{live.reserves++;return 1;};
    const shouldDelayInstall=async()=>false,installAugs=async()=>{live.installs++;};
    const runScriptLocal=async(_,file,persistent,args)=>{live.deadlines.push(args);return true;};
    ${definitions}
    return ()=>{playerInstalledAugCount=live.installed;return maybeInstallAugmentations(ns,{},live.known);};`);
  return {live,step:create(live,evaluateAugmentationReset)};
}
for(const trigger of ['normal','red-pill','daedalus','favor','hard-cap']) {
  const i=installFixture();
  if(trigger==='red-pill')i.live.names=['The Red Pill'];
  if(trigger==='daedalus')i.live.installed=29;
  if(trigger==='favor')i.live.favor=[{ready:true}];
  if(trigger==='hard-cap')i.live.elapsed=14_400_000;
  for(const known of [true,false]) {
    i.live.known=known;i.live.snapshot.stock_value_known=!known;
    await i.step();
    assert.equal(i.live.installs,0,trigger);assert.equal(i.live.reserves,0,trigger);assert.equal(i.live.deadlines.length,0,trigger);
    assert.deepEqual(i.live.state.samples,[]);assert.equal(i.live.state.wait,null);
  }
  assert.equal(i.live.logs.length,1,'Installation warnings are throttled');
  i.live.known=true;i.live.snapshot.stock_value_known=true;i.live.favor=[];
  await i.step();
  if(['red-pill','daedalus','hard-cap'].includes(trigger))assert.equal(i.live.installs,1,'Recovery releases milestone installs');
  else {assert.equal(i.live.installs,0);assert.equal(i.live.state.samples.length,1,'Recovery starts fresh ETA measurements');}
}
const legacy=installFixture();legacy.live.snapshot={};legacy.live.names=['The Red Pill'];
await legacy.step();assert.equal(legacy.live.installs,1,'Older snapshots remain usable with a successful current valuation');

// A failed stock read must not cancel an existing Daedalus reserve or prevent a cash-funded invitation.
const daedalusCode=section(autopilot,'  function markDaedalusJoined(','  /** Logic to detect if we are close');
const daedalus=Function(daedalusCode+`
  let alreadyJoinedDaedalus=false,autoJoinDaedalusUnavailable=false,reservingMoneyForDaedalus=true,disableStockmasterForDaedalus=true;
  const installedAugmentations=[],augTRP='The Red Pill',wdHack=null,playerInstalledAugCount=30,
    bitNodeMults={DaedalusAugsRequirement:30},unlockedSFs={4:1},resetInfo={currentNode:4};
  const log=()=>{},formatMoney=String,singRun=async()=>true,launchScriptHelper=()=>{throw Error('Unexpected liquidation');};
  return {step:checkOnDaedalusStatus,state:()=>({reservingMoneyForDaedalus,disableStockmasterForDaedalus,alreadyJoinedDaedalus})};`)();
await daedalus.step({}, {money:50e9,skills:{hacking:2500},factions:[]}, null);
assert.equal(daedalus.state().reservingMoneyForDaedalus,true);
assert.equal(daedalus.state().disableStockmasterForDaedalus,true);
await daedalus.step({}, {money:100e9,skills:{hacking:2500},factions:[]}, null);
assert.equal(daedalus.state().alreadyJoinedDaedalus,true);
assert.equal(daedalus.state().reservingMoneyForDaedalus,false);

const delayCode=section(autopilot,'  async function shouldDelayInstall(','  /** Logic to determine whether we should keep running');
const delayWarnings=[];
const delay=Function('getStocksValue','warnAboutFactionManagerOutput',delayCode+`
  const have4sApi=false,bitNodeMults={FourSigmaMarketDataApiCost:1,FourSigmaMarketDataCost:1},
    resetInfo={currentNode:4},reservingMoneyForDaedalus=false,bbRun=async()=>false;
  return shouldDelayInstall;`)(getStocksValue,(_,message)=>delayWarnings.push(message));
h=harness();
assert.equal(await delay(h.ns,{money:100e6},{}),true,'An outage during the late 4S check defers installation without throwing');
assert.equal(delayWarnings.length,1);
h.populate();
assert.equal(await delay({...h.ns,stock:{...h.stock,has4SData:()=>false}},{money:100e6},{}),false);

// The main loop passes availability to the installer while continuing to schedule automation.
const cycleCode=section(autopilot,'    let stocksValue = null;','    return shouldWeKeepRunning(ns);');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
for(const available of [false,true]) {
  const seen=[];
  const bindings={ns:{},player:{factions:[]},servers:[],getStocksValue:async()=>{
    if(!available)throw Error('unreadable');return expected;
  },manageReservedMoney:async(_,__,value)=>seen.push(['reserve',value]),
  checkOnDaedalusStatus:async(_,__,value)=>seen.push(['daedalus',value]),
  checkIfBnIsComplete:async()=>{},maybeAcceptStaneksGift:async()=>{},getRunningScriptNames:()=>new Set(),
  checkOnRunningScripts:async()=>seen.push(['scripts']),runPeriodicScripts:async()=>seen.push(['periodic']),
  noteMilestones:async()=>{},maybeInstallAugmentations:async(_,__,value)=>seen.push(['install',value])};
  await AsyncFunction(...Object.keys(bindings),cycleCode)(...Object.values(bindings));
  assert.deepEqual(seen,[['reserve',available?expected:0],['daedalus',available?expected:null],['scripts'],['periodic'],['install',available]]);
}
console.log('Official ECP reproduction, retries, HUD isolation, faction startup/output/purchase guards, installation pause/recovery and Daedalus reserve checks passed.');
