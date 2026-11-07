// Execute production managers with bounded game fixtures, plus the official crime formula.
// node audit/2026-11-04-full-audit/checks/full-audit.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {shouldUseGangs, shouldFundNewCorporation} from '../../../speedrun-policy.js';
import {shouldStartCorporation} from '../../../autopilot.js';
import {executePurchase} from '../../../purchase-guard.js';
import {hasBladeburnerAccess} from '../../../progression.js';
import * as planner from '../../../faction-route-planner.js';
import {main as pull, filterDownloadableFiles} from '../../../git-pull.js';

const root = new URL('../../../', import.meta.url);
const source = file => readFileSync(new URL(file, root), 'utf8');
const engine = resolve(process.argv[2] ?? '../bitburner-engine');
const official = file => readFileSync(resolve(engine, file), 'utf8');
const bare = code => code.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm, '').replace(/^export /gm, '');
const noop = () => {};
const STOP = Symbol('one loop complete');
const NF = 'NeuroFlux Governor';

function sleeveFixture({files = {10: 1}, flags = {}, count = 1, node = 10, skills = {}, crimeMult = 1,
  city = 'Sector-12', cash = 1e12, reserve = 8e9, contractChance = {1: 0.5, 2: 0.995, 3: 1},
  bb = true, stock = 100, operationStock = 100, karma = -1, work = null, age = 1000, advanced = {}, catalog = null, baseline = false} = {}) {
  const calls = [], logs = [], assignments = [];
  const sleeves = Array.from({length: count}, () => ({sync: 100, shock: 0, hp: {current: 100, max: 100}, city,
    skills: {hacking: 10, strength: 10, defense: 10, dexterity: 10, agility: 10, charisma: 10, intelligence: 0, ...skills},
    mults: {crime_success: crimeMult}}));
  const stats = {difficulty: 1, strength_success_weight: 2, defense_success_weight: 2,
    dexterity_success_weight: 0.5, agility_success_weight: 0.5};
  const bindings = {...planner, hasBladeburnerAccess, log: (_, line) => logs.push(line), disableLogs: noop,
    getConfiguration: (_, schema) => ({...Object.fromEntries(schema), ...flags}),
    getActiveSourceFiles: async () => files, findPids: async () => [1], getOwnedAugs: async () => [],
    getPlayerInfo: async () => ({money: cash, factions: []}),
    getReset: async () => ({currentNode: node, lastNodeReset: Date.now() - age, bitNodeOptions: advanced}), getReserve: async () => reserve,
    formatMoney: String, formatDuration: String,
    singRun: async (_, method, name) => {assert(files[4], 'No Singularity call without access'); calls.push(method);
      if (method === 'getCurrentWork') return work;
      if (method === 'getCrimeStats') return catalog?.[name] ?? stats;
      assert.fail(method);},
    singReadMany: async (_, method, names) => {calls.push(['bulk', method, names]); return Object.fromEntries(names.map(n => [n, method === 'getCrimeStats' ? catalog?.[n] : 0]));},
    gangRun: async () => false, hnRun: async () => assert.fail('Do not spend hashes without SF9'),
    sleeveRun: async (_, method, ...args) => {
      calls.push([method, ...args]);
      if (method === 'getNumSleeves') return sleeves.length;
      if (method === 'getSleeve') return sleeves[args[0]];
      if (method === 'getTask') return null;
      if (method === 'getSleevePurchasableAugs') return [];
      if (method.startsWith('setTo')) {assignments.push([method, ...args]); return true;}
      assert.fail(method);
    },
    bbRun: async (_, method, ...args) => {
      if (method === 'inBladeburner') return bb;
      if (method === 'getCity') return 'Sector-12';
      if (method === 'getCityChaos') return 0;
      if (method === 'getOperationNames') return ['Investigation','Assassination'];
      if (method === 'getActionCountRemaining') return args[0] === 'Operations' && args[1] === 'Assassination' ? operationStock : stock;
      if (method === 'getActionEstimatedSuccessChance') {
        const expectedIndex = {Retirement: 1, 'Bounty Hunter': 2, Tracking: 3}[args[1]];
        assert.equal(args[2], expectedIndex, 'Estimate the assigned sleeve, not the player');
        return [contractChance[args[2]], 1];
      }
      assert.fail(method);
    },
    purchase: async (_, namespace, method, args, policy) => executePurchase({getHostname: () => 'home',
      getServerMoneyAvailable: () => cash, read: () => String(reserve), sleeve: {travel: () => {cash -= 200e3; return true;}}},
      namespace, method, args, policy),
  };
  const code = baseline ? execFileSync('git',['show','7a1f189:sleeve.js'],{cwd:root,encoding:'utf8'}) : source('sleeve.js');
  const api = Function(...Object.keys(bindings), bare(code) + ';return {main, calculateCrimeChance, buildSingularityMap};')(...Object.values(bindings));
  const ns = {heart: {break: () => karma}, read: () => '', tprint: line => logs.push(line), sleep: async () => {throw STOP;},
    enums: {CrimeType: catalog && Object.fromEntries(Object.keys(catalog).map(n=>[n,n])), UniversityClassType: {algorithms: 'Algorithms', leadership: 'Leadership'}, CityName: {Sector12: 'Sector-12', Volhaven: 'Volhaven'},
      LocationName: {Sector12PowerhouseGym: 'Powerhouse Gym', VolhavenZBInstituteOfTechnology: 'ZB Institute of Technology'}}};
  return {api, sleeves, calls, logs, assignments, async run() {
    await assert.rejects(api.main(ns), error => error === STOP);
    assert(!logs.some(line => line.includes('unexpected error')), logs.join('\n'));
  }};
}
let s = sleeveFixture(); await s.run();
assert.deepEqual(s.assignments[0], ['setToGymWorkout', 0, 'Powerhouse Gym', 'str']);
s = sleeveFixture({flags: {'disable-training': true}, skills: {strength: 1000, defense: 1000}}); await s.run();
assert.equal(s.assignments[0][2], 'Homicide', 'No-SF4 fallback must survive missing Heist/Assassination metadata');
s = sleeveFixture({files: {10: 1, 2: 1}, flags: {crime: 'Mug'}}); await s.run();
assert.equal(s.assignments[0][2], 'Mug', 'Explicit crime overrides automatic gang work');
s = sleeveFixture({node: 8, files: {10: 1, 2: 1}, flags: {'disable-training': true}}); await s.run();
assert.equal(s.assignments[0][2], 'Mug', 'Do not grind gang karma in BN8');
s = sleeveFixture({files: {10: 1, 4: 3}, flags: {'disable-training': true}, skills: {strength: 1000, defense: 1000}}); await s.run();
assert.equal(s.assignments[0][2], 'Heist', 'An exactly 100% chance must meet a 100% threshold');
s = sleeveFixture({flags: {'training-reserve': 0}, cash: 100e3, reserve: 8e9}); await s.run();
assert.equal(s.assignments[0][0], 'setToGymWorkout', 'Explicit zero training reserve is valid');
s = sleeveFixture({flags: {'training-reserve': 0}, city: 'Aevum', cash: 100e3, reserve: 8e9}); await s.run();
assert.equal(s.assignments[0][0], 'setToCommitCrime', 'Do not assign training at a destination we could not afford to reach');
s = sleeveFixture({files: {10: 1, 6: 1}, count: 4, flags: {'disable-training': true}}); await s.run();
assert.deepEqual(s.assignments.map(a => a.slice(1)), [[0, 'Infiltrate Synthoids', ''], [1, 'Infiltrate Synthoids', ''],
  [2, 'Take on contracts', 'Bounty Hunter'], [3, 'Take on contracts', 'Tracking']]);
s = sleeveFixture({files: {10: 1, 6: 1}, count: 2, flags: {'disable-training': true}, contractChance: {1: NaN}}); await s.run();
assert.equal(s.assignments[1][2], 'Infiltrate Synthoids', 'Unknown chance must never authorize a contract');
s = sleeveFixture({files: {10: 1, 7: 1}, node: 7, flags: {'disable-training': true}}); s.sleeves[0].shock = 100; await s.run();
assert.deepEqual(s.assignments[0], ['setToBladeburnerAction', 0, 'Infiltrate Synthoids', ''], 'Keep a lone synced sleeve available for BN7 action supply');
await s.api.buildSingularityMap({}, 'getAugmentationRepReq', ['A', 'B', 'C']);
assert.deepEqual(s.calls.at(-1), ['bulk', 'getAugmentationRepReq', ['A', 'B', 'C']]);

// Compare production crime arithmetic with the engine method, including intelligence, augs and BN14.
const intelligenceBonus = Function(bare(stripTypeScriptTypes(official('src/PersonObjects/formulas/intelligence.ts'))) + ';return calculateIntelligenceBonus;')();
const crimeCode = official('src/Crime/Crime.ts');
const start = crimeCode.indexOf('  successRate(p:');
const end = crimeCode.indexOf('\n  }', start) + 4;
const formula = stripTypeScriptTypes('function ' + crimeCode.slice(start, end).trim());
for (const node of [10, 14]) {
  s = sleeveFixture({node, files: {10: 1, 4: 3}, flags: {'disable-training': true}, crimeMult: 1.3,
    skills: {intelligence: 70, strength: 50, defense: 30, dexterity: 40, agility: 60}}); await s.run();
  const officialChance = Function('CONSTANTS', 'currentNodeMults', 'calculateIntelligenceBonus', formula + ';return successRate;')(
    {IntelligenceCrimeWeight: 0.025, MaxSkillLevel: 975}, {CrimeSuccessRate: node === 14 ? 0.4 : 1}, intelligenceBonus);
  const stats = {difficulty: 1, hacking_success_weight: 0, charisma_success_weight: 0,
    strength_success_weight: 2, defense_success_weight: 2, dexterity_success_weight: 0.5, agility_success_weight: 0.5};
  assert(Math.abs(await s.api.calculateCrimeChance({}, s.sleeves[0], 'Homicide') - officialChance.call(stats, s.sleeves[0])) < 1e-12);
}

// Reproduce the user's BN7.2 case through the actual manager, then vary only the constraint under test.
const basic = {Homicide:{time:3000,karma:3,difficulty:1,strength_success_weight:2,defense_success_weight:2,dexterity_success_weight:.5,agility_success_weight:.5},
  Shoplift:{time:2000,karma:.1,difficulty:.05,dexterity_success_weight:1,agility_success_weight:1},
  'Deal Drugs':{time:10000,karma:.5,difficulty:1,charisma_success_weight:3,dexterity_success_weight:2,agility_success_weight:1}};
const bladeStart={count:8,node:7,files:{2:1,4:3,5:1,7:1,10:3},karma:0,bb:false,work:{type:'CLASS',classType:'str'},catalog:basic,
  skills:{strength:2,defense:2,dexterity:2,agility:2,charisma:2}};
async function atShock(settings, shock) {const h=sleeveFixture(settings);for (const sl of h.sleeves) sl.shock=shock;await h.run();return h;}
if(process.argv.includes('--compare-karma-baseline')) {
  const legacy=await atShock({...bladeStart,baseline:true},96);
  assert.equal(legacy.assignments.filter(a=>a[2]==='Homicide').length,8);
}
let current=await atShock(bladeStart,96);
assert.equal(current.assignments.filter(a=>a[0]==='setToCommitCrime').length,0);
assert.equal(current.assignments.filter(a=>a[0]==='setToGymWorkout').length,7);
assert(current.logs.some(l=>l.includes('Gang karma: deferring')&&l.includes('295.4/h')));
assert.equal(current.calls.filter(c=>Array.isArray(c)&&c[0]==='bulk'&&c[1]==='getCrimeStats').length,1);
current=await atShock({...bladeStart,age:4*3600000},96);assert(current.assignments.every(a=>a[0]==='setToShockRecovery'));
current=await atShock({...bladeStart,age:4*3600000,cash:8e9},96);
assert(current.assignments.some(a=>a[2]==='Mug'),'Keep a cash worker at the reserve when the long gang grind is deferred');
current=await atShock({...bladeStart,age:4*3600000,flags:{'shock-policy':'staged'}},96);
assert(current.assignments.some(a=>a[2]==='Mug'),'An explicit staged policy retains its background workers');
current=await atShock({...bladeStart,bb:true,age:4*3600000},96);
assert(current.assignments.some(a=>a[0]==='setToBladeburnerAction'));assert(!current.assignments.some(a=>a[0]==='setToCommitCrime'));
for(const override of [{karma:-53995},{flags:{'force-gang-karma':true}}]) {
  current=await atShock({...bladeStart,...override},96);assert.equal(current.assignments.filter(a=>a[2]==='Homicide').length,8);
}
current=await atShock({...bladeStart,karma:-53995,skills:{...bladeStart.skills,charisma:1000}},96);
assert(current.assignments.every(a=>a[2]==='Deal Drugs'),'Compare expected karma per time, not just Homicide or the most likely success');
current=await atShock({...bladeStart,flags:{crime:'Mug'}},96);assert(current.assignments.every(a=>a[2]==='Mug'));
for(const override of [{node:2},{node:8},{advanced:{disableGang:true}},{flags:{'disable-gang-homicide-priority':true}}]) {
  current=await atShock({...bladeStart,karma:-53995,...override},96);assert(!current.logs.some(l=>l.includes('Gang karma: pursuing')));
}
// A guaranteed fallback if the optional live catalog is unavailable; no SF4 call or hard-coded forced Homicide.
current=await atShock({...bladeStart,files:{10:3,7:1,2:1},karma:-53995,skills:{strength:1,defense:1,dexterity:10,agility:10}},96);
assert(current.assignments.every(a=>a[2]==='Shoplift'));
const spare={count:8,files:{5:1,10:3},age:4*3600000};
const intelClass = h=>h.assignments.filter(a=>a[0]==='setToUniversityCourse'&&a[3]==='Computer Science');
current=await atShock(spare,0);assert.deepEqual(intelClass(current),[['setToUniversityCourse',0,'Rothman University','Computer Science']]);
for(const opts of [{count:7},{files:{10:3}},{flags:{'sleeve-intel-target':0}},{flags:{'disable-training':true}},
  {skills:{intelligence:230}},{cash:8e9},{city:'Ishima'},{advanced:{disableSleeveExpAndAugmentation:true}},{flags:{crime:'Mug'}},{age:0}])
  assert.equal(intelClass(await atShock({...spare,...opts},0)).length,0);
assert.equal(intelClass(await atShock(spare,96)).length,0);
current=await atShock({...spare,files:{7:1,10:3,5:1},node:7},0);
assert.equal(intelClass(current).length,1);assert(current.assignments.some(a=>a[2]==='Infiltrate Synthoids'));
assert(current.assignments.some(a=>a.at(-1)==='Tracking'));
assert.equal(intelClass(await atShock({...spare,files:{7:1,10:3,5:1},node:7,stock:1},0)).length,0);
for (const operationStock of [0, NaN]) assert.equal(intelClass(await atShock({...spare,files:{7:1,10:3,5:1},node:7,operationStock},0)).length,0);

// New startup policy preserves BN3 free funding, BN10, and existing businesses in penalized nodes.
for (const node of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14]) {
  assert(shouldUseGangs({2: 1}, node)); assert(shouldFundNewCorporation(node));
}
for (const node of [13, 15]) {
  assert(!shouldFundNewCorporation(node)); assert(shouldFundNewCorporation(node, 'on'));
  assert(shouldUseGangs({2: 1}, node), 'Reduced gang cash alone does not erase rep/aug value');
  assert(shouldStartCorporation({corporation: {hasCorporation: () => true}}, {3: 1}, node, 0, 0));
}
assert(!shouldUseGangs({2: 1}, 8, 'on')); assert(!shouldFundNewCorporation(8, 'on'));
assert(!shouldUseGangs({2: 1}, 10, 'off')); assert(!shouldUseGangs({}, 10));
assert(!shouldStartCorporation({}, {3: 1}, 10, 1e15, 0, {mode: 'off'}));
const startup = {corporation: {hasCorporation: () => false, canCreateCorporation: () => 'Success'}};
assert(shouldStartCorporation(startup, {3: 1}, 3, 0, 8e9));
assert(!shouldStartCorporation(startup, {3: 1}, 10, 150e9, 8e9));
assert(shouldStartCorporation(startup, {3: 1}, 10, 158e9, 8e9));

// Duplicate gang processes and unsupported BN8 stop before any gang API/purchase work.
for (const [pids, node] of [[[1, 2], 10], [[1], 8]]) {
  let gangCalls = 0;
  const bindings = {getConfiguration: (_, schema) => Object.fromEntries(schema), findPids: async () => pids,
    getActiveSourceFiles: async () => ({2: 1}), getReset: async () => ({currentNode: node}),
    gangRun: async () => {gangCalls++; assert.fail('Gang manager must exit before initialization');}, log: noop};
  const main = Function(...Object.keys(bindings), bare(source('gangs.js')) + ';return main;')(...Object.values(bindings));
  await main({}); assert.equal(gangCalls, 0);
}

// An alternate route with SF2 but no SF5 can initialize a real gang manager.
{
  const gangCode = bare(source('gangs.js'));
  const bindings = {log: noop, getReset: async () => ({currentNode: 2}),
    getBNMults: async () => assert.fail('SF5 multiplier API is unavailable'),
    gangRun: async (_, method) => {
      if (method === 'inGang') return true;
      if (method === 'getGangInformation') return {faction: 'Slum Snakes', isHacking: false, power: 1};
      if (method === 'getMemberNames') return ['A', 'B', 'C'];
      if (method === 'getMemberInformation') return {task: 'Train Combat'};
      assert.fail(method);
    }};
  const initialize = Function(...Object.keys(bindings), gangCode + `
    options = Object.fromEntries(argsSchema); ownedSourceFiles = {2: 1};
    onTerritoryTick = async () => {};
    return async ns => {await initialize(ns); return multGangSoftcap;};
  `)(...Object.values(bindings));
  assert.equal(await initialize({disableLog: noop, gang: {getEquipmentNames: () => [], getTaskNames: () => []}}), 1);
}

// Intelligence preparation must not starve CashRoot's ordinary faction route.
{
  const worker = source('work-for-faction2.js');
  const begin = worker.indexOf('  async function planAndAct()');
  const end = worker.indexOf('    await ensureFactionRepRates();', begin);
  const prefix = worker.slice(begin, end);
  for (const [preparing, installed, needed, expected] of [
    [true, [], true, 'normal'], [true, ['CashRoot Starter Kit'], true, 'invites'],
    [false, [], true, 'invites'], [true, ['CashRoot Starter Kit'], false, 'normal'],
  ]) {
    const check = Function('ns', 'installedAugs', 'needed', `
      let activePlan, requestedReplanDelay, collectAllCompanyInvites = true;
      const REPLAN_INTERVAL = 30000, INVITE_REPLAN_INTERVAL = 5000, crimeFocused = false, playerInGang = false;
      const playerInfo = {}, resetInfo = {ownedSF: {4: 3, 5: 1}};
      const loadData = async () => {}, singRun = async () => null, intelFarmState = async () => ({});
      const getIntelFarmReadiness = () => ({needed}), collectCompanyInvitations = async () => 'invites';
      const isBladeburnerInterruption = async () => false;
      let currentWork;
      ${prefix}
        return 'normal';
      }
      return planAndAct();
    `);
    assert.equal(await check({args: preparing ? ['--intel-farm-preparation'] : []}, installed, needed), expected);
  }
}

// Actual NF planning and execution must agree on providers, donation cost, and purchase order.
async function neuroflux({money = 100e6, disableDonations = false} = {}) {
  let cash = money; const bought = [], donations = [];
  const bindings = {FACTIONS_WITHOUT_DONATIONS: new Set(), SOA_AUGS: [], INFILTRATION_TARGET: 'target',
    log: noop, formatMoney: String, formatNumberShort: String,
    getPlayerInfo: async () => ({money: cash, mults: {faction_rep: 1}}),
    purchase: async (_, namespace, method, args, policy) => executePurchase({getHostname: () => 'home', read: () => '8000000000',
      getServerMoneyAvailable: () => cash, singularity: {
        donateToFaction: (faction, amount) => {cash -= amount; donations.push([faction, amount]); return true;},
        getAugmentationPrice: () => 750000 * (1.14 * 1.9) ** bought.length,
        purchaseAugmentation: (faction, name) => {cash -= 750000 * (1.14 * 1.9) ** bought.length; bought.push([faction, name]); return true;},
      }}, namespace, method, args, policy),
  };
  const check = Function(...Object.keys(bindings), bare(source('faction-manager.js')) + `
    options = {...Object.fromEntries(argsSchema), 'disable-donations': ${disableDonations}};
    factionNames = joinedFactions = ['FreeRep', 'Donor'];
    priorityAugs = desiredAugs = desiredStatsFilters = simulatedOwnedAugmentations = [];
    bitNodeMults = {AugmentationMoneyCost: 1, FactionWorkRepGain: 1}; stockValueKnown = true;
    factionData = Object.fromEntries(factionNames.map((name, i) => [name, {name, joined: true,
      reputation: i ? 100 : 500, donationsUnlocked: !!i, augmentations: [strNF], mostExpensiveAugCost: 750000}]));
    augmentationData = {[strNF]: new AugmentationData(strNF, 500, 750000, {}, [])};
    return {plan: () => managePurchaseableAugs({}, [], []), buy: () => purchaseDesiredAugs({}),
      state: () => ({providers: purchaseableAugs.map(a => a.getFromJoined()), donations: purchaseFactionDonations})};
  `)(...Object.values(bindings));
  await check.plan(); const planned = structuredClone(check.state()); await check.buy();
  assert(cash >= 0); assert.deepEqual(bought.map(x => x[0]), planned.providers);
  return {planned, bought, donations};
}
let nf = await neuroflux(); assert.deepEqual(nf.planned.providers, ['FreeRep']); assert.deepEqual(nf.donations, []);
nf = await neuroflux({money: 500e6}); assert.deepEqual(nf.planned.providers, ['FreeRep', 'Donor']);
assert.equal(nf.donations.length, 1); assert(Math.abs(nf.donations[0][1] - 470e6) < 2);
nf = await neuroflux({money: 500e6, disableDonations: true}); assert.deepEqual(nf.planned.providers, ['FreeRep']);

// Manual cheat/dev scripts are deployed; repo tests, temporary and retired diagnostic files are not.
assert.deepEqual(filterDownloadableFiles(['/audit/check.js', '/Temp/old.js', '/bin/a.js', 'Tempest.js'], ['.js'], ['audit/', 'Temp/']), ['bin/a.js', 'Tempest.js']);
async function downloadCase(fallback = false, explicit = []) {
  const requests = [], downloads = [], disk = new Map();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requests.push(url); if (fallback) throw Error('rate limit');
    return {ok: true, json: async () => url.includes('/commits/') ? {sha: 'a'.repeat(40)} :
      {truncated: false, tree: ['audit/check.js', 'Temp/old.js', 'bin/a.js', 'autopilot.js', 'dev.js', 'hacks.js']
        .map(path => ({type: 'blob', path}))}};
  };
  try {
    await pull({flags: schema => ({...Object.fromEntries(schema), 'new-file': [], download: explicit}),
      getScriptName: () => 'git-pull.js', getHostname: () => 'home', print: noop, tprint: noop,
      read: file => disk.get(file) ?? '', write: async (file, text) => disk.set(file, text),
      ls: () => ['/audit/check.js', '/Temp/old.js', '/bin/a.js', 'autopilot.js', 'hacks.js', 'dev.js', 'performance-diagnostic.js', 'stock-diagnostic.js'],
      wget: async (_, file) => {downloads.push(file); disk.set(file, 'downloaded source'); return true;}});
  } finally {globalThis.fetch = oldFetch;}
  assert(!requests.some(url => /contents\/(audit|Temp)/.test(url)));
  return downloads.sort();
}
assert.deepEqual(await downloadCase(), ['autopilot.js', 'bin/a.js', 'dev.js', 'hacks.js']);
assert.deepEqual(await downloadCase(true), ['autopilot.js', 'bin/a.js', 'dev.js', 'hacks.js']);
assert.deepEqual(await downloadCase(false, ['dev.js']), ['dev.js']);
for (const file of ['dev.js', 'hacks.js']) assert(existsSync(new URL(file, root)));
for (const file of ['performance-diagnostic.js', 'stock-diagnostic.js']) assert(!existsSync(new URL(file, root)));
console.log('Full audit checks passed: real sleeve decisions and crime formula, subsystem policies, NF planning/purchases, and production downloads.');
