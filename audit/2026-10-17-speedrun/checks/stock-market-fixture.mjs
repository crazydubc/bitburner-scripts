// Shared fixture: official stock read APIs plus the real helper/RPC transport.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
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
const makeApi=Function('Player','StockSymbol','SymbolToStockMap','helpers','setRemovedFunctions','getDarknetVolatilityMult',apiCode+';return NetscriptStockMarket();');
const methods={'bin/getStockValue.js':snapshotMain,'bin/stockRun.js':stockMain,
  'bin/hasTixApi.js':accessMain,'bin/getServerAvailRam.js':availableMain};

export function harness(free=128) {
  const Player={hasTixApiAccess:true},market={},calls=[],sleeps=[],ports=new Map(),processes=new Map();
  const state={onSleep:null,failure:null,now:1_000_000};let nextPid=100;
  const api=makeApi(Player,StockSymbol,market,{
    string:(_,__,value)=>String(value),errorMessage:(ctx,message)=>new Error(`stock.${ctx.function}: ${message}`),
  },()=>{},()=>1);
  const stock=new Proxy({},{get(_,name){return (...args)=>{
    state.beforeStockCall?.(name,args);
    if(state.failure&&name==='getPosition')throw state.failure;
    return api[name]({function:name})(...args);
  };}});
  const populate=()=>{
    for(const symbol of Object.values(StockSymbol))market[symbol]={
      playerShares:0,playerAvgPx:0,playerShortShares:0,playerAvgShortPx:0,maxShares:1e9,mv:4,b:true,otlkMag:30,
      getBidPrice:()=>100,getAskPrice:()=>180,
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
