// Bounded lifecycle checks using the real corporation helpers and PID-port transport.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  waitForCorporation, getCorporationPhase, getSafeDividendRate, manageCorporationPayout,
  getInvestmentCapitalTarget, shouldUseCapitalConstrainedBootstrap, main,
} from '../../../corporation.js';
import {shouldStartCorporation} from '../../../autopilot.js';

const noop = () => {};
const STOP = Symbol('bounded check complete');
function harness(options = {}) {
  const state = {money: 158e9, reserve: 8e9, exists: false, status: 'Success', sleeps: 0,
    calls: [], checks: [], logs: [], ...options};
  let pid = 0;
  const replies = new Map();
  const ns = {
    print: text => state.logs.push(text), tprint: noop, toast: noop, format: {number: String},
    getHostname: () => 'home', read: () => String(state.reserve),
    getServerMoneyAvailable: () => state.money, getScriptRam: () => 23.6,
    getPortHandle: id => ({empty: () => !replies.has(id), read: () => replies.get(id)}),
    exec(file, host, execOptions, method, ...args) {
      assert.equal(file, 'bin/corpRun.js'); assert.equal(host, 'home');
      state.calls.push([method, ...args]);
      let reply;
      if (options.rpc) reply = options.rpc(state, method, args);
      else if (method === 'createCorporation') {
        state.exists = true;
        if (args[1]) { assert(state.money >= 150e9 + state.reserve); state.money -= 150e9; }
        reply = true;
      } else assert.fail(`Unexpected RPC: ${method}`);
      replies.set(++pid, reply);
      return pid;
    },
    sleep: async () => {
      if (++state.sleeps > 4) throw STOP;
      options.onSleep?.(state);
    },
    corporation: {
      hasCorporation: () => state.exists,
      canCreateCorporation: selfFund => {state.checks.push(selfFund); return state.status;},
    },
  };
  return {ns, state};
}

// Unsupported status strings are truthy; they must not trigger a creation retry loop.
for (const status of ['NoSf3OrDisabled', 'DisabledBySoftCap', 'UseSeedMoneyOutsideBN3', 'CorporationExists', false, undefined]) {
  const h = harness({status});
  assert.equal(await waitForCorporation(h.ns, 1), false);
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.sleeps, 0);
}
for (const status of ['Success', true]) {
  const h = harness({status});
  assert.equal(await waitForCorporation(h.ns, 1), true);
  assert.equal(h.state.money, 8e9);
  assert.deepEqual(h.state.calls, [['createCorporation', 'Shady-Ent', true]]);
}
{
  const h = harness({money: 0, reserve: 100e9});
  assert.equal(await waitForCorporation(h.ns, 3), true);
  assert.deepEqual(h.state.calls, [['createCorporation', 'Shady-Ent', false]]);
  assert.equal(h.state.money, 0);
}
{
  const h = harness({money: 157e9, onSleep: s => {
    assert.equal(s.calls.length, 0, 'Never create before cash covers the current reserve');
    if (s.sleeps === 1) {s.money = 158e9; s.reserve = 100e9;}
    if (s.sleeps === 2) s.money = 250e9;
  }});
  assert.equal(await waitForCorporation(h.ns, 1), true);
  assert.equal(h.state.sleeps, 2); assert.equal(h.state.money, 100e9);
}
{
  const h = harness({exists: true, money: 0, status: 'CorporationExists'});
  assert.equal(await waitForCorporation(h.ns, 1), true);
  assert.equal(h.state.checks.length, 0); assert.equal(h.state.calls.length, 0);
}
for (const failedReply of [false, undefined, 'ERROR: create failed', true]) {
  const h = harness({rpc: (s, method) => {
    assert.equal(method, 'createCorporation');
    if (s.calls.length === 1) return failedReply;
    s.exists = true; return true;
  }});
  assert.equal(await waitForCorporation(h.ns, 1), true);
  assert.equal(h.state.sleeps, 1, 'Verify corporation existence even after a true reply');
}
{
  const h = harness({money: 0, onSleep: s => {s.exists = true;}});
  assert.equal(await waitForCorporation(h.ns, 1), true);
  assert.equal(h.state.calls.length, 0, 'Discover a corporation created while waiting');
}
{
  const h = harness({reserve: NaN});
  await assert.rejects(waitForCorporation(h.ns, 1), /valid reserve/);
  assert.equal(h.state.calls.length, 0);
}

// Autopilot uses the same funding boundary, resumes existing corporations, and skips BN8/disabled access.
{
  const h = harness();
  assert.equal(shouldStartCorporation(h.ns, {}, 1, 1e15, 0), false);
  assert.equal(shouldStartCorporation(h.ns, {3: 1}, 1, 158e9 - 1, 8e9), false);
  assert.equal(shouldStartCorporation(h.ns, {3: 1}, 1, 158e9, 8e9), true);
  assert.equal(shouldStartCorporation(h.ns, {3: 1}, 3, 0, 8e9), true);
  h.state.status = 'DisabledBySoftCap';
  assert.equal(shouldStartCorporation(h.ns, {3: 3}, 8, 1e15, 0), false);
  h.state.status = 'NoSf3OrDisabled';
  assert.equal(shouldStartCorporation(h.ns, {3: 3}, 1, 1e15, 0), false);
  h.state.exists = true;
  assert.equal(shouldStartCorporation(h.ns, {3: 1}, 1, 0, 100e9), true);
}

for (let round = 1; round <= 5; round++) {
  assert.equal(getCorporationPhase({public: false}, {round}), round);
  assert.equal(getCorporationPhase({public: true}, {round}), 5);
}
assert.equal(getCorporationPhase(undefined, {round: 1}), 0);
for (const round of [undefined, 0, 1.5, 6, NaN]) assert.equal(getCorporationPhase({}, {round}), 0);

const healthy = {public: false, funds: 50e9, revenue: 2e9, expenses: 1e9, dividendRate: 0};
assert.equal(getSafeDividendRate(healthy, 0.01, 10), 0.01);
assert.equal(getSafeDividendRate({...healthy, funds: 30e9}, 0.01, 10), 0.01);
for (const changes of [{funds: 30e9 - 1}, {funds: -1}, {revenue: 1e9}, {revenue: 0}, {expenses: NaN}])
  assert.equal(getSafeDividendRate({...healthy, ...changes}, 0.01, 10), 0);
assert.equal(getSafeDividendRate({...healthy, expenses: 0, funds: 5e9 - 1}, 0.01, 10), 0);
for (const rate of [0, -1, NaN, 1.01]) assert.equal(getSafeDividendRate(healthy, rate, 10), 0);
assert.equal(getSafeDividendRate(healthy, 1, 10), 1);

async function payout(round, changes = {}, options = {}) {
  const corp = {...healthy, ...changes};
  const h = harness({rpc(s, method, args) {
    if (method === 'getCorporation') return {...corp};
    if (method === 'getConstants') return {officeInitialCost: 4e9, warehouseInitialCost: 5e9, secondsPerMarketCycle: 10};
    if (method === 'goPublic') {
      assert.deepEqual(args, [0], 'Do not sell any shares');
      if (options.failIpo) return false;
      if (!options.staleIpo) corp.public = true;
      return true;
    }
    if (method === 'issueDividends') {corp.dividendRate = args[0]; return;}
    assert.fail(`Unexpected payout RPC: ${method}`);
  }});
  await manageCorporationPayout(h.ns, round, options.rate ?? 0.01);
  return {corp, calls: h.state.calls};
}
for (const round of [1, 2, 3, 4, undefined, NaN]) {
  const h = await payout(round);
  assert.equal(h.corp.public, false); assert.equal(h.calls.length, 1, 'Keep every private offer available');
}
let p = await payout(5);
assert.equal(p.corp.public, true); assert.equal(p.corp.dividendRate, 0.01);
for (const options of [{failIpo: true}, {staleIpo: true}]) {
  p = await payout(5, {}, options);
  assert(!p.calls.some(([method]) => method === 'issueDividends'), 'Require verified public state');
}
p = await payout(2, {public: true});
assert.equal(p.corp.dividendRate, 0.01); assert(!p.calls.some(([method]) => method === 'goPublic'));
p = await payout(5, {public: true, funds: 1e9, dividendRate: 0.01});
assert.equal(p.corp.dividendRate, 0, 'Stop withdrawals when working capital is low');
p = await payout(5, {public: true, dividendRate: 0.01});
assert(!p.calls.some(([method]) => method === 'issueDividends'), 'Do not reset unchanged rates every phase');
p = await payout(5, {}, {rate: 0});
assert.equal(p.corp.dividendRate, 0);

// Existing funding thresholds and paid-API bootstrap remain intact.
assert.equal(getInvestmentCapitalTarget(1, 0.2), 190e9);
assert.equal(getInvestmentCapitalTarget(1, 1), 440e9);
assert.equal(getInvestmentCapitalTarget(2, 0.2), 8.8e12);
assert.equal(shouldUseCapitalConstrainedBootstrap(1, 1), true);
assert.equal(shouldUseCapitalConstrainedBootstrap(3, 0), false);
assert.equal(shouldUseCapitalConstrainedBootstrap(1, 3), false);

// Execute the real phase loops with small operation stubs: an externally public corporation
// must leave its stale private loop before selling or seeking a now-unavailable offer.
const source = await readFile(new URL('../../../corporation.js', import.meta.url), 'utf8');
const start = source.indexOf('  while (true) {', source.indexOf('export async function main'));
const end = source.indexOf('\nasync function getUpgradeLevel', start);
const loop = source.slice(start, end).trim().slice(0, -1);
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
for (const initialRound of [1, 2, 3, 4]) {
  const run = AsyncFunction('ns', 'state', 'STOP', `
    let round=${initialRound}, investOffer;
    let reads=0;
    async function prep() { reads++; investOffer={round:5}; return true; }
    async function updateHud() { state.reads=reads; throw STOP; }
    ${loop}`);
  const state = {};
  await assert.rejects(run({}, state, STOP), error => error === STOP);
  assert.equal(state.reads, 2, 'Re-enter public management after refreshing the phase');
}
for (const rate of [-0.01, 1.01, NaN]) {
  await main({ramOverride: noop, flags: () => ({'dividend-rate': rate}), tprint: noop});
}
console.log('Corporation eligibility, reserve-aware startup, public resumption, guarded payouts and unchanged bootstrap checks passed');
