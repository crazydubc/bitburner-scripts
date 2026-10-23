// Exercise the real game Enter handler with delayed React renders.
// node .../terminal-ui.mjs /path/to/bitburner-src
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {sendTerminalCommand} from '../../../terminal-ui.js';

assert.ok(process.argv[2], 'Pass the official Bitburner source checkout');
const source = readFileSync(resolve(process.argv[2], 'src/Terminal/ui/TerminalInput.tsx'), 'utf8');
const start = source.indexOf('  async function onKeyDown(');
const end = source.indexOf('\n  return (\n    <>\n      <TextField', start);
assert.ok(start >= 0 && end > start, 'Find the official terminal keyboard handler');
const keyboardHandler = stripTypeScriptTypes(source.slice(start, end), {mode: 'transform'});
const makeHandler = Function('value', 'searchResults', 'state', `
  const {Terminal, Player, saveValue, resetSearch, terminalInput} = state;
  const KEY = {ENTER: 'Enter'}, searchResultsIndex = 0;
  ${keyboardHandler}
  return onKeyDown;
`);

function fixture({renderDelay = 75, beforeRender = () => {}, initial = 'old-command'} = {}) {
  let clock = 0, pending = null, cancelled = false;
  const commands = [], prints = [];
  const input = {value: initial, disabled: false, focus() {}};
  let visible = input;
  const state = {
    terminalInput: {current: input},
    Terminal: {print: text => prints.push(text), cwd: () => '', executeCommands: text => commands.push(text)},
    Player: {getCurrentServer: () => ({hostname: 'home'})},
    saveValue: value => { input.value = value; }, resetSearch() {},
  };
  function render(value, searchResults = []) {
    input.__reactProps$test = {
      value,
      onChange: event => { pending = {value: event.target.value, at: clock + renderDelay}; },
      onKeyDown: makeHandler(value, searchResults, state),
    };
  }
  render(initial, ['old-history-suggestion']);
  const f = {
    input, commands, prints, render,
    doc: {getElementById: id => id === 'terminal-input' ? visible : null},
    hide: () => { visible = null; }, cancel: () => { cancelled = true; },
    options: {now: () => clock, timeout: 250, canContinue: () => !cancelled,
      sleep: async ms => {
        clock += ms;
        beforeRender(f, clock);
        if (pending && clock >= pending.at) { render(pending.value); pending = null; }
      }},
  };
  return f;
}

// The old immediate onChange/Enter sequence executes old component state/history.
{
  const f = fixture();
  f.input.value = 'home;connect CSEC;backdoor';
  f.input.__reactProps$test.onChange({target: f.input});
  await f.input.__reactProps$test.onKeyDown({key: 'Enter', preventDefault() {}});
  assert.deepEqual(f.commands, ['old-history-suggestion']);
}

// Waiting for the committed value also lets the game clear its history selection.
for (const renderDelay of [0, 75, 200]) {
  const f = fixture({renderDelay});
  await sendTerminalCommand(f.doc, 'home;connect CSEC;backdoor', f.options);
  assert.deepEqual(f.commands, ['home;connect CSEC;backdoor']);
  assert.equal(f.prints.length, 1);
}
{
  const f = fixture({beforeRender: (f, clock) => { if (clock === 25) f.render('unrelated-render'); }});
  await sendTerminalCommand(f.doc, 'run scan.js', f.options);
  assert.deepEqual(f.commands, ['run scan.js'], 'An unrelated rerender is not readiness');
}

// Navigation, manual input, busy terminal, cancellation and stalled renders never submit.
for (const [beforeRender, expected] of [
  [f => f.hide(), /Terminal changed/],
  [f => { f.input.value = 'user-is-typing'; }, /Terminal input changed/],
  [f => { f.input.disabled = true; }, /Terminal changed/],
  [f => f.cancel(), /cancelled/],
  [f => { delete f.input.__reactProps$test; }, /controls are unavailable/],
]) {
  const f = fixture({beforeRender});
  await assert.rejects(sendTerminalCommand(f.doc, 'run scan.js', f.options), expected);
  assert.deepEqual(f.commands, []);
}
for (const renderDelay of [250, Infinity]) {
  const f = fixture({renderDelay});
  await assert.rejects(sendTerminalCommand(f.doc, 'run scan.js', f.options), /in time/);
  assert.deepEqual(f.commands, []);
}
for (const command of ['', '  ', 'run scan.js\nbackdoor', undefined]) {
  const f = fixture();
  await assert.rejects(sendTerminalCommand(f.doc, command, f.options), /one nonempty/);
  assert.deepEqual(f.commands, []);
}
for (const unavailable of [f => f.hide(), f => { f.input.disabled = true; }]) {
  const f = fixture(); unavailable(f);
  await assert.rejects(sendTerminalCommand(f.doc, 'run scan.js', f.options), /Open Terminal/);
  assert.deepEqual(f.commands, []);
}

console.log('Official terminal Enter handler: stale input/history reproduced; delayed renders, exact command, navigation/input/busy cancellation and bounded timeout checks passed.');
