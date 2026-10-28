import assert from 'node:assert/strict';
import {main} from '../../../performance-diagnostic.js';

const realNow = Date.now;
let now = 0;
Date.now = () => now;
try {
  async function run(homeProcesses) {
    const output = [], sleeps = [], writes = [];
    const ns = {
      disableLog() {}, getHostname: () => 'remote', getResetInfo: () => ({currentNode: 5}),
      ui: {getGameInfo: () => ({version: '3.0.1'})},
      getServerMaxRam: host => host === 'home' ? 1048576 : 64,
      getServerUsedRam: host => host === 'home' ? 1047527.424 : 20,
      getScriptRam: () => 5.1, scan: host => host === 'home' ? ['remote', 'vanished'] : ['home'],
      ps(host) {
        if (host === 'vanished') throw new Error('Server disappeared');
        return host === 'home' ? homeProcesses : [{pid: 20, filename: 'kernel.js', threads: 1}];
      },
      getScriptLogs: () => ['old', 'started', 'dispatching', 'waiting for RAM'],
      async sleep(ms) {sleeps.push(ms); now += ms + 5;},
      tprint: line => output.push(line), async write(...args) {writes.push(args);},
    };
    // Deliberately provide no exec/run/kill APIs: a diagnostic cannot disturb active work.
    await main(ns);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], '/Temp/performance-diagnostic.json');
    const report = JSON.parse(writes[0][1]);
    assert.equal(report.host, 'remote');
    assert(Math.abs(report.homeBefore.free - 1048.576) < 1e-6);
    assert.equal(report.currentNode, 5);
    assert.equal(report.errors.length, 1);
    assert.equal(report.managers[0].filename, 'kernel.js');
    assert.deepEqual(report.managers[0].logs, ['started', 'dispatching', 'waiting for RAM']);
    assert.deepEqual(report.sleepOverrunsMs, Array(10).fill(5));
    assert(output.some(line => line.includes('does not identify the cause')));
    assert(output.length < 15, 'Keep output bounded regardless of process count');
    return {report, sleeps};
  }
  const many = await run(Array.from({length: 50001}, (_, i) =>
    ({pid: i + 100, filename: '/Remote/hack-target.js', threads: 1})));
  assert.equal(many.report.totalProcesses, 50002);
  assert.equal(many.report.scripts[0].processes, 50001);
  assert.equal(many.report.scripts[0].filename, 'Remote/hack-target.js');
  assert(many.sleeps.filter(ms => ms === 0).length >= 100, 'Large aggregation yields every 500 entries');
  const few = await run([{pid: 100, filename: 'bin/share.js', threads: 250000}]);
  assert.equal(few.report.totalProcesses, 2);
  assert.equal(few.report.totalThreads, 250001, 'High thread count is distinct from high process count');
  console.log('Read-only diagnostics distinguish processes/threads at 99.9% RAM, preserve remote coverage and log bounds, and yield through 50k process snapshots.');
} finally { Date.now = realNow; }
