import assert from 'node:assert/strict'
import fs from 'node:fs'
import {prepareSleeveResultForPort} from '../bin/sleeveRun.js'

const rawTask = {
  type: 'CRIME',
  crimeType: 'Homicide',
  cyclesWorked: 15,
  cyclesNeeded: 150,
  actionId: {type: 'Crime', name: 'Homicide'},
  nextCompletion: Promise.resolve(),
}

assert.throws(() => structuredClone(rawTask), /could not be cloned|DataCloneError/i)

const safeTask = prepareSleeveResultForPort('getTask', rawTask)
assert.deepEqual(safeTask, {
  type: 'CRIME',
  crimeType: 'Homicide',
  cyclesWorked: 15,
  cyclesNeeded: 150,
  actionId: {type: 'Crime', name: 'Homicide'},
})
assert.doesNotThrow(() => structuredClone(safeTask))
assert.equal('nextCompletion' in safeTask, false)

assert.equal(prepareSleeveResultForPort('getTask', null), null)
assert.equal(prepareSleeveResultForPort('getTask', true), true)
assert.equal(prepareSleeveResultForPort('getSleeve', rawTask), rawTask)

const runner = fs.readFileSync(new URL('../bin/sleeveRun.js', import.meta.url), 'utf8')
assert.match(runner, /fn !== "getTask"/)
assert.match(runner, /key !== "nextCompletion"/)
assert.match(runner, /prepareSleeveResultForPort\(fn, await f\(\.\.\.args\)\)/)

console.log('sleeve task serialization regression checks passed')
