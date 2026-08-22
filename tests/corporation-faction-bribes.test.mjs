import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  calculateFactionBribeAmount,
  getFactionBribeReserve,
  selectFactionBribeTarget,
} from '../corporation-bribes.js'

assert.equal(getFactionBribeReserve(500e18, 1e15), 250e18)
assert.equal(getFactionBribeReserve(1e18, 0), 1e18)
assert.equal(getFactionBribeReserve(10e18, 20e15), 12e18)

assert.equal(calculateFactionBribeAmount({
  corporationFunds: 500e18,
  corporationValuation: 200e12,
  corporationExpenses: 1e15,
  currentRep: 0,
  targetRep: 1e6,
  bribeThreshold: 100e12,
  bribeAmountPerReputation: 1e9,
}), 1e15)

assert.equal(calculateFactionBribeAmount({
  corporationFunds: 500e18,
  corporationValuation: 99e12,
  currentRep: 0,
  targetRep: 1e6,
  bribeThreshold: 100e12,
  bribeAmountPerReputation: 1e9,
}), 0)

assert.equal(calculateFactionBribeAmount({
  corporationFunds: 1e18,
  corporationValuation: 200e12,
  currentRep: 0,
  targetRep: 1e6,
  bribeThreshold: 100e12,
  bribeAmountPerReputation: 1e9,
}), 0)

// The per-cycle cap prevents a large reputation target from consuming all excess funds at once.
assert.equal(calculateFactionBribeAmount({
  corporationFunds: 2e18,
  corporationValuation: 200e12,
  currentRep: 0,
  targetRep: 1e9,
  bribeThreshold: 100e12,
  bribeAmountPerReputation: 1e9,
}), 1e17)

const desired = new Set(['Starter', 'Prereq', 'High', 'Blocked'])
const baseTargetArgs = {
  augmentationNames: ['NeuroFlux Governor', 'Starter', 'Prereq', 'High', 'Blocked'],
  desiredAugSet: desired,
  ownedAugs: [],
  augRepReqs: {
    'NeuroFlux Governor': 1,
    Starter: 2_000,
    Blocked: 2_500,
    Prereq: 3_000,
    High: 5_000,
    Missing: 1_000,
  },
  augPrereqs: {
    High: ['Prereq'],
    Blocked: ['Missing'],
  },
}

assert.deepEqual(selectFactionBribeTarget({...baseTargetArgs, currentRep: 1_000}), {
  targetRep: 2_000,
  unlockedAugs: ['Starter'],
})
assert.deepEqual(selectFactionBribeTarget({...baseTargetArgs, currentRep: 2_500}), {
  targetRep: 3_000,
  unlockedAugs: ['Prereq'],
})
assert.deepEqual(selectFactionBribeTarget({...baseTargetArgs, currentRep: 3_000}), {
  targetRep: 5_000,
  unlockedAugs: ['High'],
})
assert.equal(selectFactionBribeTarget({
  ...baseTargetArgs,
  currentRep: 5_000,
  ownedAugs: ['Starter', 'Prereq', 'High'],
}), null)

const corporationSource = fs.readFileSync(new URL('../corporation.js', import.meta.url), 'utf8')
const utilsSource = fs.readFileSync(new URL('../utils.js', import.meta.url), 'utf8')
const pullSource = fs.readFileSync(new URL('../git-pull.js', import.meta.url), 'utf8')
const roundFive = corporationSource.indexOf('while (round >= 5)')
const bribeCall = corporationSource.indexOf('await manageActiveFactionBribe(ns, resetInfo)', roundFive)
const teaParty = corporationSource.indexOf('teaNeeded = await teaParty(ns)', roundFive)
assert.ok(roundFive >= 0 && teaParty > roundFive && bribeCall > teaParty,
  'post-round bribes should run after office and morale upkeep')
assert.match(corporationSource, /import \{manageActiveFactionBribe\} from '\.\/corporation-bribes\.js'/)
assert.match(utilsSource, /"corporation-bribes\.js"/)
assert.match(pullSource, /corporation-bribes\.js/)

console.log('corporation active-faction bribe regression checks passed')
