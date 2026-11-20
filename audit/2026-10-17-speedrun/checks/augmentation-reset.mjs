import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateAugmentationReset} from '../../../augmentation-reset-policy.js';
import {buildAugUtilityMap} from '../../../faction-route-planner.js';
import {getFreshDonationFavorProgress, buildAscendArgs, NEUROFLUX} from '../../../donation-favor.js';
import {favorToRep} from '../../../utils.js';

const source = file => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
const section = (text, begin, end) => {
  const start = text.indexOf(begin), stop = text.indexOf(end, start);
  assert(start >= 0 && stop > start, begin); return text.slice(start, stop);
};
const reset = {currentNode: 4, lastAugReset: 1000};
const goal = (extra = {}) => ({key:'aug',label:'useful augmentation',faction:'CyberSec',money:100,
  rep:900,utility:1,...extra});
function snapshot(at, extra = {}) {
  return {generated_at:1000+at,current_node:4,last_aug_reset:1000,reset_planning:{version:1,
    wealth:100,hacking:100,readyUtility:20,reputation:{CyberSec:0},goals:[],...extra}};
}
function observed(make, state = {}, extraArgs = []) {
  let result;
  for (const t of [0,30_000,60_000]) {
    const snap = make(t);
    result = evaluateAugmentationReset(snap,reset,state,snap.generated_at,...extraArgs);
  }
  return {result,state};
}

// There is no augmentation-count cutoff: value, time and observed progress decide.
for (const readyUtility of [0.5,2,20]) {
  const {result} = observed(t => snapshot(600_000+t,{readyUtility,reputation:{CyberSec:t/100},goals:[goal()]}));
  assert.equal(result.action,'wait');assert.equal(result.reason,'productive-goal');assert.equal(result.eta,30_000);
}
assert.equal(observed(t => snapshot(600_000+t,{reputation:{CyberSec:t/100},goals:[goal({rep:100_000})]})).result.action,'reset');
assert.equal(observed(t => snapshot(600_000+t,{goals:[goal()]})).result.reason,'no-worthwhile-goal');
assert.equal(observed(t => snapshot(600_000+t,{reputation:{CyberSec:t/100},goals:[goal({utility:0.01})]})).result.action,'reset',
  'A small extra gain should not delay a valuable installed bundle');
assert.equal(observed(t => snapshot(600_000+t,{readyUtility:0})).result.action,'none');
assert.equal(evaluateAugmentationReset(snapshot(14_400_000),reset,{},14_401_000).reason,'hard-cap');

// Quotes require BOTH the full bundle's money and the reputation; a one-off payout is not an income stream.
assert.equal(observed(t => snapshot(600_000+t,{wealth:100+t/100,reputation:{CyberSec:t/100},
  goals:[goal({money:900})]})).result.action,'wait');
assert.equal(observed(t => snapshot(600_000+t,{wealth:t ? 1_000_000 : 100,goals:[goal({rep:0,money:2_000_000})]})).result.action,'reset');
assert.equal(observed(t => snapshot(600_000+t,{wealth:100-t/1000,goals:[goal({rep:0,money:200})]})).result.action,'reset');
assert.equal(observed(t => snapshot(600_000+t,{reputation:{CyberSec:t/100},goals:[goal({money:1000})]})).result.action,'reset');

// An active invitation estimate is bounded even if the worker keeps refreshing the same optimistic ETA.
const inviteState = {};
let inviteDecision;
for (let t=0;t<=240_000;t+=30_000) {
  const snap=snapshot(600_000+t,{readyUtility:1,goals:[goal({rep:0,eta:100_000})]});
  inviteDecision=evaluateAugmentationReset(snap,reset,inviteState,snap.generated_at);
  if(t===60_000)assert.equal(inviteDecision.action,'wait');
  if(t>=60_000)assert.equal(inviteDecision.deadline,841_000,'A refreshed estimate must not slide the deadline');
}
assert.equal(inviteDecision.reason,'goal-timeout');
assert.equal(observed(t=>snapshot(600_000+t,{goals:[goal({utility:1e6,eta:3_600_000})]})).result.action,'reset');

// Near-completion and 4S waits also need finite measured ETAs.
assert.equal(observed(t=>snapshot(600_000+t,{hacking:100+t/1000}),{},[1000]).result.goal,'finish this BitNode');
assert.equal(observed(t=>snapshot(600_000+t),{},[1000]).result.action,'reset');
assert.equal(observed(t=>snapshot(600_000+t,{wealth:900+t/1000}),{},[0,1000]).result.goal,'4S stock upgrade');
assert.equal(observed(t=>snapshot(600_000+t,{wealth:900}),{},[0,1000]).result.action,'reset');
const cashState={};let cashDecision;
for(const t of [0,30_000,60_000,90_000]) {
  const snap=snapshot(600_000+t,{wealth:1000});
  cashDecision=evaluateAugmentationReset(snap,reset,cashState,snap.generated_at,0,1000);
}
assert.equal(cashDecision.reason,'goal-timeout','An upgrade that never executes cannot hold installs indefinitely');

// Freshness, migration and malformed estimates cannot authorize a new reset.
assert.equal(evaluateAugmentationReset({},reset,{},1).action,'fallback');
assert.equal(evaluateAugmentationReset(snapshot(600_000),reset,{},800_000).action,'fallback');
assert.equal(evaluateAugmentationReset(snapshot(600_000,{goals:[goal({eta:NaN})]}),reset,{},601_000).action,'fallback');
const reused=observed(t=>snapshot(600_000+t)).state;
const next={currentNode:4,lastAugReset:700_000};
assert.equal(evaluateAugmentationReset({...snapshot(710_000),last_aug_reset:700_000},next,reused,711_000).reason,'measuring-progress');
assert.equal(reused.samples.length,1);

// Exercise the actual faction-manager quote builder with real sorting and utility calculations.
const manager=source('faction-manager.js');
const sortCode=section(manager,'let augSortOrder =','/** @pa am {NS} ns\n * @param {string[]} ignoredAugs');
const buildCode=section(manager,'function getResetPlanningSnapshot(','/** @pa am {NS} ns\n * @param {string[]} factionsToOmit');
function planningFixture() {
  const joined={name:'CyberSec',joined:true,reputation:1e6,donationsUnlocked:false,augmentations:[]};
  const other={name:'NiteSec',joined:false,reputation:0,donationsUnlocked:false,augmentations:['NewAug']};
  const make=(name,price,stats,prereqs=[])=>({name,price,stats,prereqs,desired:true,reputation:500,
    joinedFactionsWithAug:()=>name==='NewAug'?[]:[joined]});
  const nf=make(NEUROFLUX,1000,{hacking:1.01,faction_rep:1.01,charisma:1.01});
  const aug=make('BitWire',5000,{hacking:1.05});
  const newAug=make('NewAug',1000,{hacking:1.2});
  const future=make('Future',10000,{hacking:1.2},['BitWire']);
  const missing=make('Missing',10000,{hacking:2},['Unavailable']);
  const live={purchaseableAugs:[aug,...[0,1,2].map(i=>({...nf,price:nf.price*1.14**i,reputation:500*1.14**i}))],
    augmentationData:{[NEUROFLUX]:nf,BitWire:aug,Future:future,Missing:missing,NewAug:newAug},
    factionData:{CyberSec:joined,NiteSec:other},ownedAugmentations:[],wealth:1e9};
  const build=Function('live','buildAugUtilityMap','favorToRep',`
    const _ns={},strNF='NeuroFlux Governor',nfCountMult=1.14,augCountMult=1.9,nfLevelPurchased=0,
      desiredAugs=[],priorityAugs=[],stockValue=0,purchaseFactionDonations={};
    const {purchaseableAugs,augmentationData,factionData,ownedAugmentations}=live;
    const playerData={money:live.wealth,skills:{hacking:200}},getDonationFavorProgress=()=>[];
    const getCostOfReputation=rep=>rep*1000,getReqDonationForRep=(rep,f)=>Math.max(0,rep-f.reputation)*1000;
    const getTotalCost=augs=>augs.reduce((sum,aug,i)=>sum+aug.price*1.9**i,0);
    ${sortCode}${buildCode}return getResetPlanningSnapshot;`)(live,buildAugUtilityMap,favorToRep);
  return {live,build};
}
const fixture=planningFixture(), quote=fixture.build([],[]);
assert(!quote.goals.some(g=>g.key.startsWith('Missing')),'Never wait for an unreachable prerequisite');
assert(quote.goals.some(g=>g.key.startsWith('Future')),'An affordable prerequisite can be bought in the same bundle');
const nfGoal=quote.goals.find(g=>g.key.startsWith(NEUROFLUX));
assert.equal(nfGoal.rep,500*1.14**3);
assert.match(nfGoal.key,/:4:CyberSec$/);
assert(nfGoal.money>fixture.live.purchaseableAugs.reduce((sum,aug)=>sum+aug.price,0),'Include purchase inflation and current bundle');
assert(Math.abs(fixture.build(Array(10).fill(NEUROFLUX),[]).readyUtility-quote.readyUtility-10*nfGoal.utility)<1e-12,
  'Every queued NF level contributes its actual stat utility');
assert(!fixture.build([], [NEUROFLUX]).goals.some(g=>g.key.startsWith(NEUROFLUX)));
const invitation=fixture.build([],[],{faction:'NiteSec',eta:100000,unlockedAugs:['NewAug']}).goals.find(g=>g.key.startsWith('invite:'));
assert.equal(invitation.eta,100000);assert(invitation.money>1000);
assert(!fixture.build([],[],{faction:'NiteSec',eta:100000,unlockedAugs:['Missing']}).goals.some(g=>g.key.startsWith('invite:')));

// Execute the real autopilot decision, safety checks, ascend arguments, and telemetry together.
const autopilot=source('autopilot.js');
const decisionCode=section(autopilot,'  function updateAugMomentum(','  /** Clear invite-rush state');
const safetyCode=section(autopilot,'  async function shouldDelayInstall(','  /** Logic to determine whether we should keep running');
function pilot(overrides={}) {
  const live={elapsed:600_000,names:Array(20).fill(NEUROFLUX),queued:[],installed:Array.from({length:40},(_,i)=>'Owned'+i),
    rep:0,goals:[],favor:[],have4s:true,money:100,blackop:false,daedalus:false,infiltration:false,plan:true,events:[],ascends:[],...overrides};
  const make=Function('live','evaluateAugmentationReset','getFreshDonationFavorProgressActual','buildAscendArgs',`
    const NEUROFLUX='NeuroFlux Governor',MAX_AUGMENTATION_WAIT=14400000,unlockedSFs={4:3},shouldIntelFarm=false,
      resetInfo={currentNode:4,lastAugReset:1000},factionManagerOutputFile='queue',augTRP='The Red Pill',
      installedAugmentations=live.installed,playerInstalledAugCount=live.installed.length,wdHack=null,resetDecisionState={},
      bitNodeMults={DaedalusAugsRequirement:30,FourSigmaMarketDataApiCost:1,FourSigmaMarketDataCost:1};
    const Date={now:()=>1000+live.elapsed},getTimeInAug=()=>live.elapsed,getAugmentationCycleStart=()=>1000;
    const augMomentum={lastAugCount:0,bestRate:0,nextExpectedAug:0},formatDuration=String,log=()=>{},doSCP=async()=>{};
    let currentMoneyReserve,lastInvestmentDeadline,nextInvestmentDeadlineAttempt=0,lastFactionManagerWarning=0,
      lastResetDecisionLog='',nextResetDecisionLog=0,have4sApi=live.have4s,reservingMoneyForDaedalus=live.daedalus;
    const resetAugTrackersIfNeeded=()=>{},setReserve=async(_ns,value)=>value,
      noteMilestones=async events=>live.events.push(...events),getStocksValue=async()=>0,
      bbRun=async(_ns,fn)=>fn==='inBladeburner'?live.blackop:{type:'Black Operations'};
    const getFreshDonationFavorProgress=(snapshot,reset)=>getFreshDonationFavorProgressActual(snapshot,reset,{now:Date.now()});
    const runScriptLocal=async(_ns,file,_persistent,args)=>{
      if(file==='bin/infiltration-control.js'){assertLease(args);return live.infiltration;}
      if(file==='ascend.js')live.ascends.push(args);return true;};
    const assertLease=args=>{if(args.length!==1||args[0]!=='lease')throw Error('Reset checks must not acknowledge a worker lease');};
    const ns={getHostname:()=> 'remote',getScriptName:()=> 'autopilot.js',sleep:async()=>{},stock:{has4SData:()=>false},
      read:()=>JSON.stringify({generated_at:Date.now(),current_node:4,last_aug_reset:1000,
        affordable_augs:live.names,awaiting_install_augs:live.queued,total_rep_cost:0,total_aug_cost:100,
        donation_favor_progress:live.favor,...(live.plan?{reset_planning:{version:1,readyUtility:20,wealth:live.money,
          hacking:100,reputation:{CyberSec:live.rep},goals:live.goals}}:{})})};
    ${decisionCode}${safetyCode}
    return ()=>maybeInstallAugmentations(ns,{money:live.money,factions:[],skills:{hacking:100}});`);
  return {live,step:make(live,evaluateAugmentationReset,getFreshDonationFavorProgress,buildAscendArgs)};
}
async function measure(p) {for(const t of [0,30000,60000]){p.live.elapsed=600000+t;p.live.rep=t/100;await p.step();}return p;}
let p=await measure(pilot());assert.equal(p.live.ascends.length,1);
assert.equal(p.live.events[0].data.pendingNeuroflux,20);assert.equal(p.live.events[0].data.reason,'no-worthwhile-goal');
assert.deepEqual(p.live.ascends[0],['--install-augmentations',true,'--on-reset-script','autopilot.js']);
p=await measure(pilot({goals:[goal()]}));assert.equal(p.live.ascends.length,0,'20 pending levels do not force a reset');
p=await measure(pilot({names:[NEUROFLUX]}));assert.equal(p.live.ascends.length,1,'No hard minimum augmentation count');
for(const safeguard of ['blackop','daedalus']) {
  p=await measure(pilot({[safeguard]:true}));assert.equal(p.live.ascends.length,0,safeguard);
}
p=await measure(pilot({infiltration:true}));assert.equal(p.live.ascends.length,0);
p.live.infiltration=false;await p.step();assert.equal(p.live.ascends.length,1);
p=pilot({names:['The Red Pill'],infiltration:true});await p.step();assert.equal(p.live.ascends.length,0);
p=pilot({names:['The Red Pill'],infiltration:'ERROR:lease unavailable'});await p.step();assert.equal(p.live.ascends.length,0);
p=pilot({names:['The Red Pill']});await p.step();assert.equal(p.live.ascends.length,1);
p=pilot({installed:Array.from({length:29},(_,i)=>'Aug'+i),names:[NEUROFLUX]});await p.step();
assert.equal(p.live.events[0].data.reason,'daedalus-count','First NF is one distinct augmentation');
p=pilot({installed:[NEUROFLUX,...Array.from({length:28},(_,i)=>'Aug'+i)],names:Array(50).fill(NEUROFLUX)});
await p.step();assert.equal(p.live.ascends.length,0,'Repeat NF levels do not count toward Daedalus');
p=pilot({names:[],favor:[{faction:'Daedalus',current_favor:149,projected_favor:150,required_favor:150,desired_augs:['The Red Pill']}]});
await p.step();assert(p.live.ascends[0].includes('--allow-soft-reset'));
p=pilot({elapsed:14_400_000,names:[NEUROFLUX],goals:[goal()]});await p.step();assert.equal(p.live.ascends.length,1);
p=pilot({plan:false,names:[NEUROFLUX]});await p.step();assert.equal(p.live.ascends.length,0,'Old managers retain historical timing');
p=await measure(pilot({have4s:false,money:24e9}));assert.equal(p.live.ascends.length,1,'Unfunded 4S with no progress cannot hold forever');

// An explicitly disabled infiltration feature still publishes an invitation goal without claiming the screen.
const worker=source('work-for-faction2.js');
const publisher=section(worker,'  async function publishInfiltrationTarget()','  async function infiltrationOwnsScreen()');
const published=[];
await Function('published',`
  const infiltrationEnabled=false,activePlan={kind:'faction-invite',faction:'NiteSec',eta:120,
    unlockedAugs:['CRTX42-AA Gene Modification'],plannedAt:1000},repRateCache={},LOOP_SLEEP=30000,
    resetInfo={lastAugReset:1,lastNodeReset:1},ns={pid:8};
  let nextTargetPublish=0,lastPublishedTarget='';
  const runScriptLocal=async(_ns,file,persistent,args)=>{published.push(args);return true;};
  ${publisher}return publishInfiltrationTarget();`)(published);
assert.equal(published.length,1);assert.equal(published[0][0],'target');
assert.equal(JSON.parse(published[0][1]).workGoal.eta,120000);assert.equal(JSON.parse(published[0][1]).kind,'inactive');
console.log('Time/value reset planning, NF utility, live money/rep estimates, quote/prerequisite handling, bounded invitations/4S/BN finish, freshness, real autopilot resets and safeguards passed.');
