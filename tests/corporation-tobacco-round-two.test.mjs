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
  source.match(/const ROUND_TWO_TOBACCO_HOME_OFFICE_TARGET = [^\n]+/)?.[0],
].join('\n')
assert.doesNotMatch(constants, /undefined/)
const moduleSource = [
  constants,
  extractFunction('hasStartedProduct'),
  extractFunction('getRoundTwoTobaccoOfficeTarget'),
  extractFunction('getRoundTwoTobaccoJobPlan'),
].join('\n')
const strategy = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`)

assert.equal(strategy.hasStartedProduct({products: []}), false)
assert.equal(strategy.hasStartedProduct({products: ['Prod v1']}), true)
assert.equal(strategy.hasStartedProduct(null), false)
assert.equal(strategy.getRoundTwoTobaccoOfficeTarget('Sector-12'), 10)
assert.equal(strategy.getRoundTwoTobaccoOfficeTarget('Aevum'), 3)
assert.deepEqual(strategy.getRoundTwoTobaccoJobPlan(10, 'Sector-12', false), {
  Operations: 3, Engineer: 3, Business: 1, Management: 3,
  'Research & Development': 0, Intern: 0,
})
assert.deepEqual(strategy.getRoundTwoTobaccoJobPlan(3, 'Aevum', false), {
  Operations: 0, Engineer: 0, Business: 0, Management: 0,
  'Research & Development': 3, Intern: 0,
})
assert.deepEqual(strategy.getRoundTwoTobaccoJobPlan(3, 'Aevum', true), {
  Operations: 1, Engineer: 1, Business: 1, Management: 0,
  'Research & Development': 0, Intern: 0,
})

const roundTwoStart = source.indexOf('while (round === 2)')
const roundThreeStart = source.indexOf('while (round === 3 || round === 4)', roundTwoStart)
const roundTwo = source.slice(roundTwoStart, roundThreeStart)
assert.match(roundTwo, /await manageProducts\(ns\)/)
assert.match(roundTwo, /if \(hasDivDB\[div2\]\) await basicExporImport\(ns\)/)

const prepStart = source.indexOf('async function prep(ns)')
const prepEnd = source.indexOf('async function updateMisc(ns)', prepStart)
const prep = source.slice(prepStart, prepEnd)
const tobaccoCreate = prep.indexOf('expandCities(ns, div3, {')
const productGate = prep.indexOf('const productStarted = hasStartedProduct(tobacco)')
const tobaccoExpand = prep.indexOf('allowExpansion: true', productGate)
const chemicalExpand = prep.indexOf('expandCities(ns, div2, {', productGate)
assert.ok(tobaccoCreate >= 0 && productGate > tobaccoCreate &&
  tobaccoExpand > productGate && chemicalExpand > tobaccoExpand,
  'round two must create a Tobacco project before expanding Tobacco and Chemical')
assert.match(prep, /Market Research - Demand/)
assert.match(prep, /Market Data - Competition/)
assert.match(prep, /tobaccoInfrastructureReady[\s\S]*hasCompleteDivisionInfrastructure\(div3\)/)
assert.doesNotMatch(prep, /if \(round >= 3\) \{[\s\S]*?expandCities\(ns, div3\)/)

const tobaccoStart = source.indexOf('case "Tobacco"')
const tobaccoEnd = source.indexOf('case "Restaurant"', tobaccoStart)
const tobacco = source.slice(tobaccoStart, tobaccoEnd)
assert.match(tobacco, /case 2:/)
assert.match(tobacco, /ROUND_TWO_TOBACCO_RESERVE/)
assert.match(tobacco, /getRoundTwoTobaccoJobPlan/)
assert.match(tobacco, /!hasCompletedProduct/)

console.log('corporation Tobacco-first round-two regression checks passed')
