import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {SOA_FACTION,SOA_WKS,SOA_AUGS,soaAugmentationQuote,planSoaProgression,chooseInfiltration} from '../../../infiltration-policy.js';
import {manageSoaProgression} from '../../../infiltration-soa.js';
import {getSoaGuidance} from '../../../bn1-guide.js';

const base={owned:[],joined:true,rep:10000,money:10e9,reserve:8e9,augRequirement:30,factions:[SOA_FACTION],
  quotes:{[SOA_WKS]:{cost:1e6,rep:10000}}};
assert.equal(planSoaProgression(base).augmentation,SOA_WKS);
assert.equal(planSoaProgression({...base,joined:false}).needsInvite,true);
assert.equal(planSoaProgression({...base,money:8e9}).canBuy,false);
assert.equal(planSoaProgression({...base,money:8e9}).moneyTarget,8.001e9);
assert.equal(planSoaProgression({...base,owned:['The Red Pill']}),null);
assert.equal(planSoaProgression({...base,reserve:NaN}),null);
const extra={...base,owned:[SOA_WKS],quotes:{[SOA_AUGS[1]]:{cost:7e6,rep:13000}},rep:13000};
assert.equal(planSoaProgression(extra).augmentation,SOA_AUGS[1]);
assert.equal(planSoaProgression({...extra,money:8.006e9}),null);
assert.equal(planSoaProgression({...extra,augRequirement:1}),null);
assert.equal(planSoaProgression({...extra,factions:[SOA_FACTION,'Daedalus']}),null);
assert.equal(planSoaProgression({...extra,owned:[SOA_WKS,...Array(50).fill('NeuroFlux Governor')],augRequirement:3}).augmentation,SOA_AUGS[1]);
assert.deepEqual(soaAugmentationQuote([SOA_WKS,SOA_WKS]),{cost:7e6,rep:13000});

const choice={locations:[{location:{name:'Local',city:'Aevum'},difficulty:1,maxClearanceLevel:5,
  reward:{sellCash:1e9,tradeRep:1000,SoARep:2000}}],player:{city:'Aevum',money:10e9,factions:[SOA_FACTION,'CyberSec']},
  moneyTarget:10e9,soa:planSoaProgression({...base,rep:0})};
assert.equal(chooseInfiltration(choice).mode,'money','SoA reputation can justify a run after the cash goal is met');
assert.equal(chooseInfiltration({...choice,soa:null}),null);
assert.equal(chooseInfiltration({...choice,demand:0.7}),null);
assert.equal(chooseInfiltration({...choice,soa:planSoaProgression(base)}),null,'Do not farm more rep when the next augmentation is ready to buy');
assert.equal(chooseInfiltration({...choice,target:{faction:'CyberSec',targetRep:10000,repRate:1e9},rep:0}).faction,'CyberSec',
  'SoA progress still collects the normal reward for the active faction, even when ordinary work is faster');

// DOM/React fixture for the actual BN1 UI adapter, including both confirmation settings.
function fixture(options={}) {
  let screen='terminal',now=100000,nextScreen=null,renderAt=0,
    modal=options.invitePopup?{kind:'invite',name:options.invitePopup}:null,stopped=false;
  let money=options.money??10e9,joined=options.joined??false;
  const installed=options.installed??[],queued=[...(options.queued??[])],purchases=[],messages=[];
  const faction={name:SOA_FACTION,playerReputation:options.rep??10000};
  const allOwned=()=>[...installed,...queued];
  const currentCost=()=>soaAugmentationQuote(allOwned());
  const element=(label,handler)=>({textContent:label,disabled:false,getAttribute:()=>null,
    ...(handler?{__reactProps$soa:{onClick:handler}}:{})});
  const navigate=page=>{nextScreen=page;renderAt=now+350;};
  const menus=['Augmentations','Factions','Terminal'].map(label=>element(label,()=>navigate(label.toLowerCase())));
  const buy=name=>{
    const quote=currentCost();assert.ok(money>=quote.cost);assert.ok(faction.playerReputation>=quote.rep);
    assert.ok(!allOwned().includes(name));money-=quote.cost;queued.push(name);purchases.push(name);
    modal=options.suppressConfirmation?null:{kind:'receipt',name};
  };
  const row=name=>{
    const owned=allOwned().includes(name);
    const button=element(owned?'Owned':'Buy',()=>{
      if(options.suppressConfirmation)buy(name);else modal={kind:'confirm',name};
      if(options.drainOnBuy)money=8e9;
    });
    button.disabled=owned || faction.playerReputation<currentCost().rep || money<currentCost().cost;
    button.__reactFiber$soa={memoizedProps:{},return:{memoizedProps:{parent:{faction},augName:name,owned}}};
    return button;
  };
  const card={querySelectorAll:selector=>selector==='button'?(joined
    ?[element('Augments',()=>navigate('soa'))]:options.invited===false?[]:[element('Join!',()=>{joined=true;})]):[]};
  const queue={get textContent(){return queued.length?'Purchased Augmentations':'No Augmentations have been purchased yet';},
    querySelectorAll:selector=>selector==='.MuiListItemText-primary'?queued.map(element):[]};
  function headings(selector) {
    if(screen==='augmentations' && selector==='h4')return [element('Augmentations')];
    if(screen==='augmentations' && selector==='h5')return [{...element('Purchased Augmentations'),closest:()=>({parentElement:queue})}];
    if(screen==='factions' && selector==='h6')return [{...element(SOA_FACTION),closest:()=>card}];
    if(screen==='soa' && selector==='h4')return [element(`Faction Augmentations - ${SOA_FACTION}`)];
    return [];
  }
  function modalElement() {
    if(!modal)return null;
    const {kind,name}=modal;
    const contents=kind==='receipt'?`You purchased ${name}. Its enhancements will not take effect until they are installed.`:name;
    return {textContent:contents,getAttribute:()=>null,querySelector:()=>null,querySelectorAll:selector=>{
      if(selector==='h4')return kind==='confirm'?[element(name)]:kind==='invite'?[element('You received a faction invitation.')]:[];
      if(selector==='p')return kind==='invite'?[element(`Would you like to join ${name}?`)]:[];
      if(selector==='span')return [{__reactFiber$soa:{memoizedProps:{money:currentCost().cost}}}];
      if(selector==='button')return kind==='confirm'?[element('Purchase',()=>buy(name))]:kind==='receipt'?[element('OK',()=>{modal=null;})]:
        kind==='invite'?[element('Join',()=>{joined=true;modal=null;})]:[];
      return [];
    }};
  }
  const doc={getElementById:id=>id==='terminal' && screen==='terminal'?{}:null,
    querySelector:selector=>selector==='.factions-joined' && screen==='factions'?{}:null,
    querySelectorAll:selector=>{
      if(selector==='.MuiModal-root')return modal?[modalElement()]:[];
      if(selector==='[role="button"]')return menus;
      if(selector==='button')return screen==='soa'?SOA_AUGS.map(row):[];
      if(['h4','h5','h6'].includes(selector))return headings(selector);
      assert.fail(selector);
    }};
  const reset={ownedAugs:new Map(installed.map(name=>[name,1])),lastAugReset:10,lastNodeReset:5};
  const ns={read:()=>String(options.reserve??8e9),getPlayer:()=>({money,factions:joined?[SOA_FACTION]:[]}),getResetInfo:()=>reset,
    sleep:async ms=>{now+=ms;if(nextScreen && now>=renderAt){screen=nextScreen;nextScreen=null;}if(options.cancel)stopped=true;}};
  return {ns,doc,purchases,queued,messages,reset,get screen(){return screen;},get money(){return money;},
    async run(){const realNow=Date.now;Date.now=()=>now;try{return await manageSoaProgression(ns,
      {doc,canContinue:()=>!stopped,hasSingularity:false,augRequirement:options.augRequirement??30,print:m=>messages.push(m)});
    }finally{Date.now=realNow;}}};
}
for(const suppressConfirmation of [false,true]) {
  const f=fixture({suppressConfirmation});const state=await f.run();
  assert.deepEqual(f.purchases,[SOA_WKS]);assert.equal(state.joined,true);assert.equal(f.screen,'terminal');
  assert.equal(f.money,10e9-1e6);assert.equal(state.goal.augmentation,SOA_AUGS[1]);
  assert.match(getSoaGuidance({...state,lastAugReset:10,lastNodeReset:5,updatedAt:100000},f.reset,100001),/only after installation/);
}
{
  const f=fixture({invited:false});const state=await f.run();assert.equal(state.goal.needsInvite,true);assert.deepEqual(f.purchases,[]);
}
{
  const f=fixture({invitePopup:SOA_FACTION});const state=await f.run();assert.equal(state.joined,true);assert.deepEqual(f.purchases,[SOA_WKS]);
  const other=fixture({invitePopup:'Volhaven'});await assert.rejects(other.run(),/interrupted by a dialog/);assert.deepEqual(other.purchases,[]);
}
{
  const f=fixture({installed:[SOA_WKS,...Array.from({length:27},(_,i)=>'Other'+i)],queued:['Ready regular aug'],rep:1e6,joined:true});
  const state=await f.run();assert.deepEqual(f.purchases,[SOA_AUGS[1]]);assert.equal(new Set(state.owned).size,30);assert.equal(state.goal,null);
}
{
  const f=fixture({installed:[SOA_WKS],money:8.006e9,rep:1e6});await f.run();assert.deepEqual(f.purchases,[]);
}
{
  const f=fixture({drainOnBuy:true});await assert.rejects(f.run(),/available cash changed/);assert.deepEqual(f.purchases,[]);
}
{
  const f=fixture({cancel:true});await assert.rejects(f.run(),/cancelled/);assert.deepEqual(f.purchases,[]);
}

// Queued SoA purchases must not fabricate lower NeuroFlux levels or ordinary-augmentation inflation.
const manager=readFileSync(new URL('../../../faction-manager.js',import.meta.url),'utf8');
const count=manager.match(/numPriceScalingAugsAwaitingInstall = ownedAugmentations\.slice[^;]+;/)[0];
const inference=manager.match(/nfLevelPurchased = Math\.round[^;]+;/)[0];
const infer=Function('ownedAugmentations','installedAugmentations','augNf','SOA_AUGS',`
  let numPriceScalingAugsAwaitingInstall,nfLevelPurchased;const augCountMult=1.9,bitNodeMults={AugmentationMoneyCost:1};
  ${count}${inference}return nfLevelPurchased;`);
assert.equal(infer(['Installed','NeuroFlux Governor',SOA_WKS,SOA_AUGS[1]],['Installed'],{price:750000*1.14**10*1.9},SOA_AUGS),10);

const worker=readFileSync(new URL('../../../work-for-faction2.js',import.meta.url),'utf8');
const rates=worker.slice(worker.indexOf('  async function ensureFactionRepRates()'),worker.indexOf('  async function travelToCity('));
const measured=[];
await Function('measured',`const playerInfo={factions:['Shadows of Anarchy','CyberSec']},gangFaction=null,
  CANNOT_DONATE=new Set(['Shadows of Anarchy']),donationFactions=new Set(),usefulAugs=()=>['Useful'],
  repRateCache={},repRateMeasuredAt={},RATE_CACHE_TIME=1000,detectBestFactionWork=async faction=>measured.push(faction);
  ${rates}return ensureFactionRepRates();`)(measured);
assert.deepEqual(measured,['CyberSec']);

// Compare the BN1 UI quote with the actual official cost function, rather than a copy of our formula.
if(process.argv[2]) {
  const root=resolve(process.argv[2]);
  const enums=stripTypeScriptTypes(readFileSync(resolve(root,'src/Augmentation/Enums.ts'),'utf8'),{mode:'transform'});
  const {AugmentationName}=await import('data:text/javascript;base64,'+Buffer.from(enums).toString('base64'));
  const official=readFileSync(resolve(root,'src/Augmentation/AugmentationHelpers.ts'),'utf8').match(/export function getAugCost[\s\S]+?\n}/)[0];
  const constants=readFileSync(resolve(root,'src/Constants.ts'),'utf8');
  const constantsForCost={SoACostMult:Number(constants.match(/SoACostMult:\s*([\d.]+)/)[1]),SoARepMult:Number(constants.match(/SoARepMult:\s*([\d.]+)/)[1])};
  const getCost=Function('AugmentationName','Player','CONSTANTS','soaAugmentationNames',
    stripTypeScriptTypes(official,{mode:'transform'}).replace('export ','')+';return getAugCost;');
  const data=readFileSync(resolve(root,'src/Augmentation/Augmentations.ts'),'utf8');
  for(let count=0;count<SOA_AUGS.length;count++) {
    const owned=SOA_AUGS.slice(0,count),name=SOA_AUGS[count];
    const key=Object.keys(AugmentationName).find(key=>AugmentationName[key]===name);assert.ok(key);
    const block=data.slice(data.indexOf(`[AugmentationName.${key}]:`)).split(/\n    \[/)[0];
    const aug={name,baseCost:Number(block.match(/moneyCost:\s*([\de.]+)/)[1]),baseRepRequirement:Number(block.match(/repCost:\s*([\de.]+)/)[1])};
    const expected=getCost(AugmentationName,{hasAugmentation:name=>owned.includes(name)},constantsForCost,SOA_AUGS)(aug);
    assert.deepEqual(soaAugmentationQuote(owned),{cost:expected.moneyCost,rep:expected.repCost});
  }
}

console.log('SoA priority, reserve/budget, distinct augmentation count, simultaneous rewards, BN1 invitation/join/buy/confirmation UI, cancellation, guide, worker exclusion, official cost formula, and NeuroFlux accounting checks passed.');
