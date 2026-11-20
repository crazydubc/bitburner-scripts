import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canJoinFactionPassively, getUsefulAugsForFaction} from '../../../faction-route-planner.js';
import {COMPANY_FACTIONS, getIntelFarmReadiness} from '../../../progression.js';

const NF='NeuroFlux Governor';
const groups=[['Sector-12','Aevum'],['Chongqing','New Tokyo','Ishima'],['Volhaven']];
const cities=groups.flat(), ordinary=['CyberSec','Daedalus','ECorp','Slum Snakes'];
const enemies=Object.fromEntries([...cities,...ordinary].map(name=>[name,
  cities.includes(name)?groups.filter(group=>!group.includes(name)).flat():[]]));
const empty=Object.fromEntries([...cities,...ordinary].map(name=>[name,[NF]]));
const base={factionEnemies:enemies,factionAugs:empty};
assert.equal(canJoinFactionPassively(),false);
assert.equal(canJoinFactionPassively({...base,faction:'CyberSec'}),true);
assert.equal(canJoinFactionPassively({...base,faction:'CyberSec',joinedFactions:['CyberSec']}),false);
assert.equal(canJoinFactionPassively({...base,faction:'ECorp',reservedFactions:COMPANY_FACTIONS}),false);
for(const special of ['Bladeburners','Church of the Machine God','Shadows of Anarchy'])
  assert.equal(canJoinFactionPassively({...base,faction:special,factionEnemies:{[special]:[]}}),false);

// Every exclusive pair, including factions not yet invited and augs outside desired stat filters.
for(const faction of cities) {
  assert.equal(canJoinFactionPassively({...base,faction}),true,'NF alone cannot permanently block a city');
  for(const enemy of enemies[faction]) {
    const factionAugs={...empty,[enemy]:['Unpurchased combat aug',NF]};
    assert.equal(canJoinFactionPassively({...base,faction,factionAugs}),false,`${faction} must protect ${enemy}`);
    assert.equal(canJoinFactionPassively({...base,faction,factionAugs,ownedAugs:['Unpurchased combat aug']}),true,
      'Purchased/queued ownership releases the exclusion');
    assert.equal(canJoinFactionPassively({...base,faction,factionAugs:{...empty,[enemy]:undefined}}),false);
    assert.equal(canJoinFactionPassively({...base,faction,factionAugs:{...empty,[enemy]:[undefined]}}),false);
    assert.equal(canJoinFactionPassively({...base,faction,joinedFactions:[enemy]}),false);
  }
}
assert.equal(canJoinFactionPassively({...base,faction:'Aevum',factionEnemies:{}}),false);
assert.equal(canJoinFactionPassively({...base,faction:'Aevum',factionEnemies:{Aevum:[undefined]}}),false);
assert.equal(canJoinFactionPassively({...base,faction:'Aevum',joinedFactions:['Sector-12'],
  factionAugs:{...empty,Volhaven:['Blocked aug']}}),true,'An allied membership adds no new exclusion');

const source=file=>readFileSync(new URL('../../../'+file,import.meta.url),'utf8');
const worker=source('work-for-faction2.js'), manager=source('faction-manager.js');
const section=(text,start,end)=>{
  const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
  assert(a>=0&&b>a,`Missing ${start}`);return text.slice(a,b);
};

// Execute both actual invitation consumers, including their success bookkeeping.
function invitationHarness(kind,{invites=['CyberSec'],joined=[],augs=empty,owned=[],metadata=enemies,
  reserved=false,forced=[],utility={},response=true,crime=false}={}) {
  const calls=[],logs=[],state={joined:[...joined],invites:[...invites],owned:[...owned]};
  const bindings={canJoinFactionPassively,COMPANY_FACTIONS,state,augs,metadata,reserved,forced,utility,response,crime,
    singRun:async(_ns,method,name)=>{assert.equal(method,'joinFaction');calls.push(name);return response;},
    log:(_ns,message)=>logs.push(message),cities};
  const definitions=kind==='worker'
    ? `const ns={},CITY_FACTIONS=new Set(cities),GANG_FACTIONS=['Slum Snakes'],CANNOT_DONATE=new Set(),
        collectAllCompanyInvites=reserved,crimeFocused=crime,playerInGang=false,gangFaction=null,favorToDonate=150;
       let pendingInvites=state.invites,playerInfo={factions:state.joined},ownedAugs=state.owned,
        factionAugs=augs,factionEnemies=metadata,factionFavor={},donationFactions=new Set();
       const isTrue=value=>value===true,factionUtility=name=>utility[name]??0;
       ${section(worker,'  function refreshDonationFactions()','  async function loadData()')}
       return ()=>joinUsefulInvitations();`
    : `const ns={},printToTerminal=false,strNF=${JSON.stringify(NF)},factionSortOrder=()=>0;
       let joinedFactions=state.joined,ownedAugmentations=state.owned,simulatedOwnedAugmentations=state.owned,
        factionEnemies=metadata,reservedInvitationFactions=new Set(reserved?COMPANY_FACTIONS:[]);
       const augmentationData=Object.fromEntries(Object.entries(augs).flatMap(([faction,names])=>
         (names??[]).map(name=>[name,{desired:name!==strNF && (utility[faction]??0)>0}])));
       const factionData=Object.fromEntries([...new Set([...Object.keys(augs),...state.invites])].map(name=>[name,
         {name,invited:state.invites.includes(name),joined:state.joined.includes(name),augmentations:augs[name]??[],
          unownedAugmentations:()=> (augs[name]??[]).filter(aug=>!ownedAugmentations.includes(aug))}]));
       ${section(manager,'async function joinFactions(ns,','/** Compute how much money must be donated')}
       return ()=>joinFactions(ns,forced);`;
  return {calls,logs,state,step:Function(...Object.keys(bindings),definitions)(...Object.values(bindings))};
}
for(const kind of ['worker','manager']) {
  let h=invitationHarness(kind,{invites:['CyberSec','Daedalus']});
  await h.step();assert.deepEqual(h.calls,['CyberSec','Daedalus']);assert.deepEqual(h.state.joined,h.calls);
  // The exclusive faction itself is exhausted, but its not-yet-invited opponent still matters.
  h=invitationHarness(kind,{invites:['Aevum','CyberSec'],augs:{...empty,Volhaven:['Combat aug']}});
  await h.step();assert.deepEqual(h.calls,['CyberSec']);
  h=invitationHarness(kind,{invites:['Aevum'],augs:{...empty,Volhaven:['Combat aug']},owned:['Combat aug']});
  await h.step();assert.deepEqual(h.calls,['Aevum']);
  h=invitationHarness(kind,{invites:['Aevum','Volhaven','Sector-12']});
  await h.step();assert.deepEqual(new Set(h.calls),new Set(['Aevum','Sector-12']),'Recheck exclusions after each successful join');
  h=invitationHarness(kind,{invites:['Aevum'],joined:['Sector-12'],augs:{...empty,Volhaven:['Blocked aug']}});
  await h.step();assert.deepEqual(h.calls,['Aevum']);
  h=invitationHarness(kind,{invites:['ECorp','CyberSec'],reserved:true});
  await h.step();assert.deepEqual(h.calls,['CyberSec']);
  h=invitationHarness(kind,{invites:['ECorp'],reserved:false});
  await h.step();assert.deepEqual(h.calls,['ECorp']);
  // The optional metadata read failing must not stop useful ordinary invitations.
  h=invitationHarness(kind,{invites:['CyberSec','Daedalus','Aevum'],metadata:{},
    augs:{...empty,CyberSec:['BitWire']},utility:{CyberSec:1}});
  await h.step();assert.deepEqual(h.calls,['CyberSec']);
  for(const response of [false,'ERROR:join failed']) {
    h=invitationHarness(kind,{response});await h.step();assert.deepEqual(h.state.joined,[]);
  }
}
// Keep explicit existing overrides: purposeful gang and manual city/INT-farm decisions.
let h=invitationHarness('worker',{invites:['Slum Snakes'],metadata:{},crime:true});
await h.step();assert.deepEqual(h.calls,['Slum Snakes']);
h=invitationHarness('manager',{invites:['ECorp','Aevum'],reserved:true,forced:['ECorp','Aevum'],
  augs:{...empty,Volhaven:['Combat aug']}});
await h.step();assert.deepEqual(new Set(h.calls),new Set(['ECorp','Aevum']));

// Passive membership must not become an active rep-grinding goal for exhausted factions.
assert.deepEqual(getUsefulAugsForFaction({faction:'CyberSec',factionAugs:{CyberSec:['BitWire',NF]},
  desiredAugSet:new Set(['BitWire',NF]),ownedAugs:['BitWire'],augRepReqs:{BitWire:100},
  joinedFactions:['CyberSec'],factionRep:{CyberSec:0},donationFactions:new Set(),gangAugs:new Set()}),[]);

// Execute the manager's actual INT reservation block; failures preserve invitations, completion releases them.
const reservation=section(manager,'  reservedInvitationFactions = new Set();','  // Join useful invitations');
for(const [sf5,intelligence,status,ignore,expected] of [
  [0,10,'prepare',false,false],[1,10,'prepare',false,true],[1,10,'farming',false,true],
  [1,10,'error',false,true],[1,10,'complete',false,false],[1,230,'prepare',false,false],
  [1,10,'prepare',true,false],
]) {
  let reads=0;
  const run=Function('getIntelFarmReadiness','COMPANY_FACTIONS','intelFarmState',`
    return (async()=>{
      const ns={},ignorePlayerData=${ignore},installedAugmentations=[],log=()=>{},
        playerData={skills:{intelligence:${intelligence}},factions:[]},
        resetInfo={ownedSF:new Map([[4,1],[5,${sf5}]])};
      let reservedInvitationFactions;
      ${reservation}
      return [...reservedInvitationFactions];
    })();`);
  const value=await run(getIntelFarmReadiness,COMPANY_FACTIONS,async()=>{
    reads++;if(status==='error')throw Error('home helper unavailable');return {status};
  });
  assert.deepEqual(value,expected?COMPANY_FACTIONS:[]);
  assert.equal(reads,sf5 && intelligence<230 && !ignore?1:0);
}
console.log('Passive faction joins: both real consumers, all exclusive pairs, queued ownership, unknown data, failed joins, INT reservations and active-goal isolation passed.');
