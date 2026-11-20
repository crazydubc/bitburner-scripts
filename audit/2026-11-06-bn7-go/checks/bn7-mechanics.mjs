// Verify the routing regression and its rationale against the pinned engine.
// node audit/2026-11-06-bn7-go/checks/bn7-mechanics.mjs ../bitburner-engine
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {selectAutoGoOpponent, selectGoBoard} from '../../../go-policy.js';
const root = new URL('../../../', import.meta.url);
const engine = resolve(process.argv[2] ?? '../bitburner-engine');
const old = await import('data:text/javascript;base64,' + Buffer.from(execFileSync('git', ['show', 'dd57f3f:go-policy.js'], {cwd: root})).toString('base64'));
const now = Date.now(), reset = {currentNode: 7, lastAugReset: now - 1000, lastNodeReset: now - 2000};
const args = {reset, now, context: {updatedAt: now, lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset,
  money: 1e10, reserve: 8e9, work: null, workKnown: true}};
assert.equal(old.selectAutoGoOpponent(args).opponent, 'The Black Hand');
assert.equal(selectAutoGoOpponent(args).opponent, 'Tetrads');
assert.equal(selectGoBoard({opponent: 'Tetrads', requested: 'profile'}).size, 5);

const bnSource = readFileSync(resolve(engine, 'src/BitNode/BitNode.tsx'), 'utf8');
const bn7 = bnSource.match(/case 7: \{\s*return new BitNodeMultipliers\((\{[\s\S]*?\})\);/);
assert(bn7, 'Official BN7 multiplier definition must be present');
const mults = Function('return (' + bn7[1] + ');')();
assert.equal(mults.HackingLevelMultiplier, 0.35); assert.equal(mults.HackExpGain, 0.25);
assert.equal(mults.BladeburnerRank, 0.6); assert.equal(mults.BladeburnerSkillCost, 2);

const effectSource = readFileSync(resolve(engine, 'src/Go/effects/effect.ts'), 'utf8');
const start = effectSource.indexOf('function calculateMults()');
const end = effectSource.indexOf('\nexport function playerHasDiscoveredGo', start);
assert(start >= 0 && end > start);
function effects(opponent) {
  return Function('defaultMultipliers', 'Go', 'GoOpponent', 'getRecordEntries', 'CalculateEffect',
    stripTypeScriptTypes(effectSource.slice(start, end)) + ';return calculateMults();')(
    () => ({hacking: 1, hacking_money: 1, strength: 1, defense: 1, dexterity: 1, agility: 1}),
    {stats: {[opponent]: {nodePower: 1}}}, {TheBlackHand: 'The Black Hand', Tetrads: 'Tetrads'}, Object.entries, () => 1.2);
}
assert.deepEqual(effects('The Black Hand'), {hacking: 1, hacking_money: 1.2, strength: 1, defense: 1, dexterity: 1, agility: 1});
assert.deepEqual(effects('Tetrads'), {hacking: 1, hacking_money: 1, strength: 1.2, defense: 1.2, dexterity: 1.2, agility: 1.2});
console.log('BN7 regression reproduced and fixed; official penalties and combat-versus-hacking-money bonuses verified.');
