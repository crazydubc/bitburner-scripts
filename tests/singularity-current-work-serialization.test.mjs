import assert from 'node:assert/strict'
import fs from 'node:fs'
import {prepareSingularityResultForPort} from '../bin/singRun.js'

const rawCompanyWork = {
  type: 'COMPANY',
  cyclesWorked: 42,
  companyName: 'ECorp',
  nextCompletion: Promise.resolve(),
}
const rawFactionWork = {
  type: 'FACTION',
  cyclesWorked: 17,
  factionName: 'CyberSec',
  factionWorkType: 'hacking',
  nextCompletion: Promise.resolve(),
}

assert.throws(() => structuredClone(rawCompanyWork), /could not be cloned|DataCloneError/i)
assert.throws(() => structuredClone(rawFactionWork), /could not be cloned|DataCloneError/i)

const safeCompanyWork = prepareSingularityResultForPort('getCurrentWork', rawCompanyWork)
assert.deepEqual(safeCompanyWork, {
  type: 'COMPANY',
  cyclesWorked: 42,
  companyName: 'ECorp',
})
assert.doesNotThrow(() => structuredClone(safeCompanyWork))
assert.equal('nextCompletion' in safeCompanyWork, false)

const safeFactionWork = prepareSingularityResultForPort('getCurrentWork', rawFactionWork)
assert.deepEqual(safeFactionWork, {
  type: 'FACTION',
  cyclesWorked: 17,
  factionName: 'CyberSec',
  factionWorkType: 'hacking',
})
assert.doesNotThrow(() => structuredClone(safeFactionWork))
assert.equal('nextCompletion' in safeFactionWork, false)

assert.equal(prepareSingularityResultForPort('getCurrentWork', null), null)
assert.equal(prepareSingularityResultForPort('getCurrentWork', true), true)
assert.equal(prepareSingularityResultForPort('getPlayer', rawCompanyWork), rawCompanyWork)

const runner = fs.readFileSync(new URL('../bin/singRun.js', import.meta.url), 'utf8')
assert.match(runner, /fn !== "getCurrentWork"/)
assert.match(runner, /key !== "nextCompletion"/)
assert.match(runner, /prepareSingularityResultForPort\(fn, await f\(\.\.\.args\)\)/)

const sleeve = fs.readFileSync(new URL('../sleeve.js', import.meta.url), 'utf8')
assert.match(sleeve, /singRun\(ns, 'getCurrentWork'\)/)
assert.match(sleeve, /repAssignment\?\.type === 'FACTION'/)
assert.match(sleeve, /repAssignment\?\.type === 'COMPANY'/)

console.log('singularity current-work serialization regression checks passed')
