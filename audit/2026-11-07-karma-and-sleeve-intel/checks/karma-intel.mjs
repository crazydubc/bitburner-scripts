// Run the pinned game mechanics with in-memory people; never touch a live save.
// node audit/2026-11-07-karma-and-sleeve-intel/checks/karma-intel.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {main as bulkRead} from '../../../bin/singReadMany.js';
const root=new URL('../../../',import.meta.url),engine=resolve(process.argv[2]??'../bitburner-engine');
const source=f=>readFileSync(resolve(engine,f),'utf8'),bot=f=>readFileSync(new URL(f,root),'utf8');
const bare=s=>s.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm,'').replace(/^export /gm,'');
const build=(text,bindings,expr)=>Function(...Object.keys(bindings),bare(stripTypeScriptTypes(text,{mode:'transform'}))+';return '+expr+';')(...Object.values(bindings));
function part(text,first,last) {const a=text.indexOf(first),b=text.indexOf(last,a+first.length);assert(a>=0&&b>a,first);return text.slice(a,b);}
function fn(path,name){const text=source(path);return part(text,'export function '+name+'(', '\n}')+'\n}';}
const noop=()=>{},near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const constants=source('src/Constants.ts');const constant=name=>Number(constants.match(new RegExp('\\b'+name+':\\s*([0-9.eE+-]+)'))[1]);
const CONSTANTS=Object.fromEntries(['MaxSkillLevel','MilliPerCycle','TravelCost','IntelligenceCrimeWeight','IntelligenceCrimeBaseExpGain','IntelligenceSingFnBaseExpGain'].map(k=>[k,constant(k)]));
const currentNodeMults=new Proxy({},{get:()=>1}),defaultMultipliers=()=>new Proxy({},{get:()=>1});
const {calculateExp,calculateSkill}=build(source('src/PersonObjects/formulas/skill.ts'),{clampNumber:(x,lo,hi=Infinity)=>Math.max(lo,Math.min(x,hi))},'({calculateExp,calculateSkill})');
const calculateIntelligenceBonus=build(source('src/PersonObjects/formulas/intelligence.ts'),{},'calculateIntelligenceBonus');
const CityName={Sector12:'Sector-12',Volhaven:'Volhaven',Aevum:'Aevum',Chongqing:'Chongqing'};
const LocationName={Sector12RothmanUniversity:'Rothman University',VolhavenZBInstituteOfTechnology:'ZB Institute of Technology',AevumSummitUniversity:'Summit University'};
const Player={};
const Person=build(source('src/PersonObjects/Person.ts'),{Player,CONSTANTS,CityName,defaultMultipliers,currentNodeMults,calculateExp,calculateSkill},'Person');
Object.setPrototypeOf(Player,Person.prototype);Object.assign(Player,new Person(),{sleeves:[],sleevesFromCovenant:4,sourceFileLvl:n=>n===5?1:n===10?3:0,
  bitNodeN:7,bitNodeOptions:{},gainMoney:noop,loseMoney:noop,canAfford:()=>true,travelCostMoneySource:()=>'other',factions:[],factionInvitations:['CyberSec','NiteSec'],
  hashManager:{getStudyMult:()=>1,prestige:noop},moneySourceA:{reset:noop},hacknetNodes:[],reapplyAllAugmentations:noop,finishWork:noop});
const {newWorkStats,scaleWorkStats,multWorkStats,applyWorkStatsExp}=build(source('src/Work/WorkStats.ts'),{Player},'({newWorkStats,scaleWorkStats,multWorkStats,applyWorkStatsExp})');
const {FactionWorkType,ClassType,UniversityClassType,GymType}=build(source('src/Work/Enums.ts'),{},'({FactionWorkType,ClassType,UniversityClassType,GymType})');
const Classes=build(part(source('src/Work/ClassWork.tsx'),'export const Classes:', '\ninterface ClassWorkParams'),{UniversityClassType,GymType,newWorkStats},'Classes');
const isMember=(_,x)=>Object.values(GymType).includes(x);
const locationMeta=source('src/Locations/data/LocationsMetadata.ts');
const Locations=Object.fromEntries([...locationMeta.matchAll(/costMult: (\d+),\s*expMult: (\d+),\s*name: LocationName\.(\w+),\s*types: \[LocationType.University\]/g)]
  .map(([,cost,exp,key])=>[LocationName[key],{name:LocationName[key],costMult:Number(cost),expMult:Number(exp)}]));
const calculateClassEarnings=build(source('src/Work/Formulas.ts'),{Classes,Locations,FactionWorkType,CONSTANTS,Player,currentNodeMults,newWorkStats,scaleWorkStats,multWorkStats,isMember,
  serverMetadata:[],GetServer:()=>null,Server:class{}},'calculateClassEarnings');
const applySleeveGains=build(part(source('src/PersonObjects/Sleeve/Work/Work.ts'),'export const applySleeveGains','export abstract class'),{applyWorkStatsExp,Player},'applySleeveGains');
const constructorsForReviver={},WorkBase=class{finish(){}};
const SleeveClassWork=build(source('src/PersonObjects/Sleeve/Work/SleeveClassWork.ts'),{constructorsForReviver,SleeveBaseWork:WorkBase,SleeveWorkType:{CLASS:'CLASS'},ClassType,LocationName,
  Locations,calculateClassEarnings,scaleWorkStats,applySleeveGains,isMember},'SleeveClassWork');
const Sleeve=build(source('src/PersonObjects/Sleeve/Sleeve.ts'),{Person,Player,CityName,LocationName,ClassType,UniversityClassType,SleeveRecoveryWork:WorkBase,SleeveSynchroWork:WorkBase,
  SleeveClassWork,mergeMultipliers:a=>a,constructorsForReviver},'Sleeve');
const recalculate=build(fn('src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx','recalculateNumberOfOwnedSleeves'),{Player,Sleeve},'recalculateNumberOfOwnedSleeves');
const sing=source('src/NetscriptFunctions/Singularity.ts');const singMethod=(name,bindings)=>build('const call='+part(sing,'    '+name+': ','\n    },').split(name+': ')[1]+'\n};',bindings,'call({})');
const Factions=Object.fromEntries(['CyberSec','NiteSec'].map(name=>[name,{name,isMember:false,getInfo:()=>({enemies:[]})}]));
const joinFaction=build(fn('src/Faction/FactionHelpers.tsx','joinFaction'),{Player,Factions,FactionDiscovery:{known:'known'},getRecordKeys:Object.keys},'joinFaction');
const singBindings={Player,CONSTANTS,Factions,CityName,joinFaction,helpers:{log:noop,checkSingularityAccess:noop},getEnumHelper:()=>({nsGetMember:(_,x)=>x})};
const join=singMethod('joinFaction',singBindings),travel=singMethod('travelToCity',singBindings);
Player.gainIntelligenceExp(10000);assert(join('CyberSec'));recalculate();assert.equal(Player.sleeves.length,7);
assert(Player.sleeves.every(s=>s.persistentIntelligenceData.exp===0),'No inherited player INT on sleeve creation');
const p0=Player.persistentIntelligenceData.exp;assert(join('NiteSec'));assert(travel('Chongqing'));
assert(Player.persistentIntelligenceData.exp>p0);assert(Player.sleeves.every(s=>s.persistentIntelligenceData.exp===0),'Player-only invite/travel awards are not broadcast');
const [learner,other]=Player.sleeves;learner.shock=0;learner.sync=100;other.shock=0;Player.sleeves[2].shock=96;
assert(learner.takeUniversityCourse('Rothman University','Computer Science'));
const rate=learner.currentWork.calculateRates(learner);assert.equal(rate.money,0);
const before=Player.persistentIntelligenceData.exp;learner.currentWork.process(learner,3600*1000/CONSTANTS.MilliPerCycle);
near(learner.persistentIntelligenceData.exp,72);near(other.persistentIntelligenceData.exp,72);near(Player.persistentIntelligenceData.exp-before,72);
near(Player.sleeves[2].persistentIntelligenceData.exp,2.88);
Player.sleevesFromCovenant++;recalculate();assert.equal(Player.sleeves.length,8);assert.equal(Player.sleeves[7].persistentIntelligenceData.exp,0);
learner.installAugmentation({name:'fixture augmentation',mults:{}});near(learner.persistentIntelligenceData.exp,72);near(learner.exp.intelligence,72);
const playerInstall=build(fn('src/PersonObjects/Player/PlayerObjectGeneralMethods.ts','prestigeAugmentation'),{SpecialServers:{Home:'home'},CONSTANTS:{Donations:0},CityName,LocationName,
  FactionInvitationEvents:{emit:noop},recalculateNumberOfOwnedSleeves:recalculate},'prestigeAugmentation');
playerInstall.call(Player);near(learner.persistentIntelligenceData.exp,72);near(learner.exp.intelligence,72);
Object.assign(Player,{bitNodeN:6,moneySourceB:{reset:noop},prestigeAugmentation:playerInstall});
const enterNode=build(fn('src/PersonObjects/Player/PlayerObjectGeneralMethods.ts','prestigeSourceFile'),{resetGangs:noop},'prestigeSourceFile');
enterNode.call(Player);assert.equal(learner.shock,100);near(learner.exp.intelligence,72);near(learner.persistentIntelligenceData.exp,72);
for (const [city,school,xp] of [['Sector-12','Rothman University',72],['Aevum','Summit University',108],['Volhaven','ZB Institute of Technology',144]]) {
  learner.city=city;learner.shock=0;assert(learner.takeUniversityCourse(school,'Computer Science'));
  const gains=learner.currentWork.calculateRates(learner);assert.equal(gains.money,0);near(gains.intExp*3600*1000/CONSTANTS.MilliPerCycle,xp);
}

// Score the live crime catalog, using the real engine chance and the production bulk helper transport.
const CrimeType=build(source('src/Crime/Enums.ts'),{},'CrimeType');
const Crime=build(source('src/Crime/Crime.ts'),{CONSTANTS,currentNodeMults,calculateIntelligenceBonus},'Crime');
const Crimes=build(source('src/Crime/Crimes.ts'),{Crime,CrimeType,CONSTANTS},'Crimes');
let finish,reply;const names=Object.values(CrimeType);await bulkRead({pid:13,args:['getCrimeStats',JSON.stringify(names)],atExit:cb=>finish=cb,
  ramOverride:n=>n,getFunctionRamCost:n=>n==='baseCost'?1.6:0.5,getPortHandle:()=>({write:v=>reply=structuredClone(v)}),singularity:{getCrimeStats:n=>Crimes[n]}});finish();
assert.deepEqual(Object.keys(reply).sort(),names.sort());assert.equal(Crimes.Homicide.intelligence_exp,0);
const prod=Function(bare(bot('sleeve.js'))+';return {estimateKarma,basicCrimeStats};')();
for(const [name,stats] of Object.entries(prod.basicCrimeStats)) for(const k of Object.keys(stats))assert.equal(stats[k],Crimes[name][k]);
const fleet=Array.from({length:8},()=>({skills:{hacking:2,strength:2,defense:2,dexterity:2,agility:2,charisma:2,intelligence:0},sync:100,shock:96,mults:{crime_success:1}}));
const ids=fleet.map((_,i)=>i);
for(const changes of [{},{charisma:1000},{dexterity:12,agility:15},{hacking:1000},{strength:300,intelligence:230}]) {
  const sl={...fleet[0],skills:{...fleet[0].skills,...changes}},best=Object.values(Crimes).sort((a,b)=>b.successRate(sl)*b.karma/b.time-a.successRate(sl)*a.karma/a.time)[0];
  const forecast=prod.estimateKarma([sl],[0],reply,-53995,1);assert.equal(forecast.choices[0].crime,best.type);near(forecast.perHour,best.successRate(sl)*best.karma*3600000/best.time);
}
const slow=prod.estimateKarma(fleet,ids,reply,0,1);assert.equal(slow.choices[0].crime,'Homicide');near(slow.perHour,295.38461538461536);near(slow.hours,182.8125);
assert.equal(prod.estimateKarma(fleet,[],reply,-100,1).hours,Infinity);
// Run every student through the real class processor. INT is additive per donor; it is not divided by eight.
const studyUpgrade=part(source('src/Hacknet/data/HashUpgradesMetadata.tsx'),'name: HashUpgradeEnum.ImproveStudying,','  },');
const value=Number(studyUpgrade.match(/value: (\d+)/)[1]);assert.equal(value,20);
const HashManager=build(source('src/Hacknet/HashManager.ts'),{HashUpgrades:{Study:{value}},HashUpgradeEnum:{ImproveStudying:'Study'},constructorsForReviver},'HashManager');
Player.hashManager=new HashManager();
for(const [shock,upgrades,expectedPerBody,expectedPlayer] of [[0,0,1152,1152],[0,5,2304,2304],[96,0,7.3728,46.08]]) {
  Player.hashManager.upgrades.Study=upgrades;
  const from=Player.sleeves.map(s=>s.persistentIntelligenceData.exp),pStart=Player.persistentIntelligenceData.exp;
  for (const s of Player.sleeves) {
    s.shock=shock;s.sync=100;assert(s.travel('Volhaven'));assert(s.takeUniversityCourse('ZB Institute of Technology','Computer Science'));
  }
  Player.sleeves.forEach((s,i)=>near(s.persistentIntelligenceData.exp,from[i])); // Neither travel nor enrolling awards instant INT.
  for(const s of Player.sleeves) s.currentWork.process(s,3600*1000/CONSTANTS.MilliPerCycle);
  Player.sleeves.forEach((s,i)=>near(s.persistentIntelligenceData.exp-from[i],expectedPerBody));
  near(Player.persistentIntelligenceData.exp-pStart,expectedPlayer);
}
assert.equal(Math.round(calculateExp(50)/1152*60),101);assert.equal(Math.round(calculateExp(230)/1152/24),25);
const auto=bot('autopilot.js');const argsCode=part(auto,'  function getFactionWorkerArgs()', '\n  //in order by importance!');
const args=(node,mode,intel=false)=>Function('resetInfo','options','useGangs','playerInGang','shouldIntelFarm',argsCode+';return getFactionWorkerArgs();')({currentNode:node},{'gang-mode':mode},mode!=='off',false,intel);
assert(!args(7,'auto').includes('--crime-focus'));assert(args(7,'on').includes('--crime-focus'));assert(args(4,'auto').includes('--crime-focus'));assert(args(7,'auto',true).includes('--intel-farm-preparation'));
console.log('Engine-verified: 12 crime rates, player-only invite/travel INT, per-sleeve persistence, no retroactive XP, free class and shock-scaled sharing (72 / 2.88 XP). Eight ZB students: 1152 INT XP/body/hour, 2304 at 5 study upgrades, 7.3728 at fixed 96 shock.');
