import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadGoBot} from './go-bot-loader.mjs';
const source = readFileSync(new URL('../../../go.js', import.meta.url), 'utf8');
const main = await loadGoBot(source);
const STOP = new Error('fixture complete');

function mock() {
  return {
    pid:1, getScriptName:()=> 'go.js', disableLog() {}, clearLog() {}, print() {}, printf() {},
    format:{time:String}, exit:()=>{throw STOP;}, sleep:async()=>{throw STOP;},
    go:{getOpponent:()=> 'Netburners', opponentNextTurn:async()=>({type:'move'})},
    audit:{log() {}, board:()=>Array(5).fill('.....'), controlled:()=>Array(5).fill('?????'),
      valid:()=>Array.from({length:5},()=>Array(5).fill(true)),
      liberties:()=>Array.from({length:5},()=>Array(5).fill(-1)),
      chains:()=>Array.from({length:5},()=>Array(5).fill(0)),
    },
  };
}

// Actual main loop must refresh its opponent style after resetting a completed board.
{
  const ns=mock(), observed=[];
  let opponent='Netburners', plays=0;
  ns.audit.options={runOnce:false};
  ns.go.getOpponent=()=>{observed.push(opponent);return opponent;};
  ns.go.resetBoardState=()=>{opponent='Daedalus';};
  ns.audit.play=async()=>{if (++plays===2) throw STOP;return {type:'gameOver'};};
  await assert.rejects(main(ns), error=>error===STOP);
  assert.deepEqual(observed.slice(0,2),['Netburners','Daedalus']);
}

// Secure a winning two-pass finish; do not enter the move-selection pipeline again.
{
  const ns=mock();let passes=0;
  ns.go.opponentNextTurn=async()=>({type:'pass'});
  ns.go.getGameState=()=>({blackScore:20,whiteScore:18.5});
  ns.go.passTurn=async()=>{passes++;return {type:'gameOver'};};
  ns.audit.valid=()=>{throw Error('Should finish the winning game before evaluating more moves');};
  await assert.rejects(main(ns), error=>error===STOP);
  assert.equal(passes,1);
}

{
  const ns=mock();let moves=0;
  ns.go.opponentNextTurn=async()=>({type:'pass'});
  ns.go.getGameState=()=>({blackScore:18,whiteScore:20.5});
  ns.go.passTurn=async()=>{throw Error('Do not accept a losing two-pass finish while a move is available');};
  ns.audit.play=async()=>{moves++;return {type:'gameOver'};};
  await assert.rejects(main(ns), error=>error===STOP);
  assert.equal(moves,1);
}

// A transport error retries at the same turn number on a changed board/move mask.
{
  const ns=mock();let attempt=0,sleeps=0;const played=[];
  ns.audit.board=()=>['X....','.....','.....','.....','.....'];
  ns.audit.valid=()=>Array.from({length:5},(_,x)=>Array.from({length:5},(_,y)=>x===(attempt?3:4)&&y===4));
  ns.audit.liberties=()=>[[4,-1,-1,-1,-1],...Array.from({length:4},()=>Array(5).fill(-1))];
  ns.audit.play=async(x,y)=>{played.push([x,y]);if (!attempt++) throw Error('temporary RPC failure');throw STOP;};
  ns.sleep=async()=>{if (++sleeps>1) throw STOP;};
  ns.go.passTurn=async()=>{throw Error('Retry used stale moves instead of the new legal move');};
  await assert.rejects(main(ns), error=>error===STOP);
  assert.deepEqual(played,[[4,4],[3,4]]);
}

// Execute the real nested pattern functions with a matching shape, without a global sprintf.
for (const name of ['getDefPattern','disruptEyes']) {
  const start=source.indexOf(`  function ${name}()`);
  const stop=source.indexOf('\n  /**',start+1);
  const fn=Function('getAllValidMoves','isPattern','def5','disrupt4','disrupt5',
    `${source.slice(start,stop)};return ${name};`)(()=>[[1,1]],()=>true,[['X*']],[['O*']],[]);
  assert.deepEqual(fn().coords,[1,1]);
  assert.match(fn().msg,/Pattern|Disruption/);
}

// Wall-breaking must honor the configured success threshold, without an unrelated SF4 prerequisite.
{
  const start=source.indexOf('  async function moveWallBreaker('), stop=source.indexOf('\n  /**',start+1);
  let chance=0.8, calls=0;
  const move=Function('cheats','cheatChanceThreshold','goCheatChance','destroyND','START',
    `${source.slice(start,stop)};return moveWallBreaker;`)(true,0.9,async()=>chance,async()=>{calls++;return {type:'move'};},0);
  const ns=mock();ns.sprintf=()=>'';
  assert.equal(await move(ns,{coords:[1,1],msg:'fixture'}),false);
  assert.equal(calls,0);
  chance=0.95;
  assert.equal((await move(ns,{coords:[1,1],msg:'fixture'})).type,'move');
  assert.equal(calls,1);
}

// A two-liberty target on the last row was previously excluded from the scan.
{
  const start=source.indexOf('  function getSnakeEyes('), stop=source.indexOf('\n  /**',start+1);
  const board=['#####','#####','#####','##.##','##O.#'];
  const libs=Array.from({length:5},()=>Array(5).fill(-1));libs[4][2]=2;
  const choose=Function('cheats','board','contested','validLibMoves','getChainValue',
    `${source.slice(start,stop)};return getSnakeEyes;`)(true,board,board,libs,()=>1);
  const {coords}=choose(1);
  assert.equal(coords.length,4);
  assert.deepEqual(new Set([coords.slice(0,2).join(','),coords.slice(2).join(',')]),new Set(['3,2','4,3']));
}
console.log('Go opponent transitions, pass decisions, retry cache, pattern execution, cheat threshold, and edge scan passed');

// Configuration applies only after completion, and the hidden opponent always requests its fixed size.
for (const unlocked of [false, true]) {
  const ns = mock(), resets = [], records = [];
  ns.audit.options = {runOnce: false, opponent: 'hidden', 'board-size': 5};
  ns.audit.reset = {ownedAugs: new Map(unlocked ? [['The Red Pill', 1]] : [])};
  ns.audit.record = result => records.push(result);
  ns.go.getGameState = () => ({blackScore: 20, whiteScore: 5.5});
  ns.audit.play = async () => ({type: 'gameOver'});
  ns.go.resetBoardState = (opponent, size) => {resets.push({opponent, size}); throw STOP;};
  await assert.rejects(main(ns), error => error === STOP);
  assert.equal(resets.length, 1); assert.equal(records.length, 1);
  assert.equal(resets[0].size, unlocked ? 19 : 5);
  assert.equal(resets[0].opponent === '????????????', unlocked);
}
{
  const ns = mock(); ns.audit.options = {'board-size': 19};
  ns.audit.play = () => assert.fail('Invalid ordinary board size must not start playing');
  await main(ns);
}
console.log('Go board-size configuration, hidden-opponent eligibility, and completed-game recording passed');
