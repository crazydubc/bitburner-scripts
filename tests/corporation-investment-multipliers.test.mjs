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

const constantsStart = source.indexOf('const INVESTMENT_CAPITAL_TARGETS')
const constantsEnd = source.indexOf('let tobaccoBooster', constantsStart)
assert.ok(constantsStart >= 0 && constantsEnd > constantsStart)
const transitionFloor = source.match(/const ROUND_ONE_MINIMUM_TRANSITION_CAPITAL = [^\n]+/)?.[0]
assert.ok(transitionFloor, 'round-one transition floor should be defined')
const moduleSource = [
  source.slice(constantsStart, constantsEnd),
  transitionFloor,
  extractFunction('getInvestmentCapitalTarget'),
  extractFunction('getProjectedInvestmentCapital'),
  extractFunction('shouldTrackInvestmentPeak'),
  extractFunction('isInvestmentRoundOperationallyReady'),
  extractFunction('evaluateInvestmentPeak'),
].join('\n')
const strategy = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`)

assert.equal(strategy.getInvestmentCapitalTarget(1, 1), 440e9)
assert.equal(strategy.getInvestmentCapitalTarget(1, 0.75), 330e9)
assert.equal(strategy.getInvestmentCapitalTarget(1, 0.5), 220e9)
assert.equal(strategy.getInvestmentCapitalTarget(1, 0.2), 190e9)
assert.equal(strategy.getInvestmentCapitalTarget(1, 0.001), 190e9)
assert.equal(strategy.getInvestmentCapitalTarget(2, 0.5), 8.8e12)
assert.equal(strategy.getInvestmentCapitalTarget(3, 0.5), 12e15)
assert.equal(strategy.getInvestmentCapitalTarget(4, 0.5), 500e18)
assert.equal(strategy.getInvestmentCapitalTarget(5, 0.5), Infinity)

// BN10 can begin tracking at $220b actual projected capital, but never below the $190b transition floor.
assert.equal(strategy.shouldTrackInvestmentPeak(1, 200e9, 10e9, 0.5), false)
assert.equal(strategy.shouldTrackInvestmentPeak(1, 210e9, 10e9, 0.5), true)
assert.equal(strategy.shouldTrackInvestmentPeak(1, 170e9, 10e9, 0.2), false)
assert.equal(strategy.shouldTrackInvestmentPeak(1, 180e9, 10e9, 0.2), true)

assert.equal(strategy.isInvestmentRoundOperationallyReady(1, false), true)
assert.equal(strategy.isInvestmentRoundOperationallyReady(2, false), false)
assert.equal(strategy.isInvestmentRoundOperationallyReady(2, true), true)
assert.equal(strategy.isInvestmentRoundOperationallyReady(3, false), true)

assert.equal(strategy.getProjectedInvestmentCapital(300e9, 140e9), 440e9)
assert.equal(strategy.getProjectedInvestmentCapital(NaN, 140e9), 0)

let decision = strategy.evaluateInvestmentPeak(400e9, 410e9, 1)
assert.deepEqual(decision, {accept: false, peakOffer: 410e9, stagnantCycles: 0})
decision = strategy.evaluateInvestmentPeak(410e9, 410e9, 0)
assert.equal(decision.accept, false)
decision = strategy.evaluateInvestmentPeak(410e9, 410e9, 1)
assert.equal(decision.accept, true, 'a stable offer should not stall forever')
decision = strategy.evaluateInvestmentPeak(410e9, 400e9, 0)
assert.equal(decision.accept, true, 'a declining offer should be accepted immediately')

assert.doesNotMatch(source, /corp\.funds\s*\*\s*bnMults\.CorporationValuation/)
assert.match(source, /Round-one funding scales with valuation/)
assert.match(source, /shouldTrackInvestmentPeak\(round, offerFunds, corp\.funds, bnMults\.CorporationValuation\)/)

console.log('corporation BitNode multiplier regression checks passed')
