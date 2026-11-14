// Run every actual API helper through the real PID-port wrapper, including serialization and RAM failure.
import assert from 'node:assert/strict';
import * as utils from '../../../utils.js';
import {main as purchaseMain} from '../../../bin/purchase.js';
import {purchaseRam} from '../../../purchase-guard.js';

const noop = () => {};
const families = [
  ['corporation', 'corpRun', 23.6], ['stock', 'stockRun', 5.6], ['sleeve', 'sleeveRun', 5.6],
  ['hacknet', 'hnRun', 6.6], ['bladeburner', 'bbRun', 5.6], ['gang', 'gangRun', 5.6],
  ['stanek', 'stanekRun', 6.6], ['singularity', 'singRun', 6.6],
];
function harness(main, namespace, api) {
  let pid = 10;
  const ports = new Map(), running = new Set();
  const state = {functionCost: 3, limit: Infinity, launches: [], cash: 100, reserve: 80, beforeExecute: noop};
  const ns = {
    print: noop, getHostname: () => 'home', getScriptName: () => 'check.js', getScriptRam: () => 4,
    getFunctionRamCost: name => name === 'baseCost' ? 1.6 : state.functionCost,
    getServerMoneyAvailable: () => state.cash, read: () => String(state.reserve),
    [namespace]: api, isRunning: id => running.has(id),
    getPortHandle(id) {
      if (!ports.has(id)) {
        const values = []; let resolve;
        ports.set(id, {empty: () => !values.length, read: () => values.shift(),
          write: value => {values.push(structuredClone(value)); resolve?.();},
          nextWrite: () => new Promise(r => resolve = r)});
      }
      return ports.get(id);
    },
    exec(file, host, options, ...args) {
      assert.equal(host, 'home');
      state.launches.push({file, options, args});
      const id = ++pid; running.add(id);
      queueMicrotask(async () => {
        let onExit = noop;
        state.beforeExecute();
        try { await main({...ns, pid: id, args, atExit: fn => onExit = fn,
          ramOverride: ram => Math.min(ram, state.limit)}); }
        finally {onExit(); running.delete(id);}
      });
      return id;
    },
  };
  return {ns, state};
}

for (const [namespace, name, minimum] of families) {
  const {main} = await import(`../../../bin/${name}.js`);
  for (const value of [true, false, 0, null, undefined, [], {success: false}]) {
    const h = harness(main, namespace, {query: () => value});
    assert.deepEqual(await utils[name](h.ns, 'query'), value);
    assert.equal(h.state.launches[0].options.ramOverride, Math.max(minimum, 4.6));
  }
  const api = {query: () => {throw Error('API unavailable');}};
  const h = harness(main, namespace, api);
  await assert.rejects(utils[name](h.ns, 'query'), /API unavailable/);
  await assert.rejects(utils[name](h.ns, 'missing'), /Invalid .* function/);
  api.query = () => () => {};
  await assert.rejects(utils[name](h.ns, 'query'), /Unable to serialize result/);
  h.state.functionCost = 48; h.state.limit = 6.6;
  let called = false; api.query = () => {called = true; return true;};
  await assert.rejects(utils[name](h.ns, 'query'), /Insufficient RAM/);
  assert.equal(called, false);
  assert.equal(h.state.launches.at(-1).options.ramOverride, 49.6);
}

// A remote caller's cached quote cannot spend money made unavailable before the purchase helper executes.
{
  const api = {getServerUpgradeCost: () => 20, upgradeServer: () => {h.state.cash -= 20; return true;}};
  const h = harness(purchaseMain, 'cloud', api);
  h.state.beforeExecute = () => h.state.reserve = 90;
  const rejected = await utils.purchase(h.ns, 'cloud', 'upgradeServer', ['worker', 16], {budget: 20});
  assert.equal(rejected.result, false); assert.equal(h.state.cash, 100);
  h.state.beforeExecute = () => h.state.reserve = 80;
  const receipt = await utils.purchase(h.ns, 'cloud', 'upgradeServer', ['worker', 16], {budget: 20});
  assert.equal(receipt.result, true); assert.equal(receipt.spent, 20); assert.equal(h.state.cash, 80);
  assert.equal(h.state.launches.at(-1).options.ramOverride, purchaseRam(h.ns, 'cloud', 'upgradeServer'));
  h.state.limit = 1.6;
  await assert.rejects(utils.purchase(h.ns, 'cloud', 'upgradeServer', ['worker', 16]), /requires .* GB/);
  h.state.limit = Infinity; h.state.reserve = 0;
  api.upgradeServer = () => {throw Error('purchase denied');};
  h.state.beforeExecute = noop;
  await assert.rejects(utils.purchase(h.ns, 'cloud', 'upgradeServer', ['worker', 16]), /purchase denied/);
}

// Stock quotes require enum VALUES (L/S), not their member names (Long/Short).
// Exercise the actual remote purchase wrapper, home helper, and receipt transport.
for (const [method, positionType] of [['buyStock', 'L'], ['buyShort', 'S']]) {
  let purchases = 0, purchasePrice = 10, casino = 10e9;
  const api = {
    getPurchaseCost: (...args) => {
      assert.deepEqual(args, ['AAA', 6, positionType], 'Match the game’s strict PositionType argument contract');
      return 60;
    },
    [method]: (...args) => {
      assert.deepEqual(args, ['AAA', 6], 'The enum belongs only in the quote, not the purchase call');
      purchases++;
      if (purchasePrice > 0) h.state.cash -= 60;
      return purchasePrice;
    },
  };
  const h = harness(purchaseMain, 'stock', api);
  h.ns.enums = {PositionType: {Long: 'L', Short: 'S'}};
  h.ns.getMoneySources = () => ({sinceInstall: {casino}, sinceStart: {casino: 100e9}});
  h.state.reserve = 8e9; h.state.cash = 8e9 + 60;
  const remoteNs = {...h.ns, getHostname: () => 'the-hub',
    read: () => assert.fail('An offloaded buyer must not read its local reserve')};
  const buy = policy => utils.purchase(remoteNs, 'stock', method, ['AAA', 6], policy);
  assert.deepEqual(await buy({budget: 60}), {result: 10, spent: 60, cost: 60});
  assert.equal(h.state.cash, 8e9, 'Buying at the boundary preserves the full reserve');
  assert.equal(h.state.launches.at(-1).options.ramOverride, purchaseRam(h.ns, 'stock', method));
  assert.equal((await buy()).spent, 0, 'Cannot spend the protected reserve');
  h.state.cash += 60; casino = 10e9 - 1;
  assert.equal((await buy()).spent, 0, 'Historical winnings cannot unlock this installation’s stock buying');
  casino = 10e9;
  assert.equal((await buy({budget: 59})).spent, 0, 'The current quote must also fit the caller’s budget');
  assert.equal(purchases, 1, 'Rejected buys must never reach the stock purchase API');
  purchasePrice = 0;
  assert.deepEqual(await buy(), {result: 0, spent: 0, cost: 60});
  assert.equal(h.state.cash, 8e9 + 60, 'A failed purchase must not be counted as spending');
}
console.log('All API wrappers preserve result types, reject API/serialization/RAM failures, and enforce fresh purchase state; long/short stock quotes use valid enums and preserve reserve/casino gates');
