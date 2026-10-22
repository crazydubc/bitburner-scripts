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
console.log('Official ECP lookup reproduction, bounded whole-snapshot retries on both RAM paths, strict failure/zero distinctions, HUD first-render/loop isolation and warning throttling passed.');
