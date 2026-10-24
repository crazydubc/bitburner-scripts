// Usage: node <this-file> /path/to/bitburner-src [size=7] [games-per-opponent=2] [seed=117] [fixes|experiment]
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {loadGoEngine} from './go-engine.mjs';
import {loadGoBot} from './go-bot-loader.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const enginePath = process.argv[2] ?? '../bitburner-engine';
const size = Number(process.argv[3] ?? 7), games = Number(process.argv[4] ?? 2), seed = Number(process.argv[5] ?? 117);
const baselineRef = 'a05225d5c63d877e35ba7d34d70d7adbbff9cc69';
const engineCommit = execFileSync('git', ['-C', enginePath, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const e = await loadGoEngine(enginePath);
const {black, white, empty} = e.GoColor;
const opponents = process.argv[7] === 'hidden' ? ['????????????'] :
  ['Netburners', 'Slum Snakes', 'The Black Hand', 'Tetrads', 'Daedalus', 'Illuminati'];
const original = execFileSync('git', ['-C', root, 'show', `${baselineRef}:go.js`], {encoding:'utf8'});
let candidate = readFileSync(resolve(root, 'go.js'), 'utf8');
const experiment = process.argv[6] === 'experiment';
if (experiment) {
  // Rebuild the rejected experiment in a temporary directory; never patch the user's checkout.
  const temporary = mkdtempSync(resolve(tmpdir(), 'go-audit-'));
  try {
    writeFileSync(resolve(temporary, 'go.js'), original);
    execFileSync('git', ['apply', '--no-index', resolve(root, 'audit/2026-10-17-speedrun/go-tactics-experiment.patch')], {cwd:temporary});
    candidate = readFileSync(resolve(temporary, 'go.js'), 'utf8');
  } finally {rmSync(temporary, {recursive:true, force:true});}
}
let bots = [['baseline-format-fix', await loadGoBot(original, true)],
  [experiment ? 'experimental-tactics' : 'proposed-fixes', await loadGoBot(candidate)]];
if (process.argv[6] === 'current-only') bots = bots.slice(1);

async function play(main, opponent, gameSeed) {
  let rng = gameSeed;
  const oldRandom = Math.random;
  Math.random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2**32);
  e.Player.totalPlaytime = gameSeed;
  const state = e.getNewBoardState(size, opponent, true);
  e.updateChains(state.board); e.Go.currentGame = state; e.Go.stats = {};
  let plies = 0, turns = 0, stopped = false;
  const errors = [];
  const STOP = new Error('BENCHMARK_COMPLETE');
  const score = () => {
    const s = e.getScore(state);
    return {blackScore:s[black].sum, whiteScore:s[white].sum};
  };
  const endOrRespond = async () => {
    if (++turns > size * size * 4) throw new Error('Move budget exceeded');
    if (state.previousPlayer === null) return {type:'gameOver'};
    const reply = await e.getMove(state, white, opponent, false, gameSeed + turns * 65537);
    if (reply.type === 'pass') e.passTurn(state, white);
    else if (!e.makeMove(state, reply.x, reply.y, white)) throw new Error('Invalid engine AI move');
    plies++;
    return state.previousPlayer === null ? {type:'gameOver'} : reply;
  };
  const ns = {
    pid:1, getScriptName:()=> 'go.js', disableLog() {}, clearLog() {}, print() {}, printf() {},
    sprintf:()=>'', format:{time:String},
    exit() {stopped=true; throw STOP;},
    sleep:async()=>{throw STOP;}, // Errors must be recorded, not hidden in the bot's ten-second recovery loop.
    go: {
      getOpponent:()=>opponent, opponentNextTurn:async()=>({type:'move'}), getGameState:score,
      passTurn:async()=>{e.passTurn(state, black); plies++; return endOrRespond();},
      resetBoardState:()=>{throw Error('runOnce must not reset the board');},
    },
    audit: {
      log:message=>{if (!stopped && message.startsWith('WARNING:')) errors.push(message);},
      board:()=>e.simpleBoardFromBoard(state.board),
      controlled:()=>e.getControlledSpace(state.board).map((column,x)=>column.map((owner,y)=>
        owner===white?'O':owner===black?'X':!state.board[x][y]?'#':state.board[x][y].color===empty?'?':'.').join('')),
      valid:()=>state.board.map((column,x)=>column.map((point,y)=>point !== null &&
        e.evaluateIfMoveIsValid(state,x,y,black)===e.GoValidity.valid)),
      liberties:()=>state.board.map(column=>column.map(point=>!point?.liberties||point.color===empty?-1:point.liberties.length)),
      chains:()=>{const ids=new Map();return state.board.map(column=>column.map(point=>{
        if (!point) return null;
        if (!ids.has(point.chain)) ids.set(point.chain,ids.size);
        return ids.get(point.chain);
      }));},
      play:async(x,y)=>{
        if (!e.makeMove(state,x,y,black)) throw new Error(`Invalid bot move ${x},${y}`);
        plies++;return endOrRespond();
      },
    },
  };
  const started = performance.now();
  try {await main(ns);} catch(error) {if (error!==STOP) errors.push(String(error));}
  finally {Math.random=oldRandom;}
  const final = score(), completed = state.previousPlayer === null;
  return {opponent, seed:gameSeed, completed, win:completed && final.blackScore>final.whiteScore,
    ...final, plies, cpuMs:Math.round(performance.now()-started), errors};
}

const results = [];
for (let o = 0; o < opponents.length; o++) for (let g = 0; g < games; g++) {
  const gameSeed = seed + o * 1009 + g * 9973;
  for (const [variant, main] of bots) {
    const result = {variant, ...await play(main, opponents[o], gameSeed)};
    results.push(result);
    console.error(`${size}x${size} ${variant} ${result.opponent} seed=${gameSeed}: ${result.completed?(result.win?'win':'loss'):'ERROR'} ${result.blackScore}-${result.whiteScore} (${result.cpuMs}ms)`);
  }
}
const summary = bots.map(([variant])=>{
  const rows=results.filter(r=>r.variant===variant);
  return {variant,games:rows.length,completed:rows.filter(r=>r.completed).length,wins:rows.filter(r=>r.win).length,
    errors:rows.filter(r=>r.errors.length).length,cpuMs:rows.reduce((s,r)=>s+r.cpuMs,0)};
});
console.log(JSON.stringify({engineCommit,baselineRef,candidateSha256:createHash('sha256').update(candidate).digest('hex'),size,gamesPerOpponent:games,seed,summary,results,
  limitations:'Small seeded offline sample; real engine rules/scoring/AI, no cheats. Baseline gets only its missing sprintf fixed. UI, API transport, reward effects and artificial sleeps are stubbed. CPU time is not live game duration; no statistical or live win-rate guarantee.'},null,2));
if (results.some(r=>!r.completed || r.errors.length)) process.exitCode=1;
