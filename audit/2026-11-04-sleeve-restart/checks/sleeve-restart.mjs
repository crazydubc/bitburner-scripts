// Real manager loops and official Sleeve API exclusivity checks; no live game state.
// node audit/2026-11-04-sleeve-restart/checks/sleeve-restart.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import * as planner from '../../../faction-route-planner.js';
import {hasBladeburnerAccess, bn103StudyNode} from '../../../progression.js';
import {main as sleeveHelper, prepareSleeveResultForPort} from '../../../bin/sleeveRun.js';

const root = new URL('../../../', import.meta.url);
const code = process.env.AUDIT_SLEEVE_BASELINE
  ? execFileSync('git', ['show', process.env.AUDIT_SLEEVE_BASELINE + ':sleeve.js'], {cwd: root, encoding: 'utf8'})
  : readFileSync(new URL('sleeve.js', root), 'utf8');
const bare = text => text.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm, '').replace(/^export /gm, '');
const official = bare(stripTypeScriptTypes(readFileSync(resolve(process.argv[2] ?? '../bitburner-engine', 'src/NetscriptFunctions/Sleeve.ts'), 'utf8')));
const STOP = Symbol('bounded loop complete');
const noop = () => {};
const A = 'CyberSec', B = 'New Tokyo', C = 'Tian Di Hui';
const faction = (factionName, factionWorkType = 'hacking') => ({type: 'FACTION', factionName, factionWorkType});
const company = companyName => ({type: 'COMPANY', companyName});
const crime = crimeType => ({type: 'CRIME', crimeType});

function fixture({tasks = [null, null, null], routes = [A, B, C], playerWork = null, flags = {}, shock = {}, sync = {}} = {}) {
  const calls = [], logs = [], collisions = [], setters = [];
  const state = {routes, playerWork, now: 1_000_000, readFailure: null, skipIdle: -1, beforeFaction: null,
    tick: 0, types: {}, supported: {}, files: {10: 1, 4: 3}};
  const work = snapshot => snapshot === null ? null : {...snapshot, APICopy() {
    const {APICopy, ...data} = this; return {...data, nextCompletion: new Promise(noop)};
  }};
  const sleeves = tasks.map((snapshot, i) => ({
    currentWork: work(snapshot), sync: sync[i] ?? 100, shock: shock[i] ?? 0,
    hp: {current: 100, max: 100}, city: 'Sector-12', mults: {crime_success: 1},
    skills: {hacking: 100, strength: 100, defense: 100, dexterity: 100, agility: 100, charisma: 100, intelligence: 0},
    stopWork() {this.currentWork = null;},
    workForFaction(name, type) {
      if (!(state.supported[name] ?? ['hacking']).includes(type)) return false;
      this.currentWork = work(faction(name, type)); return true;
    },
    workForCompany(name) {this.currentWork = work(company(name)); return true;},
    shockRecovery() {this.currentWork = work({type: 'RECOVERY'}); return true;},
    synchronize() {this.currentWork = work({type: 'SYNCHRO'}); return true;},
  }));
  const bindings = {
    Player: {sleeves, gang: null},
    helpers: {integer: (_, __, value) => value, string: (_, __, value) => value,
      errorMessage: (_, text) => Error(text), log: noop},
    Factions: Object.fromEntries([A, B, C].map(name => [name, {isMember: true}])),
    getEnumHelper: () => ({nsGetMember: (_, value) => value}),
    isSleeveFactionWork: task => task?.type === 'FACTION', isSleeveCompanyWork: task => task?.type === 'COMPANY',
    canAccessBitNodeFeature: () => true, setRemovedFunctions: noop,
  };
  const engineApi = Function(...Object.keys(bindings), official + ';return NetscriptSleeve();')(...Object.values(bindings));
  const taskData = i => prepareSleeveResultForPort('getTask', engineApi.getTask({})(i));
  const mocks = {...planner, hasBladeburnerAccess, bn103StudyNode, disableLogs: noop,
    getConfiguration: (_, schema) => ({...Object.fromEntries(schema), 'disable-training': true, 'disable-bladeburner': true, ...flags}),
    findPids: async () => [1], getActiveSourceFiles: async () => state.files,
    log: (_, text) => logs.push(text), formatMoney: String, formatDuration: String,
    getPlayerInfo: async () => ({money: 1e9, factions: [A, B, C]}), getReserve: async () => 0,
    getReset: async () => ({currentNode: 10, lastNodeReset: 0}), getOwnedAugs: async () => [],
    singRun: async (_, method, name) => {
      if (method === 'getCurrentWork') return state.playerWork;
      if (method === 'getAugmentationsFromFaction') return [];
      if (method === 'getFactionWorkTypes') return state.types[name] ?? ['hacking'];
      if (method === 'getCrimeStats') return {difficulty: 1, strength_success_weight: 1};
      assert.fail(method);
    },
    singReadMany: async (_, method, names) => Object.fromEntries(names.map(name => [name, 0])),
    planDistinctFactionRepRoutes: () => state.routes.map(name => ({faction: name, targetRep: 1e6, unlockedAugs: []})),
    gangRun: async () => false, bbRun: async () => assert.fail('unexpected bladeburner call'),
    hnRun: async () => assert.fail('unexpected hash purchase'), purchase: async () => assert.fail('unexpected purchase'),
    sleeveRun: async (_, method, ...args) => {
      calls.push({tick: state.tick, method, args});
      if (method === 'getNumSleeves') return sleeves.length;
      if (method === 'getSleeve') {const {currentWork, ...info} = sleeves[args[0]]; return info;}
      if (method === 'getSleevePurchasableAugs') return [];
      if (method === 'getTask') {
        if (state.readFailure === args[0]) return 'ERROR: task read unavailable';
        return taskData(args[0]);
      }
      setters.push([method, ...args]);
      if (method === 'setToCommitCrime') {sleeves[args[0]].currentWork = work(crime(args[1])); return true;}
      if (method === 'setToIdle' && args[0] === state.skipIdle) return;
      if (method === 'setToFactionWork' && state.beforeFaction) state.beforeFaction(...args);
      try {return engineApi[method]({})(...args);}
      catch (error) {collisions.push(String(error)); if (state.serializeErrors) return 'ERROR:' + error; throw error;}
    },
  };
  const api = Function(...Object.keys(mocks), bare(code) + ';return {main, setSleeveTask, assignSleeveRepTargets, state:()=>({factionWorkFailureCount, factionWorkUnavailableUntil, workByFaction})};')(...Object.values(mocks));
  let remaining, afterTick, step;
  const ns = {read: () => '', heart: {break: () => -1e6}, tprint: text => logs.push(text),
    sleep: async () => {state.tick++; state.now += step; if (afterTick) afterTick(state.tick);
      if (--remaining <= 0) throw STOP;}};
  return {state, calls, logs, collisions, setters, sleeves, api, ns, taskData,
    setTask(i, task) {sleeves[i].currentWork = work(task);},
    async run(ticks = 1, after = null, ms = 1000, allowFailure = false) {
      remaining = ticks; afterTick = after; step = ms;
      const previous = Date.now; Date.now = () => state.now;
      try {await assert.rejects(api.main(ns), error => error === STOP);}
      finally {Date.now = previous;}
      if (!allowFailure) assert(!logs.some(text => text.includes('unexpected error')), logs.join('\n'));
    },
  };
}

// Restart with the same useful factions on different sleeve indices: adopt them without resets or collisions.
for (const names of [[B, A, C], [A, B, C], [A, C, B], [B, C, A], [C, A, B], [C, B, A]]) {
  const h = fixture({tasks: names.map(name => faction(name))}); await h.run();
  assert.equal(h.collisions.length, 0, 'Restart must not swap already occupied faction routes');
  assert.deepEqual(h.setters, [], 'Keep matching work and its progress');
  await h.run(); assert.deepEqual(h.setters, [], 'Repeated restart stays idempotent');
}
let h = fixture({tasks: [faction(A), company('ECorp')], routes: [A], playerWork: {type: 'COMPANY', companyName: 'ECorp'}});
await h.run(); assert.deepEqual(h.setters, [], 'Adopt the current company follower');

// Preserve the existing worker-priority slots, including Bladeburner generalists before contract specialists.
h = fixture();
const slots = h.api.assignSleeveRepTargets([0, 4, 5, 1, 2, 3], null, [{faction: A}], {[A]: ['hacking']}, false,
  [null, faction(A)]);
assert.deepEqual(Object.keys(slots), ['0']);

// Retiring a later-index holder must free the faction/company before an earlier sleeve claims it.
for (const [oldTask, setup, expected] of [
  [faction(A), {sync: {1: 50}}, 'setToSynchronize'],
  [faction(A), {shock: {1: 20}}, 'setToShockRecovery'],
  [company('ECorp'), {shock: {1: 20}, playerWork: {type: 'COMPANY', companyName: 'ECorp'}}, 'setToShockRecovery'],
]) {
  h = fixture({tasks: [null, oldTask], routes: [A], ...setup}); await h.run();
  assert.equal(h.collisions.length, 0);
  assert.deepEqual(h.setters[0], ['setToIdle', 1]);
  assert.equal(h.taskData(0).type, oldTask.type); assert.equal(h.setters.at(-1)[0], expected);
}
h = fixture({tasks: [faction(B), faction(C)], routes: [A, B]}); await h.run();
assert.equal(h.taskData(0).factionName, B); assert.equal(h.taskData(1).factionName, A);
assert.equal(h.collisions.length, 0);

// Manual changes to a different active faction and idle tasks reconcile after the five-second snapshot interval.
h = fixture({tasks: [faction(A), faction(B)], routes: [A, B]});
await h.run(3, tick => {if (tick === 1) {h.setTask(0, faction(C)); h.setTask(1, null);}}, 6000);
assert.equal(h.taskData(0).factionName, A); assert.equal(h.taskData(1).factionName, B);
assert.equal(h.collisions.length, 0);
// A player-work preference reorder does not bounce faction workers between indices.
h = fixture({tasks: [faction(A), faction(B)], routes: [A, B]});
await h.run(2, tick => {if (tick === 1) h.state.playerWork = {type: 'FACTION', factionName: B};});
assert.deepEqual(h.setters, []);

// Reconcile actual identity without restarting ongoing crimes; repair a different active crime after a refresh.
h = fixture({tasks: [{...crime('Mug'), cyclesWorked: 20}], routes: [], flags: {crime: 'Mug'}});
await h.run(2); assert.deepEqual(h.setters, []); assert.equal(h.taskData(0).cyclesWorked, 20);
await h.run(2, tick => h.setTask(0, crime('Heist')), 6000);
assert(h.setters.some(([method, , name]) => method === 'setToCommitCrime' && name === 'Mug'));

// A steady eight-sleeve loop reads tasks once per five seconds, not once per second.
h = fixture({tasks: Array.from({length: 8}, () => crime('Mug')), routes: [], flags: {crime: 'Mug'}});
await h.run(10); assert.equal(h.calls.filter(call => call.method === 'getTask').length, 16); assert.deepEqual(h.setters, []);

// Incomplete observations and failed releases never authorize new assignments.
h = fixture({tasks: [faction(B), faction(A)], routes: [A, B]}); h.state.readFailure = 1;
await h.run(1, null, 1000, true); assert.deepEqual(h.setters, []); assert.equal(h.collisions.length, 0);
h = fixture({tasks: [null, faction(A)], routes: [A], shock: {1: 10}}); h.state.skipIdle = 1;
await h.run(1, null, 1000, true); assert.deepEqual(h.setters, [['setToIdle', 1]]);
assert(h.logs.some(line => line.includes('did not release')));
h.state.skipIdle = -1; h.logs.length = 0; await h.run(); assert.equal(h.taskData(0).factionName, A);

// An outside assignment between snapshot and setter produces one real API collision, then recovers next tick.
h = fixture({tasks: [null, null], routes: [A, B]});
h.state.beforeFaction = (i, name) => {if (i === 0 && name === A) {h.setTask(1, faction(A)); h.state.beforeFaction = null;}};
await h.run(2); assert.equal(h.collisions.length, 1); assert.equal(h.taskData(0).factionName, A);
assert(!h.logs.some(line => line.includes('Temporarily removing')));
assert.equal(h.api.state().factionWorkFailureCount[A] ?? 0, 0);
assert.equal(h.api.state().factionWorkUnavailableUntil[A], undefined);

// Repeated occupancy errors, including company work, never cycle work types or ban a faction.
h = fixture({tasks: [faction(A), faction(B)], routes: [A, B]}); await h.run();
for (let i = 0; i < 8; i++) {
  h.state.serializeErrors = i % 2 === 0;
  assert.equal(await h.api.setSleeveTask(h.ns, 0, `work for faction '${B}' (hacking)`, 'setToFactionWork', [0, B, 'hacking']), false);
}
assert.equal(h.api.state().factionWorkFailureCount[B] ?? 0, 0);
assert.equal(h.api.state().factionWorkUnavailableUntil[B], undefined);
assert.equal(h.api.state().workByFaction[B], undefined);
h.setTask(1, company('ECorp'));
assert.equal(await h.api.setSleeveTask(h.ns, 0, "work for company 'ECorp'", 'setToCompanyWork', [0, 'ECorp']), false);
assert(h.logs.at(-1).includes('refreshing assignments next tick'));

// Actual unsupported-work failures still use the existing fallback work types.
h = fixture({tasks: [null], routes: [A]}); h.state.types[A] = ['security', 'hacking'];
await h.run(2); assert.equal(h.taskData(0).factionWorkType, 'hacking');
assert.deepEqual(h.setters.map(args => args.at(-1)), ['security', 'hacking']);
h = fixture({tasks: [null], routes: [A]}); h.state.supported[A] = [];
await h.run(2); assert(h.api.state().factionWorkUnavailableUntil[A] > h.state.now);

// Exercise the recovery policy through the real manager, route planner handoffs and task setters.
const eightShocked=Object.fromEntries(Array.from({length:8},(_,i)=>[i,100]));
const freshFleet=()=>Array.from({length:8},()=>({type:'RECOVERY'}));
h=fixture({tasks:freshFleet(),shock:eightShocked,routes:[A,B]});await h.run(3);
assert.equal(h.sleeves.filter((_,i)=>h.taskData(i)?.type==='FACTION').length,2);
assert.equal(h.sleeves.filter((_,i)=>h.taskData(i)?.type==='RECOVERY').length,6);
assert.equal(h.setters.length,2,'Stable coverage should not restart any work on later ticks');
h=fixture({tasks:[{type:'RECOVERY'}],shock:{0:100},routes:[A]});await h.run();
assert.equal(h.taskData(0).factionName,A,'A single synchronized sleeve need not wait for zero shock to serve a live route');
// A partly recovered bench worker is ready for the next aug checkpoint and would improve the same job.
// Release the former worker first. Never rotate the protected aug sleeve, sacrifice XP/rep, or chase bonus cycles.
for(const guard of ['none','rep','xp','stored']) {
  h=fixture({tasks:[{type:'RECOVERY'},faction(A),{type:'RECOVERY'}],shock:{0:50,1:90,2:60},routes:[A]});
  for(const sl of h.sleeves) Object.assign(sl.mults,{faction_rep:1,...Object.fromEntries(Object.keys(sl.skills).map(k=>[k+'_exp',1]))});
  if(guard==='rep')h.sleeves[1].skills.hacking=10000;
  if(guard==='xp')h.sleeves[2].mults.hacking_exp=0.1;
  if(guard==='stored')h.sleeves[2].storedCycles=1000;
  await h.run(4,null,6000);assert.equal(h.taskData(0).type,'RECOVERY');assert.equal(h.collisions.length,0);
  if(guard==='none'){
    assert.equal(h.taskData(2).factionName,A);assert.equal(h.taskData(1).type,'RECOVERY');
    assert.equal(h.setters.filter(args=>args[0]==='setToFactionWork').length,1,'No back-and-forth swaps');
  }else {assert.equal(h.taskData(1).factionName,A);assert.deepEqual(h.setters,[]);}
}
for(const [policy,expectedWorkers] of [['staged',7],['parallel',0]]) {
  h=fixture({tasks:freshFleet(),shock:eightShocked,routes:[A,B],flags:{'shock-policy':policy}});await h.run();
  assert.equal(h.sleeves.filter((_,i)=>h.taskData(i)?.type!=='RECOVERY').length,expectedWorkers);
}
h=fixture({tasks:freshFleet(),shock:eightShocked,routes:[A,B],sync:{7:50}});h.state.files[2]=1;
let karma=-50000,firstTasks;h.ns.heart.break=()=>karma;
await h.run(2,tick=>{if(tick===1){firstTasks=h.sleeves.map((_,i)=>h.taskData(i));karma=-54000;}});
assert(firstTasks.slice(0,7).every(w=>w.crimeType==='Homicide'));assert.equal(firstTasks[7].type,'SYNCHRO');
assert.equal(h.sleeves.filter((_,i)=>h.taskData(i)?.type==='FACTION').length,2);
assert.equal(h.sleeves.filter((_,i)=>h.taskData(i)?.type==='RECOVERY').length,5);
assert.equal(h.collisions.length,0,'Karma goal handoff must not cause faction conflicts');
h=fixture({tasks:[null],shock:{0:100},flags:{'shock-policy':'invalid'}});await h.api.main(h.ns);
assert(h.logs.some(text=>text.includes('--shock-policy')));assert.equal(h.setters.length,0);

// The real low-RAM helper transports the void setToIdle result without confusing it with false/failure.
let atExit, stopped = false;
const replies = [];
await sleeveHelper({pid: 123, args: ['setToIdle', 0], ramOverride: ram => ram,
  getFunctionRamCost: name => name === 'baseCost' ? 1.6 : 4,
  getPortHandle: () => ({write: value => replies.push(structuredClone(value))}), atExit: fn => {atExit = fn;},
  sleeve: {setToIdle: i => {assert.equal(i, 0); stopped = true;}}});
atExit(); assert(stopped); assert.deepEqual(replies, [undefined]);
console.log('Sleeve restart checks passed: live-task adoption, all three-faction permutations, company and recovery/sync handoffs, priority slots, manual/idle repair, crime progress, five-second polling, failed observations/releases, and conflict recovery without faction bans.');
