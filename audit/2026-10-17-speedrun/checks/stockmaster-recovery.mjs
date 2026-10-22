// Run the complete stockmaster against real RPC/official stock read APIs.
// Trades are a deterministic adapter; its selection/sizing logic is the actual stockmaster code.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stockRun} from '../../../utils.js';
import {harness} from './stock-market-fixture.mjs';

const current=readFileSync(new URL('../../../stockmaster.js',import.meta.url),'utf8');
const STOP=Symbol('bounded stockmaster run complete');
function trader(flags={},code=current) {
  const h=harness(),live={money:100e6,reserve:8e9,casino:0,price:100,logs:[],trades:[],sleeps:[],killed:[],files:new Map(),peers:[55]};
  const hud={innerText:'prior value'};
  const populate=()=>{
    h.populate();
    for(const stk of Object.values(h.market)) {
      stk.playerShares=stk.playerShortShares=0;
      stk.getBidPrice=()=>live.price;stk.getAskPrice=()=>live.price+1;
    }
  };
  const transact=async(method,sym,shares)=>{
    assert(['buyStock','buyShort','sellStock','sellShort'].includes(method));
    assert(Number.isInteger(shares)&&shares>0);
    live.beforeTrade?.(method,sym,shares);
    if(live.tradeResult===0)return 0;
    const price=await stockRun(h.ns,['buyStock','sellShort'].includes(method)?'getAskPrice':'getBidPrice',sym);
    const stk=h.market[sym],long=['buyStock','sellStock'].includes(method),buy=method.startsWith('buy');
    const held=long?'playerShares':'playerShortShares',average=long?'playerAvgPx':'playerAvgShortPx';
    if(buy) {
      const cost=price*shares+100_000;
      assert(cost<=live.money-live.reserve+1e-6,'A purchase must respect current cash/reserve');
      stk[average]=(stk[held]*stk[average]+shares*price)/(stk[held]+shares);
      stk[held]+=shares;live.money-=cost;
    } else {
      assert(shares<=stk[held],'Never repeat an already completed sale');
      stk[held]-=shares;live.money+=(long?price:2*stk[average]-price)*shares-100_000;
    }
    live.trades.push([method,sym,shares,price]);return price;
  };
  const bindings={getConfiguration:(_,schema)=>({...Object.fromEntries(structuredClone(schema)),...flags}),
    getActiveSourceFiles:async()=>({8:3}),getBNMults:async()=>({FourSigmaMarketDataCost:1,FourSigmaMarketDataApiCost:1}),
    getReserve:async()=>live.reserve,hasTixApi:async()=>h.Player.hasTixApiAccess,
    getPlayerInfo:async()=>({money:live.money}),getReset:async()=>({lastNodeReset:0}),findPids:async()=>live.peers,
    formatMoney:String,formatNumberShort:String,formatDuration:String,Date:{now:()=>h.state.now},
    document:{getElementById:()=>hud},
    purchase:async(_,namespace,method,args)=>{
      assert.equal(namespace,'stock');assert(method==='buyStock'||method==='buyShort','Unexpected access purchase');
      return {result:await transact(method,...args)};
    },stockRun:async(ns,method,...args)=>{
      if(method==='getSymbols'&&live.symbols!==undefined)return live.symbols;
      return method.startsWith('sell')?transact(method,...args):stockRun(ns,method,...args);
    }};
  const executable=code.replace(/^import\s+\{[\s\S]*?\}\s+from '\.\/utils\.js'\s*/,'').replace(/^export /gm,'');
  const api=Function(...Object.keys(bindings),executable+
    ';return {main,initAllStocks,refresh,doBuy,profit:()=>totalProfit};')(...Object.values(bindings));
  const ns={...h.ns,pid:55,getHostname:()=> 'foodnstuff',getScriptName:()=> 'stockmaster.js',
    disableLog(){},atExit(){},print:message=>live.logs.push(message),tprint(){},toast(){},
    kill:pid=>live.killed.push(pid),getMoneySources:()=>({sinceInstall:{casino:live.casino}}),
    write:async(file,value)=>{live.files.set(file,value);live.onWrite?.(file,value);},
    sleep:async ms=>{live.sleeps.push(ms);h.state.now+=ms;
      if(live.sleeps.length>100)throw Error('Unbounded fixture');live.onSleep?.(ms);}};
  return {h,live,hud,ns,api,populate,run:()=>api.main(ns)};
}
const stopAtNormalTick=t=>t.live.onSleep=ms=>{assert.equal(ms,1000);throw STOP;};
const bounded=t=>assert.rejects(t.run(),error=>error===STOP);

// The reported ECP max-share failure stays alive without trades or a restart loop.
let t=trader();
t.live.onSleep=ms=>{assert.equal(ms,5000);assert.equal(t.live.trades.length,0);
  if(t.live.sleeps.length===14)throw STOP;};
await bounded(t);
assert.equal(t.hud.innerText,'Unavailable');
const marketWarnings=t.live.logs.filter(line=>line.startsWith('WARNING: Stock market data is unavailable')).length;
assert(marketWarnings>=1&&marketWarnings<=2,'At most one warning per minute; identical consecutive messages may also be deduplicated');
assert.equal(t.h.calls.filter(call=>call[1]==='getSymbols').length,14,'Reread symbols on each recovery pass');

// Fail late within every read stage: no partial market snapshot can trigger a trade.
for(const method of ['getMaxShares','getAskPrice','getBidPrice','getVolatility','getForecast','getPosition']) {
  t=trader();t.populate();t.h.Player.has4SDataTixApi=true;
  let failed=false,recovered=false;
  t.h.state.beforeStockCall=(name,[sym])=>{
    if(!failed&&name===method&&sym==='MGCP') {failed=true;delete t.h.market.MGCP;}
  };
  t.live.onSleep=ms=>{
    if(ms===5000) {assert.equal(t.live.trades.length,0);assert.equal(t.hud.innerText,'Unavailable');t.populate();recovered=true;}
    else {assert(recovered);throw STOP;}
  };
  await bounded(t);assert.equal(t.hud.innerText,'$0.000 ');
  assert(t.live.logs.some(line=>line.includes('Stock data is readable again')));
  assert.equal(t.live.sleeps.filter(ms=>ms===5000).length,1);
}

// Discard pre-4S history across missing ticks instead of forecasting from a discontinuous series.
t=trader();t.populate();let goodTicks=0;
t.live.onSleep=ms=>{
  if(ms===5000) {t.populate();return;}
  if(++goodTicks===4)throw STOP;
  livePrice(t);if(goodTicks===3)delete t.h.market.ECP;
};
function livePrice(t) {t.live.price++;}
await bounded(t);
const histories=t.live.logs.filter(line=>line.startsWith('Building a history'));
assert.deepEqual(histories.map(line=>line.match(/\((\d+)\/21\)/)[1]),['1','2','3','1']);
assert.equal(t.live.trades.length,0);

// A later failed order cannot reuse stale cash/holdings or undo an earlier successful trade.
t=trader();t.populate();t.h.Player.has4SDataTixApi=true;t.live.money=30e9;t.live.casino=10e9;
let removed;
t.live.beforeTrade=(method,sym)=>{
  if(method==='buyStock'&&t.live.trades.length===1&&!removed) {removed=[sym,t.h.market[sym]];delete t.h.market[sym];}
};
t.live.onSleep=ms=>{
  if(ms===5000) {assert.equal(t.live.trades.length,1);t.h.market[removed[0]]=removed[1];t.live.reserve=t.live.money;}
  else throw STOP;
};
await bounded(t);assert.equal(t.live.trades.length,1,'Recovery rereads the new reserve before considering purchases');
assert.equal(t.h.market[t.live.trades[0][1]].playerShares,t.live.trades[0][2]);

// Failed buys (throw or zero) do not book a fictitious commission; a successful add-on does.
const stocks=await t.api.initAllStocks(t.ns);await t.api.refresh(t.ns,true,stocks,[]);
const owned=stocks.find(stk=>stk.owned());t.live.beforeTrade=()=>{throw Error('stock.getPurchaseCost: Invalid stock symbol: ECP');};
const priorProfit=t.api.profit();await assert.rejects(t.api.doBuy(t.ns,owned,1),/Invalid stock symbol/);
assert.equal(t.api.profit(),priorProfit);
t.live.beforeTrade=null;t.live.tradeResult=0;assert.equal(await t.api.doBuy(t.ns,owned,1),0);
assert.equal(t.api.profit(),priorProfit);
delete t.live.tradeResult;t.live.reserve=0;await t.api.doBuy(t.ns,owned,1);
assert.equal(t.api.profit(),priorProfit-100_000);

// Liquidators keep their no-buy ownership, and retry only the shares still held after partial liquidation.
for(const flag of ['liquidate','liquidate-once']) {
  t=trader({[flag]:true});t.populate();t.live.peers=[55,56];
  t.h.market.ECP.playerShares=100;t.h.market.MGCP.playerShortShares=200;t.h.market.MGCP.playerAvgShortPx=100;
  let saved;
  t.live.beforeTrade=(method,sym)=>{
    if(method==='sellShort'&&!saved) {saved=t.h.market[sym];delete t.h.market[sym];}
  };
  t.live.onSleep=ms=>{
    if(ms===5000) {assert.equal(t.h.market.ECP.playerShares,0);assert.equal(t.live.trades.length,1);t.h.market.MGCP=saved;}
    else {assert.equal(ms,60_000);throw STOP;}
  };
  if(flag==='liquidate')await bounded(t);else await t.run();
  assert.deepEqual(t.live.killed,[56]);
  assert.deepEqual(t.live.trades.map(row=>row.slice(0,3)),[['sellStock','ECP',100],['sellShort','MGCP',200]]);
  assert.equal(t.h.market.MGCP.playerShortShares,0);
  assert(!t.h.calls.some(call=>call[1]==='getMaxShares'),'Liquidation never enters the trading startup');
}
t=trader({'liquidate-once':true});t.live.onSleep=ms=>{assert.equal(ms,5000);throw STOP;};
await bounded(t);assert.equal(t.live.trades.length,0,'A one-shot command cannot report completion while positions are unreadable');

// Unrelated failures and malformed lists remain visible instead of turning into silent waiting loops.
t=trader();t.h.state.beforeStockCall=name=>{if(name==='getMaxShares')throw Error('Insufficient RAM');};
await assert.rejects(t.run(),/Insufficient RAM/);assert.equal(t.live.sleeps.length,0);
for(const symbols of [[],null,'ERROR:bad symbols']) {
  t=trader();t.live.symbols=symbols;await assert.rejects(t.run(),/Invalid stock symbol list/);
  assert.equal(t.live.sleeps.length,0);assert.equal(t.live.trades.length,0);
}

// Healthy runs retain the baseline's trade choices and sizing, casino gate and reserve behavior.
const baseline=execFileSync('git',['show','2e66a6b:stockmaster.js'],{encoding:'utf8'});
async function healthy(code,casino,reserve) {
  const f=trader({},code);f.populate();f.h.Player.has4SDataTixApi=true;f.live.money=30e9;
  f.live.casino=casino;f.live.reserve=reserve;let ticks=0;
  f.live.onSleep=ms=>{assert.equal(ms,1000);if(++ticks===3)throw STOP;f.live.price++;};
  await bounded(f);return {trades:f.live.trades,money:f.live.money};
}
for(const [casino,reserve] of [[0,8e9],[10e9,30e9],[10e9,8e9]]) {
  const before=await healthy(baseline,casino,reserve),after=await healthy(current,casino,reserve);
  assert.deepEqual(after,before);
  assert.equal(after.trades.length>0,casino===10e9&&reserve===8e9);
}

// Mock short holdings survive refresh, without real purchases or sales.
t=trader({mock:true});t.populate();t.h.Player.has4SDataTixApi=true;stopAtNormalTick(t);await bounded(t);
const simulated=await t.api.initAllStocks(t.ns);
simulated[0].sharesShort=200;simulated[0].boughtPriceShort=110;
await t.api.refresh(t.ns,true,simulated,[]);
assert.equal(simulated[0].sharesShort,200);assert.equal(simulated[0].boughtPriceShort,110);
assert.equal(t.live.trades.length,0);

// Simulated positions also survive a full main-loop reinitialization after a data outage.
t=trader({mock:true});t.populate();t.h.Player.has4SDataTixApi=true;t.live.money=30e9;t.live.casino=10e9;
t.h.market.ECP.b=false;t.h.market.ECP.mv=10;
let ticks=0,beforeHoldings,missingStock,recovering=false;
const holdings=value=>Object.fromEntries(Object.entries(JSON.parse(value)).map(([sym,stk])=>[sym,[stk.sharesLong,stk.sharesShort]]));
t.live.onSleep=ms=>{
  if(ms===5000) {t.h.market.ECP=missingStock;recovering=true;return;}
  if(++ticks===1) {t.live.reserve=t.live.money;t.live.price++;return;}
  beforeHoldings=holdings(t.live.files.get('/Temp/stock-probabilities.txt'));
  assert(beforeHoldings.ECP[1]>0);missingStock=t.h.market.ECP;delete t.h.market.ECP;
};
t.live.onWrite=(file,value)=>{
  if(recovering&&file==='/Temp/stock-probabilities.txt') {assert.deepEqual(holdings(value),beforeHoldings);throw STOP;}
};
await bounded(t);assert.equal(t.live.trades.length,0);
console.log('Stockmaster official-API startup/refresh recovery, throttled HUD pause, fresh forecasts/budgets, partial liquidation, commission accounting and healthy baseline trade parity passed.');
