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
  source.match(/const ROUND_ONE_SEED_FUNDED_EXPANSION_RESERVE = [^\n]+/)?.[0],
  source.match(/const ROUND_ONE_HOME_OFFICE_TARGET = [^\n]+/)?.[0],
].join('\n')
assert.doesNotMatch(constants, /undefined/)
const moduleSource = [
  constants,
  extractFunction('canAffordCorporationPurchase'),
  extractFunction('isRoundOneBootstrapReady'),
  extractFunction('getRoundOneExpansionReserve'),
  extractFunction('getRoundOneAdvertTarget'),
  extractFunction('getRoundOneOfficeTarget'),
  extractFunction('getRoundOneJobPlan'),
  extractFunction('canRunBoostMaterialOptimization'),
].join('\n')
const strategy = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`)

assert.equal(strategy.getRoundOneExpansionReserve(1, 6, false), 1e9)
assert.equal(strategy.getRoundOneExpansionReserve(5, 6, false), 1e9)
assert.equal(strategy.getRoundOneExpansionReserve(6, 6, false), 5e9)
assert.equal(strategy.getRoundOneExpansionReserve(1, 6, true), 5e9)
assert.equal(strategy.getRoundOneExpansionReserve(5, 6, true), 5e9)
assert.equal(strategy.getRoundOneAdvertTarget(1), 0)
assert.equal(strategy.getRoundOneAdvertTarget(6), 2)

assert.equal(strategy.getRoundOneOfficeTarget('Sector-12', 1, 6, true), 6)
assert.equal(strategy.getRoundOneOfficeTarget('Aevum', 1, 6, true), 3)
assert.equal(strategy.getRoundOneOfficeTarget('Sector-12', 1, 6, false), 3)
assert.equal(strategy.getRoundOneOfficeTarget('Aevum', 6, 6, true), 4)

assert.equal(strategy.canAffordCorporationPurchase(10e9, 9e9, 5e9), false)
assert.equal(strategy.canAffordCorporationPurchase(14e9, 9e9, 5e9), true)

assert.equal(strategy.isRoundOneBootstrapReady(null, {
  numEmployees: 3,
  employeeJobs: {Operations: 1, Engineer: 1, Business: 1},
}), true)
assert.equal(strategy.isRoundOneBootstrapReady(null, {
  numEmployees: 3,
  employeeJobs: {Operations: 1, Engineer: 1, Business: 0},
}), false)

assert.deepEqual(strategy.getRoundOneJobPlan(3, 'Sector-12', 1, 0, 6, true), {
  Operations: 1, Engineer: 1, Business: 1, Management: 0,
  'Research & Development': 0, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Sector-12', 1, 0, 6, true), {
  Operations: 1, Engineer: 1, Business: 1, Management: 1,
  'Research & Development': 0, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(6, 'Sector-12', 1, 0, 6, true), {
  Operations: 2, Engineer: 2, Business: 1, Management: 1,
  'Research & Development': 0, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Sector-12', 2, 0, 6, false), {
  Operations: 1, Engineer: 1, Business: 1, Management: 0,
  'Research & Development': 1, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Aevum', 6, 0, 6, true), {
  Operations: 0, Engineer: 0, Business: 0, Management: 0,
  'Research & Development': 4, Intern: 0,
})
assert.deepEqual(strategy.getRoundOneJobPlan(4, 'Aevum', 6, 60, 6, true), {
  Operations: 1, Engineer: 1, Business: 1, Management: 1,
  'Research & Development': 0, Intern: 0,
})

// The reported two-city optimizer wants roughly $3.2b of Real Estate while only $1b remains.
assert.equal(strategy.canRunBoostMaterialOptimization(1e9, 3.2e9, 5e9), false)
assert.equal(strategy.canRunBoostMaterialOptimization(10e9, 1.6e9, 5e9), true)
assert.equal(strategy.canRunBoostMaterialOptimization(-1.8e9, 0, 5e9), false)

assert.match(source, /allowExpansion: false/)
assert.match(source, /manageRoundOneBoostMaterials/)
assert.match(source, /Stopped boost-material purchases and liquidating them at market price/)
assert.match(source, /const officeTarget = getRoundOneOfficeTarget/)
assert.doesNotMatch(source, /const ROUND_ONE_EXPANSION_RESERVE = 1e9/)

console.log('corporation bootstrap-capital regression checks passed')
