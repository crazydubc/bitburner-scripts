// Node 24: node .../purchase-ram.mjs /path/to/bitburner-src
// Run the actual helper with the official effective costs and dynamic RAM enforcement.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {main as purchaseMain} from '../../../bin/purchase.js';
import {purchaseRam} from '../../../purchase-guard.js';

const engine = resolve(process.argv[2] ?? '../bitburner-engine');
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const costsSource = readFileSync(resolve(engine, 'src/Netscript/RamCostGenerator.ts'), 'utf8')
  .replace('import { Player } from "@player";', 'export const Player = {bitNodeN: 1, sf4: 3, activeSourceFileLvl() { return this.sf4; }};')
  .replace('import { NSFull } from "../NetscriptFunctions";', '');
const {getRamCost, RamCostConstants, Player} = await import(moduleUrl(stripTypeScriptTypes(costsSource)));
const functionCost = name => name === 'baseCost' ? RamCostConstants.Base : getRamCost(name.split('.'), true);

// Extract the actual enforcement/termination functions, keeping their ordering intact.
// The adapters replace logging, the worker registry and error rendering, not RAM arithmetic.
function engineFunction(file, name, dependencies) {
  const source = readFileSync(resolve(engine, file), 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing engine function ${name}`);
  const end = source.indexOf('\n}', start);
  assert(end > start);
  const body = stripTypeScriptTypes(source.slice(start, end + 2));
  return Function(...Object.keys(dependencies), `${body}\nreturn ${name};`)(...Object.values(dependencies));
}
const stopWorker = engineFunction('src/Netscript/killWorkerScript.ts', 'stopAndCleanUpWorkerScript', {
  ScriptDeath: Error, handleUnknownError: error => {throw error;}, removeWorkerScript: () => {},
});
const updateDynamicRam = engineFunction('src/Netscript/NetscriptHelpers.tsx', 'updateDynamicRam', {
  RamCostConstants, log: () => {}, errorMessage: (_ctx, message) => new Error(message),
  formatRam: value => String(value), killWorkerScript: stopWorker,
});

const oldGuardSource = execFileSync('git', ['show', '80e2cfb:purchase-guard.js'], {cwd: repo, encoding: 'utf8'});
const oldGuardUrl = moduleUrl(oldGuardSource);
const {purchaseRam: oldPurchaseRam} = await import(oldGuardUrl);
const oldHelperSource = execFileSync('git', ['show', '80e2cfb:bin/purchase.js'], {cwd: repo, encoding: 'utf8'})
  .replace("'../purchase-guard.js'", JSON.stringify(oldGuardUrl));
const {main: oldPurchaseMain} = await import(moduleUrl(oldHelperSource));

const cases = [
  ['stock', 'buyStock', ['AAA', 6], 'getPurchaseCost'],
  ['stock', 'buyShort', ['AAA', 6], 'getPurchaseCost'],
  ['stock', 'purchaseWseAccount', [], null],
  ['stock', 'purchaseTixApi', [], null],
  ['stock', 'purchase4SMarketData', [], null],
  ['stock', 'purchase4SMarketDataTixApi', [], null],
  ['cloud', 'purchaseServer', ['worker', 16], 'getServerCost'],
  ['cloud', 'upgradeServer', ['worker', 32], 'getServerUpgradeCost'],
  ['hacknet', 'purchaseNode', [], 'getPurchaseNodeCost'],
  ['hacknet', 'upgradeLevel', [0, 1], 'getLevelUpgradeCost'],
  ['hacknet', 'upgradeRam', [0, 1], 'getRamUpgradeCost'],
  ['hacknet', 'upgradeCore', [0, 1], 'getCoreUpgradeCost'],
  ['hacknet', 'upgradeCache', [0, 1], 'getCacheUpgradeCost'],
  ['singularity', 'upgradeHomeRam', [], 'getUpgradeHomeRamCost'],
  ['singularity', 'upgradeHomeCores', [], 'getUpgradeHomeCoresCost'],
  ['singularity', 'purchaseProgram', ['BruteSSH.exe'], 'getDarkwebProgramCost'],
  ['singularity', 'purchaseAugmentation', ['CyberSec', 'Aug'], 'getAugmentationPrice'],
  ['singularity', 'purchaseTor', [], null],
  ['gang', 'purchaseEquipment', ['member', 'gear'], 'getEquipmentCost'],
  ['sleeve', 'purchaseSleeveAug', [0, 'Aug'], 'getSleevePurchasableAugs'],
  ['sleeve', 'purchaseSleeve', [0], 'getSleeveCost'],
  ['sleeve', 'upgradeMemory', [0, 1], 'getMemoryUpgradeCost'],
  ['corporation', 'createCorporation', ['Company', true], null],
];
function runPurchase(testCase, {main = purchaseMain, initialRam, freeRam = Infinity} = {}) {
  const [namespace, method, args, quote] = testCase;
  const expectedResult = method === 'purchaseServer' ? 'worker' : method === 'purchaseNode' ? 0 :
    ['buyStock', 'buyShort'].includes(method) ? 10 : true;
  const cost = method === 'createCorporation' ? 150e9 : method === 'purchaseTor' ? 200e3 : 60;
  const replies = [], calls = [], allocations = [];
  let cash = 1e12;
  const ws = {dynamicLoadedFns: {}, dynamicRamUsage: RamCostConstants.Base,
    scriptRef: {ramUsage: initialRam, threads: 1}, env: {stopFlag: false, runningFn: ''}, atExit: new Map()};
  const api = {[method]: (...actualArgs) => {
    assert.deepEqual(actualArgs, args); calls.push(method); cash -= cost; return expectedResult;
  }};
  if (quote) api[quote] = (...actualArgs) => {
    if (namespace === 'stock') assert.equal(actualArgs[2], method === 'buyStock' ? 'L' : 'S');
    return quote === 'getSleevePurchasableAugs' ? [{name: 'Aug', cost}] : cost;
  };
  const raw = {
    pid: 42, args: [namespace, method, JSON.stringify(args), JSON.stringify({quotedCost: cost})],
    enums: {PositionType: {Long: 'L', Short: 'S'}},
    getPortHandle: () => ({write: value => replies.push(structuredClone(value))}),
    atExit: fn => ws.atExit.set('default', fn), getFunctionRamCost: functionCost,
    getHostname: () => 'home', read: () => '8000000000', getServerMoneyAvailable: () => cash,
    getMoneySources: () => ({sinceInstall: {casino: 10e9}}),
    ramOverride: requested => {
      const rounded = Math.round(requested * 100) / 100;
      if (rounded >= Math.round(ws.dynamicRamUsage * 100) / 100 &&
          rounded - ws.scriptRef.ramUsage <= freeRam + 1e-10) {
        freeRam -= rounded - ws.scriptRef.ramUsage;
        ws.scriptRef.ramUsage = rounded;
      }
      allocations.push(ws.scriptRef.ramUsage);
      return ws.scriptRef.ramUsage;
    },
    [namespace]: api,
  };
  function wrap(object, path = []) {
    return new Proxy(object, {get(target, key) {
      const value = target[key], functionPath = [...path, key];
      if (typeof value === 'function') return (...parameters) => {
        assert.equal(ws.env.stopFlag, false, 'No API calls after termination');
        updateDynamicRam({workerScript: ws, function: key, functionPath: functionPath.join('.')},
          getRamCost(functionPath, true));
        return value(...parameters);
      };
      return path.length === 0 && key === namespace ? wrap(value, functionPath) : value;
    }});
  }
  main(wrap(raw));
  const killedDuringMain = ws.env.stopFlag;
  stopWorker(ws);
  assert.equal(replies.length, 1, 'Exactly one exit reply');
  return {reply: replies[0], calls, cash, allocations, killedDuringMain, dynamicRam: ws.dynamicRamUsage, cost, expectedResult};
}

// Preserve a real reproduction of the reported fallback: kill invokes atExit before catch assigns the error.
for (const testCase of cases.slice(0, 2)) {
  const [namespace, method] = testCase;
  const oldRam = oldPurchaseRam({getFunctionRamCost: functionCost}, namespace, method);
  const old = runPurchase(testCase, {main: oldPurchaseMain, initialRam: oldRam});
  assert.equal(old.reply, 'ERROR:Purchase helper exited before reporting its result');
  assert.equal(old.killedDuringMain, true);
  assert.equal(old.calls.length, 0, 'RAM enforcement stops the buy before it can spend');
  assert(Math.abs(old.dynamicRam - oldRam - 0.05) < 1e-9);
}

let verified = 0;
for (const [node, sf4] of [[1, 0], [1, 1], [1, 2], [1, 3], [4, 0]]) {
  Player.bitNodeN = node; Player.sf4 = sf4;
  for (const testCase of cases) {
    const [namespace, method] = testCase;
    const oldRam = oldPurchaseRam({getFunctionRamCost: functionCost}, namespace, method);
    const required = purchaseRam({getFunctionRamCost: functionCost}, namespace, method);
    // Include an old offloaded caller that still allocates the old amount.
    for (const initialRam of [required, oldRam]) {
      const current = runPurchase(testCase, {initialRam});
      assert.deepEqual(current.reply, {result: current.expectedResult, spent: current.cost, cost: current.cost},
        `${namespace}.${method} in BN${node}/SF4.${sf4} with initial ${initialRam} GB`);
      assert.equal(current.killedDuringMain, false);
      assert.equal(current.cash, 1e12 - current.cost);
      assert.deepEqual(current.calls, [method]);
      assert(current.dynamicRam <= required + 1e-9);
    }
    const denied = runPurchase(testCase, {initialRam: oldRam, freeRam: 0});
    assert.match(denied.reply, /ERROR:Error: Purchase helper requires .* GB/);
    assert.equal(denied.killedDuringMain, false, 'A denied increase returns an explicit error before spending');
    assert.equal(denied.calls.length, 0); assert.equal(denied.cash, 1e12);
    verified++;
  }
}
console.log(`Official dynamic RAM checks passed for ${cases.length} guarded operations across ${verified} BN/SF4 cases, including old-caller allocations and denied increases; reproduced the original stock exit failure`);
