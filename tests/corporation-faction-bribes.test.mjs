import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  calculateFactionBribeAmount,
  getFactionBribeReserve,
  selectFactionBribeTarget,
} from '../corporation-bribes.js'
import {shouldStartCorporationBribeManager} from '../bin/corpRun.js'

assert.equal(getFactionBribeReserve(500e18, 1e15), 250e18)
assert.equal(getFactionBribeReserve(1e18, 0), 1e18)
assert.equal(getFactionBribeReserve(10e18, 20e15), 10e18)

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

// Spend at most 25% of excess: $2e18 funds, $1e18 reserve => $250q per pass.
assert.equal(calculateFactionBribeAmount({
  corporationFunds: 2e18,
  corporationValuation: 200e12,
  currentRep: 0,
  targetRep: 1e9,
  bribeThreshold: 100e12,
  bribeAmountPerReputation: 1e9,
}), 250e15)

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

assert.equal(shouldStartCorporationBribeManager('getInvestmentOffer', {round: 4}), false)
assert.equal(shouldStartCorporationBribeManager('getInvestmentOffer', {round: 5}), true)
assert.equal(shouldStartCorporationBribeManager('getCorporation', {round: 5}), false)
assert.equal(shouldStartCorporationBribeManager('getInvestmentOffer', undefined), false)

const managerSource = fs.readFileSync(new URL('../corporation-bribes.js', import.meta.url), 'utf8')
const runnerSource = fs.readFileSync(new URL('../bin/corpRun.js', import.meta.url), 'utf8')
const launcherSource = fs.readFileSync(new URL('../bin/startCorporationBribes.js', import.meta.url), 'utf8')
const pullSource = fs.readFileSync(new URL('../git-pull.js', import.meta.url), 'utf8')
assert.match(managerSource, /Number\(offer\?\.round\) >= 5/)
assert.match(managerSource, /work\.type !== 'FACTION'/)
assert.match(managerSource, /corpRun\(ns, 'bribe', faction, amount\)/)
assert.match(managerSource, /buildDesiredAugSet/)
assert.match(managerSource, /getDefaultDesiredStats/)
assert.match(managerSource, /aug !== NEUROFLUX/)
assert.match(runnerSource, /ns\.exec\(BRIBE_MANAGER_LAUNCHER, "home"/)
assert.match(launcherSource, /ns\.exec\(BRIBE_MANAGER_SCRIPT, "home"/)
assert.match(launcherSource, /START_TIMEOUT = 30_000/)
assert.match(runnerSource, /ensureCorporationBribeManager\(ns, fn, response\)/)
assert.match(pullSource, /corporation-bribes\.js/)
assert.match(pullSource, /bin\/startCorporationBribes\.js/)

const responseAssignment = runnerSource.indexOf('response = await f(...args);')
const apiFailureFallback = runnerSource.indexOf('response = undefined;', responseAssignment)
const managerLaunch = runnerSource.indexOf('ensureCorporationBribeManager(ns, fn, response);', apiFailureFallback)
assert.ok(responseAssignment >= 0 && apiFailureFallback > responseAssignment && managerLaunch > apiFailureFallback,
  'manager startup must not change a valid Corporation API response')

console.log('corporation active-faction bribe regression checks passed')
