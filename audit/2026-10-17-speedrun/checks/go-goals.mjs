import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectAutoGoOpponent, selectGoFavorTarget, freshGoWorkTarget, sellsGoHashesForMoney,
  goCohort, GO_FAVOR_BUDGET_MS} from '../../../go-policy.js';
import {getGoContext, favorToRep} from '../../../utils.js';
import {main as contextMain} from '../../../bin/go-context.js';
import {main as singularityMain} from '../../../bin/singRun.js';
import {loadGoBot} from './go-bot-loader.mjs';

const now = Date.now(), reset = {currentNode:4,lastAugReset:now-600_000,lastNodeReset:now-1e6,ownedSF:new Map()};
const cohort = goCohort(false,0.9,false);
const rows = (wins,total,ms=5000) => Array.from({length:total},(_,i)=>({won:i<wins,durationMs:ms}));
const context = extra => ({updatedAt:now,lastAugReset:reset.lastAugReset,lastNodeReset:reset.lastNodeReset,
  money:10e9,reserve:8e9,factions:[],...extra});
const select = (state={},extra={}) => selectAutoGoOpponent({reset,cohort,now,context:context(state),...extra});
const repWork = {type:'FACTION',factionName:'CyberSec'};

assert.equal(select({work:repWork}).opponent,'Daedalus');
assert.equal(select({work:{type:'COMPANY',companyName:'ECorp'}}).opponent,'Daedalus');
assert.equal(select({work:{type:'CRIME',crimeType:'Homicide'},crimeChance:0.4}).opponent,'Slum Snakes');
assert.equal(select({work:{type:'CRIME',crimeType:'Homicide'},crimeChance:1}).opponent,'Tetrads');
assert.equal(select({work:{type:'CRIME'},crimeChance:'ERROR'}).opponent,'Slum Snakes');
for (const classType of ['str','def','dex','agi'])
  assert.equal(select({work:{type:'CLASS',classType}}).opponent,'Tetrads');
assert.equal(select({work:{type:'CLASS',classType:'Algorithms'}}).goal,'hacking');
assert.equal(select({}, {goal:'rep'}).opponent,'Daedalus','BN1 users can supply a goal without Singularity');
assert.equal(select({work:repWork},{goal:'combat'}).opponent,'Tetrads');
assert.equal(select({money:1e6,hacknetCashRate:1000,hackingIncome:2000}).opponent,'Netburners');
for (const hacknetCashRate of [0,-1,NaN,Infinity,1])
  assert.equal(select({money:1e6,hacknetCashRate,hackingIncome:2000}).opponent,'The Black Hand');
assert.equal(select({money:1e6,hacknetCashRate:1e9},{reset:{...reset,currentNode:8}}).opponent,'Illuminati');
assert.equal(select({work:repWork,money:0,hacknetCashRate:1e9}).opponent,'Daedalus','Active work wins over a generic cash goal');
assert.equal(select({work:{type:'CRIME'}},{liveStats:{'Slum Snakes':{bonusPercent:100}}}).opponent,'Tetrads');
const poorCrimes = {_adaptive:{[cohort]:{'Slum Snakes:5':rows(0,12)}}};
assert.equal(select({work:{type:'CRIME'}},{stats:poorCrimes}).opponent,'Tetrads');
assert.equal(select({work:{type:'CRIME'}},{stats:poorCrimes,cohort:'other-strategy'}).opponent,'Slum Snakes');

const target={kind:'donation-unlock',faction:'CyberSec',updatedAt:now,lastAugReset:reset.lastAugReset,lastNodeReset:reset.lastNodeReset};
assert(freshGoWorkTarget(target,reset,now));
assert.equal(select({target}).opponent,'Daedalus');
assert.equal(select({target,work:null,workKnown:true}).opponent,'The Black Hand','Known idle work must overrule a previous worker target');
for(const changed of [{updatedAt:now-90_001},{updatedAt:now+1},{lastAugReset:0},{lastNodeReset:0},{kind:'inactive'}])
  assert.equal(select({target:{...target,...changed}}).opponent,'The Black Hand');
for(const changed of [{updatedAt:now-30_001},{updatedAt:now+1},{lastAugReset:0}])
  assert.equal(select({work:repWork,...changed}).opponent,'The Black Hand');
assert.equal(selectAutoGoOpponent({reset,now,context:null}).opponent,'The Black Hand');
const unlocked={...reset,ownedAugs:new Map([['The Red Pill',1]])};
assert.equal(select({}, {reset:unlocked}).opponent,'????????????');
assert.notEqual(select({}, {reset:unlocked,includeHidden:false}).opponent,'????????????');
assert.notEqual(select({}, {reset:{...reset,ownedAugs:new Map()}}).opponent,'????????????');

// Direct favor is based on CURRENT favor, cap remaining, current cash, and timed games.
const faction='The Black Hand', favorStats={_adaptive:{[cohort]:{[`${faction}:7`]:rows(54,60)}}};
const quote={faction,currentFavor:149.95,requiredFavor:150,cost:1e9,goRep:1000,augmentation:'Useful Aug'};
const favorSnapshot={generated_at:now,current_node:4,last_aug_reset:reset.lastAugReset,go_favor_targets:[quote]};
const liveStats={[faction]:{rep:1000,winStreak:1}}, funded=context({factions:[faction],favorSnapshot,work:repWork});
const favorArgs={context:funded,reset,stats:favorStats,liveStats,cohort,now};
const picked=selectGoFavorTarget(favorArgs);
assert.equal(picked.opponent,faction);assert.equal(picked.rewards,1);assert(picked.eta<60_000);
assert(favorToRep(150)-favorToRep(149.95)<500);
assert.equal(selectAutoGoOpponent(favorArgs).goal,'favor');
assert.equal(selectAutoGoOpponent({...favorArgs,goal:'crime'}).goal,'crime','Manual goals remain deliberate overrides');
const even=selectGoFavorTarget({...favorArgs,liveStats:{[faction]:{rep:1000,winStreak:2}}});
assert(even.eta>picked.eta,'An odd positive streak is one win closer to the reward');
for(const change of [{money:8.5e9},{reserve:NaN},{reserve:-1},{factions:[]},
  {favorSnapshot:{...favorSnapshot,generated_at:now-90_001}},
  {favorSnapshot:{...favorSnapshot,generated_at:now+1}},
  {favorSnapshot:{...favorSnapshot,last_aug_reset:0}},
  {favorSnapshot:{...favorSnapshot,current_node:1}}])
  assert.equal(selectGoFavorTarget({...favorArgs,context:{...funded,...change}}),null);
for (const changes of [{currentFavor:150},{currentFavor:0},{cost:Infinity},{cost:0},{faction:'CyberSec'}])
  assert.equal(selectGoFavorTarget({...favorArgs,context:{...funded,
    favorSnapshot:{...favorSnapshot,go_favor_targets:[{...quote,...changes}]}}}),null);
for (const rep of [100_000,1500,0,NaN])
  assert.equal(selectGoFavorTarget({...favorArgs,liveStats:{[faction]:{rep,winStreak:1}}}),null,
    'Respect the cap, already-earned favor, reset counters, and invalid stats');
assert.equal(selectGoFavorTarget({...favorArgs,stats:{}}),null,'Missing timing does not invent a fast unlock');
assert.equal(selectGoFavorTarget({...favorArgs,stats:{_adaptive:{[cohort]:{[`${faction}:7`]:rows(2,60,60_000)}}}}),null);
// Automatic favor routing can favor a much faster board despite a lower win rate.
const routeStats={_adaptive:{[cohort]:{[`${faction}:5`]:rows(40,60,10000),[`${faction}:7`]:rows(54,60,30000),
  [`${faction}:9`]:rows(50,60,30000),[`${faction}:13`]:rows(60,60,60000)}}};
const fastRoute=selectGoFavorTarget({...favorArgs,stats:routeStats,boardSize:'auto'});
assert.equal(fastRoute.board.size,5);
assert.equal(selectGoFavorTarget({...favorArgs,stats:routeStats}).board.size,7,'Honor the fixed per-opponent profile');
assert.equal(selectGoFavorTarget({...favorArgs,stats:routeStats,boardSize:'9'}).board.size,9,'Honor explicit board size');
assert.equal(selectGoFavorTarget({...favorArgs,stats:routeStats,cohort:'other-strategy'}),null);
const further={...funded,favorSnapshot:{...favorSnapshot,go_favor_targets:[{...quote,currentFavor:149.8}]}};
assert.equal(selectGoFavorTarget({...favorArgs,context:further,reset:{...reset,ownedSF:new Map([[14,3]])}}).rewards,1);
assert(selectGoFavorTarget({...favorArgs,context:further}).rewards>1,'Use effective SF14 reward size');
const deadlines={};selectAutoGoOpponent({...favorArgs,favorDeadlines:deadlines});
const deadline=deadlines[picked.key];assert.equal(deadline,now+GO_FAVOR_BUDGET_MS);
function freshAt(at){return {...funded,updatedAt:at,favorSnapshot:{...favorSnapshot,generated_at:at}};}
selectAutoGoOpponent({...favorArgs,now:now+30_000,context:freshAt(now+30_000),favorDeadlines:deadlines});
assert.equal(deadlines[picked.key],deadline,'Refreshed forecasts cannot slide the deadline');
assert.equal(selectAutoGoOpponent({...favorArgs,now:deadline+1,context:freshAt(deadline+1),favorDeadlines:deadlines}).opponent,'Daedalus');

// Run the real quote publisher: honor owned prerequisites, omitted augs, and remaining rep costs.
const manager=readFileSync(new URL('../../../faction-manager.js',import.meta.url),'utf8');
const quoteSource=manager.slice(manager.indexOf('function getGoFavorTargets('),manager.indexOf('/** Reuse this pass'));
const makeQuotes=Function('live',`
  const _ns={go:{analysis:{getStats:()=>({'The Black Hand':{rep:500}})}}};
  const getDonationFavorProgress=ratio=>{if(ratio!==0)throw Error('Exclude no near-favor candidates');return [live.progress];};
  const {augmentationData,ownedAugmentations}=live,factionData={'The Black Hand':{reputation:100}};
  const getReqDonationForRep=(required,faction)=>Math.max(0,required-faction.reputation)*1000;
  ${quoteSource}return getGoFavorTargets;`);
const quoteInput={progress:{faction,current_favor:149.95,required_favor:150,desired_augs:['Cheap','Locked','Invalid']},
  ownedAugmentations:[],augmentationData:{Cheap:{name:'Cheap',price:100,reputation:200,prereqs:[]},
    Locked:{name:'Locked',price:1,reputation:101,prereqs:['Key']},Invalid:{name:'Invalid',price:NaN,reputation:1,prereqs:[]}}};
assert.deepEqual(makeQuotes(quoteInput)(),[{faction,currentFavor:149.95,requiredFavor:150,goRep:500,augmentation:'Cheap',cost:100_100}]);
assert.deepEqual(makeQuotes(quoteInput)(['Cheap']),[]);
quoteInput.ownedAugmentations.push('Key');assert.equal(makeQuotes(quoteInput)()[0].augmentation,'Locked');

// Actual home snapshot helper, including an offloaded hash seller and fresh worker liveness.
async function readContext({nodes=[],processes=[],config='',target=null,alive=true,fail=false}={}) {
  let exit,result;const files={'reserve.txt':'8000000000','spend-hashes.js.config.txt':config,
    '/Temp/infiltration-target.txt':JSON.stringify(target),'/Temp/affordable-augs.txt':JSON.stringify(favorSnapshot)};
  await contextMain({pid:1,getResetInfo:()=>reset,getPlayer:()=>({money:10e9,factions:[faction]}),
    getMoneySources:()=>({sinceInstall:{hacking:1e6,stock:1e15}}),read:file=>files[file]??'',
    scan:host=>host==='home'?['CSEC']:['home'],ps:host=>host==='CSEC'?processes:[],isRunning:()=>alive,
    hacknet:{numNodes:()=>nodes.length,getNodeStats:i=>{if(fail)throw Error('read failed');return nodes[i];},hashCost:()=>4},
    atExit:fn=>exit=fn,getPortHandle:()=>({write:value=>result=value})});
  exit();return result;
}
assert.equal((await readContext({nodes:[{production:10},{production:20},{production:NaN}]})).hacknetCashRate,30);
const hashNodes=[{production:2,hashCapacity:4}], seller=args=>({filename:'spend-hashes.js',args});
assert.equal((await readContext({nodes:hashNodes,processes:[seller([])]})).hacknetCashRate,500_000);
assert.equal((await readContext({nodes:hashNodes})).hacknetCashRate,0);
assert.equal((await readContext({nodes:[{production:2,hashCapacity:2}],processes:[seller([])]})).hacknetCashRate,0);
assert.equal((await readContext({nodes:hashNodes,processes:[seller([])],config:'{"spend-on":["Sell for Corporation Funds"]}'})).hacknetCashRate,0);
assert.equal((await readContext({nodes:hashNodes,processes:[seller(['--spend-on','Sell_for_Money'])],config:'{"spend-on":["Improve Studying"]}'})).hacknetCashRate,500_000);
assert.equal((await readContext({nodes:hashNodes,processes:[seller([])],config:'bad JSON'})).hacknetCashRate,0);
assert(sellsGoHashesForMoney(['--spend-on=Sell_for_Money']));
assert(!sellsGoHashesForMoney([], [['spend-on',['Improve Studying']]]));
assert((await readContext()).hackingIncome<2000,'Stock gains must not masquerade as hacking production');
assert.equal((await readContext({target:{...target,pid:25}})).target.faction,'CyberSec');
assert.equal((await readContext({target:{...target,pid:25},alive:false})).target,null);
assert.match(await readContext({nodes:hashNodes,fail:true}),/^ERROR:/);

// Real remote caller/home transport. Optional SF4 calls obey effective RAM and never perform work.
function rpc({free=128,missing=false,work=repWork,chance=0.4,fail=false,costs={}}={}) {
  const ports=new Map(),running=new Set(),launches=[];let pid=0;
  const ns={print(){},getScriptRam:file=>missing&&file==='bin/go-context.js'?0:6.6,
    getFunctionRamCost:fn=>fn==='baseCost'?1.6:costs[fn]??0.5,isRunning:id=>running.has(id),
    singularity:{getCurrentWork:()=>{if(fail)throw Error('access unavailable');return work;},getCrimeChance:()=>chance},
    getPortHandle:id=>{if(!ports.has(id)){const values=[];let resolve;ports.set(id,{empty:()=>!values.length,read:()=>values.shift(),
      write:value=>{values.push(structuredClone(value));resolve?.();},nextWrite:()=>new Promise(r=>resolve=r)});}return ports.get(id);},
    exec(file,host,options,...args){assert.equal(host,'home');assert(args.every(x=>['string','number','boolean'].includes(typeof x)));
      const id=++pid;running.add(id);launches.push({file,options,args});queueMicrotask(async()=>{
        if(file==='bin/singRun.js'){let exit;await singularityMain({...ns,pid:id,args,atExit:fn=>exit=fn,ramOverride:ram=>ram});exit();}
        else ns.getPortHandle(id).write(file==='bin/getServerAvailRam.js'?free:context());
        running.delete(id);
      });return id;
    }};return {ns,launches};
}
let h=rpc({work:{type:'CRIME',crimeType:'Homicide'}});
let result=await getGoContext(h.ns,{4:3});assert.equal(result.work.type,'CRIME');assert.equal(result.crimeChance,0.4);
assert.equal(h.launches.length,4);
h=rpc();result=await getGoContext(h.ns,{});assert.equal(result.work,undefined);assert.equal(h.launches.length,2);
h=rpc({free:6.5});assert.equal(await getGoContext(h.ns,{4:3}),null);assert.equal(h.launches.length,1);
h=rpc({free:NaN});assert.equal(await getGoContext(h.ns,{4:3}),null);
h=rpc({missing:true});assert.equal(await getGoContext(h.ns,{4:3}),null);assert.equal(h.launches.length,0);
h=rpc({free:20,work:{type:'CRIME',crimeType:'Homicide'},costs:{'singularity.getCurrentWork':8,'singularity.getCrimeChance':80}});
result=await getGoContext(h.ns,{4:1});assert.equal(result.work.type,'CRIME');assert.equal(result.crimeChance,undefined);
assert.equal(h.launches.at(-1).options.ramOverride,9.6);
h=rpc({fail:true});assert.equal((await getGoContext(h.ns,{4:3})).workKnown,undefined);
h=rpc({work:null});assert.equal((await getGoContext(h.ns,{4:3})).workKnown,true);

// Execute the real Go loop: route only after completed games, re-evaluate goals, preserve explicit choices.
const main=await loadGoBot(readFileSync(new URL('../../../go.js',import.meta.url),'utf8'));
const STOP=new Error('finished');
async function loop(options={},failContext=false,scenario={}){
  let plays=0,observations=0,opponent='Netburners';const resets=[],logs=[];
  const ns={pid:1,getScriptName:()=> 'go.js',disableLog(){},clearLog(){},print(){},printf(){},format:{time:String},
    sleep:async()=>{throw STOP;},exit:()=>{throw STOP;},
    go:{getOpponent:()=>opponent,opponentNextTurn:async()=>({type:'move'}),getGameState:()=>({blackScore:20,whiteScore:1,bonusCycles:0}),
      analysis:{getStats:()=>({...scenario.liveStats,[opponent]:{...scenario.liveStats?.[opponent],wins:plays,winStreak:1}})},
      resetBoardState:(who,size)=>{assert(plays>0);resets.push({who,size});opponent=who;if(resets.length===2)throw STOP;}},
    audit:{options:{runOnce:false,...options},reset,stats:scenario.stats??{},log:message=>logs.push(message),
      context:()=>{observations++;assert(plays>0,'Never sample/change goals mid-game');
        if(options.opponent&&options.opponent!=='auto')assert.fail('Explicit opponent must skip the goal helper');
        if(failContext)throw Error('home busy');return scenario.context??context({work:plays===1?repWork:{type:'CRIME'}});},
      board:()=>Array(5).fill('.....'),controlled:()=>Array(5).fill('?????'),valid:()=>Array.from({length:5},()=>Array(5).fill(true)),
      liberties:()=>Array.from({length:5},()=>Array(5).fill(-1)),chains:()=>Array.from({length:5},()=>Array(5).fill(0)),
      play:async()=>{plays++;return {type:'gameOver'};}}};
  await assert.rejects(main(ns),error=>error===STOP);return {resets,logs,observations};
}
let played=await loop();assert.deepEqual(played.resets.map(row=>row.who),['Daedalus','Slum Snakes']);
assert(played.logs.some(message=>message.includes('reputation work')));
assert(played.resets.every(row=>row.size===5),'Default mode executes the fixed per-opponent profile');
played=await loop({opponent:'Tetrads','board-size':'7'});assert(played.resets.every(row=>row.who==='Tetrads'&&row.size===7));
assert.equal(played.observations,0);
played=await loop({},true);assert(played.resets.every(row=>row.who==='The Black Hand'));
played=await loop({'board-size':'auto'},false,{stats:routeStats,liveStats,context:funded});
assert(played.resets.every(row=>row.who===faction&&row.size===5),'Execute the forecast board, not the unconstrained reliability choice');
assert(played.logs.some(message=>message.includes('funded donation unlock')));
console.log('Goal routing, affordable/time-bounded Go favor, quotes, caps, stale state, hash sinks, effective RAM, and real game-boundary regressions passed.');
