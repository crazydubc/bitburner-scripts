import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Execute the actual stockmaster module with mocked RPC/configuration transport.
// No market model is substituted for its liquidation or duplicate-instance logic.
const source = await readFile(new URL('../../../stockmaster.js', import.meta.url), 'utf8');
const executable = source.replace(/^import\s+\{[\s\S]*?\}\s+from '\.\/utils\.js'\s*/, '')
  .replace(/^export /gm, '');
const stop = Error('end liquidation hold check');
function harness(options, {tix = true, peers = [10, 20, 21]} = {}) {
  const calls = [], killed = [], logs = [];
  const positions = {AAA: [100, 50, 0, 0], BBB: [0, 0, 200, 80]};
  let sleeps = 0;
  const stockRun = async (ns, command, symbol, shares) => {
    calls.push(command);
    switch (command) {
      case 'getSymbols': return Object.keys(positions);
      case 'getPosition': return [...positions[symbol]];
      case 'sellStock': assert.equal(shares, 100); positions[symbol][0] = 0; return 100;
      case 'sellShort': assert.equal(shares, 200); positions[symbol][2] = 0; return 60;
      default: throw Error(`Unexpected stock call in no-buy mode: ${command}`);
    }
  };
  const main = Function('getConfiguration', 'hasTixApi', 'findPids', 'stockRun', 'formatMoney',
    executable + '\nreturn main;')(
    () => options, async () => tix,
    async (ns, file) => { assert.equal(file, 'stockmaster.js'); return peers; },
    stockRun, value => String(value));
  const ns = {
    pid: 10, kill: pid => { killed.push(pid); return true; },
    print: line => logs.push(line), tprint() {}, toast() {}, disableLog() {},
    sleep: async ms => { assert.equal(ms, 60_000); if (++sleeps === 3) throw stop; },
  };
  return {main, ns, calls, killed, logs, positions, sleepCount: () => sleeps};
}
for (const flag of ['l', 'liquidate']) {
  const h = harness({[flag]: true});
  await assert.rejects(h.main(h.ns), error => error === stop);
  assert.deepEqual(h.killed, [20, 21], 'Stop other stockmasters, never the liquidator or autopilot');
  assert(Object.values(h.positions).every(p => p[0] === 0 && p[2] === 0));
  assert.deepEqual(h.calls, ['getSymbols', 'getPosition', 'getPosition', 'sellStock', 'sellShort']);
  assert.equal(h.sleepCount(), 3, 'Liquidation must remain alive after selling, without entering trading');
}
const once = harness({'liquidate-once': true});
await once.main(once.ns);
assert.equal(once.sleepCount(), 0, 'Automated callers must be able to wait for a one-shot exit');
assert(Object.values(once.positions).every(p => p[0] === 0 && p[2] === 0));

const manual = harness({liquidate: true}, {tix: false});
await assert.rejects(manual.main(manual.ns), error => error === stop);
assert.equal(manual.calls.length, 0);
assert.deepEqual(manual.killed, [20, 21]);
assert(manual.logs.some(line => line.includes('Sell any positions manually')));

const duplicate = harness({}, {peers: [10, 20]});
await duplicate.main(duplicate.ns);
assert.equal(duplicate.calls.length, 0, 'Normal trading must exit when a liquidator already exists');
assert.equal(duplicate.killed.length, 0);
const mock = harness({liquidate: true, mock: true});
await mock.main(mock.ns);
assert.equal(mock.calls.length, 0, 'Mock mode must not perform real liquidation');
assert.equal(mock.killed.length, 0);

// Execute ascend's stock phase, including its wait-for-exit loop. A persistent
// liquidator would deadlock here, so the caller must request a one-shot sale.
const ascendSource = await readFile(new URL('../../../ascend.js', import.meta.url), 'utf8');
const stockPhase = ascendSource.slice(ascendSource.indexOf('const hasTixApiAccess = ns.stock.hasTixApiAccess();'),
  ascendSource.indexOf('// STEP 2:'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let remaining = 1, running = false, phaseSleeps = 0, launched = false;
await AsyncFunction('ns', 'stockRun', 'countOwnedStocks', 'launchScriptHelper', 'let pid;\n' + stockPhase)(
  {stock: {hasTixApiAccess: () => true}, isRunning: () => running,
    sleep: async () => { assert(++phaseSleeps < 4, 'Ascend must finish its stock phase'); running = false; }},
  async () => ['AAA'], async () => remaining,
  async (ns, file, args) => {
    assert.equal(file, 'stockmaster.js');
    assert.deepEqual(args, ['--liquidate-once']);
    launched = true; running = true; remaining = 0; return 20;
  });
assert(launched);
assert.equal(phaseSleeps, 2);

// The Daedalus caller also owns a temporary pause; it must release normal
// trading when the invite is resolved, instead of leaving a permanent holder.
const autopilot = await readFile(new URL('../../../autopilot.js', import.meta.url), 'utf8');
const policySource = autopilot.slice(autopilot.indexOf('name: "stockmaster.js"'), autopilot.indexOf('name: "bladeburner.js"'));
const predicate = policySource.match(/shouldRun: ([\s\S]*?),\s*args:/)[1];
for (const paused of [false, true]) {
  const shouldRun = Function('disableStockmasterForDaedalus', 'reqRam', 'shouldImproveHacking', 'getTimeInAug', 'resetInfo', 'ns',
    `return (${predicate});`)(paused, () => true, () => false, () => 60_000, {currentNode: 1}, {});
  assert.equal(shouldRun(), !paused);
}
assert(autopilot.includes("launchScriptHelper(ns, 'stockmaster.js', ['--liquidate-once'])"));
console.log('Persistent liquidation, long/short sales, no-TIX manual hold, duplicate prevention, and automated caller checks passed');
