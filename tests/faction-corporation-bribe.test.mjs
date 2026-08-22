import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../work-for-faction2.js', import.meta.url), 'utf8')

function extractFunction(marker) {
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${marker} should exist`)
  const signatureEnd = source.indexOf(') {', start)
  assert.notEqual(signatureEnd, -1, `${marker} should have a function body`)
  const open = signatureEnd + 2
  let depth = 0
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') {
      depth--
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`Unable to extract ${marker}`)
}

const constants = [
  source.match(/const CORPORATION_BRIBE_MIN_RESERVE = [^\n]+/)?.[0],
  source.match(/const CORPORATION_BRIBE_OPERATING_RESERVE_SECONDS = [^\n]+/)?.[0],
].join('\n')
assert.doesNotMatch(constants, /undefined/)
const helperSource = `${constants}\n${extractFunction('export function getCorporationBribeAmount')}`
const strategy = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)

assert.equal(strategy.getCorporationBribeAmount({
  funds: 10e18,
  expenses: 1e15,
  currentRep: 1e6,
  targetRep: 3e6,
  bribeAmountPerReputation: 1e9,
}), 2e15)

// Do not make partial bribes: $1q available above reserve cannot pay a $2q target.
assert.equal(strategy.getCorporationBribeAmount({
  funds: 1.001e18,
  expenses: 0,
  currentRep: 1e6,
  targetRep: 3e6,
  bribeAmountPerReputation: 1e9,
}), 0)

// Ten minutes of expenses can be the binding reserve.
assert.equal(strategy.getCorporationBribeAmount({
  funds: 3.001e18,
  expenses: 5e15,
  currentRep: 1e6,
  targetRep: 3e6,
  bribeAmountPerReputation: 1e9,
}), 0)

assert.equal(strategy.getCorporationBribeAmount({
  funds: 10e18,
  currentRep: 3e6,
  targetRep: 3e6,
  bribeAmountPerReputation: 1e9,
}), 0)

const bribeRuntime = extractFunction('async function tryCorporationBribe')
const executeRuntime = extractFunction('async function executeRepPlan')
assert.match(source, /getServ, corpRun/)
assert.match(bribeRuntime, /corpRun\(ns, "hasCorporation"\)/)
assert.match(bribeRuntime, /corpRun\(ns, "getCorporation"\)/)
assert.match(bribeRuntime, /corpRun\(ns, "getConstants"\)/)
assert.match(bribeRuntime, /corpRun\(ns, "bribe", plan\.faction, amount\)/)
assert.doesNotMatch(bribeRuntime, /round/i)
assert.ok(executeRuntime.indexOf('tryCorporationBribe(plan)') < executeRuntime.indexOf('detectBestFactionWork'),
  'executeRepPlan should try the exact corporation bribe before starting faction work')

console.log('faction corporation-bribe regression checks passed')
