import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Expose the actual worker's closures before its infinite loop. Solvers and dispatch stay intact.
const source = await readFile(new URL('../../../darknet.js', import.meta.url), 'utf8');
const entry = '  await startup(ns);\n  while (true) {';
assert.equal(source.split(entry).length, 2, 'Locate the worker entry point exactly once');
const executable = source.replace(entry,
  '  return {startup, mainRun, breakIn, complete, inProgress, workingOn};\n  while (true) {');
const {main} = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`);

// Exact unavailable-server shape returned by the game and reported for smart_tv.
const offline = {isConnectedToCurrentServer: false, hasSession: false, modelId: '', passwordHint: '', data: '',
  logTrafficInterval: -1, passwordLength: -1, passwordFormat: 'numeric', blockedRam: 0, difficulty: 0,
  requiredCharismaSkill: 0, depth: -1, isStationary: false, isOnline: false};
const online = overrides => ({...offline, isOnline: true, isConnectedToCurrentServer: true,
  modelId: 'ZeroLogon', passwordLength: 0, depth: 1, ...overrides});

async function harness(servers) {
  const records = new Map(Object.entries(servers).map(([host, details]) => [host, {...details}]));
  const warnings = [], attempts = [], deployments = [];
  const state = {authenticate: null};
  const ns = {
    args: [], pid: 1, self: () => ({server: 'dark-worker', filename: 'darknet.js', threads: 2, ramUsage: 12.55}),
    tprint: text => warnings.push(text), tprintf: text => warnings.push(text), atExit: () => {},
    ls: () => [], getServerMaxRam: () => 32, ps: () => [{pid: 99}],
    scp: (...args) => {deployments.push(['scp', ...args]); return true;},
    exec: (...args) => {deployments.push(['exec', ...args]); return 2;},
    spawn: () => assert.fail('No respawn needed for this fixture'),
    sleep: async () => {}, asleep: async () => {},
    dnet: {
      probe: () => [...records.keys()], getServerRequiredCharismaLevel: () => 0,
      getServerDetails: host => ({...(records.get(host) ?? offline)}),
      getBlockedRam: () => 0, getStasisLinkedServers: () => [],
      phishingAttack: async () => {},
      authenticate: async (host, answer) => {
        attempts.push({host, answer});
        if (state.authenticate) return state.authenticate(host, answer);
        const details = records.get(host);
        if (!details?.isOnline || !details.isConnectedToCurrentServer)
          return {success: false, message: 'Service Unavailable'};
        details.hasSession = true;
        return {success: true, message: 'Success'};
      },
    },
  };
  return {ns, state, records, warnings, attempts, deployments, ...await main(ns)};
}

// Unavailable records must never become solver work, warnings, or login attempts.
for (const details of [offline, online({isConnectedToCurrentServer: false}), online({modelId: ''})]) {
  const h = await harness({smart_tv: details});
  h.complete.smart_tv = ''; h.inProgress.smart_tv = {tries: 3}; h.workingOn.smart_tv = true;
  const result = await h.breakIn(h.ns, 'smart_tv', details);
  assert.equal(result.success, false);
  assert.deepEqual(h.warnings, [], 'Unavailable details are not an unknown model');
  assert.deepEqual(h.attempts, [], 'Do not authenticate an unavailable/disconnected device');
  assert.equal(h.workingOn.smart_tv, undefined, 'Release an obsolete work claim');
  assert.equal(h.complete.smart_tv, ''); assert.deepEqual(h.inProgress.smart_tv, {tries: 3});
}

// Both discovery passes must continue to reachable devices after a stale probe entry.
for (const pass of ['startup', 'mainRun']) {
  for (const details of [offline, online({isConnectedToCurrentServer: false}), online({modelId: ''})]) {
    const h = await harness({smart_tv: details, next_device: online()});
    h.complete.smart_tv = '';
    await h[pass](h.ns);
    assert.deepEqual(h.warnings, []);
    assert.deepEqual(h.attempts, [{host: 'next_device', answer: ''}], `${pass} must skip smart_tv and process the next host`);
    assert.deepEqual(h.deployments, [], 'Do not duplicate existing workers or deploy to unavailable devices');
    assert.equal(h.complete.next_device, '');
    // A fresh probe can retry the host when it is reachable again.
    h.records.set('smart_tv', online()); h.attempts.length = 0;
    await h[pass](h.ns);
    assert.deepEqual(h.attempts, [{host: 'smart_tv', answer: ''}]);
    assert.deepEqual(h.warnings, []);
  }
}

// A cached empty password is valid even if the model has no dedicated solver.
{
  const details = online({modelId: 'NewDeviceModel'});
  const h = await harness({smart_tv: details});
  h.complete.smart_tv = '';
  assert.equal((await h.breakIn(h.ns, 'smart_tv', details)).success, true);
  assert.deepEqual(h.attempts, [{host: 'smart_tv', answer: ''}]);
  assert.deepEqual(h.warnings, [], 'Use the cached password before declaring a model unknown');
}

// A target can disappear while authentication yields. Keep its cache for a later probe.
{
  const details = online({modelId: 'DeskMemo_3.1', passwordHint: 'Password: secret', passwordLength: 6});
  const h = await harness({smart_tv: details}); h.complete.smart_tv = 'secret';
  h.state.authenticate = () => {
    h.records.set('smart_tv', {...offline});
    return {success: false, message: 'Service Unavailable'};
  };
  assert.equal((await h.breakIn(h.ns, 'smart_tv', details)).success, false);
  assert.deepEqual(h.warnings, []); assert.equal(h.complete.smart_tv, 'secret');
  assert.equal(h.workingOn.smart_tv, undefined);
  h.records.set('smart_tv', details); h.state.authenticate = null;
  await h.startup(h.ns);
  assert.deepEqual(h.attempts, [{host: 'smart_tv', answer: 'secret'}, {host: 'smart_tv', answer: 'secret'}]);
}

// Preserve reachable known-model handling and useful diagnostics for genuinely new models.
{
  const details = online({modelId: 'DeskMemo_3.1', passwordHint: 'Password: secret', passwordLength: 6});
  const h = await harness({smart_tv: details});
  assert.equal((await h.breakIn(h.ns, 'smart_tv', details)).success, true);
  assert.deepEqual(h.attempts, [{host: 'smart_tv', answer: 'secret'}]);
  assert.deepEqual(h.warnings, []); assert.equal(h.complete.smart_tv, 'secret');
}
{
  const details = online({modelId: 'NewDeviceModel'}), h = await harness({smart_tv: details});
  h.state.authenticate = () => ({success: false, message: 'Authentication Failed'});
  await h.breakIn(h.ns, 'smart_tv', details);
  await h.breakIn(h.ns, 'smart_tv', details);
  assert.equal(h.warnings.length, 1, 'Continue reporting a real unsupported model once');
  assert.match(h.warnings[0], /Unknown modelID.*NewDeviceModel/);
  assert.deepEqual(h.attempts, [{host: 'smart_tv', answer: ''}, {host: 'smart_tv', answer: ''}]);
}
console.log('Darknet unavailable/disconnected/empty-model skips, continued discovery, reconnection, cached empty passwords, mid-auth disappearance, and known/unknown model dispatch passed');
