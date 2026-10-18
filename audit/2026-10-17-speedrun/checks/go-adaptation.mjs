import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {goCohort, selectGoBoard, summarizeGoSamples} from '../../../go-policy.js';
import {main as save} from '../../../bin/go-stats.js';
import {loadGoBot} from './go-bot-loader.mjs';
const cohort=goCohort(false,0.9,false), opponent='Netburners';
const stats={_adaptive:{[cohort]:{}}}, data=stats._adaptive[cohort];
const rows=(wins,total,ms)=>Array.from({length:total},(_,i)=>({won:i<wins,durationMs:ms}));
const select=extra=>selectGoBoard({opponent,stats,cohort,explore:false,...extra});
assert.equal(select().size,13);
data['Netburners:5']=rows(3,3,1000);assert.equal(select().size,13);
data['Netburners:13']=rows(54,60,60000);data['Netburners:5']=rows(54,60,10000);
assert.equal(select().size,5);
data['Netburners:5']=rows(40,60,10000);assert.equal(select().size,13);
data['Illuminati:13']=rows(42,60,80000);data['Illuminati:5']=rows(3,60,5000);
assert.equal(select({opponent:'Illuminati'}).size,13);
assert.equal(select({opponent:'????????????',requested:'5'}).size,19);
assert.equal(select({requested:'9'}).size,9);
assert.equal(select({cohort:goCohort(true,0.9,false)}).size,13);
assert.equal(select({cohort:goCohort(false,0.9,true)}).size,13);
assert.equal(summarizeGoSamples([{won:true,durationMs:NaN},{won:'yes',durationMs:10}]).games,0);
assert.equal(summarizeGoSamples(rows(90,90,100)).games,60);
const trialStats={_adaptive:{[cohort]:{'Netburners:completed':4,'Illuminati:completed':4}}};
assert.equal(select({stats:trialStats,explore:true,streak:1}).size,13);
assert.equal(select({stats:trialStats,explore:true,streak:0}).size,5);
assert.equal(select({stats:trialStats,explore:true,streak:-1,opponent:'Illuminati'}).size,9);
trialStats._adaptive[cohort]['Netburners:lastTrial']=3;
assert.equal(select({stats:trialStats,explore:true,streak:0}).size,13);

const files=new Map();
async function helper(args){let callback,result;await save({pid:1,args,read:file=>files.get(file)??'',write:async(file,contents)=>files.set(file,contents),atExit:fn=>{callback=fn;},getPortHandle:()=>({write:value=>{result=value;}})});callback();return result;}
const game={opponent,size:5,won:false,blackScore:20,whiteScore:10,durationMs:1000,resumed:false,cohort,trial:true};
assert.equal(await helper([JSON.stringify(game)]),true);
let saved=await helper(['read']);assert.equal(saved['Netburners:5'].wins,0);
assert.equal(saved._adaptive[cohort]['Netburners:5'][0].won,false);
assert.equal(saved._adaptive[cohort]['Netburners:lastTrial'],1);
await helper([JSON.stringify({...game,won:true,resumed:true})]);saved=await helper(['read']);
assert.equal(saved['Netburners:5'].wins,1);assert.equal(saved._adaptive[cohort]['Netburners:5'].length,1);
for(let i=0;i<65;i++)await helper([JSON.stringify({...game,trial:false})]);
saved=await helper(['read']);assert.equal(saved._adaptive[cohort]['Netburners:5'].length,60);assert.equal(saved._adaptive[cohort]['Netburners:completed'],66);
for(let i=0;i<10;i++)await helper([JSON.stringify({...game,cohort:`configuration-${i}`})]);
assert.equal(Object.keys((await helper(['read']))._adaptive).length,8);
const corrupt='not json';files.set('/data/go-results.json',corrupt);assert.match(await helper([JSON.stringify(game)]),/^ERROR:/);assert.equal(files.get('/data/go-results.json'),corrupt);

// Actual game boundaries: choose for the next opponent, keep partial timings out,
// and count a failed cheat from engine counters even when black is ahead on the board.
const main=await loadGoBot(readFileSync(new URL('../../../go.js',import.meta.url),'utf8'));
const STOP=new Error('done'), records=[], resets=[];
let played=0,wins=0;
const ns={pid:1,getScriptName:()=> 'go.js',disableLog(){},clearLog(){},print(){},printf(){},format:{time:String},sleep:async()=>{throw STOP;},exit(){throw STOP;},
  go:{getOpponent:()=>opponent,getGameState:()=>({blackScore:20,whiteScore:1,bonusCycles:0}),opponentNextTurn:async()=>({type:'move'}),
    analysis:{getStats:()=>({[opponent]:{wins,winStreak:1}})},resetBoardState:(who,size)=>{resets.push({who,size});if(resets.length===2)throw STOP;}},
  audit:{options:{runOnce:false,opponent,'board-size':'auto'},stats:{_adaptive:{[cohort]:{'Netburners:13':rows(54,60,60000),'Netburners:5':rows(54,60,10000)}}},
    log(){},record:value=>records.push(value),board:()=>Array(5).fill('.....'),controlled:()=>Array(5).fill('?????'),
    valid:()=>Array.from({length:5},()=>Array(5).fill(true)),liberties:()=>Array.from({length:5},()=>Array(5).fill(-1)),chains:()=>Array.from({length:5},()=>Array(5).fill(0)),
    play:async()=>{if(++played===1)wins++;return {type:'gameOver'};},
  }};
await assert.rejects(main(ns),error=>error===STOP);
assert.equal(resets[0].size,5);assert.equal(records.length,2);assert.equal(records[0].resumed,true);
assert.equal(records[0].won,true);assert.equal(records[1].won,false);assert.equal(records[1].resumed,false);
console.log('Go per-opponent reliability/time choice, streak protection, bounded exploration, cohort separation, result retention, and real lifecycle checks passed.');
