// Offline evidence for the audited a05225d source. No game, save, network, or purchases.
// These assertions describe ORIGINAL audited defects, not desired regression-test behavior.
// After fixing a finding, update/retire its reproduction rather than restoring the bug.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = file => readFile(path.join(root, file), 'utf8');
const utils = await import(pathToFileURL(path.join(root, 'utils.js')));
const observations = [];
function record(id, message) { observations.push({ id, message }); }
const noop = () => {};
const STOP = Symbol('bounded fixture stop');

// Execute the actual unexported function, bounded by the following declaration.
// This only strips its export modifier; it does not substitute its implementation.
async function functionFrom(file, begin, end, bindings = {}) {
  const text = await source(file);
  const start = text.indexOf(begin);
  assert(start >= 0, `Missing start marker: ${file}: ${begin}`);
  const stop = text.indexOf(end, start + begin.length);
  assert(stop > start, `Missing end marker: ${file}: ${end}`);
  const declaration = text.slice(start, stop).trim().replace(/^export /, '');
  const name = declaration.match(/(?:async )?function\s+(\w+)/)[1];
  return Function(...Object.keys(bindings), `${declaration}\nreturn ${name};`)(...Object.values(bindings));
}

// Only the transport is mocked. utils.js really executes/reads the helper protocol.
function rpcMock(responder, additions = {}) {
  let pid = 0;
  const replies = new Map();
  return {
    print: noop, tprint: noop, toast: noop,
    exec(file, host, options, ...args) {
      const current = ++pid;
      replies.set(current, responder(file, args, host, options));
      return current;
    },
    nextPortWrite: async () => {},
    readPort: id => replies.get(id),
    sleep: async () => {},
    ...additions,
  };
}

// B01: failed launches have no bound. Stop the mock after six retries.
{
  let attempts = 0;
  const ns = { print: noop, exec: () => (++attempts, 0), sleep: async () => {
    if (attempts === 6) throw STOP;
  } };
  await assert.rejects(utils.runScriptLocal(ns, 'missing.js'), error => error === STOP);
  assert.equal(attempts, 6);
  record('B01', 'runScriptLocal retries an impossible launch until the fixture interrupts it.');
}
// A dead child never writing its port also has no recovery check.
{
  let reads = 0;
  const ns = { print: noop, exec: () => 101, nextPortWrite: () => new Promise(() => {}),
    readPort: () => { reads++; }, isRunning: () => false };
  const result = await Promise.race([
    utils.runScriptLocal(ns, 'dead-child.js').then(() => 'returned'),
    new Promise(resolve => setTimeout(() => resolve('pending'), 15)),
  ]);
  assert.equal(result, 'pending');
  assert.equal(reads, 0);
  record('B01', 'A successfully launched but dead child leaves its caller waiting for a port reply.');
}
// B02: launch bundle contains code, but no reserve.txt or script configuration.
{
  const bundle = utils.getRemoteScriptFiles('stockmaster.js');
  assert(!bundle.includes('reserve.txt'));
  assert(!bundle.includes('stockmaster.js.config.txt'));
  const remoteReserve = Number('' || 0);
  assert.equal(remoteReserve, 0);
  record('B02', 'A fresh remote stockmaster receives no reserve/config; an empty local reserve reads as zero.');
}
// B03: only BruteSSH, only FTP, and all crackers.
{
  const crackers = ['BruteSSH.exe', 'FTPCrack.exe', 'relaySMTP.exe', 'HTTPWorm.exe', 'SQLInject.exe'];
  const ns = owned => ({ print: noop, fileExists: file => owned.includes(file) });
  assert.deepEqual(await utils.getPortCrackers(ns(['BruteSSH.exe'])), []);
  assert.deepEqual(await utils.getPortCrackers(ns(['FTPCrack.exe'])), ['BruteSSH.exe']);
  assert.deepEqual(await utils.getPortCrackers(ns(crackers)), crackers.slice(0, 4));
  record('B03', 'Cracker inventory omits BruteSSH-only ownership and reports FTP-only as BruteSSH.');
}
// B04: the purchase loop ignores the reserve, even though it computes a budget.
{
  // tryUpgradeRam is the final declaration; retain its complete closing brace.
  const text = await source('host-manager.js');
  const declaration = text.slice(text.indexOf('async function tryUpgradeRam(ns)'));
  const run = Function('getActiveSourceFiles', 'singRun', 'purchasedServerName',
    `${declaration}; return tryUpgradeRam;`)(async () => ({}), async () => false, 'daemon');
  let money = 1e6, bought = 0;
  const reserve = 900_000;
  const ns = {
    read: () => String(reserve), getServerMoneyAvailable: () => money,
    getServerMaxRam: () => 2, sleep: async () => {},
    cloud: {
      getServerNames: () => [], getServerLimit: () => 25, getRamLimit: () => 2,
      purchaseServer: () => {
        if (money < 110_000) return '';
        money -= 110_000;
        return `daemon-${++bought}`;
      },
    },
  };
  await run(ns);
  assert.equal(bought, 9);
  assert.equal(money, 10_000);
  record('B04', '$1m cash / $900k reserve still buys nine $110k servers, leaving $10k.');
}
// B05: readiness is only assigned twice, before the monitoring loop; no refresh there.
{
  const text = await source('autopilot.js');
  const assignments = [...text.matchAll(/readyToFarmIntel\s*=/g)];
  assert.equal(assignments.length, 2);
  assert(assignments.every(m => m.index < text.indexOf('async function mainLoop(ns)')));
  assert(text.includes('if (shouldIntelFarm) return false;'));
  assert(!text.includes('"CashRoot Starter Kit"'));
  record('B05', 'Intel readiness is never refreshed in the loop; the finish gate remains tied to startup intent.');
}
// B06: increasing live cash never refreshes the captured player snapshot.
{
  const { main } = await import(pathToFileURL(path.join(root, 'purchaseSleeves.js')));
  let liveMoney = 0, playerReads = 0, purchases = 0, sleeps = 0;
  const ns = rpcMock((file, args) => {
    if (file === 'bin/getPlayer.js') { playerReads++; return { money: liveMoney, factions: ['The Covenant'] }; }
    if (file === 'bin/sleeveRun.js' && args[0] === 'getSleeveCost') return 100;
    if (file === 'bin/sleeveRun.js' && args[0] === 'purchaseSleeve') { purchases++; return true; }
    throw new Error(`Unexpected RPC: ${file} ${args}`);
  }, { enums: { FactionName: { TheCovenant: 'The Covenant' } }, sleep: async () => {
    liveMoney = 1e6;
    if (++sleeps === 4) throw STOP;
  } });
  await assert.rejects(main(ns), error => error === STOP);
  assert.equal(playerReads, 1);
  assert.equal(purchases, 0);
  record('B06', 'Sleeve purchaser makes zero attempts after live cash rises above price; player was read once.');
}
// B07: active reset paths name files absent from the audited tree.
{
  const text = await source('ascend.js');
  for (const file of ['spend-hacknet-hashes.js', 'Tasks/ram-manager.js']) {
    assert(text.includes(`getFilePath('${file}')`));
    await assert.rejects(access(path.join(root, file)));
  }
  record('B07', 'Both reset-time hash liquidation and home-RAM upgrade targets are missing files.');
}
// B08: a BN6/SF6-only state fails both script gates.
{
  const unlocked = { 6: 1 };
  const pilot = await source('autopilot.js');
  const bb = await source('bladeburner.js');
  assert(pilot.includes('7 in unlockedSFs && bitNodeMults.BladeburnerRank > 0'));
  assert(bb.includes('if (!(7 in ownedSourceFiles))'));
  assert.equal(7 in unlocked, false);
  record('B08', 'BN6/SF6-only access is rejected by both Bladeburner launch and entry gates.');
}
// B09: execute the real periodic scheduler with an alwaysRun entry.
{
  let launched = 0;
  const run = await functionFrom('autopilot.js', 'async function runPeriodicScripts(ns)', '\n  /** Accept Stanek', {
    periodicScripts: [{ name: 'example.js', alwaysRun: true, nextRun: 0, shouldRun: () => true, args: () => [] }],
    isScriptRunning: async () => false,
    runScriptSomewhere: async () => { launched++; return 1; }, log: noop, PERIOD: 30_000,
  });
  await run({});
  assert.equal(launched, 0);
  record('B09', 'alwaysRun=true suppresses the periodic launch even when the script is absent.');
}
// B10: execute the sleeve augmentation buyer with one affordable augmentation.
{
  let calls = 0;
  const run = await functionFrom('sleeve.js', 'async function manageSleeveAugs(ns, i, budget)', '\n/** @param {NS} ns\n * @returns {Promise<Task>}', {
    availableAugs: [[{ name: 'Only Aug', cost: 100 }]], cacheExpiry: [Infinity],
    options: { 'buy-cooldown': 0, 'min-aug-batch': 1 },
    lastPurchaseTime: [], lastPurchaseStatusUpdate: [], lastSleeveHp: [], lastSleeveShock: [],
    sleeveRun: async () => [], log: noop, formatMoney: String, formatDuration: String,
  });
  const spent = await run({ sleeve: { purchaseSleeveAug: () => { calls++; return true; } } }, 0, 100);
  assert.equal(calls, 0);
  assert.equal(spent, 100);
  record('B10', 'A one-augmentation batch calls no purchase API but reports the entire $100 budget as spent.');
}
// B11: real helper returns a truthy error string, not boolean false / an exception.
{
  const { main } = await import(pathToFileURL(path.join(root, 'bin/singRun.js')));
  let exit, result;
  await main({ pid: 5, args: ['upgradeHomeCores'], ramOverride: noop,
    getPortHandle: () => ({ write: value => { result = value; } }), atExit: cb => { exit = cb; },
    singularity: { upgradeHomeCores: () => { throw new Error('fixture API failure'); } },
  });
  exit();
  assert.match(result, /^ERROR:/);
  assert.equal(Boolean(result), true);
  assert((await source('ascend.js')).includes("while (await singRun(ns, 'upgradeHomeCores'))"));
  record('B11', 'An API failure is truthy to the ascend upgrade loop; strict result validation is required.');
}
// B12: the default target expression returns the Server object, not its hostname.
{
  const text = await source('spend-hashes.js');
  assert(text.includes("options['spend-on-server']?.replaceAll(\"_\", \" \") ?? await getOptimalTarget(ns)"));
  const target = { hostname: 'n00dles' };
  const resolved = null ?? target;
  assert.equal(typeof resolved, 'object');
  record('B12', 'Hash server upgrades receive an object unless --spend-on-server supplies a hostname.');
}
// B13: backdoor subprocess is absent from the actual remote bundle.
{
  const files = utils.getRemoteScriptFiles('/Tasks/backdoor-all-servers.js');
  assert(!files.some(file => file.includes('backdoor-one.js')));
  record('B13', 'Remote backdoor task bundle omits Tasks/backdoor-all-servers.js.backdoor-one.js.');
}
// B14: a wrong solver result is tried again on the next invocation.
{
  const { main } = await import(pathToFileURL(path.join(root, 'Tasks/contractor.js.solver.js')));
  const storage = new Map();
  let attempts = 0;
  const ns = {
    args: [JSON.stringify([{ type: 'Find Largest Prime Factor', data: 15, contract: 'fixture.cct', hostname: 'n00dles' }])],
    read: name => storage.get(name) || '', write: (name, value) => storage.set(name, value),
    print: noop, tprint: noop, toast: noop, sleep: async () => {},
    codingcontract: { attempt: () => { attempts++; return ''; } },
  };
  await main(ns); await main(ns);
  assert.equal(attempts, 2);
  record('B14', 'The failure file suppresses notices but does not prevent a second attempt on the same contract.');
}
// B15: exact leftover-accounting expression uses a number as if it were a batch record.
{
  const text = await source('kernel.js');
  const line = text.split('\n').find(line => line.includes('threadsLeft -= ((batchesTotal.H1'));
  assert(line);
  const remaining = Function('threadsLeft', 'batchesTotal', 'results', `${line}; return threadsLeft;`)(100, 3, { batches: 3 });
  assert(Number.isNaN(remaining));
  assert(text.includes('batchInfo = getHackP(ns, target, -1, -1, 1);'));
  record('B15', 'Post-batch leftover threads become NaN; the target-switch call also lacks await/hostname.');
}
// B16: execute the real batch calculator, mocking only its helper RPC responses.
{
  const text = (await source('bin/getHackP.js')).replace('from "utils.js"',
    `from ${JSON.stringify(pathToFileURL(path.join(root, 'utils.js')).href)}`);
  const { main } = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
  let atExit, result;
  const ns = rpcMock(file => {
    if (file === 'bin/getServer.js') return { hostname: 'n00dles', minDifficulty: 1, moneyMax: 1e6 };
    if (file === 'bin/getHackChance.js') return 1;
    if (file === 'bin/getHackPercent.js') return 1 / 30;
    if (file === 'bin/getGrowThreads.js') return 30;
    if (file === 'bin/getbnmultis.js') return { ScriptHackMoneyGain: 1 };
    throw new Error(`Unexpected RPC ${file}`);
  }, { pid: 999, args: ['n00dles', -1, -1, 30],
    atExit: cb => { atExit = cb; }, getPortHandle: () => ({ write: value => { result = value; } }),
  });
  await main(ns); atExit();
  assert.equal(result.H1, 30);
  assert.equal(result.G1, 30);
  assert.equal(result.W1 + result.W2, 1);
  const securityAdded = result.H1 * 0.002 + result.G1 * 0.004;
  const securityRemoved = (result.W1 + result.W2) * 0.05;
  assert(securityAdded > securityRemoved);
  record('B16', `Batch calculator fixture adds ${securityAdded.toFixed(2)} security and budgets ${securityRemoved.toFixed(2)} weakening at BN1/one core.`);
}
// B17: root filter in utils.maxRun counts only unrooted ordinary hosts.
{
  const ns = rpcMock((file, args) => {
    if (file === 'bin/getServersLight.js') return ['home', 'rooted', 'locked'];
    if (file === 'bin/getServerAvailRam.js') return { home: 128, rooted: 64, locked: 512 }[args[0]];
    throw new Error(`Unexpected RPC ${file}`);
  }, { hasRootAccess: host => host !== 'locked' });
  assert.equal(await utils.maxRun(ns, false), 512);
  record('B17', 'maxRun selects 512 GB on an unrooted host and ignores the rooted 128/64 GB hosts.');
}
// B18: stasis spawn thread arithmetic allocates more RAM than is available.
{
  const text = await source('darknet.js');
  assert(text.includes('/ scriptCost + 12)'));
  const available = 128, scriptCost = 12.55;
  const threads = Math.floor(available / scriptCost + 12);
  const required = threads * (scriptCost + 12);
  assert(required > available);
  record('B18', `Stasis branch requests ${threads} threads / ${required.toFixed(1)} GB from 128 GB free.`);
}

console.log(JSON.stringify({
  auditedCommit: 'a05225d5c63d877e35ba7d34d70d7adbbff9cc69',
  findingsCovered: new Set(observations.map(o => o.id)).size,
  checks: observations,
  limitation: 'Mixed mocked execution, source assertions, and arithmetic checks. No wall-clock speedrun result or live Netscript RAM simulation.',
}, null, 2));
