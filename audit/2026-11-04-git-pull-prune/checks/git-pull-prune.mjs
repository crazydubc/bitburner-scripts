// Bounded downloader integration tests; no network or live-game deletion.
// node audit/2026-11-04-git-pull-prune/checks/git-pull-prune.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {main as pull} from '../../../git-pull.js';

const root = new URL('../../../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('git-pull-retired.json', root)));
const source = 'crazydubc/bitburner-scripts';
const manifestPath = 'data/git-pull/' + source + '/manifest.json';
const digest = text => createHash('sha256').update(text).digest('hex');
const engine = resolve(process.argv[2] ?? '../bitburner-engine');
const serverCode = readFileSync(resolve(engine, 'src/Server/BaseServer.ts'), 'utf8');
const methodStart = serverCode.indexOf('  removeFile(path:');
const methodEnd = serverCode.indexOf('\n  }', methodStart) + 4;
assert(methodStart > 0 && methodEnd > methodStart);
const removeFile = Function('hasTextExtension', 'hasScriptExtension', 'hasProgramExtension',
  stripTypeScriptTypes('function ' + serverCode.slice(methodStart, methodEnd).trim()) + '; return removeFile;')(
  path => /\.(?:txt|json)$/.test(path), path => /\.(?:js|ts|ns|script)$/.test(path), path => path.endsWith('.exe'));

function fixture({folder = '', host = 'home', files = {}, remote = {'main.js': '// current'}, legacy = false} = {}) {
  const disk = new Map(Object.entries(files)), versions = new Map(), reads = [], updates = [], writes = [], removals = [], logs = [];
  const state = {failure: '', denyDownload: '', writeFailure: '', editOnBackup: null, running: new Set(), sha: '', remote, catalog};
  const relative = file => folder ? file.slice(folder.length + 1) : file;
  function snapshot() {
    state.sha = String(versions.size + 1).padStart(40, '0');
    versions.set(state.sha, {...state.remote, ...(legacy ? {'git-pull-retired.json': JSON.stringify(state.catalog)} : {})});
  }
  snapshot();
  const ns = {
    pid: 42, getHostname: () => host, getScriptName: () => (folder ? folder + '/' : '') + 'git-pull.js',
    flags: schema => ({...Object.fromEntries(structuredClone(schema)), 'new-file': [], branch: 'testing/bn1-go-audit', subfolder: folder, ...state.flags}),
    print: value => logs.push(value), tprint: value => logs.push(value),
    read: path => disk.get(path) ?? '', ls: actualHost => {assert.equal(actualHost, host); return [...disk.keys()];},
    write: async (path, text, mode) => {
      assert.equal(mode, 'w'); writes.push(path);
      if (state.writeFailure && path.includes(state.writeFailure)) throw Error('disk write failed');
      disk.set(path, text);
      if (path.includes('/backups/')) {
        const backup = JSON.parse(text);
        for (const [file, contents] of Object.entries(backup.files)) assert.equal(disk.get(file), contents);
        if (state.editOnBackup) disk.set(...state.editOnBackup);
      }
    },
    wget: async (url, path) => {
      updates.push({url, path});
      if (path === state.denyDownload) return false;
      const ref = url.split('/' + source + '/')[1].split('/')[0];
      const version = versions.get(ref) ?? (ref === 'testing' ? state.remote : undefined);
      const content = version?.[relative(path)];
      if (content === undefined) return false;
      disk.set(path, content); return true;
    },
    rm: (path, actualHost) => {
      assert.equal(actualHost, host);
      assert(writes.some(p => p.includes('/backups/')), 'Back up before deleting');
      const backup = JSON.parse(disk.get(writes.findLast(p => p.includes('/backups/'))));
      assert.equal(backup.files[path], disk.get(path), 'Verified exact-content backup must exist');
      removals.push(path);
      // Use the actual official running-script refusal and deletion path.
      const server = {scripts: new Map([[path, {invalidateModule() {}}]]), isRunning: file => state.running.has(file)};
      const result = removeFile.call(server, path);
      if (result.res) disk.delete(path);
      return result.res;
    },
  };
  return {disk, state, reads, updates, writes, removals, logs, snapshot,
    async run(flags = {}) {
      state.flags = flags; reads.length = updates.length = writes.length = removals.length = logs.length = 0;
      const previousFetch = globalThis.fetch;
      globalThis.fetch = async url => {
        reads.push(url);
        if (state.failure === 'http') return {ok: false, status: 403};
        if (url.includes('/commits/')) {
          assert(url.endsWith('/commits/testing%2Fbn1-go-audit'));
          return {ok: true, json: async () => ({sha: state.sha})};
        }
        if (url.includes('/git/trees/')) {
          assert(url.includes(state.sha));
          const tree = Object.keys(versions.get(state.sha)).map(path => ({type: 'blob', path}));
          if (state.failure === 'unsafe-tree') tree.push({type: 'blob', path: '../personal.js'});
          if (state.failure === 'tree-error') throw Error('network failed during listing');
          return {ok: true, json: async () => ({truncated: state.failure === 'truncated', tree})};
        }
        assert(url.endsWith('/' + state.sha + '/git-pull-retired.json'), url);
        if (state.failure === 'catalog') throw Error('catalog unavailable');
        return {ok: true, json: async () => state.catalog};
      };
      try {await pull(ns);} finally {globalThis.fetch = previousFetch;}
    },
  };
}

let h = fixture({remote: {'main.js': '// first', 'obsolete.js': '// old'}});
await h.run();
assert(h.disk.has('obsolete.js')); assert.deepEqual(h.removals, []);
const manifest = JSON.parse(h.disk.get(manifestPath));
assert.equal(manifest.files['obsolete.js'], digest('// old'));
assert(h.updates.every(item => item.url.includes('/' + h.state.sha + '/')));
h.state.remote = {'main.js': '// second'}; h.snapshot();
const beforePreview = [...h.disk];
await h.run({'dry-run': true});
assert.deepEqual([...h.disk], beforePreview); assert.equal(h.updates.length + h.writes.length + h.removals.length, 0);
assert(h.logs.some(line => line.startsWith('WOULD REMOVE: obsolete.js')));
await h.run();
assert(!h.disk.has('obsolete.js'), 'Normal full pulls sync removals without a flag'); assert.deepEqual(h.removals, ['obsolete.js']);
assert.equal(JSON.parse(h.disk.get(h.writes.find(p => p.includes('/backups/')))).files['obsolete.js'], '// old');

// Bootstrap known legacy files, preserving unrecognized personal scripts and all data/configs.
const dev = execFileSync('git', ['show', '65a7018^:dev.js'], {cwd: root, encoding: 'utf8'});
const hacks = execFileSync('git', ['show', '65a7018^:hacks.js'], {cwd: root, encoding: 'utf8'});
assert(catalog.files['dev.js'].includes(digest(dev))); assert(catalog.files['hacks.js'].includes(digest(hacks)));
const preserved = {'personal.js': '// personal', 'reserve.txt': '8000000000', 'autopilot.js.config.txt': '{}',
  'go-results.json': '[]', 'data/custom.js': '// user data', 'Temp/state.txt': 'keep', 'BruteSSH.exe': 'program', 'test.cct': 'contract'};
h = fixture({legacy: true, files: {...preserved, 'dev.js': dev, 'hacks.js': hacks}});
await h.run();
assert.deepEqual(h.removals.sort(), ['dev.js', 'hacks.js']);
for (const [file, content] of Object.entries(preserved)) assert.equal(h.disk.get(file), content);
assert(!h.updates.some(({path}) => path.endsWith('git-pull-retired.json')), 'Migration catalog is read directly, not installed as a runtime script');
h = fixture({legacy: true, files: {'dev.js': '// my own dev script'}}); await h.run();
assert.equal(h.disk.get('dev.js'), '// my own dev script'); assert.equal(h.removals.length, 0);

async function managed(settings = {}) {
  const x = fixture({...settings, remote: {'main.js': '// current', 'old.js': '// old'}});
  await x.run(); x.state.remote = {'main.js': '// updated'}; x.snapshot(); return x;
}
h = await managed(); h.disk.set('old.js', '// edited');
await h.run(); assert.equal(h.disk.get('old.js'), '// edited'); assert.equal(h.removals.length, 0);
h = await managed(); h.state.running.add('old.js');
await h.run(); assert(h.disk.has('old.js')); assert(h.logs.some(line => line.includes('may be running')));
h.state.running.clear(); await h.run(); assert(!h.disk.has('old.js'));
for (const failure of ['http', 'tree-error', 'truncated', 'unsafe-tree']) {
  h = await managed(); h.state.failure = failure; await h.run();
  assert(h.disk.has('old.js'), failure); assert.equal(h.removals.length, 0); assert(h.logs.some(line => line.includes('Cleanup skipped')));
}
h = await managed(); h.state.denyDownload = 'main.js'; await h.run();
assert(h.disk.has('old.js')); assert.equal(h.removals.length, 0);
h = await managed(); await h.run({download: ['main.js'], 'new-file': ['unrequested.js']});
assert.equal(h.reads.length, 0); assert(h.disk.has('old.js')); assert(h.logs.some(line => line.includes('Cleanup skipped')));
assert.deepEqual(h.updates.map(({path}) => path), ['main.js'], 'Explicit subset must not also fetch fallback hints');
for (const invalid of ['{bad json', JSON.stringify({...manifest, source: 'someone/else'}),
  JSON.stringify({...manifest, files: {'../old.js': digest('// old')}})]) {
  h = await managed(); h.disk.set(manifestPath, invalid); await h.run();
  assert(h.disk.has('old.js')); assert.equal(h.disk.get(manifestPath), invalid, 'Preserve invalid history for recovery');
}
for (const target of ['manifest.json', '/backups/']) {
  h = await managed(); h.state.writeFailure = target; await h.run();
  assert(h.disk.has('old.js')); assert.equal(h.removals.length, 0);
}
h = await managed(); h.state.editOnBackup = ['old.js', '// edited during backup'];
await h.run(); assert.equal(h.disk.get('old.js'), '// edited during backup'); assert.equal(h.removals.length, 0);
h = await managed({folder: 'copy', host: 'n00dles'}); h.disk.set('old.js', '// outside deployment');
await h.run(); assert(!h.disk.has('copy/old.js')); assert.equal(h.disk.get('old.js'), '// outside deployment');
assert(h.disk.has('copy/' + manifestPath));
h = await managed({folder: 'copy'}); h.state.failure = 'http'; await h.run();
assert(h.updates.every(({path}) => !path.startsWith('copy/copy/')), 'Fallback must not double-prefix deployment folders');
assert(h.disk.has('copy/old.js'));
h = await managed(); h.state.remote['stock-diagnostic.js'] = '// still in repo'; h.snapshot();
h.disk.set('stock-diagnostic.js', '// old diagnostic');
const oldManifest = JSON.parse(h.disk.get(manifestPath)); oldManifest.files['stock-diagnostic.js'] = digest('// old diagnostic');
h.disk.set(manifestPath, JSON.stringify(oldManifest)); await h.run();
assert(h.disk.has('stock-diagnostic.js'), 'Omitted downloads still count as present in the repository');
h = fixture({legacy: true, files: {'dev.js': dev}}); h.state.failure = 'catalog';
await h.run(); assert(h.disk.has('dev.js')); assert.equal(h.removals.length, 0);
h = fixture({legacy: true, files: {'dev.js': dev}}); h.state.catalog = {...catalog, source: 'wrong/repo'};
await h.run(); assert(h.disk.has('dev.js')); assert.equal(h.removals.length, 0);
h = await managed(); const crypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
try {
  Object.defineProperty(globalThis, 'crypto', {value: undefined, configurable: true});
  await h.run(); assert(h.disk.has('old.js')); assert.equal(h.removals.length, 0);
} finally {Object.defineProperty(globalThis, 'crypto', crypto);}
// The complete inventory wins over stale fallback hints and is pinned for all updates.
h = fixture(); await h.run({'new-file': ['retired-not-in-tree.js']});
assert(!h.updates.some(({path}) => path === 'retired-not-in-tree.js'));
assert(!h.logs.some(line => line.includes('Cleanup skipped')));
console.log('Git-pull cleanup checks passed: default sync without a flag, tracking, 38-file legacy catalog, no-write preview, verified backups, edit/running-file protection, pinned full trees, fallback/partial/failure refusal, and deployment scoping.');
