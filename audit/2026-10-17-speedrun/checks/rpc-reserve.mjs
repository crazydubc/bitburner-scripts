// Actual transport, Singularity and reserve functions with a small Netscript host/port model.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runScriptLocal, runScriptSomewhere, singRun, getReserve, setReserve, isScriptRunning, whichServerIsRunning, rpcReplyBudget, getRemoteScriptFiles} from '../../../utils.js';
import {main as reserveMain} from '../../../bin/reserve.js';
import {main as singularityMain} from '../../../bin/singRun.js';
import {main as configMain} from '../../../bin/sync-script-config.js';

const noop = () => {};
function port() {
  const values = [];
  let resolve, waiting;
  return {
    empty: () => values.length === 0,
    read: () => values.length ? values.shift() : 'NULL PORT DATA',
    nextWrite: () => waiting ??= new Promise(r => resolve = r),
    write(value) { values.push(value); resolve?.(); resolve = waiting = undefined; },
  };
}
function harness() {
  const h = {nextPid: 100, ports: new Map(), running: new Set(), launches: [], copies: [], removed: [],
    files: new Map([['home', new Map([['reserve.txt', '8000000000']])], ['worker', new Map([['reserve.txt', '0']])]]),
    free: {home: 64, worker: 32}, servers: ['home', 'worker'], failLaunch: false, failCopy: false,
    missing: new Set(), functions: {}, functionCost: 3, helperErrors: []};
  h.port = pid => { if (!h.ports.has(pid)) h.ports.set(pid, port()); return h.ports.get(pid); };
  h.ns = host => ({
    print: noop, tprint: noop, toast: noop, getHostname: () => host, getScriptName: () => h.scriptName ?? 'launcher.js',
    getScriptRam: (file, host) => { assert.equal(host, 'home'); return h.missing.has(file) ? 0 : 4; },
    getFunctionRamCost: name => name === 'baseCost' ? 1.6 : h.functionCost,
    read: file => h.files.get(host)?.get(file) ?? '',
    write: async (file, value) => h.files.get(host).set(file, String(value)),
    getPortHandle: h.port, isRunning: pid => h.running.has(pid),
    hasRootAccess: name => name !== 'unrooted',
    fileExists: (file, name = host) => h.files.get(name)?.has(file) ?? false,
    rm: (file, name = host) => { h.removed.push([file, name]); return h.files.get(name).delete(file); },
    scp: (file, dest, source) => {
      h.copies.push([file, dest, source]);
      if (h.failCopy || !h.files.get(source)?.has(file)) return false;
      h.files.get(dest).set(file, h.files.get(source).get(file)); return true;
    },
    sleep: async () => {},
    exec(file, target, options, ...args) {
      h.launches.push({file, target, options, args});
      if (h.failLaunch) return 0;
      const pid = h.nextPid++;
      if (['manager.js','bn1-auto.js'].includes(file)) { h.running.add(pid); return pid; }
      if (file === 'reply.js') { h.port(pid).write(h.reply); return pid; }
      if (file === 'dead.js') return pid;
      if (file === 'slow.js') { h.running.add(pid); return pid; }
      if (file === 'bin/terminate-rpc.js') { h.running.delete(args[0]); h.killed = args[0]; return pid; }
      if (file === 'bin/getServerAvailRam.js') { h.port(pid).write(h.free[args[0]] ?? 0); return pid; }
      if (file === 'bin/getServersLight.js') { h.port(pid).write(h.servers); return pid; }
      if (file === 'bin/scp.js') {
        h.copies.push(args);
        const [name, dest, source] = args;
        if (h.files.get(source)?.has(name) && !h.failCopy)
          h.files.get(dest).set(name, h.files.get(source).get(name));
        h.port(pid).write(!h.failCopy); return pid;
      }
      const main = file === 'bin/reserve.js' ? reserveMain : file === 'bin/singRun.js' ? singularityMain
        : file === 'bin/sync-script-config.js' ? configMain : null;
      assert(main, `Unexpected helper: ${file}`);
      h.running.add(pid);
      queueMicrotask(async () => {
        let onExit = noop;
        const ns = {...h.ns(target), pid, args, singularity: h.functions,
          atExit: callback => onExit = callback,
          ramOverride: ram => Math.min(ram, h.ramLimit ?? Infinity)};
        try { await main(ns); } catch (error) { h.helperErrors.push(error); }
        finally { onExit(); h.running.delete(pid); }
      });
      return pid;
    },
  });
  return h;
}

// Reply types and immediate replies must remain intact; persistent mode never waits for a port.
for (const value of [true, false, undefined, null, 0, '', [], {success: false}, 'ERROR:legacy']) {
  const h = harness(); h.reply = value;
  assert.deepEqual(await runScriptLocal(h.ns('worker'), 'reply.js', false), value);
  assert.equal(h.launches[0].target, 'home');
}
{
  const h = harness();
  assert.equal(await runScriptLocal(h.ns('worker'), 'manager.js', true), 100);
  h.missing.add('missing.js');
  await assert.rejects(runScriptLocal(h.ns('home'), 'missing.js'), /missing or invalid/);
  assert.equal(h.launches.length, 1, 'Do not retry a missing file');
  await assert.rejects(runScriptLocal(h.ns('home'), 'dead.js'), /exited without a reply/);
}

// Virtual time covers exhausted launch retries, crash recovery and legitimate long operations.
const realNow = Date.now, realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
let now = 0, timerId = 0;
const timers = new Map();
Date.now = () => now;
globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, {fn, due: now + delay}); return id; };
globalThis.clearTimeout = id => timers.delete(id);
async function tick(ms) {
  now += ms;
  for (const [id, task] of [...timers]) if (task.due <= now) { timers.delete(id); task.fn(); }
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
try {
  const blocked = harness(); blocked.failLaunch = true;
  const ns = blocked.ns('home'); ns.sleep = async ms => now += ms;
  await assert.rejects(runScriptLocal(ns, 'reply.js'), /after 10s/);
  assert.equal(blocked.launches.length, 1001);
  const retry = harness(); retry.failLaunch = true;
  const retryNs = retry.ns('home');
  retryNs.sleep = async () => { now += 10; retry.failLaunch = false; };
  retry.reply = 42;
  assert.equal(await runScriptLocal(retryNs, 'reply.js'), 42);
  assert.equal(retry.launches.length, 2);

  const slow = harness();
  const pending = runScriptLocal(slow.ns('home'), 'slow.js');
  let finished = false; pending.then(() => finished = true);
  await tick(120_000);
  assert.equal(finished, false, 'Do not time out an active backdoor/Go/calculator operation');
  slow.port(100).write({done: true});
  assert.deepEqual(await pending, {done: true});
  assert.equal(timers.size, 0, 'Successful replies cancel the watchdog');

  const dead = harness();
  const pendingDeath = runScriptLocal(dead.ns('home'), 'slow.js');
  const rejection = assert.rejects(pendingDeath, /exited without a reply/);
  dead.running.delete(100);
  await tick(1000); await rejection;
  assert(dead.port(100).empty(), 'Dead child cleanup must not leave a synthetic response');
  assert.equal(timers.size, 0);

  const stalled = harness(); stalled.running.add(999);
  const timeout = assert.rejects(runScriptLocal(stalled.ns('home'), 'slow.js', false, [], 0, 30_000), /30s reply budget/);
  await tick(30_000); await timeout;
  assert.equal(stalled.killed, 100);
  assert(stalled.running.has(999), 'A stalled RPC must not kill unrelated processes');
  assert(stalled.port(100).empty());
  assert.equal(timers.size, 0);

  const noRoom = harness();
  const blockedTimeout = assert.rejects(runScriptLocal(noRoom.ns('home'), 'slow.js', false, ['blocked'], 0, 30_000), /Free home RAM/);
  noRoom.failLaunch = true;
  await tick(30_000); await blockedTimeout;
  const attempts = noRoom.launches.length;
  await assert.rejects(runScriptLocal(noRoom.ns('home'), 'slow.js', false, ['blocked']), /still unresponsive/);
  assert.equal(noRoom.launches.length, attempts, 'Do not duplicate an unresponsive child when the killer cannot launch');
  noRoom.running.delete(100); noRoom.failLaunch = false;
  const recovered = runScriptLocal(noRoom.ns('home'), 'slow.js', false, ['blocked']);
  noRoom.port(101).write('recovered');
  assert.equal(await recovered, 'recovered');
  assert.equal(timers.size, 0);
} finally {
  Date.now = realNow; globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
}

assert.equal(rpcReplyBudget('custom-task.js'), 0);
assert.equal(rpcReplyBudget('bin/getPlayer.js'), 30_000);
assert.equal(rpcReplyBudget('bin/getHackP.js'), 120_000);
assert.equal(rpcReplyBudget('bin/makeMove.js'), 600_000);
assert.equal(rpcReplyBudget('bin/corpRun.js', ['nextUpdate']), 120_000);
assert.equal(rpcReplyBudget('bin/stanekRun.js', ['chargeFragment']), 600_000);

// Effective Singularity cost is preallocated at every SF4 level; API error strings never count as success.
for (const multiplier of [16, 4, 1]) {
  const h = harness(); h.functionCost = 3 * multiplier;
  h.functions.upgradeHomeCores = () => true;
  assert.equal(await singRun(h.ns('worker'), 'upgradeHomeCores'), true);
  assert.equal(h.launches[0].options.ramOverride, Math.max(6.6, 1.6 + 3 * multiplier));
}
{
  const h = harness(); h.functions.joinFaction = () => false;
  assert.equal(await singRun(h.ns('home'), 'joinFaction', 'Daedalus'), false);
  h.functions.joinFaction = () => { throw Error('API unavailable'); };
  await assert.rejects(singRun(h.ns('home'), 'joinFaction', 'Daedalus'), /API unavailable/);
  h.functionCost = 48; h.ramLimit = 6.6;
  let invoked = false; h.functions.upgradeHomeCores = () => invoked = true;
  await assert.rejects(singRun(h.ns('home'), 'upgradeHomeCores'), /Insufficient RAM/);
  assert.equal(invoked, false, 'Do not call a function after RAM allocation fails');
}

// One home reserve, fresh on every remote request; zero overrides and failures are explicit.
{
  const h = harness(), home = h.ns('home'), remote = h.ns('worker');
  assert.equal(await getReserve(home), 8e9);
  assert.equal(await getReserve(remote), 8e9, 'Ignore stale zero on the offloaded host');
  await setReserve(remote, 100e9);
  assert.equal(await getReserve(home), 100e9);
  assert.equal(h.files.get('worker').get('reserve.txt'), '0', 'Remote state must not become authoritative');
  await setReserve(home, 0);
  assert.equal(await getReserve(remote), 0);
  h.files.get('home').set('reserve.txt', 'broken');
  await assert.rejects(getReserve(home), /valid reserve/);
  await assert.rejects(getReserve(remote), /valid reserve/);
  await assert.rejects(setReserve(remote, NaN), /Invalid cash reserve/);
  h.missing.add('bin/reserve.js');
  await assert.rejects(getReserve(remote), /missing or invalid/);
  h.missing.clear(); h.files.get('home').delete('reserve.txt');
  assert.equal(await getReserve(remote), 0, 'Preserve standalone behavior with no configured reserve');
}

// Persistent launch still prefers offloading, copies current config, and respects home's 16 GB reserve.
{
  const h = harness(); h.files.get('home').set('manager.js.config.txt', '{"reserve":8000000000}');
  const pid = await runScriptSomewhere(h.ns('home'), 'manager.js', true, []);
  assert(pid > 0);
  assert.equal(h.launches.at(-1).target, 'worker');
  assert.equal(h.files.get('worker').get('manager.js.config.txt'), '{"reserve":8000000000}');
  h.files.get('home').delete('manager.js.config.txt');
  await runScriptSomewhere(h.ns('home'), 'manager.js', true, []);
  assert(!h.files.get('worker').has('manager.js.config.txt'), 'Removed home config must not linger remotely');
}
{
  const h = harness(); h.files.get('home').set('manager.js.config.txt', '{}'); h.free.home = 19;
  const ns = h.ns('home');
  // Required code copies succeed; only the configuration copy fails.
  const originalNs = h.ns;
  h.ns = host => ({...originalNs(host), scp: () => false});
  assert.equal(await runScriptSomewhere(ns, 'manager.js', true, [], 0, true), 0);
  assert(!h.launches.some(call => call.file === 'manager.js'));
}
for (const free of [19.9, 20, 64]) {
  const h = harness(); h.free = {home: free, worker: 0};
  const pid = await runScriptSomewhere(h.ns('home'), 'manager.js', true, [], 0, true);
  assert.equal(pid > 0, free >= 20);
  if (pid) assert.equal(h.launches.at(-1).target, 'home');
}
{
  const h = harness(); h.free = {home: 64, worker: 0}; h.scriptName = 'manager.js';
  assert.equal(await runScriptSomewhere(h.ns('home'), 'manager.js', true, [], 0, true), 0,
    'Self-offloading must not create a same-host restart loop through the home fallback');
}
{
  const h = harness(); h.missing.add('manager.js');
  assert.equal(await runScriptSomewhere(h.ns('worker'), 'manager.js', true, [], 0, true), 0);
  assert.equal(h.launches.length, 0, 'An offloaded launcher must size the home script, never treat a missing copy as zero RAM');
}
{
  const h = harness(); h.failCopy = true; h.free.home = 19;
  assert.equal(await runScriptSomewhere(h.ns('home'), 'manager.js', true, [], 0, true), 0);
  assert(!h.launches.some(call => call.file === 'manager.js'), 'Do not launch with incomplete dependencies/config');
}

// A remote BN1 controller is placed and allocated at the full 16 GB requirement.
for (const homeFree of [8,64]) {
  const h=harness();h.free={home:homeFree,worker:32};
  const pid=await runScriptSomewhere(h.ns('home'),'bn1-auto.js',true,[],16);
  assert(pid>0);const launch=h.launches.at(-1);assert.equal(launch.target,'worker');
  assert.equal(launch.options.ramOverride,16,'Placement and exec must use the same allocation');
  const copies=new Set(h.copies.filter(([,dest])=>dest==='worker').map(([file])=>file));
  for(const file of getRemoteScriptFiles('bn1-auto.js')) assert(copies.has(file),`Missing remote dependency: ${file}`);
}
for (const entry of ['autopilot.js','bn1-auto.js']) {
  const files=new Set(getRemoteScriptFiles(entry));
  for (const file of files) {
    const code=await readFile(new URL('../../../'+file,import.meta.url),'utf8');
    for(const match of code.matchAll(/from ['"](\.[^'"]+)['"]/g)) {
      const resolved=new URL(match[1],new URL('../../../'+file,import.meta.url));
      const dependency=resolved.pathname.slice(new URL('../../../',import.meta.url).pathname.length);
      assert(files.has(dependency),`${entry} deployment misses ${dependency} imported by ${file}`);
    }
  }
}

// Direct process lookup handles network cycles, remote instances and no match without a helper.
for (const runningOn of ['home', 'worker', 'leaf', null]) {
  const network = {home: ['worker'], worker: ['home', 'leaf'], leaf: ['worker']};
  const ns = {print: noop, scan: host => network[host],
    ps: host => host === runningOn ? [{filename: 'autopilot.js', pid: 3}] : []};
  assert.equal(await isScriptRunning(ns, 'autopilot.js'), runningOn !== null);
  assert.deepEqual(await whichServerIsRunning(ns, 'autopilot.js'), [runningOn, runningOn ? 3 : null]);
}

// Execute autopilot's actual reserve formula from an offloaded host. Its spending policy stays the same.
const autopilot = await readFile(new URL('../../../autopilot.js', import.meta.url), 'utf8');
const reservePolicy = autopilot.slice(autopilot.indexOf('  async function manageReservedMoney('),
  autopilot.indexOf('  async function checkOnRunningScripts('));
for (const [cash, stocks, daedalus, expected] of [[1e6, 0, false, 8e9], [20e9, 0, false, 16e9], [1e6, 0, true, 100e9]]) {
  const h = harness();
  const manage = Function('getReserve', 'setReserve', 'reservingMoneyForDaedalus',
    `let reservedPurchase=0,currentMoneyReserve=0; const getTimeInBitnode=()=>0; ${reservePolicy}; return manageReservedMoney;`)(
    getReserve, setReserve, daedalus);
  await manage(h.ns('worker'), {money: cash}, stocks);
  assert.equal(await getReserve(h.ns('home')), expected);
}

// Execute the actual reset-core phase: false, error strings and exceptions all stop optional spending.
const ascend = await readFile(new URL('../../../ascend.js', import.meta.url), 'utf8');
const phase = ascend.slice(ascend.indexOf('  // STEP 8:'), ascend.indexOf('  // STEP 9:'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const failure of [false, 'ERROR:denied', Error('denied')]) {
  let calls = 0, sleeps = 0;
  await AsyncFunction('ns', 'singRun', 'log', phase)(
    {sleep: async () => sleeps++}, async () => { if (++calls === 1) return true; if (failure instanceof Error) throw failure; return failure; }, noop);
  assert.equal(calls, 2); assert.equal(sleeps, 1);
}
console.log('RPC launch/reply recovery, long-call preservation, SF4 RAM/errors, home reserve transport, config deployment and home fallback checks passed');
