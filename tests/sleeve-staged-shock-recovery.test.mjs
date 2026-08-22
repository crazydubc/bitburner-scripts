import assert from 'node:assert/strict'
import fs from 'node:fs'
import {getStagedShockRecoveryPlan} from '../sleeve.js'

const sleeve = (shock, sync = 100) => ({shock, sync})

// Even below the old 97% mandatory threshold, an all-shocked fleet must designate exactly one recovery sleeve.
let plan = getStagedShockRecoveryPlan([
  sleeve(80), sleeve(70), sleeve(90),
])
assert.equal(plan.active, true)
assert.equal(plan.mode, 'prime')
assert.equal(plan.anchor, 1)
assert.deepEqual(plan.recoverySleeves, [1])
assert.deepEqual(plan.workSleeves, [0, 2])

// Preserve a current recovery anchor so the selected sleeve does not thrash between assignments.
plan = getStagedShockRecoveryPlan([
  sleeve(90), sleeve(80), sleeve(70),
], [], {active: true, mode: 'prime', anchor: 0})
assert.equal(plan.anchor, 0)
assert.deepEqual(plan.recoverySleeves, [0])

// A cached recovery assignment is preferred after a script restart.
plan = getStagedShockRecoveryPlan([
  sleeve(90), sleeve(80), sleeve(70),
], ['commit Homicide', 'recover from shock', 'commit Homicide'])
assert.equal(plan.anchor, 1)

// Once one sleeve reaches zero shock, it works while every remaining shocked sleeve recovers.
plan = getStagedShockRecoveryPlan([
  sleeve(0), sleeve(55), sleeve(20),
], [], {active: true, mode: 'prime', anchor: 0})
assert.equal(plan.mode, 'drain')
assert.equal(plan.anchor, 0)
assert.deepEqual(plan.recoverySleeves, [1, 2])
assert.deepEqual(plan.workSleeves, [0])

// Additional sleeves return to work as they finish recovery.
plan = getStagedShockRecoveryPlan([
  sleeve(0), sleeve(55), sleeve(0),
], [], {active: true, mode: 'drain', anchor: 0})
assert.deepEqual(plan.recoverySleeves, [1])
assert.deepEqual(plan.workSleeves, [0, 2])

// Unsynchronized sleeves remain outside the recovery roster until synchronization completes.
plan = getStagedShockRecoveryPlan([
  sleeve(60), sleeve(100, 80),
])
assert.equal(plan.mode, 'prime')
assert.deepEqual(plan.recoverySleeves, [0])
assert.deepEqual(plan.workSleeves, [])

plan = getStagedShockRecoveryPlan([
  sleeve(0), sleeve(0), sleeve(0),
])
assert.equal(plan.active, false)
assert.equal(plan.mode, 'none')
assert.deepEqual(plan.recoverySleeves, [])
assert.deepEqual(plan.workSleeves, [0, 1, 2])

const source = fs.readFileSync(new URL('../sleeve.js', import.meta.url), 'utf8')
assert.match(source, /getStagedShockRecoveryPlan\(\s*sleeveInfo, task, stagedShockRecoveryState/)
assert.match(source, /if \(stagedRecoverySleeve\)/)
assert.match(source, /if \(!stagedRecoveryActive\)/)
assert.match(source, /sleeve\.shock > 0 && !stagedRecoveryActive/)

console.log('staged sleeve shock recovery regression checks passed')