// Render the real React/MUI input; run production scan.js and the official Enter handler.
// Usage/dependency installation: ../2026-10-23-scan-regression.md
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire, stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {main as scan} from '../../../scan.js';
import {sendTerminalCommand} from '../../../terminal-ui.js';

assert.ok(process.argv[2] && process.argv[3], 'Pass the engine checkout and UI dependency directory');
const engine = resolve(process.argv[2]), repo = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(resolve(process.argv[3], 'package.json'));
const lock = JSON.parse(readFileSync(resolve(engine, 'package-lock.json'), 'utf8'));
for (const name of ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'])
  assert.equal(require(name + '/package.json').version, lock.packages['node_modules/' + name].version, name);

const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><ul id="terminal"></ul></body></html>',
  {url: 'http://localhost/', pretendToBeVisual: true});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node'])
  Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
// ReactDOM must load after the DOM, exactly as it does in the game.
const React = require('react'), ReactDOM = require('react-dom'), {TextField} = require('@mui/material');

const source = readFileSync(resolve(engine, 'src/Terminal/ui/TerminalInput.tsx'), 'utf8');
const start = source.indexOf('  async function onKeyDown(');
const end = source.indexOf('\n  return (\n    <>\n      <TextField', start);
assert.ok(start >= 0 && end > start);
const change = source.match(/  function handleValueChange\([\s\S]+?\n  }/)[0];
const handlers = Function('value', 'searchResults', 'state', `
  const {Terminal, Player, saveValue, resetSearch, terminalInput,
    setPossibilities, setSearchResults, setAutofilledValue} = state;
  const KEY = {ENTER: 'Enter'}, searchResultsIndex = 0;
  ${stripTypeScriptTypes(source.slice(start, end) + '\n' + change, {mode: 'transform'})}
  return {onKeyDown, handleValueChange};
`);
const commands = [], errors = [], root = document.getElementById('root');
function TerminalInput({variant, initial = '', history = []}) {
  const [value, setValue] = React.useState(initial), [searchResults, setSearchResults] = React.useState(history);
  const [, setPossibilities] = React.useState([]), [, setAutofilledValue] = React.useState(false);
  const terminalInput = React.useRef(null);
  const resetSearch = () => setSearchResults([]);
  const {onKeyDown, handleValueChange} = handlers(value, searchResults, {
    terminalInput, saveValue: setValue, resetSearch, setPossibilities, setSearchResults, setAutofilledValue,
    Player: {getCurrentServer: () => ({hostname: 'home'})},
    Terminal: {print() {}, cwd: () => '', executeCommands: text => commands.push(text)},
  });
  return React.createElement(TextField, {variant, fullWidth: true, autoFocus: true, value,
    onChange: handleValueChange, inputRef: terminalInput, InputProps: {
      id: 'terminal-input', spellCheck: false,
      onBlur: () => { setPossibilities([]); resetSearch(); },
      onKeyDown: event => { onKeyDown(event).catch(error => errors.push(error)); },
    }});
}
function mount(props) {
  ReactDOM.unmountComponentAtNode(root);
  commands.length = 0; errors.length = 0;
  document.getElementById('terminal').replaceChildren();
  ReactDOM.render(React.createElement(TerminalInput, props), root);
  return document.getElementById('terminal-input');
}

const graph = {home: ['n00dles', 'foodnstuff'], n00dles: ['home', 'CSEC'],
  foodnstuff: ['home', 'I.I.I.I'], CSEC: ['n00dles'], 'I.I.I.I': ['foodnstuff']};
const server = host => ({hostname: host, requiredHackingSkill: 1, hasAdminRights: true,
  purchasedByPlayer: host === 'home', backdoorInstalled: host === 'I.I.I.I',
  moneyMax: 0, moneyAvailable: 0, hackDifficulty: 1, minDifficulty: 1, maxRam: 8, ramUsed: 0});
const ns = {getScriptName: () => 'scan.js', read: () => '', flags: () => ({'hide-stats': false}), print() {},
  getHackingLevel: () => 3000, getServer: server, ls: () => [], scan: host => [...graph[host]]};
const click = async (input, host, selector, blur) => {
  if (blur) input.blur();
  const before = commands.length;
  document.getElementById(host).querySelector(selector).click();
  await Promise.resolve();
  assert.equal(commands.length, before + 1, 'Each visible link submits exactly once');
  assert.deepEqual(errors, []);
  assert.equal(input.value, '', 'Game handler clears the submitted command');
  return commands.at(-1);
};

const oldSource = execFileSync('git', ['show', '7a287d1:terminal-ui.js'], {cwd: repo, encoding: 'utf8'});
const {sendTerminalCommand: broken} = await import('data:text/javascript;base64,' + Buffer.from(oldSource).toString('base64'));
for (const variant of ['standard', 'outlined', 'filled']) {
  // The previous fixture had focus() {} and therefore missed MUI restoring the old value.
  let input = mount({variant}); input.blur();
  await assert.rejects(broken(document, 'home;connect CSEC', {timeout: 250}), /Terminal input changed/);
  assert.deepEqual(commands, []);

  // Keep the optional compatibility helper correct too, although scan no longer imports it.
  input = mount({variant}); input.blur();
  await sendTerminalCommand(document, 'home;connect CSEC', {timeout: 250});
  assert.deepEqual(commands, ['home;connect CSEC']);
  assert.deepEqual(errors, []);

  for (const blur of [false, true]) {
    input = mount({variant, initial: 'old command', history: ['old-history-suggestion']});
    scan(ns); // The real main returns before its generated links are clicked.
    assert.equal(await click(input, 'CSEC', '.server', blur), 'home;connect n00dles;connect CSEC');
    assert.equal(await click(input, 'CSEC', '.backdoor a', blur), 'home;connect n00dles;connect CSEC;backdoor');
    assert.equal(await click(input, 'I.I.I.I', '.server', blur), 'connect I.I.I.I');
    assert.equal(await click(input, 'home', '.server', blur), 'home');
  }
}
ReactDOM.unmountComponentAtNode(root);
dom.window.close();
console.log('Real React 17/MUI 5 input: previous focus regression reproduced in three variants; restored scan server/backdoor links pass with focused and blurred input, old command/history, and post-main clicks. Compatibility helper also passes.');
// React 17's browser scheduler owns a MessageChannel in this Node DOM harness.
process.exit(0);
