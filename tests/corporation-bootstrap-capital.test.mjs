import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../corporation.js', import.meta.url), 'utf8')

function extractFunction(name) {
  const marker = `export function ${name}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${name} should be exported`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') {
      depth--
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`Unable to extract ${name}`)
}

const constants = [
  source.match(/const ROUND_ONE_OPERATING_RESERVE = [^\n]+/)?.[0],
  source.match(/const ROUND_ONE_EXPANSION_RESERVE = [^\n]+/)?.[0],
].join('\n')
assert.doesNotMatch(constants, /undefined/)
const moduleSource = [
  constants,
  extractFunction('canAffordCorporationPurchase'),
  extractFunction('isRoundOneBootstrapReady'),
  extractFunction('getRoundOneExpansionReserve'),
  extractFunction('getRoundOneAdvertTarget'),
  extractFunction('getRoundOneJobPlan'),
].join('\n')
const strategy = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`)

assert.equal(strategy.getRoundOneExpansionReserve(1), 1e9)
assert.equal(strategy.getRoundOneExpansionReserve(5), 1e9)
assert.equal(strategy.getRoundOneExpansionReserve(6), 5e9)
assert.equal(strategy.getRoundOneAdvertTarget(1), 0)
assert.equal(strategy.getRoundOneAdvertTarget(5), 0)
assert.equal(strategy.getRoundOneAdvertTarget(6), 2)

// $10b after Agriculture + paid APIs can open a $9b office/warehouse pair with a $1b reserve.
assert.equal(strategy.canAffordCorporationPurchase(10e9, 9e9, strategy.getRoundOneExpansionReserve(1)), true)
assert.equal(strategy.canAffordCorporationPurchase(10e9, 9e9, 5e9), false)

assert.equal(strategy.isRoundOneBootstrapReady(null, {
  numEmployees: 3,
  employeeJobs: {Operations: 1, Engineer: 1, Business: 1},
}), true)
assert.equal(strategy.isRoundOneBootstrapReady(null, {
  numEmployees: 3,
  employeeJobs: {Operations: 1, Engineer: 1, Business: 0},
}), false)

assert.deepEqual(strategy.getRoundOneJobPlan(3, 'Sector-12', 1, 0), {
  Operations: 1, Engineer: 1, Business: 1, Management: 0,
  'Research & Development': 0, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Sector-12', 2, 0), {
  Operations: 1, Engineer: 1, Business: 1, Management: 0,
  'Research & Development': 1, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Aevum', 6, 0), {
  Operations: 0, Engineer: 0, Business: 0, Management: 0,
  'Research & Development': 4, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Sector-12', 6, 0), {
  Operations: 1, Engineer: 1, Business: 1, Management: 0,
  'Research & Development': 1, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Aevum', 6, 60), {
  Operations: 1, Engineer: 1, Business: 1, Management: 1,
  'Research & Development': 0, Intern: 0,
})

assert.match(source, /allowExpansion: true/)
assert.match(source, /const advertTarget = getRoundOneAdvertTarget/)
assert.match(source, /Hacknet corporation-fund sales are optional acceleration, not a prerequisite/)
assert.doesNotMatch(source, /await hireAdVertsUpTo\(ns, div1, 2\)/)

console.log('corporation bootstrap-capital regression checks passed')
