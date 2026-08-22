from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


path = Path("corporation.js")
text = path.read_text()

text = replace_once(
    text,
    '''const REQUIRED_CORPORATION_APIS = ["Office API", "Warehouse API"]
const ROUND_ONE_OPERATING_RESERVE = 5e9
const ROUND_ONE_EXPANSION_RESERVE = 1e9
''',
    '''const REQUIRED_CORPORATION_APIS = ["Office API", "Warehouse API"]
const ROUND_ONE_OPERATING_RESERVE = 5e9
const ROUND_ONE_EXPANSION_RESERVE = ROUND_ONE_OPERATING_RESERVE
const ROUND_ONE_MATERIAL_CASH_FLOOR = 250e6
const ROUND_ONE_MATERIAL_BUDGET_RATIO = 0.10
const ROUND_ONE_EXPENSE_RUNWAY_SECONDS = 60
const CORPORATION_CYCLE_SECONDS = 10
const BOOST_MATERIALS = ["Hardware", "Robots", "AI Cores", "Real Estate"]
''',
    "round-one cash-flow constants",
)

text = replace_once(
    text,
    '''/** Keep only a small reserve until all six Agriculture cities exist. */
export function getRoundOneExpansionReserve(cityCount, totalCityCount = 6) {
  return Number(cityCount) >= Number(totalCityCount)
    ? ROUND_ONE_OPERATING_RESERVE
    : ROUND_ONE_EXPANSION_RESERVE
}

/** Advertising is useful, but it must not consume the cash needed for the next office and warehouse. */
export function getRoundOneAdvertTarget(cityCount, totalCityCount = 6) {
  return Number(cityCount) >= Number(totalCityCount) ? 2 : 0
}
''',
    '''/** Keep real operating capital after every office/warehouse expansion, including the first one. */
export function getRoundOneExpansionReserve(_cityCount, _totalCityCount = 6) {
  return ROUND_ONE_EXPANSION_RESERVE
}

/** Advertising is useful, but it must not consume the cash needed for the next office and warehouse. */
export function getRoundOneAdvertTarget(cityCount, totalCityCount = 6) {
  return Number(cityCount) >= Number(totalCityCount) ? 2 : 0
}

/** Bound one corporation cycle of required-input purchases so a persistent buy order cannot create debt. */
export function getRoundOneMaterialBudget(
  funds,
  expenses = 0,
  minimumCashFloor = ROUND_ONE_MATERIAL_CASH_FLOOR,
  budgetRatio = ROUND_ONE_MATERIAL_BUDGET_RATIO,
  expenseRunwaySeconds = ROUND_ONE_EXPENSE_RUNWAY_SECONDS,
) {
  const corporationFunds = Number(funds)
  if (!Number.isFinite(corporationFunds) || corporationFunds <= 0) return 0
  const operatingFloor = Math.max(
    Math.max(0, Number(minimumCashFloor) || 0),
    Math.max(0, Number(expenses) || 0) * Math.max(0, Number(expenseRunwaySeconds) || 0),
  )
  const available = Math.max(0, corporationFunds - operatingFloor)
  const ratio = Math.min(1, Math.max(0, Number(budgetRatio) || 0))
  return available * ratio
}

/** Convert a remaining cash budget into a safe per-second material buy rate. */
export function getBudgetedMaterialBuyRate(
  desiredRate,
  marketPrice,
  remainingBudget,
  cycleSeconds = CORPORATION_CYCLE_SECONDS,
) {
  const desired = Math.max(0, Number(desiredRate) || 0)
  const price = Number(marketPrice)
  const budget = Math.max(0, Number(remainingBudget) || 0)
  const seconds = Math.max(1, Number(cycleSeconds) || 0)
  if (!(desired > 0) || !Number.isFinite(price) || price <= 0 || !(budget > 0)) return 0
  return Math.min(desired, budget / (price * seconds))
}
''',
    "round-one reserve and material helpers",
)

text = replace_once(
    text,
    '''function logBootstrapWarning(ns, message) {
  if (Date.now() - lastBootstrapWarning < 30_000) return
  lastBootstrapWarning = Date.now()
  log(ns, message, true, 'warning')
}

''',
    '''function logBootstrapWarning(ns, message) {
  if (Date.now() - lastBootstrapWarning < 30_000) return
  lastBootstrapWarning = Date.now()
  log(ns, message, true, 'warning')
}

/**
 * Boost-material buy orders persist between cycles. Cancel them while round one is still capital constrained,
 * and liquidate the stock only when the corporation is already insolvent.
 */
async function stabilizeRoundOneMaterialOrders(ns, liquidateBoosts = false) {
  const agriculture = await corpRun(ns, 'getDivision', div1)
  if (!agriculture || !Array.isArray(agriculture.cities)) return

  for (const city of agriculture.cities) {
    if (await corpRun(ns, 'hasWarehouse', div1, city) !== true) continue
    for (const material of BOOST_MATERIALS) {
      await corpRun(ns, 'buyMaterial', div1, city, material, 0)
      await corpRun(ns, 'sellMaterial', div1, city, material,
        liquidateBoosts ? "MAX" : 0, "MP")
    }
  }

  if (liquidateBoosts) {
    logBootstrapWarning(ns, `Round-one corporation funds are negative. Cancelling discretionary material buys ` +
      `and liquidating Agriculture boost materials until cash flow recovers.`)
  }
}

''',
    "persistent boost-order cleanup",
)

text = replace_once(
    text,
    '''        if (!teaNeeded && (await corpRun(ns, 'getOffice', div1, "Sector-12")).employeeJobs.Business > 0) {
          await optimizeMats(ns)
        }
        await purchase(ns)
''',
    '''        const agriculture = await corpRun(ns, 'getDivision', div1)
        const infrastructureComplete = Array.isArray(agriculture?.cities)
          && agriculture.cities.length >= cities.length
        if (infrastructureComplete && await corpFunds(ns) >= ROUND_ONE_OPERATING_RESERVE * 2
          && !teaNeeded
          && (await corpRun(ns, 'getOffice', div1, "Sector-12")).employeeJobs.Business > 0) {
          await optimizeMats(ns)
        }
        await purchase(ns)
''',
    "defer round-one boost optimization",
)

text = replace_once(
    text,
    '''    if (!(await expandCities(ns, div1, { allowExpansion: true, reserve }))) return false
  }
''',
    '''    if (!(await expandCities(ns, div1, { allowExpansion: true, reserve }))) return false
    const corporation = await getCorp(ns)
    const updatedAgriculture = await corpRun(ns, 'getDivision', div1)
    const infrastructureComplete = Array.isArray(updatedAgriculture?.cities)
      && updatedAgriculture.cities.length >= cities.length
    if (!infrastructureComplete || Number(corporation?.funds) < 0)
      await stabilizeRoundOneMaterialOrders(ns, Number(corporation?.funds) < 0)
  }
''',
    "round-one recovery pass",
)

purchase_start = text.index("async function purchase(ns) {")
purchase_end = text.index("/** @param {NS} ns */\nasync function basicExporImport", purchase_start)
text = text[:purchase_start] + '''async function purchase(ns) {
  const round = Number(investOffer?.round)
  let remainingMaterialBudget = Infinity
  if (round === 1) {
    const corporation = await getCorp(ns)
    remainingMaterialBudget = getRoundOneMaterialBudget(
      corporation?.funds,
      corporation?.expenses,
    )
  }

  for (const div of industries) {
    if (!hasDivDB[div]) continue
    for (const city of cities) {
      if (!hasWarehouseDB[div + city]) continue
      const smartBuy = {}
      const warehouse = await corpRun(ns, 'getWarehouse', div, city)
      if (!indDataDB[hasDivDB[div].industry]) {
        indDataDB[hasDivDB[div].industry] =
          await corpRun(ns, 'getIndustryData', hasDivDB[div].industry)
      }

      for (const matName of Object.keys(indDataDB[hasDivDB[div].industry].requiredMaterials)) {
        const material = await corpRun(ns, 'getMaterial', div, city, matName)
        if (!material) continue
        let desiredAmount = await maxMatRequired(ns, div, city, matName)
        desiredAmount -= Number(material.stored) || 0
        if (!matDataDB[matName])
          matDataDB[matName] = await corpRun(ns, 'getMaterialData', matName)
        const maxAmount = Math.floor(
          Math.max(0, warehouse.size - warehouse.sizeUsed) /
          Math.max(Number(matDataDB[matName]?.size) || 0, Number.EPSILON),
        )
        desiredAmount = Math.min(desiredAmount, maxAmount)
        smartBuy[matName] = { desiredAmount, material }
      }

      for (const [matName, order] of Object.entries(smartBuy)) {
        const desiredAmount = Number(order.desiredAmount) || 0
        const material = order.material
        const mult = await getMult(ns, div, city)

        if (mult[0] === 0) {
          // Keep existing inputs rather than dumping them for $0 while an office is temporarily unproductive.
          await corpRun(ns, 'buyMaterial', div, city, matName, 0)
          await corpRun(ns, 'sellMaterial', div, city, matName, 0, "MP")
          continue
        }

        if (desiredAmount > 0) {
          const desiredRate = desiredAmount / CORPORATION_CYCLE_SECONDS
          const buyRate = round === 1
            ? getBudgetedMaterialBuyRate(
              desiredRate,
              material.marketPrice,
              remainingMaterialBudget,
            )
            : desiredRate

          await corpRun(ns, 'sellMaterial', div, city, matName, 0, "MP")
          await corpRun(ns, 'buyMaterial', div, city, matName, buyRate)

          if (round === 1 && buyRate > 0) {
            const estimatedCost = buyRate * Number(material.marketPrice) * CORPORATION_CYCLE_SECONDS
            remainingMaterialBudget = Math.max(0, remainingMaterialBudget - estimatedCost)
          }
          continue
        }

        await corpRun(ns, 'buyMaterial', div, city, matName, 0)
        // Sell only the actual excess, and always recover market value instead of discarding purchased inputs.
        await corpRun(ns, 'sellMaterial', div, city, matName,
          Math.max(0, -desiredAmount / CORPORATION_CYCLE_SECONDS), "MP")
      }
    }
  }
}

''' + text[purchase_end:]

text = replace_once(
    text,
    '''  ns.printf("Round: %s Offer: %s Capital: %s/%s CorpVal: x%s %s", invest.round, ns.format.number(invest.funds, 3), ns.format.number(projectedCapital, 3), Number.isFinite(capitalTarget) ? ns.format.number(capitalTarget, 3) : "n/a", ns.format.number(bnMults.CorporationValuation, 3), minRound)

  ns.printf("Empl Upgrades: %s Prod Upgrades: %s Profit Upgrades: %s Wilson: %s", upgrades, produpgrades, await getUpgradeLevel(ns, "ABC SalesBots"), await getUpgradeLevel(ns, "Wilson Analytics"))
''',
    '''  ns.printf("Round: %s Offer: %s Capital: %s/%s CorpVal: x%s %s", invest.round, ns.format.number(invest.funds, 3), ns.format.number(projectedCapital, 3), Number.isFinite(capitalTarget) ? ns.format.number(capitalTarget, 3) : "n/a", ns.format.number(bnMults.CorporationValuation, 3), minRound)
  if (Number(invest.round) === 1) {
    const agriculture = await corpRun(ns, 'getDivision', div1)
    ns.printf("Bootstrap: %s/%s cities  Input budget: $%s/cycle  Expansion reserve: $%s",
      agriculture?.cities?.length ?? 0, cities.length,
      ns.format.number(getRoundOneMaterialBudget(cObj.funds, cObj.expenses), 3),
      ns.format.number(ROUND_ONE_EXPANSION_RESERVE, 3))
  }

  ns.printf("Empl Upgrades: %s Prod Upgrades: %s Profit Upgrades: %s Wilson: %s", upgrades, produpgrades, await getUpgradeLevel(ns, "ABC SalesBots"), await getUpgradeLevel(ns, "Wilson Analytics"))
''',
    "bootstrap HUD telemetry",
)

path.write_text(text)

bootstrap_test = Path("tests/corporation-bootstrap-capital.test.mjs")
test_text = bootstrap_test.read_text()
test_text = replace_once(
    test_text,
    '''assert.equal(strategy.getRoundOneExpansionReserve(1), 1e9)
assert.equal(strategy.getRoundOneExpansionReserve(5), 1e9)
assert.equal(strategy.getRoundOneExpansionReserve(6), 5e9)
''',
    '''assert.equal(strategy.getRoundOneExpansionReserve(1), 5e9)
assert.equal(strategy.getRoundOneExpansionReserve(5), 5e9)
assert.equal(strategy.getRoundOneExpansionReserve(6), 5e9)
''',
    "bootstrap reserve expectations",
)
test_text = replace_once(
    test_text,
    '''// $10b after Agriculture + paid APIs can open a $9b office/warehouse pair with a $1b reserve.
assert.equal(strategy.canAffordCorporationPurchase(10e9, 9e9, strategy.getRoundOneExpansionReserve(1)), true)
assert.equal(strategy.canAffordCorporationPurchase(10e9, 9e9, 5e9), false)
''',
    '''// Do not spend the final $10b on a city and leave no operating runway.
assert.equal(strategy.canAffordCorporationPurchase(10e9, 9e9, strategy.getRoundOneExpansionReserve(1)), false)
assert.equal(strategy.canAffordCorporationPurchase(14e9, 9e9, strategy.getRoundOneExpansionReserve(1)), true)
''',
    "bootstrap expansion expectations",
)
test_text = replace_once(
    test_text,
    '''assert.match(source, /Hacknet corporation-fund sales are optional acceleration, not a prerequisite/)
''',
    '''assert.match(source, /Hacknet corporation-fund sales are optional acceleration, not a prerequisite/)
assert.match(source, /liquidating Agriculture boost materials until cash flow recovers/)
''',
    "bootstrap debt recovery assertion",
)
bootstrap_test.write_text(test_text)

Path("tests/corporation-round1-cashflow.test.mjs").write_text(r'''import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../corporation.js', import.meta.url), 'utf8')

function extractFunction(name) {
  const marker = `export function ${name}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${name} should be exported`)
  const signatureEnd = source.indexOf(') {', start)
  assert.notEqual(signatureEnd, -1, `${name} should have a function body`)
  const open = signatureEnd + 2
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

function extractAsyncFunction(name) {
  const marker = `async function ${name}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${name} should exist`)
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
  source.match(/const ROUND_ONE_MATERIAL_CASH_FLOOR = [^\n]+/)?.[0],
  source.match(/const ROUND_ONE_MATERIAL_BUDGET_RATIO = [^\n]+/)?.[0],
  source.match(/const ROUND_ONE_EXPENSE_RUNWAY_SECONDS = [^\n]+/)?.[0],
  source.match(/const CORPORATION_CYCLE_SECONDS = [^\n]+/)?.[0],
].join('\n')
assert.doesNotMatch(constants, /undefined/)

const helperSource = [
  constants,
  extractFunction('getRoundOneMaterialBudget'),
  extractFunction('getBudgetedMaterialBuyRate'),
].join('\n')
const strategy = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)

assert.equal(strategy.getRoundOneMaterialBudget(10e9, 0), 975e6)
assert.equal(strategy.getRoundOneMaterialBudget(1e9, 2e6), 75e6)
assert.equal(strategy.getRoundOneMaterialBudget(1e9, 5e6), 0)
assert.equal(strategy.getRoundOneMaterialBudget(-1.8e9, 0), 0)

assert.equal(strategy.getBudgetedMaterialBuyRate(100, 10_000, 1e6), 10)
assert.equal(strategy.getBudgetedMaterialBuyRate(5, 10_000, 1e6), 5)
assert.equal(strategy.getBudgetedMaterialBuyRate(5, 10_000, 0), 0)
assert.equal(strategy.getBudgetedMaterialBuyRate(5, 0, 1e6), 0)

const purchase = extractAsyncFunction('purchase')
const stabilize = extractAsyncFunction('stabilizeRoundOneMaterialOrders')
assert.match(purchase, /remainingMaterialBudget = getRoundOneMaterialBudget/)
assert.match(purchase, /getBudgetedMaterialBuyRate/)
assert.match(purchase, /Math\.max\(0, remainingMaterialBudget - estimatedCost\)/)
assert.doesNotMatch(purchase, /sellMaterial[^;\n]+,\s*"0"\)/)
assert.match(purchase, /recover market value instead of discarding purchased inputs/)
assert.match(stabilize, /BOOST_MATERIALS/)
assert.match(stabilize, /liquidateBoosts \? "MAX" : 0/)
assert.match(stabilize, /buyMaterial', div1, city, material, 0/)

assert.match(source, /infrastructureComplete && await corpFunds\(ns\) >= ROUND_ONE_OPERATING_RESERVE \* 2/)
assert.doesNotMatch(source, /ROUND_ONE_EXPANSION_RESERVE = 1e9/)

console.log('corporation round-one cash-flow regression checks passed')
''')
