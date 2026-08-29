import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  hasActiveSleeveTask,
  isSleeveApiError,
  isSleeveAssignmentSuccessful,
  shouldPrioritizeGangKarma,
  shouldRerollShockRecovery,
} from '../sleeve.js'

assert.equal(isSleeveAssignmentSuccessful(true), true)
assert.equal(isSleeveAssignmentSuccessful(false), false)
assert.equal(isSleeveAssignmentSuccessful('ERROR:temporary helper failure'), false)
assert.equal(isSleeveApiError('ERROR:temporary helper failure'), true)
assert.equal(isSleeveApiError(true), false)

assert.equal(hasActiveSleeveTask({type: 'CRIME', crimeType: 'Homicide'}), true)
assert.equal(hasActiveSleeveTask({type: 'RECOVERY'}), true)
assert.equal(hasActiveSleeveTask(null), false)
assert.equal(hasActiveSleeveTask('ERROR:getTask failed'), false)

assert.equal(shouldRerollShockRecovery(61_000, 0, 61_000), true)
assert.equal(shouldRerollShockRecovery(60_999, 0, 61_000), false)
assert.equal(shouldRerollShockRecovery(122_000, 61_000, 61_000), true)

assert.equal(shouldPrioritizeGangKarma(false, false, true, -10_000), true)
assert.equal(shouldPrioritizeGangKarma(false, false, true, -54_000), false)
assert.equal(shouldPrioritizeGangKarma(true, false, true, -10_000), false)
assert.equal(shouldPrioritizeGangKarma(false, true, true, -10_000), false)
assert.equal(shouldPrioritizeGangKarma(false, false, false, -10_000), false)

const source = fs.readFileSync(new URL('../sleeve.js', import.meta.url), 'utf8')
const karmaIndex = source.indexOf('if (gangKarmaPriority)')
const trainingIndex = source.indexOf("// Train if our sleeve's physical stats")
const followIndex = source.indexOf("if (repAssignment?.type === 'FACTION')")
assert.ok(karmaIndex >= 0 && karmaIndex < trainingIndex && karmaIndex < followIndex,
  'gang karma must take precedence over training and player-follow work')
assert.match(source, /await sleeveRun\(ns, 'travel', i, ns\.enums\.CityName\.Sector12\)/)
assert.doesNotMatch(source, /while \(sleeve\.city != ns\.enums\.CityName/)
assert.match(source, /const actualTask = await sleeveRun\(ns, 'getTask', i\)/)
assert.doesNotMatch(source, /if \(\(await sleeveRun\(ns, command, \.\.\.args\)\)\)/)
assert.match(source, /playerInGang = inGangResult === true/)

console.log('sleeve gang-karma and idle-task regression checks passed')
