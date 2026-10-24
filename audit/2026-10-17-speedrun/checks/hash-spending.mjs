import assert from 'node:assert/strict';
import {main, prioritizeHashPurchases, getHashTargetHostname} from '../../../spend-hashes.js';
const STOP = Symbol('bounded hash test complete');
const noop = () => {};
const cash = 'Sell for Money', funds = 'Sell for Corporation Funds', research = 'Exchange for Corporation Research';
assert.deepEqual(prioritizeHashPurchases([cash, funds, research, funds]), [funds, research, cash]);
assert.equal(getHashTargetHostname({hostname: 'foodnstuff'}), 'foodnstuff');
for (const target of [null, {}, 5, '', {hostname: 5}]) assert.equal(getHashTargetHostname(target), null);

async function run(options = {}, setup = {}) {
  const state = {hashes: 100, calls: [], scans: 0, sleeps: 0, logs: [], ...setup};
  const replies = new Map(); let pid = 0;
  const ns = {
    args: [], getScriptName: () => 'spend-hashes.js', read: () => '',
    flags: schema => ({...Object.fromEntries(schema), 'no-capacity-upgrades': true, ...options}),
    print: text => state.logs.push(text), tprint: noop, toast: noop, disableLog: noop,
    getScriptRam: () => 2, getHostname: () => 'home',
    getPortHandle: id => ({empty: () => !replies.has(id), read: () => replies.get(id)}),
    exec(file) {
      assert.equal(file, 'bin/getOptimalServer.js'); state.scans++;
      replies.set(++pid, setup.target === undefined ? {hostname: 'foodnstuff'} : setup.target);
      return pid;
    },
    sleep: async () => {if (++state.sleeps > (setup.frames ?? 6)) throw STOP;},
    hacknet: {
      numHashes: () => state.hashes, hashCapacity: () => 100, numNodes: () => 1,
      getNodeStats: () => ({production: 1}),
      hashCost: action => action === cash ? 4 : 20,
      spendHashes(action, target, count) {
        if (['Reduce Minimum Security', 'Increase Maximum Money'].includes(action))
          assert.equal(typeof target, 'string', 'Pass a hostname to the game, not a Server object');
        const cost = (action === cash ? 4 : 20) * count;
        assert(state.hashes >= cost); state.hashes -= cost;
        state.calls.push([action, target, count]);
        return true;
      },
    },
  };
  await assert.rejects(main(ns), error => error === STOP);
  assert(!state.logs.some(line => /Caught \(and suppressed\)/.test(line)), 'No swallowed runtime errors');
  return state;
}

let h = await run();
assert.equal(h.scans, 0, 'Default cash-only mode must never rank hacking targets');
assert(h.calls.every(([action]) => action === cash));
for (const action of [funds, research]) {
  h = await run({'spend-on': [action], liquidate: true});
  assert.equal(h.scans, 0); assert(h.calls.some(([a]) => a === action));
}
h = await run({'spend-on': [cash, funds], liquidate: true});
assert.deepEqual(h.calls.map(([action]) => action), [funds, cash]);
assert.equal(h.calls[1][2], 20, 'Only liquidate the 80 hashes left after corporation funding');
h = await run({'spend-on': [cash, research, funds], liquidate: true, 'max-purchases-per-loop': 1}, {frames: 1});
assert.equal(h.calls.length, 1, 'The loop cap applies inside mixed-purchase lists');
h = await run({'spend-on': ['Reduce Minimum Security'], liquidate: true});
assert.equal(h.scans, 1, 'Automatic targets are cached across 50 ms polling iterations');
assert.equal(h.calls[0][1], 'foodnstuff');
h = await run({'spend-on': ['Increase Maximum Money'], 'spend-on-server': 'n00dles', liquidate: true});
assert.equal(h.scans, 0); assert.equal(h.calls[0][1], 'n00dles');
h = await run({'spend-on': ['Increase Maximum Money'], liquidate: true, 'reserve-buffer': 8}, {target: null});
assert.equal(h.scans, 1);
assert(!h.calls.some(([action]) => action === 'Increase Maximum Money'));
assert(h.calls.some(([action]) => action === cash), 'No target must still allow overflow cash sales');
console.log('Hash spending priority, explicit corporation purchases, hostname targets, caching and overflow checks passed');
