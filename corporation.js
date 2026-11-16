import { getReset, log, corpRun, getBNMults, getReserve, purchase as guardedPurchase } from './utils.js'
import { recordRunEvents } from './logger.js'
import { getCorporationBribeReserve } from './speedrun-policy.js'

//Can we get rid of these?
const corpName = "Shady-Ent"
const div1 = "Agriculture" //Agriculture
const div2 = "Chemical" //Chemical
const div3 = "Tobacco" //Tobacco
const div4 = "Restaurant" //Restaurant
const div5 = "Water Utilities" //Water Utilities
const div6 = "Computer Hardware" //Computer Hardware
const div7 = "Refinery" //Refinery
const div8 = "Mining" //Mining

const cities = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"]
const industries = [div1, div2, div3, div4, div5, div6, div7, div8]

// Full-valuation nodes outside BN3 keep their established private funding policy.
const INVESTMENT_CAPITAL_TARGETS = Object.freeze({
  1: 440e9,
  2: 8.8e12,
  3: 12e15,
  4: 500e18,
})
const INVESTMENT_OFFER_STALL_CYCLES = 2
const INVESTMENT_OFFER_RELATIVE_EPSILON = 1e-6
// The offer averages ten corporation cycles. Allow two more for phase/staffing changes.
const INVESTMENT_REVIEW_CYCLES = 12
let investmentReview = null
let bn3Reset = null // Reset data for the adaptive private strategy (BN3 or discounted valuation).
let fundingGrowthCycles = 0
let fundingSettleCycles = 0
let fundingStatus = ''
let seedCapitalSamples = []
let savedForDivision = 0
let companyReset, cashPlan, supplyPlan
const cashPhases = ['PURCHASE', 'PRODUCTION', 'EXPORT', 'SALE', 'START']
const cashHorizon = 600 // Compare growth with keeping ten minutes of earnings for a bribe.
const usesCashPolicy = round => round === 5 || (!!bn3Reset && (round === 3 || round === 4))
const ROUND_THREE_TOBACCO_SEATS = 106
const ROUND_FOUR_TOBACCO_SEATS = 250
let reviewedProductLineup = ''
let roundTwoGrowthCycles = 0
let roundTwoAllocation = { forSetup: false, goal: 0, saved: 0, maySave: true }
let tobaccoBooster = false
const ta2DB = Object.create(null) // TA2 cache keyed by division + city + item
const indDataDB = []
const matDataDB = []
let researchedDB = []
let hasDivDB = []
let hasOfficeDB = []
let hasWarehouseDB = []
let investmentPeakRound = 0
let investmentPeakActive = false
let investmentPeakOffer = 0
let investmentOfferStallCycles = 0
let bnMults
let teaNeeded
let investOffer
let corporationConstants
let lastBootstrapWarning = 0
let capitalConstrainedBootstrap = false
let pendingInputPurchases = 0
let boostOrdersInitialized = false
let boostTargets = []
let dividendRate = 0.01
const argsSchema = [['dividend-rate', 0.01], ['help', false]]

export function autocomplete(data) { data.flags(argsSchema); return [] }

/** Creation eligibility is a status string in 3.x; older games returned a boolean. */
export async function waitForCorporation(ns, currentNode) {
  const selfFund = Number(currentNode) !== 3
  let lastNotice = -Infinity
  while (!ns.corporation.hasCorporation()) {
    const status = ns.corporation.canCreateCorporation(selfFund)
    if (status !== 'Success' && status !== true) {
      log(ns, `Cannot create a corporation (${String(status)}). Requires BN3 or SF3 and corporation access enabled.`, true, 'warning')
      return false
    }
    const reserve = selfFund ? await getReserve(ns) : 0
    const requiredMoney = selfFund ? 150e9 + reserve : 0
    if (!selfFund || ns.getServerMoneyAvailable('home') >= requiredMoney) {
      try { await guardedPurchase(ns, 'corporation', 'createCorporation', [corpName, selfFund], selfFund ? {} : {reserve: 0}) }
      catch (error) { log(ns, `Corporation creation failed; rechecking funds/access: ${String(error)}`, false, 'warning') }
      // A reply, including a truthy error, is not proof that creation succeeded.
      if (ns.corporation.hasCorporation()) return true
    }
    if (Date.now() - lastNotice >= 60_000) {
      log(ns, selfFund
        ? `Waiting to create a corporation: need $150b plus the home reserve ($${ns.format.number(reserve, 3)}). Keep income scripts running.`
        : 'BN3 seed-funded creation has not succeeded; retrying.', true, 'info')
      lastNotice = Date.now()
    }
    await ns.sleep(1000)
  }
  return true
}

/** Public corporations no longer receive investment offers, even if they skipped private rounds. */
export function getCorporationPhase(corporation, offer) {
  if (!corporation) return 0
  if (corporation.public === true) return 5
  const round = Number(offer?.round)
  return Number.isInteger(round) && round >= 1 && round <= 5 ? round : 0
}

async function readInvestmentOffer(ns) {
  const corporation = await getCorp(ns)
  if (corporation?.public) return {round:5, funds:0, shares:0}
  const offer = await corpRun(ns, 'getInvestmentOffer')
  const round = getCorporationPhase(corporation, offer)
  return round ? { ...offer, round } : undefined
}

/** Keep three market cycles of operating expenses before distributing a small share of profits. */
export function getSafeDividendRate(corporation, requestedRate, secondsPerCycle) {
  const { funds, revenue, expenses } = corporation ?? {}
  if (![funds, revenue, expenses, requestedRate, secondsPerCycle].every(Number.isFinite) ||
    requestedRate < 0 || requestedRate > 1 || secondsPerCycle <= 0 || expenses < 0 ||
    revenue <= expenses || funds < Math.max(ROUND_ONE_OPERATING_RESERVE, expenses * secondsPerCycle * 3)) return 0
  return requestedRate
}

/** All four offers remain available before the default IPO; no player-owned shares are sold. */
export async function manageCorporationPayout(ns, round, requestedRate = 0.01) {
  let corporation = await getCorp(ns)
  if (!corporation || (corporation.public !== true && Number(round) !== 5)) return
  if (corporation.public !== true) {
    if (await corpRun(ns, 'goPublic', 0) !== true) return
    corporation = await getCorp(ns)
    if (corporation?.public !== true) return
    log(ns, 'All private funding rounds complete. Corporation is public; retained all remaining shares.', true, 'info')
  }
  const constants = await getCorporationConstants(ns)
  const rate = getSafeDividendRate(corporation, requestedRate, Number(constants?.secondsPerMarketCycle))
  if (corporation.dividendRate !== rate) await corpRun(ns, 'issueDividends', rate)
}

const REQUIRED_CORPORATION_APIS = ["Office API", "Warehouse API"]
const ROUND_ONE_OPERATING_RESERVE = 5e9
const ROUND_ONE_SEED_FUNDED_EXPANSION_RESERVE = 1e9
const ROUND_ONE_HOME_OFFICE_TARGET = 6
const ROUND_ONE_MINIMUM_TRANSITION_CAPITAL = 190e9
const ROUND_TWO_TOBACCO_RESERVE = 10e9
const ROUND_TWO_TOBACCO_HOME_OFFICE_TARGET = 10
const supplyResearch = {Agriculture:700, Chemical:390}
const BOOST_MATERIALS = ["Hardware", "Robots", "AI Cores", "Real Estate"]

//I want to impliment helper functions for ram dodge across all corp functions.
async function getCorp(ns) {
  return (await corpRun(ns, 'getCorporation'));
}

/** Missing divisions are an expected state; other RPC failures must remain errors. */
async function getOptionalDivision(ns, name) {
  const corporation = await getCorp(ns);
  if (!Array.isArray(corporation?.divisions)) throw new Error('Invalid corporation division list');
  return corporation.divisions.includes(name) ? await corpRun(ns, 'getDivision', name) : undefined;
}

/** Keep a corporation purchase from consuming working capital needed to reach the next market cycle. */
export function canAffordCorporationPurchase(funds, cost, reserve = 0) {
  return Number.isFinite(funds) && Number.isFinite(cost) && Number.isFinite(reserve)
    && funds >= cost + reserve
}

/** Read a Source-File level directly from ResetInfo without launching another high-RAM helper. */
export function getOwnedSourceFileLevel(resetInfo, sourceFileNumber) {
  const owned = resetInfo?.ownedSF
  const sourceFile = Number(sourceFileNumber)
  if (!Number.isFinite(sourceFile)) return 0
  if (owned instanceof Map) return Number(owned.get(sourceFile)) || 0
  return Number(owned?.[sourceFile]) || 0
}

/**
 * Only use the emergency low-capital bootstrap when the corporation had to buy both APIs.
 * BN3 and SF3.3 grant Office API and Warehouse API automatically, even when the corporation itself is
 * self-funded outside BN3.
 */
export function shouldUseCapitalConstrainedBootstrap(currentNode, sourceFile3Level = 0) {
  const node = Number(currentNode)
  const sf3Level = Number(sourceFile3Level)
  if (node === 3) return false
  return !Number.isFinite(sf3Level) || sf3Level < 3
}

/** Return the actual post-investment capital target for a funding round. */
export function getInvestmentCapitalTarget(round, corporationValuation = 1) {
  const fundingRound = Number(round)
  const baseTarget = Number(INVESTMENT_CAPITAL_TARGETS[fundingRound])
  if (!Number.isFinite(baseTarget)) return Infinity
  if (fundingRound !== 1) return baseTarget

  const valuation = Number(corporationValuation)
  const effectiveValuation = Number.isFinite(valuation) && valuation > 0
    ? Math.min(1, valuation)
    : 1
  return Math.max(ROUND_ONE_MINIMUM_TRANSITION_CAPITAL, baseTarget * effectiveValuation)
}

/** Corporation costs are not scaled by CorporationValuation, so compare actual dollars. */
export function getProjectedInvestmentCapital(offerFunds, corporationFunds) {
  const offer = Number(offerFunds)
  const funds = Number(corporationFunds)
  if (!Number.isFinite(offer) || !Number.isFinite(funds)) return 0
  return Math.max(0, offer) + Math.max(0, funds)
}

export function shouldTrackInvestmentPeak(
  round,
  offerFunds,
  corporationFunds,
  corporationValuation = 1,
) {
  return getProjectedInvestmentCapital(offerFunds, corporationFunds) >=
    getInvestmentCapitalTarget(round, corporationValuation)
}

/** Round two must finish the Chemical division infrastructure before taking its funding offer. */
export function isInvestmentRoundOperationallyReady(round, roundTwoInfrastructureReady = true) {
  return Number(round) !== 2 || roundTwoInfrastructureReady === true
}

/**
 * Track the actual offer peak. A small decline accepts immediately; an exact plateau accepts after two cycles.
 */
export function evaluateInvestmentPeak(peakOffer, currentOffer, stagnantCycles = 0) {
  const peak = Number.isFinite(Number(peakOffer)) ? Math.max(0, Number(peakOffer)) : 0
  const current = Number.isFinite(Number(currentOffer)) ? Math.max(0, Number(currentOffer)) : 0
  const epsilon = Math.max(1e6, peak * INVESTMENT_OFFER_RELATIVE_EPSILON)

  if (current > peak + epsilon) {
    return { accept: false, peakOffer: current, stagnantCycles: 0 }
  }

  const nextStagnantCycles = Math.max(0, Number(stagnantCycles) || 0) + 1
  return {
    accept: current < peak - epsilon || nextStagnantCycles >= INVESTMENT_OFFER_STALL_CYCLES,
    peakOffer: Math.max(peak, current),
    stagnantCycles: nextStagnantCycles,
  }
}

/** A minimally staffed office can produce and sell without waiting on research or advertising. */
export function isRoundOneBootstrapReady(_division, office) {
  return Number(office?.numEmployees) >= 3
    && Number(office?.employeeJobs?.Operations) > 0
    && Number(office?.employeeJobs?.Engineer) > 0
    && Number(office?.employeeJobs?.Business) > 0
}

/** Keep only a small reserve until all six Agriculture cities exist. */
export function getRoundOneExpansionReserve(
  cityCount,
  totalCityCount = 6,
  capitalConstrained = false,
) {
  if (Number(cityCount) >= Number(totalCityCount)) return ROUND_ONE_OPERATING_RESERVE
  return capitalConstrained ? ROUND_ONE_OPERATING_RESERVE : ROUND_ONE_SEED_FUNDED_EXPANSION_RESERVE
}

/** Advertising is useful, but it must not consume the cash needed for the next office and warehouse. */
export function getRoundOneAdvertTarget(cityCount, totalCityCount = 6) {
  return Number(cityCount) >= Number(totalCityCount) ? 2 : 0
}

/** Grow the productive home office before a paid-API corporation buys a second city. */
export function getRoundOneOfficeTarget(
  city,
  cityCount,
  totalCityCount = 6,
  capitalConstrained = false,
) {
  if (capitalConstrained && city === "Sector-12" && Number(cityCount) < Number(totalCityCount))
    return ROUND_ONE_HOME_OFFICE_TARGET
  return Number(cityCount) >= Number(totalCityCount) ? 4 : 3
}
/**
 * Keep existing offices productive while the division bootstraps. Once all cities exist, remote offices may
 * temporarily research while Sector-12 continues producing and selling.
 */
export function getRoundOneJobPlan(
      numEmployees,
      city,
      cityCount,
      researchPoints,
      totalCityCount = 6,
      capitalConstrained = false,
    ) {
      const employees = Math.max(0, Math.floor(Number(numEmployees) || 0))
      const infrastructureComplete = Number(cityCount) >= Number(totalCityCount)
      const needsResearch = Number(researchPoints) < 60
      const plan = {
        "Operations": 0,
        "Engineer": 0,
        "Business": 0,
        "Management": 0,
        "Research & Development": 0,
        "Intern": 0,
      }

      // A paid-API corporation has only $10b after Agriculture and both APIs. Until city coverage is
      // complete, every available employee must contribute to cash flow rather than early research.
      if (capitalConstrained && !infrastructureComplete) {
        if (employees === 1) {
          plan.Operations = 1
          return plan
        }
        if (employees === 2) {
          plan.Operations = 1
          plan.Engineer = 1
          return plan
        }
        if (employees >= 3) {
          plan.Business = 1
          let remaining = employees - 1
          const coreEmployees = Math.max(1, Math.floor(remaining * 0.4))
          plan.Operations = Math.min(coreEmployees, remaining)
          remaining -= plan.Operations
          plan.Engineer = Math.min(coreEmployees, remaining)
          remaining -= plan.Engineer
          plan.Management = remaining
        }
        return plan
      }

      if (infrastructureComplete && needsResearch && city !== "Sector-12") {
        plan["Research & Development"] = employees
        return plan
      }

      let remaining = employees
      for (const job of ["Operations", "Engineer", "Business"]) {
        if (remaining <= 0) break
        plan[job] = 1
        remaining--
      }

      if (needsResearch)
        plan["Research & Development"] = remaining
      else
        plan.Management = remaining
      return plan
    }

/** A product project is underway as soon as the division owns its first product slot. */
export function hasStartedProduct(division) {
  return Array.isArray(division?.products) && division.products.length > 0
}

/** Concentrate early product development in Sector-12 without overbuilding every Tobacco office. */
export function getRoundTwoTobaccoOfficeTarget(city) {
  return city === "Sector-12" ? ROUND_TWO_TOBACCO_HOME_OFFICE_TARGET : 3
}

/** Keep remote offices researching until the first product can actually be manufactured and sold. */
export function getRoundTwoTobaccoJobPlan(numEmployees, city, hasCompletedProduct = false) {
  const employees = Math.max(0, Math.floor(Number(numEmployees) || 0))
  const plan = {
    "Operations": 0,
    "Engineer": 0,
    "Business": 0,
    "Management": 0,
    "Research & Development": 0,
    "Intern": 0,
  }

  if (city !== "Sector-12" && !hasCompletedProduct) {
    plan["Research & Development"] = employees
    return plan
  }
  if (employees === 1) {
    plan.Operations = 1
    return plan
  }
  if (employees === 2) {
    plan.Operations = 1
    plan.Engineer = 1
    return plan
  }
  if (employees >= 3) {
    plan.Operations = Math.max(1, Math.floor(employees / 3))
    plan.Engineer = Math.max(1, Math.floor(employees / 3))
    plan.Business = 1
    plan.Management = employees - plan.Operations - plan.Engineer - plan.Business
  }
  return plan
}


function hasCompleteDivisionInfrastructure(division) {
  return cities.every(city => hasOfficeDB[division + city] && hasWarehouseDB[division + city])
}

async function getCorporationConstants(ns) {
  if (corporationConstants) return corporationConstants
  const constants = await corpRun(ns, 'getConstants')
  if (constants && Number.isFinite(constants.officeInitialCost)
    && Number.isFinite(constants.warehouseInitialCost)) {
    corporationConstants = constants
  }
  return corporationConstants
}

async function ensureCorporationApis(ns) {
  const missing = []
  let totalCost = 0

  for (const unlock of REQUIRED_CORPORATION_APIS) {
    if (await corpRun(ns, 'hasUnlock', unlock) === true) {
      researchedDB[unlock] = true
      continue
    }
    const cost = Number(await corpRun(ns, 'getUnlockCost', unlock))
    if (!Number.isFinite(cost)) {
      return false
    }
    missing.push({ unlock, cost })
    totalCost += cost
  }

  if (missing.length === 0) return true

  const funds = await corpFunds(ns)
  if (!canAffordCorporationPurchase(funds, totalCost)) {
    return false
  }

  for (const { unlock } of missing) {
    await corpRun(ns, 'purchaseUnlock', unlock)
    if (await corpRun(ns, 'hasUnlock', unlock) !== true) {
      return false
    }
    researchedDB[unlock] = true
  }

  log(ns, `Purchased required corporation APIs: ${missing.map(item => item.unlock).join(', ')}.`,
    true, 'success')
  return true
}

async function hireAdVertsUpTo(ns, divisionName, target) {
  let division = await getOptionalDivision(ns, divisionName)
  if (!division) return false

  while (division.numAdVerts < target) {
    const cost = Number(await corpRun(ns, 'getHireAdVertCost', divisionName))
    const funds = await corpFunds(ns)
    if (!canAffordCorporationPurchase(funds, cost, ROUND_ONE_OPERATING_RESERVE)) return false

    const previousCount = division.numAdVerts
    await corpRun(ns, 'hireAdVert', divisionName)
    division = await corpRun(ns, 'getDivision', divisionName)
    if (!division || division.numAdVerts <= previousCount) {
      return false
    }
  }
  return true
}

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(5.5) // Include the home reserve and player-cash checks at startup.
  const options = ns.flags(argsSchema)
  dividendRate = Number(options['dividend-rate'])
  if (options.help || !Number.isFinite(dividendRate) || dividendRate < 0 || dividendRate > 1) {
    ns.tprint('Usage: run corporation.js [--dividend-rate 0.01] (0 to 1; 0 retains all profits). BN3 uses seed funding; other BNs require $150b above the home reserve. Dividends begin after all four private offers, or resume for an already-public corporation.')
    return
  }
  ns.disableLog("ALL")
  //ns.ui.openTail();
  ns.clearLog()
  hasDivDB = []
  researchedDB = []
  hasOfficeDB = []
  hasWarehouseDB = []
  const resetInfo = await getReset(ns)
  companyReset = resetInfo
  cashPlan = null
  const myBN = resetInfo.currentNode
  fundingGrowthCycles = 0
  fundingSettleCycles = 0
  fundingStatus = ''
  seedCapitalSamples = []
  savedForDivision = 0
  supplyPlan = null
  const sourceFile3Level = getOwnedSourceFileLevel(resetInfo, 3)
  bnMults = await getBNMults(ns)
  const corporationValuation = Number(bnMults?.CorporationValuation)
  // Discounted private offers need the same real-cost comparison. The access,
  // seed and paid-API decisions above/below still use the actual BitNode.
  bn3Reset = Number(myBN) === 3 || corporationValuation < 1 ? resetInfo : null
  const corporationDivisions = Number(bnMults?.CorporationDivisions)
  if (!(corporationValuation > 0) || !(corporationDivisions > 0) || !(Number(bnMults?.CorporationSoftcap) >= 0.15)) {
    log(ns, `Corporations are disabled in BN${myBN}; corporation.js is exiting.`, true, 'warning')
    return
  }
  capitalConstrainedBootstrap = shouldUseCapitalConstrainedBootstrap(myBN, sourceFile3Level)
  const bootstrapMode = capitalConstrainedBootstrap
    ? `paid-API constrained bootstrap (SF3.${sourceFile3Level})`
    : `free-API fast bootstrap (SF3.${sourceFile3Level})`
  log(ns, `Corporation strategy for BN${myBN}: valuation x${corporationValuation}; ${bootstrapMode}. ` +
    (bn3Reset ? 'Price the next stage and compare the benefit of waiting with advancing the run.' :
      `Round-one funding scales with valuation but retains a ${ns.format.number(ROUND_ONE_MINIMUM_TRANSITION_CAPITAL, 3)} minimum transition floor.`),
    true, 'info')
  if (!(await waitForCorporation(ns, myBN))) return
  log(ns, `Corporation is up, detecting investment round`, true)
  investOffer = await readInvestmentOffer(ns)
  let round = investOffer?.round ?? 0
  log(ns, `Round ${round}!`, true)
  teaNeeded = true
  tobaccoBooster = false
  investmentReview = null
  reviewedProductLineup = ''
  roundTwoGrowthCycles = 0
  roundTwoAllocation = { forSetup: false, goal: 0, saved: 0, maySave: true }
  boostOrdersInitialized = false
  boostTargets = []
  const seedSaleCities = new Set()
  while (true) {
    while (round === 1) {
      const ready = await prep(ns)
      round = investOffer?.round ?? round
      if (!ready) {
        await ns.corporation.nextUpdate()
        continue
      }
      if (round !== 1) continue
      const agriculture = hasDivDB[div1]
      const advertTarget = getRoundOneAdvertTarget(agriculture?.cities?.length, cities.length)
      if (advertTarget > 0 && agriculture.numAdVerts < advertTarget)
        await hireAdVertsUpTo(ns, div1, advertTarget)
      if (bn3Reset) await setSeedSales(ns, seedSaleCities)
      if (!bn3Reset) await updateHud(ns)
      const nState = (await getCorp(ns)).nextState
      if (nState === "SALE" && (!bn3Reset || (researchedDB["Market Research - Demand"] && researchedDB["Market Data - Competition"])))
        await sell(ns)
      if (nState === "PURCHASE") {

        await purchase(ns)
        await purchaseBoostMaterials(ns)
      }
      if (nState === "START") {
        teaNeeded = await teaParty(ns)
        round = await checkInvest(ns)
        if (bn3Reset) await updateHud(ns)
      }
      if (nState === "EXPORT") {
        await manageOffice(ns)
        if (bn3Reset && hasCompleteDivisionInfrastructure(div1)) await growSeedAgriculture(ns)
        else {
          if (hasCompleteDivisionInfrastructure(div1)) await warehouseUpgrade(ns)
          await manageRoundOneBoostMaterials(ns)
        }
      }
      if (!bn3Reset && hasCompleteDivisionInfrastructure(div1)) {
        const upgradeCost = Number(await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots"))
        if (canAffordCorporationPurchase(await corpFunds(ns), upgradeCost, ROUND_ONE_OPERATING_RESERVE))
          await corpRun(ns, 'levelUpgrade', "ABC SalesBots")
      }
      await ns.corporation.nextUpdate();
    }
    while (round === 2) {
      const ready = await prep(ns)
      round = investOffer?.round ?? round
      if (!ready) {
        await ns.corporation.nextUpdate()
        continue
      }
      if (round !== 2) continue
      if (bn3Reset) {
        round = await runSupplyPhase(ns)
        await ns.corporation.nextUpdate()
        continue
      }
      await manageProducts(ns)
      await updateHud(ns)
      let hasDiv2 = false
      // Chemical becomes round-two supply support after the Tobacco product is underway.    
      let count = 0
      if (researchedDB["Export"])
        for (const city of cities)
          if (hasWarehouseDB[div2 + city]) count++
      if (count === 6)
        hasDiv2 = true
      while (hasDiv2 && (await corpRun(ns, 'getUpgradeLevel', "Smart Factories")) < 16 && (await corpRun(ns, 'getUpgradeLevelCost', "Smart Factories")) <= await corpFunds(ns))
        (await corpRun(ns, 'levelUpgrade', "Smart Factories"))
      const nState = (await getCorp(ns)).nextState
      if (nState === "SALE")
        await sell(ns)
      if (nState === "PURCHASE") {
        if (hasDivDB[div2]) await basicExporImport(ns)
        await purchase(ns)
        while (await corpFunds(ns) > (await corpRun(ns, 'getHireAdVertCost', div1)) && (await corpRun(ns, 'getHireAdVertCount', div1)) < 12 && hasDiv2)
          await corpRun(ns, 'hireAdVert', div1)
        if ((await corpRun(ns, 'getHireAdVertCount', div1)) < 11 && (await corpRun(ns, 'getMaterial', div1, "Sector-12", "Plants")).stored > 200 &&
          await corpFunds(ns) >= await corpRun(ns, 'getHireAdVertCost', div1))
          await corpRun(ns, 'hireAdVert', div1)
        else if (hasDiv2 && (await corpRun(ns, 'getMaterial', div1, "Sector-12", "Plants")).stored > 200 &&
          await corpFunds(ns) >= await corpRun(ns, 'getHireAdVertCost', div1))
          await corpRun(ns, 'hireAdVert', div1)
        // A productive Tobacco city must not wait for Agriculture's staffing/morale gate.
        const agricultureReady = !teaNeeded &&
          (await corpRun(ns, 'getOffice', div1, "Sector-12")).employeeJobs.Business > 0
        await purchaseBoostMaterials(ns, agricultureReady ? industries : [div3])
      }
      if (nState === "START") {
        teaNeeded = await teaParty(ns)
        round = await checkInvest(ns)
      }
      if (nState === "EXPORT") {
        await manageOffice(ns)
        await warehouseUpgrade(ns)
        if (!teaNeeded && (await corpRun(ns, 'getOffice', div1, "Sector-12")).employeeJobs.Business > 0) {

          while (hasDiv2 && await corpFunds(ns) >= (await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots")) && (await corpRun(ns, 'getUpgradeLevel', "ABC SalesBots")) < 30)
            (await corpRun(ns, 'levelUpgrade', "ABC SalesBots"))
        }
        while (await corpFunds(ns) >= (await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots")) && (await corpRun(ns, 'getUpgradeLevel', "ABC SalesBots")) < 10)
          await corpRun(ns, 'levelUpgrade', "ABC SalesBots")
        const agricultureReady = !teaNeeded &&
          (await corpRun(ns, 'getOffice', div1, "Sector-12")).employeeJobs.Business > 0
        await optimizeMats(ns, agricultureReady ? industries : [div3])
      }
      await ns.corporation.nextUpdate();
    }
    while (round === 3 || round === 4) {
      const ready = await prep(ns)
      round = investOffer?.round ?? round
      if (!ready) {
        await ns.corporation.nextUpdate()
        continue
      }
      if (round !== 3 && round !== 4) continue
      if (usesCashPolicy(round)) {
        round = await runCashPhase(ns, round)
        await ns.corporation.nextUpdate()
        continue
      }
      await updateHud(ns)
      await manageProducts(ns)
      while ((await corpRun(ns, 'getUpgradeLevel', "Smart Factories")) < 20 && (await corpRun(ns, 'getUpgradeLevelCost', "Smart Factories")) <= await corpFunds(ns))
        (await corpRun(ns, 'levelUpgrade', "Smart Factories"))
      await spendRP(ns)
      const nState = (await getCorp(ns)).nextState
      if (nState === "SALE")
        await sell(ns)
      if (nState === "PURCHASE") {
        await basicExporImport(ns)
        await purchase(ns)
        if ((await corpRun(ns, 'getMaterial', div1, "Sector-12", "Plants")).stored > 200 &&
          await corpFunds(ns) >= await corpRun(ns, 'getHireAdVertCost', div1))
          await corpRun(ns, 'hireAdVert', div1)
        await purchaseBoostMaterials(ns)
      }
      if (nState === "START") {
        teaNeeded = await teaParty(ns)
        round = await checkInvest(ns)
      }
      if (nState === "EXPORT") {
        await updateMisc(ns)
        await manageOffice(ns)
        await warehouseUpgrade(ns)
        await optimizeMats(ns)
      }
      await ns.corporation.nextUpdate();
    }
    while (round >= 5) {
      const ready = await prep(ns)
      round = investOffer?.round ?? round
      if (!ready) {
        await ns.corporation.nextUpdate()
        continue
      }
      if (round < 5) continue
      round = await runCashPhase(ns, round)
      await ns.corporation.nextUpdate();
    }
    log(ns, `Unexpected corporation investment round ${String(round)}; refreshing state.`, true, 'warning')
    await ns.sleep(1000)
    investOffer = await readInvestmentOffer(ns)
    round = investOffer?.round ?? 0
  }
}

async function getUpgradeLevel(ns, type) {
  return await corpRun(ns, 'getUpgradeLevel', type)
}

/** @param {NS} ns */
async function updateHud(ns) {
  ns.clearLog()
  const cObj = await getCorp(ns)
  ns.printf("%s", cObj.name)
  ns.printf("Funds : $%s  Profit: $%s/s", ns.format.number(cObj.funds, 3), ns.format.number(cObj.revenue - cObj.expenses, 3))
  ns.printf("%s | Player dividends: $%s/s | Rate: %s%%", cObj.public ? "Public" : "Private",
    ns.format.number(cObj.dividendEarnings || 0, 3), ns.format.number((cObj.dividendRate || 0) * 100, 2))
  const invest = investOffer
  if (usesCashPolicy(invest.round) && cashPlan) {
    ns.printf("Cash for factions | growth: %s | operating profit: $%s/s", cashPlan.focus, ns.format.number(cObj.revenue - cObj.expenses, 3))
    ns.printf("Retaining $%s%s", ns.format.number(cashPlan.floor, 3), cashPlan.goal ? ` | ${cashPlan.faction}: $${ns.format.number(cashPlan.goal, 3)} rep gap` : '')
    const spendable = await corpFunds(ns, 0, cObj) - getCorporationBribeReserve(cObj, invest.round)
    ns.printf("Bribe cash after bills: %s | %s (valuation $%s / $%s)", Number.isFinite(spendable) ?
      '$' + ns.format.number(Math.max(0, spendable), 3) : 'updating',
      cObj.valuation >= corporationConstants.bribeThreshold ? 'eligible' : 'locked', ns.format.number(cObj.valuation, 3),
      ns.format.number(corporationConstants?.bribeThreshold ?? 0, 3))
    for (const div of industries) {
      const d = hasDivDB[div]
      if (!d) continue
      const sellingCities = new Set((cashPlan.goods?.[div] ?? []).filter(g => g.product.actualSellAmount > 0).map(g => g.city))
      ns.printf("%s: $%s/s%s", div, ns.format.number(d.lastCycleRevenue - d.lastCycleExpenses, 3),
        d.makesProducts ? ` | product sales in ${sellingCities.size}/${d.cities.length} cities` : '')
    }
    const v2 = cashPlan.v2
    if (v2) {
      const eta = v2.confirmed && Number.isFinite(v2.remaining) ? ` (~${Math.ceil(v2.remaining / 60)} min at normal speed)` : ''
      const status = v2.progress == null ? 'not yet started' : `${v2.progress.toFixed(1)}%${eta}`
      ns.printf("%s Prod v2: %s%s", v2.div, status, v2.note ? ' | '+v2.note : '')
    }
    const line = cashPlan.tobacco
    if (line) {
      ns.printf("Tobacco: $%s/s net over %d market cycles%s", ns.format.number(line.net,3),
        line.samples.length, line.note ? ' | '+line.note : '')
      ns.printf("Average units sold/s, all cities: %s",Object.entries(line.soldByProduct)
        .map(([name,units])=>name+' '+ns.format.number(units,3)).join(' | '))
    }
    if (invest.round < 5 && fundingStatus) ns.printf("%s", fundingStatus)
    ns.ui.renderTail()
    return // The cycle snapshot already has the division and sales figures.
  }
  if (bn3Reset) {
    ns.printf("Round: %s Offer: $%s", invest.round, ns.format.number(invest.funds, 3))
    if (invest.round < 5 && fundingStatus) ns.printf("%s", fundingStatus)
  } else {
    const target = getInvestmentCapitalTarget(invest.round, bnMults.CorporationValuation)
    ns.printf("Round: %s Offer: %s Capital: %s/%s CorpVal: x%s", invest.round, ns.format.number(invest.funds, 3), ns.format.number(getProjectedInvestmentCapital(invest.funds, cObj.funds), 3), Number.isFinite(target) ? ns.format.number(target, 3) : "n/a", ns.format.number(bnMults.CorporationValuation, 3))
  }
  if (investmentReview)
    ns.printf("Investment review: %s cycles left. Selling normally; growth purchases paused.", investmentReview.remaining)
  else if (invest.round === 2 && roundTwoAllocation.goal > 0)
    ns.printf("Saving for %s: $%s / $%s above operating cash.", roundTwoAllocation.forSetup ? 'required expansion' : 'next Tobacco product', ns.format.number(roundTwoAllocation.saved, 3), ns.format.number(roundTwoAllocation.goal, 3))

  const upgrades = await getUpgradeLevel(ns, "Neural Accelerators")
    + await getUpgradeLevel(ns, "Project Insight")
    + await getUpgradeLevel(ns, "Nuoptimal Nootropic Injector Implants")
    + await getUpgradeLevel(ns, "FocusWires")
    + await getUpgradeLevel(ns, "Speech Processor Implants")

  const produpgrades = await getUpgradeLevel(ns, "Smart Factories") + await getUpgradeLevel(ns, "Smart Storage")
  ns.printf("Empl Upgrades: %s Prod Upgrades: %s Profit Upgrades: %s Wilson: %s", upgrades, produpgrades, await getUpgradeLevel(ns, "ABC SalesBots"), await getUpgradeLevel(ns, "Wilson Analytics"))
  const state = cObj.nextState === "PURCHASE" ? "START"
    : cObj.nextState === "PRODUCTION" ? "PURCHASE"
      : cObj.nextState === "EXPORT" ? "PRODUCTION"
        : cObj.nextState === "SALE" ? "EXPORT"
          : "SALE"
  ns.printf("Stage: %s", state)
  for (const div of industries) {
    if (!hasDivDB[div]) continue
    const division = await corpRun(ns, 'getDivision', div);
    ns.printf("-%s(%s)  Profit: $%s/s  Awareness: %s  Pop: %s", div, division.industry, ns.format.number(division.lastCycleRevenue - division.lastCycleExpenses, 3), ns.format.number(division.awareness, 3), ns.format.number(division.popularity, 3))
    let wCount = 0
    let wSpace = 0
    let wSpaceUsed = 0
    let oCount = 0
    let oEmployees = 0
    let oSize = 0
    for (const city of cities) {
      if (!hasOfficeDB[div + city]) continue
      if (hasWarehouseDB[div + city]) {
        wCount++
        const warehouse = await corpRun(ns, 'getWarehouse', div, city)
        wSpace += warehouse.size
        wSpaceUsed += warehouse.sizeUsed
      }
      try {
        const office = (await corpRun(ns, 'getOffice', div, city))
        oEmployees += office.numEmployees
        oCount++
        oSize += office.size
      }
      catch { }
    }
    ns.printf("  Warehouse Space: (%s/6) %s/%s  Office Usage: (%s/6) %s/%s  Research: %s", wCount, Math.round(wSpaceUsed), Math.round(wSpace), oCount, oEmployees, oSize, ns.format.number(division.researchPoints, 3))

    while (indDataDB[hasDivDB[div].industry] === undefined) {
      indDataDB[hasDivDB[div].industry] = await corpRun(ns, 'getIndustryData', division.industry)
      await ns.sleep(100);
    }
    if (indDataDB[hasDivDB[div].industry].makesProducts) {
      for (const product of division.products) {
        const prog = (await corpRun(ns, 'getProduct', div, "Sector-12", product)).developmentProgress
        const sellPrice = await getSellPrice(ns, div, "Sector-12", product)
        if (prog === 100) {
          if (sellPrice === 0) ns.printf("  Calculating - %s", product)
          else {
            ns.printf("  $%s - %s", ns.format.number(await getSellPrice(ns, div, "Sector-12", product), 3), product)
          }
        }
        else {
          ns.printf("  %s%s - %s", ns.format.number(prog, 2), "%", product);
        }
      }
    }
  }
  ns.ui.renderTail()
}

function resetInvestmentPeakTracking(round = 0) {
  investmentPeakRound = Number(round) || 0
  investmentPeakActive = false
  investmentPeakOffer = 0
  investmentOfferStallCycles = 0
}

function beginInvestmentReview(ns, round, reason) {
  investmentReview = {round, remaining: INVESTMENT_REVIEW_CYCLES}
  resetInvestmentPeakTracking(round)
  log(ns, `Round ${round}: ${reason}. Keeping production, sales and employee care running while ` +
    `growth purchases pause for ${INVESTMENT_REVIEW_CYCLES} corporation cycles to measure the investment offer.`, true, 'info')
}

// Price the next stage once per review. A new division includes its first office and
// warehouse; an existing office with no warehouse only needs the warehouse.
async function quoteBn3Stage(ns, round, corp, constants) {
  const {officeInitialCost, warehouseInitialCost, officeInitialSize, secondsPerMarketCycle} = constants
  if (![officeInitialCost, warehouseInitialCost, officeInitialSize, secondsPerMarketCycle].every(x => Number.isFinite(x) && x > 0))
    return null
  if (round >= 3) {
    // Price this company's next design and operating cash. A paper build of six
    // 250-seat offices, a Restaurant, or a missing support division is not a cash goal.
    const line = cashPlan?.focus ?? div3
    const d = corp.divisions.includes(line) ? await corpRun(ns, 'getDivision', line) : null
    const rows = d?.products.flatMap(n => d.cities.map(c => [line,c,n])) ?? []
    const products = await corporationBatch(ns, 'getProduct', rows)
    const productSelling = products.some(p => p?.developmentProgress === 100 && p.actualSellAmount > 0)
    const version = Math.max(0, ...(d?.products ?? []).map(parseVersion))
    const design = projectBudget(version, corp, round)
    const runway = Math.max(ROUND_ONE_OPERATING_RESERVE, corp.expenses * secondsPerMarketCycle * 3)
    const startup = !d ? (await corpRun(ns,'getIndustryData',line)).startingCost :
      !(await corpRun(ns,'hasWarehouse',line,'Sector-12')) ? warehouseInitialCost : 0
    const names = ['Market Research - Demand', 'Market Data - Competition']
    const owned = await corporationBatch(ns,'hasUnlock',names.map(n => [n]))
    const costs = await corporationBatch(ns,'getUnlockCost',names.filter((_,i) => !owned[i]).map(n => [n]))
    const setup = startup + costs.reduce((a,b) => a+b,0)
    const firstDesignCash = !setup && d?.products.length ? 0 :
      ROUND_ONE_OPERATING_RESERVE + setup + (startup ? ROUND_TWO_TOBACCO_RESERVE : 2e9)
    const minimum = Math.max(runway + setup + design, firstDesignCash)
    if (![minimum, design, runway].every(x => Number.isFinite(x) && x > 0)) return null
    return {line, productSelling, minimum, next:minimum, full:minimum, design, runway,
      firstDesignCash, seconds:secondsPerMarketCycle}
  }
  const names = [div1, div3, div2]
  const existing = names.filter(name => corp.divisions.includes(name))
  const missing = names.filter(name => !existing.includes(name))
  const divisions = await corporationBatch(ns, 'getDivision', existing.map(name => [name]))
  const industryData = await corporationBatch(ns, 'getIndustryData', missing.map(name => [name]))
  const locations = divisions.flatMap(d => d.cities.map(city => [d.name, city]))
  const warehouses = await corporationBatch(ns, 'hasWarehouse', locations)
  if (warehouses.length !== locations.length || !warehouses.every(x => typeof x === 'boolean')) return null
  const footprint = officeInitialCost + warehouseInitialCost
  const buildCost = Object.fromEntries(missing.map((name, i) =>
    [name, industryData[i].startingCost + (cities.length - 1) * footprint]))
  for (const d of divisions) buildCost[d.name] = (cities.length - d.cities.length) * footprint
  locations.forEach(([name], i) => {if (!warehouses[i]) buildCost[name] += warehouseInitialCost})
  let setup = Object.values(buildCost).reduce((sum, cost) => sum + cost, 0)
  const unlocks = ['Market Research - Demand', 'Market Data - Competition', 'Export']
  const owned = await corporationBatch(ns, 'hasUnlock', unlocks.map(name => [name]))
  const missingUnlocks = unlocks.filter((_, i) => !owned[i])
  const prices = await corporationBatch(ns, 'getUnlockCost', missingUnlocks.map(name => [name]))
  setup += prices.reduce((a, b) => a + b, 0)

  const tobacco = divisions.find(d => d.name === div3)
  const version = Math.max(0, ...(tobacco?.products ?? []).map(parseVersion))
  const design = projectBudget(version, corp, round)
  const runway = Math.max(ROUND_ONE_OPERATING_RESERVE, corp.expenses * secondsPerMarketCycle * 3)
  const seats = (size, end) => end <= size ? 0 :
    officeInitialCost / .09 * 1.09 ** (size/3) * (1.09 ** ((end-size)/3)-1)
  if (round === 1) {
    const ag = divisions.find(d=>d.name===div1)
    const offices=await corporationBatch(ns,'getOffice',(ag?.cities ?? []).map(c=>[div1,c]))
    const unlock=name=>prices[missingUnlocks.indexOf(name)] ?? 0
    const core=runway+buildCost[div1]+unlock('Export')+buildCost[div2]
    const ad=ag && ag.numAdVerts<8 ? await corpRun(ns,'getHireAdVertCost',div1) : 0
    const adverts=ad*(1.06**Math.max(0,8-(ag?.numAdVerts ?? 0))-1)/.06
    const chemCities=locations.filter(([n],i)=>n===div2 && warehouses[i])
    const levels=await corporationBatch(ns,'getWarehouse',chemCities)
    const smallWarehouses=(cities.length-levels.filter(w=>w.level>=2).length)*
      (constants.warehouseSizeUpgradeCostBase ?? 1e9)*1.07**2
    const full=core+unlocks.slice(0,2).reduce((a,n)=>a+unlock(n),0)+smallWarehouses+adverts+
      cities.reduce((t,c)=>t+seats(offices[ag?.cities.indexOf(c)]?.size ?? officeInitialSize,8),0)
    // If investors cannot fund even the design half of v1 and our cash can launch it,
    // the three included seats can design while the farm earns the optional upgrades.
    const starter=tobacco ? 0 : industryData[missing.indexOf(div3)].startingCost
    const launch=runway+buildCost[div1]+starter+design
    const extra=corp.funds>=launch && investOffer.funds<design/2 ? 0 :
      seats(officeInitialSize,10)+unlock('Market Research - Demand')+unlock('Market Data - Competition')
    const lean=bnMults.CorporationValuation<1 ? Math.min(core,launch+extra) : core
    return [full,lean].every(n=>Number.isFinite(n) && n>0) ?
      {minimum:full,next:full,full,supportCapital:lean,design,runway,seconds:secondsPerMarketCycle} : null
  }
  const currentCities = tobacco?.cities ?? []
  const offices = await corporationBatch(ns,'getOffice',currentCities.map(c=>[div3,c]))
  const size = c => offices[currentCities.indexOf(c)]?.size ?? officeInitialSize
  const hq = size('Sector-12'), target=ROUND_THREE_TOBACCO_SEATS
  const minimum=setup+design+runway+seats(hq,Math.min(target,hq+officeInitialSize))
  const next=setup+design+runway+seats(hq,target)
  const full=setup+design+runway+cities.reduce((a,c)=>a+seats(size(c),target),0)
  // Price the tranche itself separately from the company's cash. A new project
  // plus a meaningful HQ expansion must be paid by the investor, not old equity.
  const ticket=buildCost[div3]+design+seats(hq,Math.max(10,hq+3,Math.min(2*hq,target)))
  if (![minimum,next,full,ticket].every(n=>Number.isFinite(n) && n>0)) return null
  const lean=bnMults.CorporationValuation<1 && tobacco && !divisions.some(d=>d.name===div2)
  const launch=design+runway+seats(hq,Math.max(10,hq))
  const stage={minimum:lean ? launch : minimum,next,full,design,runway,
    organic:runway+ticket, ticket:lean ? design+seats(hq,Math.max(10,hq+3)) : ticket,seconds:secondsPerMarketCycle}

  return stage
}

function factionCashGoal(constants, snapshot, route, reset) {
  const now = Date.now(), fresh = t => Number.isFinite(t) && t >= reset.lastAugReset && t <= now && now - t <= 90_000
  if (!reset || snapshot?.current_node !== reset.currentNode || snapshot?.last_aug_reset !== reset.lastAugReset ||
      !fresh(snapshot.generated_at) || snapshot.reset_planning?.version !== 1 || !route ||
      !fresh(route.updatedAt) || route.lastNodeReset !== reset.lastNodeReset || route.lastAugReset !== reset.lastAugReset ||
      !['faction-rep','donation-unlock'].includes(route.kind) || typeof route.faction !== 'string' ||
      !Number.isFinite(constants?.bribeAmountPerReputation) || constants.bribeAmountPerReputation <= 0) return 0
  const cost = Math.ceil((route.targetRep - snapshot.reset_planning.reputation?.[route.faction]) * constants.bribeAmountPerReputation)
  return Number.isFinite(cost) && cost > 0 ? cost : 0
}

// Money raised belongs to the company. Count a player benefit only when a current plan can use it.
function bn3FundingBenefit(round, corp, offer, cash, stage, constants, snapshot, route) {
  if (round === 1) return ''
  const now = Date.now()
  const fresh = time => Number.isFinite(time) && time >= bn3Reset.lastAugReset && time <= now && now - time <= 90_000
  const plan = snapshot?.reset_planning
  if (snapshot?.current_node !== bn3Reset.currentNode || snapshot?.last_aug_reset !== bn3Reset.lastAugReset ||
      !fresh(snapshot.generated_at) || plan?.version !== 1) return ''
  const post = cash + offer.funds
  if (corp.valuation >= constants.bribeThreshold) {
    const cost = factionCashGoal(constants, snapshot, route, bn3Reset)
    const spendable = (funds, r) => funds - getCorporationBribeReserve({funds, expenses: corp.expenses}, r)
    if (Number.isFinite(cost) && cost > 0 && spendable(cash, round) < cost &&
        spendable(post, round + 1) >= cost && post - cost >= stage.minimum)
      return `funds the active ${route.faction} reputation target`
  }
  if (round !== 4 || snapshot.stock_value_known !== true || !Number.isFinite(plan.wealth) ||
      !Array.isArray(plan.goals)) return ''
  const rate = getSafeDividendRate({...corp, funds: post - (stage.minimum - stage.runway)}, dividendRate, stage.seconds)
  const retainedFraction = (corp.numShares - offer.shares) / corp.totalShares
  if (!(rate > 0 && retainedFraction > 0 && retainedFraction <= 1 && Number.isFinite(corp.tributeModifier) &&
      corp.tributeModifier >= 0 && corp.tributeModifier < 1)) return ''
  const perCycle = ((corp.revenue - corp.expenses) * stage.seconds * rate * retainedFraction) ** (1 - corp.tributeModifier)
  const goal = plan.goals.find(g => Number.isFinite(g?.money) && Number.isFinite(g.rep) &&
    Number.isFinite(plan.reputation?.[g.faction]) && plan.reputation[g.faction] >= g.rep &&
    g.money > plan.wealth && g.money - plan.wealth <= perCycle * INVESTMENT_REVIEW_CYCLES)
  return goal ? `dividends can close the cash gap for ${goal.label} within one review` : ''
}

function evaluateBn3Offer(stage, corp, cash, offer, offerRate, extraCycles, benefit) {
  const capital = cash + offer
  const income = Math.max(0, corp.revenue - corp.expenses)
  const cycle = stage.seconds
  const usable = Number.isFinite(capital) && Number.isFinite(offer) && offer > 0
  if (!usable) return {action: 'grow', reason: 'waiting for a valid cash balance and offer'}
  const affordable = capital >= stage.minimum
  if (affordable && benefit) return {action: 'accept', reason: benefit}
  if (stage.productSelling === false) {
    // While a first design is progressing, cash for a new Restaurant alone is no reason
    // to give up private funding. Allow a real rescue if operations cannot pay for the
    // first design or cannot stay solvent through the next review.
    const net = corp.revenue - corp.expenses
    const nextCash = cash + net * cycle * INVESTMENT_REVIEW_CYCLES
    const rescue = (stage.firstDesignCash > 0 && Math.max(cash, nextCash) < stage.firstDesignCash) ||
      (net <= 0 && nextCash < 0)
    return affordable && rescue ? {action: 'accept', reason: 'funds a blocked first product or operating shortfall'} :
      {action: 'grow', reason: `waiting for ${stage.line} product sales; keeping growth and design running`}
  }
  const goal = capital < stage.minimum ? stage.minimum : capital < stage.next ? stage.next : stage.full
  const gap = goal - capital
  const eta = gap / (offerRate + income)
  const earningTime = income > 0 ? gap / income : Infinity
  // Advancing now can still earn the rest. Only defer if the time saved obtaining
  // this specific build exceeds the time we would forgo operating the new stage.
  if (extraCycles > 0 && offerRate > 0 && eta > 0 && eta <= extraCycles * cycle && earningTime - eta > Math.max(cycle, eta))
    return {action: 'wait', reason: `investor growth can fund the next build in ~${Math.ceil(eta)}s of production`}
  if (!affordable) return {action: 'grow', reason: 'offer still leaves setup or operating costs unfunded'}
  // Cash already owned is not a reason to sell another equity tranche for a token offer.
  if (offer < income * cycle * INVESTMENT_REVIEW_CYCLES || (cash >= stage.minimum && offer < stage.design))
    return {action: 'grow', reason: 'new money buys less than a project or one review of earnings'}
  return {action: 'accept', reason: capital >= stage.full ? 'the entire next build is funded' :
    'the next productive step is funded; waiting buys no near-term upgrade'}
}

function supplyStatus() {
  return `Preparing round 2: Agriculture ${Math.floor(hasDivDB[div1]?.researchPoints || 0)}/700 RP, Chemical ${Math.floor(hasDivDB[div2]?.researchPoints || 0)}/390 RP; waiting for production and sales.`
}

async function roundTwoSelling(ns) {
  const t=hasDivDB[div3]
  if (t?.products.length) {
    const products=await corporationBatch(ns,'getProduct',t.cities.flatMap(c=>t.products.map(n=>[div3,c,n])))
    if (products.some(p=>p.developmentProgress===100 && p.actualSellAmount>0) && t.lastCycleRevenue>t.lastCycleExpenses) return true
  }
  if (!researchedDB.Export || ![div1,div2].every(n=>hasCompleteDivisionInfrastructure(n) &&
      hasDivDB[n]?.researchPoints>=supplyResearch[n])) return false
  const rows=[...cities.map(c=>[div1,c,'Food']),...cities.map(c=>[div2,c,'Chemicals'])]
  const stock=await corporationBatch(ns,'getMaterial',rows)
  const food=stock.slice(0,cities.length),chem=stock.slice(cities.length)
  return food.some(m=>m.productionAmount>0 && m.actualSellAmount>0) && chem.some(m=>m.productionAmount>0)
}

async function reviewBn3Offer(ns, round, corp) {
  let review = investmentReview, constants, stage, productive
  if (bnMults.CorporationValuation<1 && (round===1 || round===2) && hasCompleteDivisionInfrastructure(div1)) {
    // In a heavily discounted node Agriculture may have to fund the next
    // division itself. Optional storage/boost orders cannot consume every harvest.
    savedForDivision=Math.min(Math.max(0,corp.funds-ROUND_ONE_OPERATING_RESERVE),
      savedForDivision+Math.max(0,corp.revenue-corp.expenses)*5)
  }
  if (round===2 && (!review || review.remaining<=1)) {
    productive=await roundTwoSelling(ns)
    // No discretionary freeze while labs are researching or farms are not selling.
    // A debt rescue or an eligible player milestone can still be priced immediately.
    if (!productive && corp.funds>Math.max(ROUND_ONE_OPERATING_RESERVE,corp.expenses*120) &&
        corp.valuation < (corporationConstants?.bribeThreshold ?? 100e12)) {
      investmentReview=null
      fundingStatus=supplyStatus()
      return round
    }
  }
  if (!review) {
    if (round >= 3 && fundingSettleCycles > 0 && --fundingSettleCycles > 0) return round
    if (round === 2 && fundingGrowthCycles > 0 && --fundingGrowthCycles > 0) return round
    if ((round <= 2 && !hasDivDB[div1]) || !(investOffer.funds > 0) || (round === 1 && !(corp.revenue > 0))) return round
    if (round >= 3) {
      constants = await getCorporationConstants(ns)
      stage = constants && await quoteBn3Stage(ns, round, corp, constants)
    }
    if (round !== 2 || !productive) {
      // Seed and late offers are checked during normal operations. With an established
      // business, check the value of taking the money without pausing designers or sales.
      review = {remaining: 1, offers: [], extra: 0}
    } else {
      beginInvestmentReview(ns, round, 'production is selling; measuring the Tobacco investment')
      investmentReview.offers = []
      investmentReview.extra = INVESTMENT_REVIEW_CYCLES
      return round
    }
  }
  review.offers.push(Number(investOffer.funds))
  if (--review.remaining > 0) return round
  // Reprice before every decision. The home helper reads the real offer and the plans in
  // the same turn; an offloaded manager never copies stale files over a running worker.
  constants ??= await getCorporationConstants(ns)
  stage ??= constants && await quoteBn3Stage(ns, round, corp, constants)
  const report = await corpRun(ns, 'getInvestmentOffer', '--bn3-review')
  if (!report?.corporation || !report.offer) {
    investmentReview = null
    seedCapitalSamples = []
    fundingGrowthCycles = INVESTMENT_REVIEW_CYCLES
    tobaccoBooster = false
    fundingStatus = 'Could not read the live offer. Sync bin/corpRun.js on home; growth has resumed.'
    log(ns, fundingStatus, true, 'warning')
    return round
  }
  const {offer, corporation: latest, snapshot, route} = report
  const actualRound = getCorporationPhase(latest, offer)
  if (actualRound !== round) {
    investmentReview = null
    fundingGrowthCycles = INVESTMENT_REVIEW_CYCLES
    tobaccoBooster = false
    fundingStatus = ''
    return actualRound || round
  }
  investOffer = offer
  const cash = await corpFunds(ns, 0, latest) // Retains debt and already committed bills.
  const samples = review.offers
  samples[samples.length - 1] = offer.funds
  let decision = {action: 'grow', reason: 'no reliable stage or operating quote'}
  if (stage && latest?.public === false && Number.isSafeInteger(latest.investorShares) && latest.investorShares >= 0 &&
      Number.isFinite(latest.valuation) && latest.valuation > 0 && latest.expenses === corp.expenses && Number.isFinite(latest.revenue) && Number.isFinite(latest.expenses) &&
      latest.expenses >= 0 && Number.isFinite(cash) && Number.isFinite(offer.funds) && offer.funds > 0) {
    // Require a sustained rise, not a single spike or the investment from the previous round.
    const end = samples.length - 1
    const rate = end < 6 ? 0 : Math.max(0, Math.min(samples[end] - samples[end - 3], samples[end - 3] - samples[end - 6]) / (3 * stage.seconds))
    const benefit = bn3FundingBenefit(round, latest, offer, cash, stage, constants, snapshot, route)
    decision = evaluateBn3Offer(stage, latest, cash, offer.funds, rate, review.extra, benefit)
    if (round === 2 && !benefit) {
      if (!productive && !(cash < 0 && latest.revenue<=latest.expenses && cash+offer.funds>=stage.minimum))
        decision={action:'grow',reason:'building the supply chain; no operating shortfall to finance'}
      else if (productive && offer.funds<stage.ticket) {
        const organic=bnMults.CorporationValuation<1 && cash>=stage.organic && latest.revenue>latest.expenses && rate<=latest.revenue-latest.expenses
        decision=organic ? {action:'accept',reason:'the company itself funds the design HQ; this discounted tranche no longer speeds growth'} :
          {action:'grow',reason:'new investor cash alone does not fund the next Tobacco expansion'}
      } else if (productive && decision.action==='accept' && rate>Math.max(0,latest.revenue-latest.expenses) &&
          review.extra>0 && cash+offer.funds<stage.full)
        decision={action:'wait',reason:'priced offer still rising faster than retained earnings'}
    }
    if (round === 1) {
      const capital=cash+offer.funds, period=INVESTMENT_REVIEW_CYCLES
      if (capital<stage.supportCapital) seedCapitalSamples=[]
      else {
        seedCapitalSamples.push(capital)
        if (seedCapitalSamples.length>2*period) seedCapitalSamples.shift()
        const n=seedCapitalSamples.length
        const gain=n<7 ? 0 : Math.max(0,Math.min(capital-seedCapitalSamples[n-4],
          seedCapitalSamples[n-4]-seedCapitalSamples[n-7])/3)
        const wait=n<period || (n<2*period && gain>Math.max(0,latest.revenue-latest.expenses)*stage.seconds)
        const funded=evaluateBn3Offer({...stage,minimum:stage.supportCapital},latest,cash,offer.funds,0,0,'')
        const selfFunded=bnMults.CorporationValuation<1 && cash>=stage.supportCapital && latest.revenue>latest.expenses
        // Once harvests can pay for the next division without the investor,
        // don't spend that same money on optional boosters during the observation.
        if (selfFunded && offer.funds<stage.supportCapital)
          savedForDivision=Math.max(savedForDivision,stage.supportCapital-ROUND_ONE_OPERATING_RESERVE)
        decision=wait ? {action:'grow',reason:'measuring the producing Agriculture offer; farming continues'} :
          funded.action==='accept' || selfFunded ? {action:'accept',reason:capital>=stage.full ?
            'funds the Agriculture/Chemical build and its operating cash' : 'funds the next operating division; further waiting buys less'} : funded
      }
    }
  } else if (round === 1) {
    seedCapitalSamples = []
  }
  const money = x => ns.format.number(x, 3)
  fundingStatus = `${decision.reason}.` + (stage && Number.isFinite(cash)
    ? ` Net cash + offer $${money(cash + offer.funds)}; next step $${money(stage.supportCapital ?? stage.minimum)}, full build $${money(stage.full)}.` : '')
  if (decision.action === 'wait') {
    if (review.extra === INVESTMENT_REVIEW_CYCLES) log(ns, `Round ${round}: ${fundingStatus}`, true, 'info')
    review.extra--
    review.remaining = 1
    return round
  }
  investmentReview = null
  fundingGrowthCycles = INVESTMENT_REVIEW_CYCLES
  if (round >= 3) tobaccoBooster = false
  if (decision.action === 'accept') {
    const next = await acceptReviewedOffer(ns, round, offer.funds, latest)
    if (next > round) log(ns, `Round ${round}: took $${money(offer.funds)}; ${decision.reason}.`, true, 'info')
    return next
  }
  if (round === 2) log(ns, `Round ${round}: resuming growth. ${fundingStatus}`, true, 'info')
  return round
}

/** @param {NS} ns */
async function checkInvest(ns) {
  const round = Number(investOffer?.round)
  const corp = await getCorp(ns)
  if (corp?.public === true) { investmentReview = null; return 5 }
  if (!corp || !Number.isInteger(round) || round < 1 || round > 4) return round

  if (investmentReview && investmentReview.round !== round) investmentReview = null
  if (investmentPeakRound !== round) resetInvestmentPeakTracking(round)
  if (round === 2) roundTwoAllocation.maySave = Number.isFinite(corp.revenue) && corp.revenue > 0

  if (bn3Reset) return reviewBn3Offer(ns, round, corp)

  let offerFunds = Number(investOffer.funds)
  const capitalTarget = getInvestmentCapitalTarget(round, bnMults.CorporationValuation)
  const projectedCapital = getProjectedInvestmentCapital(offerFunds, corp.funds)
  if (!isInvestmentRoundOperationallyReady(round, hasCompleteDivisionInfrastructure(div2))) return round

  // Preserve the existing early product-division signal, but express it in actual dollars.
  const wasBoosting = tobaccoBooster
  if ((round === 3 || round === 4) &&
    getProjectedInvestmentCapital(offerFunds * 4, corp.funds) >= capitalTarget) {
    tobaccoBooster = true
  }

  if (round >= 2) {
    if (!investmentReview) {
      if (projectedCapital < capitalTarget) {
        if (round !== 2) return round
        // Round two can spend every spare dollar while waiting for an offer which that
        // spending suppresses. Measure a finished first product; do not wait for a full
        // lineup or positive displayed profit (booster purchases count as expenses).
        if (roundTwoGrowthCycles > 0 && --roundTwoGrowthCycles > 0) return round
        if (!Number.isFinite(corp.funds) || corp.funds < 0 ||
            !Number.isFinite(corp.revenue) || corp.revenue <= 0 ||
            !hasCompleteDivisionInfrastructure(div1) || !hasCompleteDivisionInfrastructure(div3) ||
            !(await hasCompletedManagedProduct(ns, div3))) return round
      }
      beginInvestmentReview(ns, round, projectedCapital >= capitalTarget
        ? 'Investment target reached' : 'First Tobacco product selling; checking the round-two offer')
      return round
    }
    if (!wasBoosting && tobaccoBooster) {
      // Give all-city production a complete averaging window after job assignments take effect.
      investmentReview.remaining = INVESTMENT_REVIEW_CYCLES
      return round
    }
    if (--investmentReview.remaining > 0) return round
    investmentReview = null
    // A missed round-two target must leave time for growth before another measurement.
    // Recheck even if v1 is still the only product and v2 remains unaffordable.
    if (round === 2) roundTwoGrowthCycles = INVESTMENT_REVIEW_CYCLES
    resetInvestmentPeakTracking(round)

    // Use a fresh real offer, never an income-based estimate. Cash accumulation can keep the
    // offer rising indefinitely, so a completed review must not wait forever for a decline.
    const freshOffer = await readInvestmentOffer(ns)
    if (Number(freshOffer?.round) !== round) return Number(freshOffer?.round) || round
    investOffer = freshOffer
    offerFunds = Number(freshOffer.funds)
    if (getProjectedInvestmentCapital(offerFunds, (await getCorp(ns)).funds) < capitalTarget) {
      log(ns, `Round ${round}: investment review complete; offer $${ns.format.number(offerFunds, 3)} ` +
        `is below the capital target. Resuming growth and funded product replacement.`, true, 'info')
      return round
    }
  } else {
    if (!investmentPeakActive) {
      if (!shouldTrackInvestmentPeak(round, offerFunds, corp.funds, bnMults.CorporationValuation)) return round

      investmentPeakActive = true
      investmentPeakOffer = Math.max(0, offerFunds)
      investmentOfferStallCycles = 0
      log(ns, `Round ${round} reached ${ns.format.number(projectedCapital, 3)} projected capital ` +
        `(target ${ns.format.number(capitalTarget, 3)}). Tracking the actual offer peak.`, true, 'info')
      return round
    }

    const decision = evaluateInvestmentPeak(investmentPeakOffer, offerFunds, investmentOfferStallCycles)
    investmentPeakOffer = decision.peakOffer
    investmentOfferStallCycles = decision.stagnantCycles
    if (!decision.accept) return round
  }

  return acceptReviewedOffer(ns, round, offerFunds)
}

async function acceptReviewedOffer(ns, round, offerFunds, quote) {
  const accepted = quote ? await corpRun(ns, 'acceptInvestmentOffer', '--if-current', quote.investorShares, quote.valuation, quote.funds, quote.nextState) :
    await corpRun(ns, 'acceptInvestmentOffer')
  if (accepted !== true) {
    if (quote) {
      fundingStatus = accepted === 'deferred' ? 'Not enough free home RAM for the final offer check; growth has resumed.' :
        'Offer, cash balance or phase changed before acceptance; growing until the next quote.'
      log(ns, `Round ${round}: ${fundingStatus}`, true, 'info')
    }
    return round
  }

  const nextOffer = await corpRun(ns, 'getInvestmentOffer')
  await recordRunEvents(ns, [{kind: 'corporation-investment', key: String(round), data: {round, offerFunds}}])
  const nextRound = Number(nextOffer?.round)
  investOffer = nextOffer
  teaNeeded = true
  if (round === 3 || bn3Reset) tobaccoBooster = false
  if (bn3Reset) {
    savedForDivision=0
    fundingSettleCycles = INVESTMENT_REVIEW_CYCLES
    fundingGrowthCycles = INVESTMENT_REVIEW_CYCLES
    fundingStatus = ''
  }
  resetInvestmentPeakTracking(nextRound)

  const resolvedNextRound = Number.isInteger(nextRound) && nextRound > round ? nextRound : round + 1
  return resolvedNextRound
}
function cashGrowthReserve(corp, reserve) {
  const goal = cashPlan.goal > 0 ? cashPlan.goal + getCorporationBribeReserve(corp, investOffer.round) : 0
  return Math.max(reserve, cashPlan.floor, goal)
}
/** @param {NS} ns */
async function corpFunds(ns, reserve = ROUND_ONE_OPERATING_RESERVE, expected, forDesign = false) {
  // Employee care uses reserve=0; recipe inputs are funded separately in purchase().
  if (investmentReview && reserve > 0) return 0
  const corporation = expected ?? await getCorp(ns)
  const divisions = await corporationBatch(ns, 'getDivision', corporation.divisions.map(div => [div]))
  const latest = await getCorp(ns)
  // Do not combine a pre-START cash balance with post-START bills (or cross a purchase).
  if (latest.nextState !== corporation.nextState || (expected && (latest.funds !== expected.funds ||
      latest.public !== expected.public || latest.valuation !== expected.valuation))) return -Infinity
  // Material purchases have already happened, but the game deducts these bills at START.
  const unpaid = divisions.reduce((sum, div) => sum + div.thisCycleExpenses, 0)
  const available = latest.funds - unpaid - pendingInputPurchases - reserve
  if (!Number.isFinite(available)) return -Infinity
  if (reserve > 0 && usesCashPolicy(investOffer?.round) && cashPlan) {
    if (!Number.isFinite(cashPlan.floor)) return 0
    return latest.funds - unpaid - pendingInputPurchases - cashGrowthReserve(latest, reserve)
      - (forDesign ? 0 : cashPlan.designHold || 0)
  }
  if (reserve > 0 && investOffer?.round === 2 && roundTwoAllocation.goal > 0) {
    // Only quoting the priority purchase updates savings. Other purchases can repeatedly
    // read their remaining allowance without reserving the same cash again.
    return available - Math.min(Math.max(0, available), roundTwoAllocation.saved)
  }
  return available
}

// Quote the first blocked setup step or an empty Tobacco slot. Once per earning cycle,
// set aside half the uncommitted cash, up to the price plus its existing cushion.
function saveRoundTwoCapital(available, cost, reserve, forSetup) {
  if (investOffer?.round !== 2 || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(available)) return
  if (roundTwoAllocation.forSetup) return // First blocked construction step takes priority this pass.
  const goal = cost + reserve
  const prior = Math.min(roundTwoAllocation.saved, goal, Math.max(0, available))
  const deposit = roundTwoAllocation.maySave ? Math.max(0, available - prior) / 2 : 0
  roundTwoAllocation = { forSetup, goal, saved: Math.min(goal, prior + deposit), maySave: false }
}

async function corporationBatch(ns, fn, calls, once = false) {
  if (!calls.length) return []
  return corpRun(ns, fn, once ? '--once' : '--batch', JSON.stringify(calls))
}

// Clear orders inherited from the old manager, including when it was offloaded or interrupted.
async function stopBoostPurchases(ns) {
  const corporation = await getCorp(ns)
  const divisions = await corporationBatch(ns, 'getDivision', corporation.divisions
    .filter(name => industries.includes(name)).map(name => [name]))
  const locations = divisions.flatMap(div => div.cities.map(city => [div.name, city]))
  const warehouses = await corporationBatch(ns, 'hasWarehouse', locations)
  await corporationBatch(ns, 'buyMaterial', locations.flatMap(([div, city], i) => warehouses[i]
    ? BOOST_MATERIALS.map(material => [div, city, material, 0]) : []))
}

async function expandCities(ns, division, options = {}) {
  const allowExpansion = options.allowExpansion !== false
  const reserve = Number(options.reserve) || 0
  let divisionInfo = await getOptionalDivision(ns, division)

  if (!divisionInfo) {
    const corporation = await getCorp(ns)
    const limit = Math.ceil(20 * (bnMults?.CorporationDivisions ?? 1))
    if (!Number.isFinite(limit) || corporation.divisions.length >= limit) return false
    const industryData = await corpRun(ns, 'getIndustryData', division)
    const startingCost = Number(industryData?.startingCost)
    const funds = await corpFunds(ns)
    if (!canAffordCorporationPurchase(funds, startingCost, reserve)) {
      saveRoundTwoCapital(funds, startingCost, reserve, true)
      return false
    }

    await corpRun(ns, 'expandIndustry', division, division)
    divisionInfo = await corpRun(ns, 'getDivision', division)
    if (!divisionInfo) {
      return false
    }
  }

  hasDivDB[division] = divisionInfo
  const constants = await getCorporationConstants(ns)
  if (!constants) {
    return true
  }

  for (const city of options.homeOnly ? ['Sector-12'] : cities) {
    const key = division + city
    const cityExists = Array.isArray(divisionInfo.cities) && divisionInfo.cities.includes(city)

    if (!cityExists) {
      delete hasOfficeDB[key]
      delete hasWarehouseDB[key]
      if (!allowExpansion) continue

      const combinedCost = Number(constants.officeInitialCost) + Number(constants.warehouseInitialCost)
      const funds = await corpFunds(ns)
      if (!canAffordCorporationPurchase(funds, combinedCost, reserve)) {
        saveRoundTwoCapital(funds, combinedCost, reserve, true)
        return true
      }

      await corpRun(ns, 'expandCity', division, city)
      const office = await corpRun(ns, 'getOffice', division, city)
      if (!office) {
        return true
      }
      hasOfficeDB[key] = office

      await corpRun(ns, 'purchaseWarehouse', division, city)
      if (await corpRun(ns, 'hasWarehouse', division, city) !== true) {
        return true
      }
      hasWarehouseDB[key] = true
      divisionInfo = await corpRun(ns, 'getDivision', division)
      hasDivDB[division] = divisionInfo
      continue
    }

    const office = await corpRun(ns, 'getOffice', division, city)
    if (!office) {
      delete hasOfficeDB[key]
      return true
    }
    hasOfficeDB[key] = office

    if (await corpRun(ns, 'hasWarehouse', division, city) === true) {
      hasWarehouseDB[key] = true
      continue
    }

    delete hasWarehouseDB[key]
    if (!allowExpansion) continue

    const warehouseCost = Number(constants.warehouseInitialCost)
    const funds = await corpFunds(ns)
    if (!canAffordCorporationPurchase(funds, warehouseCost, reserve)) {
      saveRoundTwoCapital(funds, warehouseCost, reserve, true)
      return true
    }

    await corpRun(ns, 'purchaseWarehouse', division, city)
    if (await corpRun(ns, 'hasWarehouse', division, city) !== true) {
      return true
    }
    hasWarehouseDB[key] = true
  }

  return true
}

async function tryPurchaseUnlock(ns, purchase) {
  if (await corpRun(ns, 'hasUnlock', purchase) === true) {
    researchedDB[purchase] = true
    return true
  }

  const cost = Number(await corpRun(ns, 'getUnlockCost', purchase))
  const funds = await corpFunds(ns)
  if (!canAffordCorporationPurchase(funds, cost)) {
    saveRoundTwoCapital(funds, cost, 0, true)
    return false
  }

  await corpRun(ns, 'purchaseUnlock', purchase)
  const unlocked = await corpRun(ns, 'hasUnlock', purchase) === true
  if (unlocked) researchedDB[purchase] = true
  return unlocked
}
/** @param {NS} ns */
async function prep(ns) {
  pendingInputPurchases = 0
  investOffer = await readInvestmentOffer(ns)
  const round = Number(investOffer?.round)
  if (investmentReview && investmentReview.round !== round) investmentReview = null
  // Re-establish the current goal from live infrastructure/product snapshots each pass.
  // Keep saved cash across phases while required purchases remain unaffordable.
  roundTwoAllocation.goal = 0
  roundTwoAllocation.forSetup = false
  if (!Number.isFinite(round)) {
    return false
  }

  if (!(await ensureCorporationApis(ns))) return false
  if (!boostOrdersInitialized) {
    await stopBoostPurchases(ns)
    boostOrdersInitialized = true
  }
  if (round >= 5) await manageCorporationPayout(ns, round, dividendRate)
  if (bn3Reset && round === 2) return prepareSupplyRound(ns)
  if (usesCashPolicy(round)) {
    await prepareCashOperations(ns, round)
    return Number.isFinite(cashPlan.floor) && !!cashPlan.goods
  }

  if (round >= 1) {
  const agriculture = await getOptionalDivision(ns, div1)
  const cityCount = Array.isArray(agriculture?.cities) ? agriculture.cities.length : 0
  const reserve = round === 1
    ? getRoundOneExpansionReserve(cityCount, cities.length, capitalConstrainedBootstrap)
    : 0

  if (round === 1 && capitalConstrainedBootstrap) {
    // Create/discover Sector-12 first, but do not spend the final $9b on Aevum before the home office
    // is productive and large enough to generate its own expansion capital.
    if (!(await expandCities(ns, div1, { allowExpansion: false, reserve }))) return false
    const refreshedDivision = await corpRun(ns, 'getDivision', div1)
    const refreshedCityCount = Array.isArray(refreshedDivision?.cities)
      ? refreshedDivision.cities.length
      : 0
    const homeOffice = await corpRun(ns, 'getOffice', div1, "Sector-12")
    const officeTarget = getRoundOneOfficeTarget(
      "Sector-12",
      refreshedCityCount,
      cities.length,
      true,
    )
    const allowExpansion = Number(homeOffice?.size) >= officeTarget &&
      isRoundOneBootstrapReady(refreshedDivision, homeOffice)
    if (!(await expandCities(ns, div1, { allowExpansion, reserve }))) return false
  } else if (!(await expandCities(ns, div1, { allowExpansion: true, reserve }))) {
    return false
  }
}
  if (round >= 2 && hasCompleteDivisionInfrastructure(div1)) {
    const hasMarketData = await tryPurchaseUnlock(ns, "Market Research - Demand") &&
      await tryPurchaseUnlock(ns, "Market Data - Competition")
    if (hasMarketData) {
      // Create Tobacco with only its free Sector-12 office/warehouse. manageProducts() starts the first project
      // before expansion consumes the rest of the round-one investment.
      if (!(await expandCities(ns, div3, {
        allowExpansion: false,
        reserve: ROUND_TWO_TOBACCO_RESERVE,
      }))) return !!bn3Reset && round < 5 // Agriculture can earn and a private offer can finance the missing setup.

      let tobacco = await corpRun(ns, 'getDivision', div3)
      const productStarted = hasStartedProduct(tobacco)
      if (productStarted) {
        await expandCities(ns, div3, {
          allowExpansion: true,
          reserve: ROUND_TWO_TOBACCO_RESERVE,
        })
        tobacco = await corpRun(ns, 'getDivision', div3)
        hasDivDB[div3] = tobacco
        const tobaccoInfrastructureReady =
          Array.isArray(tobacco?.cities) && tobacco.cities.length >= cities.length &&
          hasCompleteDivisionInfrastructure(div3)

        // Chemical is useful support, but it must not delay the first product or Tobacco's six-city multiplier.
        if (tobaccoInfrastructureReady && await tryPurchaseUnlock(ns, "Export")) {
          await expandCities(ns, div2, {
            allowExpansion: true,
            reserve: ROUND_TWO_TOBACCO_RESERVE,
          })
        }
      }
    }
  }
  return true
}
/** @param {NS} ns */
function projectBudget(version, corp, round) {
  const normal = 2e9 * 2 ** version
  if (!usesCashPolicy(round)) return normal
  return Math.min(normal, Math.max(2e9, (corp.revenue - corp.expenses) * 60))
}

// Product.createProduct advances this many percentage points per market cycle. The
// game uses the design office alone. Predict new hires with measured per-worker output.
function designRate(office, extra = 0) {
  if (!office?.employeeProductionByJob) return 0
  const counts = extra ? cashOfficeJobs(office.numEmployees + extra, false, true) : null
  const perRole = (job, countIndex) => {
    const output = office.employeeProductionByJob[job]
    if (!counts) return output
    const workers = office.employeeJobs[job]
    return workers > 0 ? output / workers * counts[countIndex] : 0
  }
  const ops = perRole('Operations',0), eng = perRole('Engineer',1), mgmt = perRole('Management',3)
  const total = ops + eng + mgmt
  return total > 0 ? .01 * (eng ** .34 + ops ** .2) * (1 + mgmt / (1.2 * total)) : 0
}

// For the second product, existing rep cash and running costs have first claim.
// Cash retained for a distant bribe may instead pay for demonstrably earlier sales.
function observeSecondProduct(d, headquarters, corp, liquid, constants, repCost) {
  if (cashPlan.round !== 5 || !d?.makesProducts || d.maxProducts < 2 ||
      !d.products.includes('Prod v1') || d.products.some(n => n !== 'Prod v1' && n !== 'Prod v2')) return null
  if (headquarters.get(d.name+':Prod v1')?.developmentProgress !== 100) return null
  const pending = d.products.includes('Prod v2'), p = headquarters.get(d.name+':Prod v2')
  if (pending && !(p?.developmentProgress >= 0 && p.developmentProgress < 100)) return null
  const progress = pending ? p.developmentProgress : null
  const old = cashPlan.v2?.div === d.name ? cashPlan.v2 : null
  const seconds = constants.secondsPerMarketCycle, office = hasOfficeDB[d.name+'Sector-12'], rate = designRate(office)
  // The 3.0.1 API omits creationCity. After a restart, identify a managed project
  // only if two observed advances match HQ and distinguish it from the other offices.
  const delta = pending && old?.progress != null ? progress - old.progress : 0
  const matches = r => r > 0 && Math.abs(delta - r) <= .02 * r
  const match = matches(old?.rate) && !d.cities.some(c => c !== 'Sector-12' && matches(designRate(hasOfficeDB[d.name+c])))
  const votes = match ? (old?.votes ?? 0) + 1 : delta === 0 ? old?.votes ?? 0 : 0
  const confirmed = pending && (old?.startedHere || (old?.confirmed && progress >= old.progress) || votes >= 2)
  const goods = cashPlan.goods[d.name].filter(g => g.product.name === 'Prod v1')
  const sold = goods.reduce((sum,g) => sum + g.product.actualSellAmount,0)
  const made = goods.reduce((sum,g) => sum + g.product.productionAmount,0)
  const retainedRate = 1 - (corp.public ? corp.dividendRate : 0)
  const profit = made > 0 && sold >= .9 * made ? retainedRate * Math.max(0,
    Math.min(corp.revenue - corp.expenses, d.lastCycleRevenue - d.lastCycleExpenses)) : 0
  const income = Math.min(old?.profit ?? 0, profit)
  const remaining = rate > 0 ? Math.ceil((100 - (progress ?? 0)) / rate) * seconds : Infinity
  const need = repCost > 0 && corp.valuation >= constants.bribeThreshold
    ? repCost + getCorporationBribeReserve(corp, 5) : 0
  const fundsBeforeRelease = liquid + Math.max(0,corp.revenue-corp.expenses) * retainedRate * remaining
  const bribeFirst = need > 0 && (cashPlan.goal > 0 || liquid >= need || need <= fundsBeforeRelease)
  const note = pending && !confirmed ? 'checking which office is designing v2' :
    !income ? 'waiting for two profitable cycles of v1 sales' : old?.progress === progress ? old?.note : ''
  return {div:d.name, progress, rate, seconds, remaining, votes, confirmed, profit, income,
    keptForRep:bribeFirst ? need : 0, note}
}

function secondProductReserve(plan, corp) {
  return Math.max(ROUND_ONE_OPERATING_RESERVE, corp.expenses * 3 * plan.seconds, plan.keptForRep)
}

// A sale can empty the warehouse in one tick. Compare settled cycles, not the
// inventory visible on the current screen. Only finance the established Tobacco line.
function observeTobaccoEarnings(d, corp, liquid, constants, repCost) {
  if (cashPlan.round !== 5 || d?.industry !== 'Tobacco' || !d.products.every(n => /^Prod v\d+$/.test(n))) return null
  const goods = cashPlan.goods[d.name], names = [...new Set(goods.map(g => g.product.name))].sort()
  if (names.length < 2) return null
  const key = JSON.stringify([d.name, names]), old = cashPlan.tobacco
  const cities = {}, perProduct = {}
  for (const {city,product:p} of goods) {
    const m = cities[city] ??= {made:0, sold:0}
    m.made += p.productionAmount; m.sold += p.actualSellAmount
    perProduct[p.name]=(perProduct[p.name] || 0)+p.actualSellAmount
  }
  const sample = {cities, perProduct, net:d.lastCycleRevenue-d.lastCycleExpenses,
    company:(corp.revenue-corp.expenses)*(1-corp.dividendRate)}
  const samples = [...(old?.key === key ? old.samples : []), sample].slice(-6)
  const avg = k => samples.reduce((a,s) => a+s[k],0)/samples.length
  const market = {}, soldByProduct = Object.fromEntries(names.map(n=>[n,
    samples.reduce((sum,s)=>sum+(s.perProduct[n] || 0),0)/samples.length]))
  let units = 0, output = 0
  for (const city of Object.keys(cities)) {
    const q = k => samples.reduce((a,s) => a+(s.cities[city]?.[k] ?? 0),0)/samples.length
    units += q('sold'); output += q('made')
    market[city] = Math.min(q('made'),q('sold')) / names.length
  }
  const net = avg('net'), flow = avg('company'), reserve = getCorporationBribeReserve(corp,5)
  const ready = samples.length >= 3 && Object.values(soldByProduct).filter(n=>n>0).length >= 2 &&
    net>0 && flow>0 && units>=.9*output && output>0
  const eligible = repCost > 0 && corp.valuation >= constants.bribeThreshold
  // With no known bribe, require repayment within the time needed to earn back
  // today's spare treasury. Never unlock more than a quarter of it per selling lineup.
  const horizon = (eligible ? repCost+reserve-liquid : liquid-reserve) / flow
  const floor = old?.key === key && Number.isFinite(old.floor) ?
    Math.min(liquid,old.floor+Math.max(0,sample.company)*constants.secondsPerMarketCycle/2) :
    ready ? liquid-Math.max(0,liquid-reserve)/4 : null
  return {key,samples,market,soldByProduct,units,net,horizon,floor,ready,repCash:eligible ? repCost+reserve : 0,seconds:constants.secondsPerMarketCycle,
    note:old?.key === key ? old.note : ''}
}

// Product.finishProduct: Tobacco weights are 70% quality, 10% durability,
// 20% aesthetics. Input quality caps effective rating, which is used when selling.
function tobaccoDesign(j, rp, science, design, advertising) {
  const [o,e,b,m,r] = j, t = o+e+b+m+r
  if (!(t > 0)) return null
  const mult = (1.5*o+1.2*e+b+.9*m+1.3*r)/t * (1+design**.1/100) * (1+rp**science/800)
  const quality = (.10*e+.05*m+.05*r+.02*o+.02*b)*mult
  const durability = (.05*e+.02*m+.08*r+.05*o+.05*b)*mult
  const aesthetics = (.08*m+.05*r+.02*o+.10*b)*mult
  return {rating:.7*quality+.1*durability+.2*aesthetics,
    inverseMarkup:(1+advertising**.1/100)*(quality+.001)**.65*Math.max((b+m)/t,1/t)/100}
}

function tobaccoDemand(d, industry, business, product, bots=cashPlan?.salesBots ?? 1) {
  const a = d.awareness, p = d.popularity, f = industry.advertisingFactor
  const advert = ((a+1)**f*(p+1)**f*(a>0?Math.max(.01,(p+.001)/a):.01))**.85
  const market = Math.max(.1,product.demand*(100-product.competition)/100), b = 1+business
  return .5*market*(b**.26+b/1e4)*advert*bots
}

// The five published product stats below are linear combinations of the five
// creation jobs, all multiplied by the same factor. Solving those equations for
// (Business + Management) / total cancels that factor, including historical RP.
function tobaccoSaleTerms(p,d,spec,business) {
  const {quality:q,performance:t,durability:u,reliability:r,aesthetics:a}=p.stats ?? {}
  const total = 351*q-108*t+507*u+624*r-234*a
  const mix = (-31*q+155*t-465*u+155*r+651*a)/total
  if (!(total>0 && mix>1e-9 && mix<=1+1e-9 && p.advertisingInvestment>=0 && p.productionCost>0 && p.effectiveRating>0)) return null
  const limit = Math.max(.001,p.effectiveRating)*(1+p.advertisingInvestment**.1/100)*(q+.001)**.65*Math.min(1,mix)/100
  const capacity = p.effectiveRating**.65*tobaccoDemand(d,spec,business,p)
  return Number.isFinite(limit) && limit>0 && Number.isFinite(capacity) && capacity>0 ? {limit,capacity,mp:p.productionCost} : null
}

const officeOutput = ([op,en,,mg]) => (op**.4+en**.3)*(1+mg/(1.2*(op+en+mg)))

async function useSmallDesignTeam(ns,div,o) {
  const plan=cashPlan?.tobacco, d=hasDivDB[div], spec=d && indDataDB[d.industry]
  if (!plan?.ready || !spec || d.industry!=='Tobacco' || !spec.makesProducts || !(plan.market['Sector-12']>0)) return false
  const j=o.employeeProductionByJob, workers=o.employeeJobs
  if (!(workers.Operations===1 && workers.Engineer===1 && workers.Business+workers.Management===1)) return false
  const [,nominal] = await getMult(ns,div,'Sector-12')
  if (!(nominal>0) || plan.market['Sector-12']<.9*nominal) return workers.Management===1
  const observed = role => {
    if (workers[role]) return j[role]/workers[role]
    const units = d.cities.map(c=>hasOfficeDB[div+c]).filter(x=>x?.employeeJobs[role]>0)
      .map(x=>x.employeeProductionByJob[role]/x.employeeJobs[role]).filter(n=>n>0)
    return units.length ? Math.min(...units) : Math.min(j.Operations,j.Engineer,j.Business || j.Management)
  }
  const bus=observed('Business'), manager=observed('Management'), goods=cashPlan.goods[div].filter(g=>g.city==='Sector-12')
  if (!(bus>0 && manager>0 && goods.length)) return false
  const production = m=>officeOutput([j.Operations,j.Engineer,0,m])
  const q0=plan.market['Sector-12']/production(j.Management)
  const net = (b,m) => goods.reduce((sum,g)=>{
    const s=tobaccoSaleTerms(g.product,d,spec,b), q=q0*production(m)
    if (!s || !(q>0)) return NaN
    return sum + Math.min(s.capacity,q)*(s.mp+s.limit*Math.sqrt(s.capacity/q))-q*s.mp/5
  },0)
  // Moving the only salesperson changes today's receipts. Require the management
  // mix to earn at least as much in this city before crediting any design benefit.
  return net(0,manager)>=net(bus,0)
}

function officeDesignJobs(office, remote) {
  const roles = ['Operations','Engineer','Business','Management','Research & Development']
  const jobs = roles.map(k=>office.employeeProductionByJob[k])
  const unit = roles.map((k,i)=>office.employeeJobs[k] > 0 ? jobs[i]/office.employeeJobs[k] : 0)
  const measured = unit.filter(x=>x>0)
  // Steam omits individual attributes. Use the weakest observed per-worker
  // productivity for an entirely new role instead of assuming perfect hires.
  const more = cashOfficeJobs(office.numEmployees+3,remote,true).slice(0,5)
    .map((n,i)=>n*(unit[i] || (measured.length ? Math.min(...measured) : 0)))
  return {jobs,more}
}

async function growEstablishedTobacco(ns, d) {
  const plan = cashPlan.tobacco, homeCity = 'Sector-12', homeOffice = hasOfficeDB[d.name+homeCity]
  if (!plan?.ready || !homeOffice || !hasWarehouseDB[d.name+homeCity]) return false
  if (cashPlan.goal || !(plan.horizon>0)) { plan.note=plan.repCash ? 'holding cash for the faction target' : 'holding operating cash'; return false }
  const spec = indDataDB[d.industry] ??= await corpRun(ns,'getIndustryData',d.industry)
  const corp = await getCorp(ns), budget = projectBudget(Math.max(...d.products.map(parseVersion)),corp,5)
  const kept = Math.max(plan.floor,getCorporationBribeReserve(corp,5)) + Math.max(budget,cashPlan.designHold || 0)
  const available = await corpFunds(ns,0,corp)-kept
  if (!(available > 0)) { plan.note='holding cash for bills, the next design and faction savings'; return false }
  const rate = designRate(homeOffice)
  if (!(rate > 0)) return false
  const goods = cashPlan.goods[d.name], finished = new Set(goods.map(g=>g.product.name)).size
  const cycles = Math.ceil(100/rate)
  const remaining = cashPlan.finishAt>0 ? Math.max(0,(cashPlan.finishAt-Date.now())/1000) :
    d.maxProducts*cycles*plan.seconds
  const horizon = Math.min(remaining,plan.horizon)
  if (!(horizon>2*plan.seconds)) { plan.note='holding cash near the expected end of the run'; return false }
  // Credit the first *fully* improved design. A project already underway may have
  // been started elsewhere, and its accumulated job factors are not public.
  const delay = (2+cycles*(d.products.length>finished ? 2 : 1))*plan.seconds
  // Each later design can replace an old slot; cap the number earning the
  // improvement at today's slot count, with one full development period between them.
  let sellingSeconds = 0
  for (let i=0;i<d.maxProducts;i++) sellingSeconds += Math.max(0,horizon-delay-i*cycles*plan.seconds)
  const places = Object.keys(plan.market).filter(c=>hasWarehouseDB[d.name+c] && plan.market[c]>0)
  const offices = places.map(c=>hasOfficeDB[d.name+c])
  const market = places.map((c,i)=>{
    const products = goods.filter(g=>g.city===c).map(g=>g.product)
    const factor = Math.min(...products.map(g=>tobaccoDemand(d,spec,offices[i].employeeProductionByJob.Business,g)))
    return {q:plan.market[c],quality:cashPlan.plantQuality?.[c],factor,
      margin:Math.min(plan.net/plan.units,...products.map(g=>.8*g.productionCost))}
  })
  // Sale formula above market price: premium = markupLimit * sqrt(capacity/units).
  // Price one future product in today's markets; do not credit unpurchased upgrades.
  function forecast(jobs,rp) {
    const design = tobaccoDesign(jobs,rp,spec.scienceFactor,budget/2,budget/2)
    let premium = 0
    for (const {q,quality,factor} of market) if (design && Number.isFinite(quality) && Number.isFinite(factor)) {
      const eff = Math.min(design.rating,(1+quality)*Math.sqrt(design.rating))
      const capacity = eff**.65*factor
      premium += Math.min(q,capacity)*eff*design.inverseMarkup*Math.sqrt(Math.max(1,capacity/q))
    }
    return {rating:design?.rating,premium}
  }
  const hq = officeDesignJobs(homeOffice,false), base = forecast(hq.jobs,d.researchPoints)
  const prices = await corporationBatch(ns,'getOfficeSizeUpgradeCost',places.map(c=>[d.name,c,3]))
  let best
  for (const [i,c] of places.entries()) {
    const o = offices[i], cost = prices[i], remote = c !== homeCity
    if (o.numEmployees !== o.size || !(cost>0 && cost<=available)) continue
    const {jobs,more} = remote ? officeDesignJobs(o,true) : hq
    // Funding satellites is limited to establishing a first researcher without
    // taking an existing seller off its job. Four non-START phases earn RP.
    if (remote && (jobs[4]>0 || !(more[4]>0))) continue
    const gainRP = remote ? .016*Math.sqrt(more[4])*cycles : 0
    const next = forecast(remote ? hq.jobs : more,d.researchPoints+gainRP)
    const [ ,maxOutput] = await getMult(ns,d.name,c)
    const q = market[i].q, keep = (1-corp.dividendRate)/2
    // If ingredients, not staff, limit this city, do not count increased capacity.
    const extra = maxOutput>0 && q>=.9*maxOutput ? Math.max(0,officeOutput(more)/officeOutput(jobs)-1)*q*finished : 0
    const nowGain = keep*extra*market[i].margin, laterGain = keep*Math.max(0,next.premium-base.premium)
    const value = nowGain*(horizon-2*plan.seconds)+laterGain*sellingSeconds
    if (!Number.isFinite(value) || !(value>cost)) continue
    if (!best || value/cost>best.value/best.cost) best={city:c,cost,value,rating:next.rating}
  }
  if (!best) { plan.note = 'holding cash: no three-seat upgrade repays before the bribe or run horizon'; return false }
  const bought = await corpRun(ns,'upgradeOfficeSize','--earning-line',d.name,best.cost,kept+pendingInputPurchases,corp.nextState,
    JSON.stringify(d.products),best.city,plan.repCash ? plan.repCash+pendingInputPurchases : 0)
  if (bought === true) plan.note = `${best.city} +3 seats: next full design rating ~${Math.round(base.rating)} → ${Math.round(best.rating)}`
  return bought === true
}

// Operate the supply chain before funding Tobacco. Keep plants, cash flow and any
// inherited product running during research or an investment review.
async function prepareSupplyRound(ns) {
  const corp = await getCorp(ns), phase = cashPhases.indexOf(corp.nextState)
  if (!supplyPlan) { supplyPlan = {phase:-1, exports:'', goods:{}}; boostTargets=[] }
  const previous=supplyPlan.phase
  supplyPlan.phase=phase
  if (previous>=0 && phase>=previous && supplyPlan.ready) return true
  if (!(await expandCities(ns,div1))) return false
  if (bnMults.CorporationValuation<1 && !corp.divisions.includes(div3)) {
    const starter=(await corpRun(ns,'getIndustryData',div3)).startingCost
    const liquid=await corpFunds(ns)
    if (investOffer.funds<starter && liquid>=starter+2e9+ROUND_ONE_OPERATING_RESERVE)
      await expandCities(ns,div3,{allowExpansion:false,reserve:2e9})
  }
  const lean=bnMults.CorporationValuation<1 && !corp.divisions.includes(div2) &&
    await corpFunds(ns)<(await corpRun(ns,'getIndustryData',div2)).startingCost+
      (researchedDB.Export || await corpRun(ns,'hasUnlock','Export') ? 0 : await corpRun(ns,'getUnlockCost','Export'))
  if (lean) {
    await expandCities(ns,div3,{allowExpansion:false})
    if (hasDivDB[div3]?.products.length) {
      await tryPurchaseUnlock(ns,'Market Research - Demand')
      await tryPurchaseUnlock(ns,'Market Data - Competition')
    }
  } else if (await tryPurchaseUnlock(ns,'Export')) await expandCities(ns,div2)
  if (corp.divisions.includes(div3)) await expandCities(ns,div3,{allowExpansion:false})
  if (hasCompleteDivisionInfrastructure(div2)) {
    await tryPurchaseUnlock(ns,'Market Research - Demand')
    await tryPurchaseUnlock(ns,'Market Data - Competition')
  }
  supplyPlan.salesBots=1+.01*await corpRun(ns,'getUpgradeLevel','ABC SalesBots')
  const d=hasDivDB[div3], rows=d?.cities.flatMap(c=>d.products.map(n=>[div3,c,n])) ?? []
  const products=await corporationBatch(ns,'getProduct',rows)
  supplyPlan.goods[div3]=rows.flatMap(([,city],i)=>products[i].developmentProgress===100 ? [{city,product:products[i]}] : [])
  supplyPlan.ready=true
  return true
}

async function staffSupplyRound(ns) {
  for (const div of [div1,div2]) {
    const d=hasDivDB[div]
    if (!d) continue
    for (const city of d.cities) {
      let o=hasOfficeDB[div+city]
      if (!o || !hasWarehouseDB[div+city]) continue
      if (div===div1 && hasCompleteDivisionInfrastructure(div2) && o.size<8) {
        const cost=await corpRun(ns,'getOfficeSizeUpgradeCost',div,city,8-o.size)
        if (cost<=await corpFunds(ns)) {
          await corpRun(ns,'upgradeOfficeSize',div,city,8-o.size)
          o=await corpRun(ns,'getOffice',div,city)
        }
      }
      if (o.numEmployees<o.size) {
        await corporationBatch(ns,'hireEmployee',Array.from({length:Math.min(8,o.size-o.numEmployees)},()=>[div,city]))
        o=await corpRun(ns,'getOffice',div,city)
      }
      hasOfficeDB[div+city]=o
      const n=o.numEmployees, study=d.researchPoints<supplyResearch[div]
      // One office keeps the company operating. If it is the only office, split
      // its team rather than depending on a satellite we cannot yet afford.
      const lab=study ? (city==='Sector-12' ? (d.cities.length===1 ? Math.max(0,n-2) : 0) : n) : 0
      const workers=n-lab, ops=Math.min(workers,Math.max(1,Math.floor(3*workers/8))),
        eng=Math.min(workers-ops,Math.max(1,Math.floor(workers/8))),
        biz=Math.min(workers-ops-eng,Math.max(1,Math.floor(workers/4)))
      await assignOfficeJobs(ns,div,city,o,[ops,eng,biz,workers-ops-eng-biz,lab,0])
    }
  }
  const d=hasDivDB[div3]
  if (d) for (const city of d.cities) if (hasOfficeDB[div3+city]) {
    const o=hasOfficeDB[div3+city]
    if (city==='Sector-12' && o.size<10 && bnMults.CorporationValuation<1) {
      const cost=await corpRun(ns,'getOfficeSizeUpgradeCost',div3,city,10-o.size)
      if (cost+2e9<=await corpFunds(ns)) {
        await corpRun(ns,'upgradeOfficeSize',div3,city,10-o.size)
        hasOfficeDB[div3+city]=await corpRun(ns,'getOffice',div3,city)
      }
    }
    await staffCashOffice(ns,div3,city,supplyPlan.goods[div3].length>0)
  }
}

async function runSupplyPhase(ns) {
  const phase=(await getCorp(ns)).nextState
  if (phase==='PURCHASE') {
    await buyCashInputs(ns,supplyPlan)
    await purchaseBoostMaterials(ns)
  } else if (phase==='SALE') await sellCashOutput(ns)
  else if (phase==='EXPORT') {
    await staffSupplyRound(ns)
    if (researchedDB.Export) await connectCashSuppliers(ns,supplyPlan)
    if (hasDivDB[div3]) await manageProducts(ns)
    if (hasCompleteDivisionInfrastructure(div2) && !investmentReview) {
      await hireAdVertsUpTo(ns,div1,8)
      const keys=cities.map(c=>[div2,c]), ws=await corporationBatch(ns,'getWarehouse',keys)
      for (const [i,k] of keys.entries()) if (ws[i].level===1 &&
          await corpRun(ns,'getUpgradeWarehouseCost',...k)<=await corpFunds(ns)) await corpRun(ns,'upgradeWarehouse',...k)
    }
    if (hasCompleteDivisionInfrastructure(div1) && hasCompleteDivisionInfrastructure(div2)) {
      await growSeedAgriculture(ns)
      await optimizeMats(ns,[div2])
    }
  } else if (phase==='START') {
    teaNeeded=await teaParty(ns)
    const round=await checkInvest(ns)
    if (round===2) await updateHud(ns)
    return round
  }
  return 2
}

async function prepareCashOperations(ns, round) {
  const corp = await getCorp(ns)
  const phase = cashPhases.indexOf(corp.nextState)
  const moved = !cashPlan || cashPlan.round !== round
  const newCycle = moved || phase < cashPlan.phase
  if (moved) {
    cashPlan = {round, phase, floor:Infinity, goal:0, focus:div3, exports:''}
    boostTargets = [] // Do not replay orders from the previous strategy or round.
  }
  cashPlan.phase = phase
  if (!newCycle && Number.isFinite(cashPlan.floor)) return
  const historyDue = round === 5 && Number.isInteger(companyReset?.currentNode) && companyReset.lastNodeReset>0 &&
    Date.now() >= (cashPlan.nextHistory ?? 0)
  const report = historyDue ? await corpRun(ns,'getCorporation','--cash-plan',companyReset.currentNode,companyReset.lastNodeReset) :
    await corpRun(ns,'getCorporation','--cash-plan')
  if (historyDue) {
    cashPlan.finishAt = report?.finishAt || 0
    cashPlan.nextHistory = Date.now()+300000
  }
  const live = report?.corporation, constants = await getCorporationConstants(ns)
  if (!live || getCorporationPhase(live, report.offer) !== round || !(constants?.secondsPerMarketCycle > 0)) return
  const liquid = await corpFunds(ns, 0, live)
  const net = Math.max(0, live.revenue - live.expenses)
  if (!Number.isFinite(liquid) || !Number.isFinite(net)) return
  const first = !Number.isFinite(cashPlan.floor)
  const openCredit = Math.min(Math.max(0, liquid) / 4, Math.max(2e9, net * cashHorizon))
  const netAfterPayout = net * (1 - (live.public ? live.dividendRate : 0))
  const retained = netAfterPayout * constants.secondsPerMarketCycle / 2
  cashPlan.floor = Math.max(0, first ? liquid - openCredit : Math.min(liquid, cashPlan.floor + retained))
  const cost = factionCashGoal(constants, report.snapshot, report.route, companyReset)
  const reserve = getCorporationBribeReserve(live, round)
  cashPlan.goal = cost > 0 && live.valuation >= constants.bribeThreshold && liquid + netAfterPayout * cashHorizon - reserve >= cost ? cost : 0
  cashPlan.faction = cashPlan.goal ? report.route.faction : ''

  // Discover the actual footprint, including an existing Restaurant or a manual IPO.
  const names = live.divisions.filter(d => industries.includes(d))
  const divisions = await corporationBatch(ns, 'getDivision', names.map(d => [d]))
  const locations = divisions.flatMap(d => d.cities.map(c => [d.name, c]))
  const offices = await corporationBatch(ns, 'getOffice', locations)
  const warehouses = await corporationBatch(ns, 'hasWarehouse', locations)
  hasDivDB = []; hasOfficeDB = []; hasWarehouseDB = []
  for (const d of divisions) hasDivDB[d.name] = d
  locations.forEach(([d,c], i) => {hasOfficeDB[d+c] = offices[i]; hasWarehouseDB[d+c] = warehouses[i]})
  const rows = divisions.filter(d => d.makesProducts).flatMap(d =>
    d.cities.flatMap(c => d.products.map(p => [d.name, c, p])))
  const products = await corporationBatch(ns, 'getProduct', rows)
  cashPlan.goods = Object.fromEntries(divisions.map(d => [d.name, []]))
  const headquarters = new Map()
  rows.forEach(([d,city,name], i) => {
    if (round === 5 && city === 'Sector-12') headquarters.set(d+':'+name, products[i])
    if (products[i].developmentProgress === 100) cashPlan.goods[d].push({city, product:products[i]})
  })
  if (round === 5 && divisions.some(d=>d.industry==='Tobacco')) {
    const [factories,bots] = await corporationBatch(ns,'getUpgradeLevel',[['Smart Factories'],['ABC SalesBots']])
    cashPlan.factory = factories; cashPlan.salesBots = 1+.01*bots
  } else cashPlan.factory = await corpRun(ns, 'getUpgradeLevel', 'Smart Factories')
  // A restarted manager may inherit production research bought hours ago. Match
  // the engine's material/product rates before ordering the next batch of ingredients.
  const upgrades = divisions.flatMap(d => ['Drones - Assembly','Self-Correcting Assemblers',
    ...(d.makesProducts ? ['uPgrade: Fulcrum'] : [])].filter(n => !researchedDB[d.name+n]).map(n => [d.name,n]))
  const done = await corporationBatch(ns, 'hasResearched', upgrades)
  upgrades.forEach(([d,n],i) => {researchedDB[d+n] = done[i]})
  const profit = d => d.lastCycleRevenue - d.lastCycleExpenses
  const tobacco = hasDivDB[div3]
  const winner = divisions.filter(d => cashPlan.goods[d.name].some(g => g.product.actualSellAmount > 0) && profit(d) > 0)
    .sort((a,b) => profit(b) - profit(a))[0]
  // A single sale of excess material can move the division's reported profit. Require
  // three winning cycles to divert growth from an established product line.
  const existingLine = tobacco ?? divisions.find(d => d.makesProducts && d.products.length) ?? divisions.find(d => d.makesProducts)
  const candidate = winner?.name ?? (hasDivDB[cashPlan.focus] ? cashPlan.focus : existingLine?.name ?? div3)
  const established = cashPlan.goods[cashPlan.focus]?.some(g => g.product.actualSellAmount > 0 ||
    (hasDivDB[cashPlan.focus]?.industry==='Tobacco' && cashPlan.tobacco?.soldByProduct[g.product.name]>0))
  cashPlan.wins = cashPlan.challenger === candidate ? cashPlan.wins + 1 : 1
  cashPlan.challenger = candidate
  if (cashPlan.focus !== candidate && (!established || cashPlan.wins >= 3)) {
    cashPlan.designHold = 0
    cashPlan.focus = candidate
  }

  const line = hasDivDB[cashPlan.focus], goods = cashPlan.goods[cashPlan.focus] ?? []
  const sold = goods.reduce((sum,g) => sum + g.product.actualSellAmount,0)
  const made = goods.reduce((sum,g) => sum + g.product.productionAmount,0)
  cashPlan.v2 = observeSecondProduct(line, headquarters, live, liquid, constants, cost)
  cashPlan.tobacco = observeTobaccoEarnings(line,live,liquid,constants,cost)
  cashPlan.boost = !!line && profit(line) > 0 && sold > 0 && made > 0 && sold >= .9 * made

  const unlocks = ['Market Research - Demand', 'Market Data - Competition', 'Export']
  const owned = await corporationBatch(ns, 'hasUnlock', unlocks.map(n => [n]))
  unlocks.forEach((n,i) => {researchedDB[n] = owned[i]})
  // Do not strand a manually advanced company without a way to earn.
  if (!hasDivDB[cashPlan.focus]?.products.length && !winner && first && !cashPlan.goal)
    cashPlan.floor = Math.min(cashPlan.floor, Math.max(ROUND_ONE_OPERATING_RESERVE, live.expenses * constants.secondsPerMarketCycle * 3))
  if (!existingLine) await expandCities(ns, div3, {allowExpansion:false})
  else if (cashPlan.focus === div3 && tobacco && (tobacco.cities.length < cities.length || !hasCompleteDivisionInfrastructure(div3)))
    await expandCities(ns, div3, {allowExpansion:true, homeOnly:round!==3 && !cashPlan.goods[div3].some(g => g.product.actualSellAmount > 0), reserve:ROUND_TWO_TOBACCO_RESERVE})
  for (const n of unlocks.slice(0,2)) if (!researchedDB[n]) await tryPurchaseUnlock(ns, n)
  if (hasDivDB[div1] && hasDivDB[div3] && !researchedDB.Export) await tryPurchaseUnlock(ns, 'Export')
}

async function buyCashInputs(ns, plan = cashPlan) {
  pendingInputPurchases = 0
  const inputs = [], locations = []
  for (const div of industries) {
    const d = hasDivDB[div]
    if (!d) continue
    const industry = indDataDB[d.industry] ??= await corpRun(ns, 'getIndustryData', d.industry)
    for (const city of d.cities) {
      if (!hasWarehouseDB[div+city]) continue
      const [materials, products] = await getMult(ns, div, city)
      const slots = plan.goods?.[div]?.filter(g => g.city === city).length ?? 0
      const output = ((industry.makesMaterials ? materials : 0) + slots * products) * 10
      const index = locations.push([div, city]) - 1
      for (const [name, coefficient] of Object.entries(industry.requiredMaterials))
        inputs.push({key:[div,city,name], index, target:output * coefficient})
    }
  }
  const warehouses = await corporationBatch(ns, 'getWarehouse', locations)
  const stock = await corporationBatch(ns, 'getMaterial', inputs.map(p => p.key))
  if (plan.tobacco) plan.plantQuality = Object.fromEntries(inputs.flatMap((p,i) =>
    p.key[0] === plan.focus && p.key[2] === 'Plants' ? [[p.key[1],stock[i].quality]] : []))
  const missing = [...new Set(inputs.map(p => p.key[2]).filter(n => !matDataDB[n]))]
  const data = await corporationBatch(ns, 'getMaterialData', missing.map(n => [n]))
  missing.forEach((n,i) => {matDataDB[n]=data[i]})
  const needSpace = warehouses.map(() => 0)
  for (const [i,p] of inputs.entries()) {
    p.qty = Math.max(0, p.target - stock[i].stored)
    needSpace[p.index] += p.qty * matDataDB[p.key[2]].size
  }
  for (const [i,w] of warehouses.entries()) {
    if (locations[i][0] === div3 && needSpace[i] > Math.max(0, w.size - w.sizeUsed))
      await makeRoomForPlants(ns, div3, locations[i][1], w)
  }
  let total = 0
  for (const [i,p] of inputs.entries()) {
    const w = warehouses[p.index]
    if (needSpace[p.index] > 0) p.qty *= Math.min(1, Math.max(0, w.size - w.sizeUsed) / needSpace[p.index])
    total += p.qty * stock[i].marketPrice
  }
  const liquid = await corpFunds(ns, 0)
  if (!Number.isFinite(total) || !Number.isFinite(liquid) || (await getCorp(ns)).nextState !== 'PURCHASE') return
  const fraction = total > 0 ? Math.min(1, Math.max(0, liquid) / total) : 0
  // Clear inherited zero-price sales. Sell only actual excess recipe stock; keep a
  // material that doubles as a production booster. Never discard scarce ingredients.
  await corporationBatch(ns, 'sellMaterial', inputs.map((p,i) =>
    [...p.key, BOOST_MATERIALS.includes(p.key[2]) ? 0 : Math.max(0, stock[i].stored - p.target) / 10, 'MP']))
  if ((await getCorp(ns)).nextState !== 'PURCHASE') return
  await corporationBatch(ns, 'buyMaterial', inputs.map(p => [...p.key, p.qty * fraction / 10]))
  pendingInputPurchases = total * fraction
}

// Keep existing routes, including manual exports. Add missing local supply only between
// warehouses that exist. Recheck the topology when a division or warehouse appears.
async function connectCashSuppliers(ns, plan = cashPlan) {
  const divisions = industries.filter(d => hasDivDB[d])
  const footprint = JSON.stringify(divisions.map(d => [d, ...cities.map(c => !!hasWarehouseDB[d+c])]))
  if (plan.exports === footprint) return
  for (const d of divisions) indDataDB[hasDivDB[d].industry] ??= await corpRun(ns, 'getIndustryData', hasDivDB[d].industry)
  const rows = [], targets = []
  for (const from of divisions) for (const name of indDataDB[hasDivDB[from].industry].producedMaterials ?? []) {
    for (const city of cities) {
      if (!hasWarehouseDB[from+city]) continue
      const destinations = divisions.filter(to => from !== to && hasWarehouseDB[to+city] && indDataDB[hasDivDB[to].industry].requiredMaterials[name] > 0)
      if (name==='Plants') destinations.sort((a,b)=>Number(b===div3)-Number(a===div3))
      if (destinations.length) { rows.push([from,city,name]); targets.push(destinations) }
    }
  }
  const stock = await corporationBatch(ns, 'getMaterial', rows)
  const routes=[], move=[]
  rows.forEach(([from,city,mat],i)=>{
    const existing=stock[i].exports
    const index=to=>existing.findIndex(e=>e.division===to && e.city===city)
    for (const to of targets[i]) if (index(to)<0) routes.push([from,city,to,city,mat,'(-IPROD-IINV/10)'])
    if (from!==div1 || mat!=='Plants' || !targets[i].includes(div3)) return
    const chem=index(div2), tobacco=index(div3)
    if (chem>=0 && (tobacco<0 || chem<tobacco) &&
      ['(-IPROD-IINV/10)','(IPROD+IINV/10)*(-1)'].includes(existing[chem].amount))
      move.push([from,city,div2,city,mat,existing[chem].amount])
  })
  await corporationBatch(ns,'exportMaterial',routes)
  // Export is FIFO. Append only our standard Chemical route after Tobacco; leave
  // manual quantities and other destinations alone.
  for (const row of move) {
    await corpRun(ns,'cancelExportMaterial',...row.slice(0,-1))
    await corpRun(ns,'exportMaterial',...row)
  }
  plan.exports = footprint
}

// A sooner second seller benefits every producing city. Give it credit for only half
// of v1's demonstrated net income, for at most ten minutes of sales brought forward.
async function growSecondDesign(ns) {
  const p = cashPlan.v2
  if (!p?.confirmed || p.progress == null || !(p.income > 0 && p.rate > 0)) return false
  const city = 'Sector-12', office = hasOfficeDB[p.div+city]
  if (!office || office.numEmployees !== office.size) return false // Fill paid seats first.
  const after = designRate(office, 3)
  if (!(after > p.rate)) return false
  // Allow two cycles to hire and apply assignments; finishing before then makes seats worthless.
  const left = 100 - p.progress - 2 * p.rate
  if (left <= 0) return false
  const saved = (Math.ceil(left / p.rate) - Math.ceil(left / after)) * p.seconds
  const credit = Math.min(cashHorizon, saved) * p.income / 2
  const cost = await corpRun(ns,'getOfficeSizeUpgradeCost',p.div,city,3)
  if (!(Number.isFinite(cost) && cost > 0 && cost <= credit)) {
    p.note = 'current team is cheaper than the estimated time saved'
    return false
  }
  const quote = await getCorp(ns)
  const kept = secondProductReserve(p,quote)
  if (await corpFunds(ns,0,quote) - kept < cost) {
    p.note = p.keptForRep ? 'holding cash for the earlier faction bribe' : 'waiting for cash above operating costs'
    return false
  }
  const bought = await corpRun(ns,'upgradeOfficeSize','--second-design',p.div,cost,kept+pendingInputPurchases,quote.nextState,p.progress+2*p.rate)
  if (bought === true) {
    p.note = `+3 design seats: estimated ${Math.round(saved/60)} min earlier at current staffing`
    return true
  }
  p.note = 'retrying live cash, phase and home RAM checks'
  return false
}

// An upgrade competes with keeping its price for a faction. Use the selling division's
// observed margin and throughput; neither paper valuation nor idle capacity earns cash.
async function growCashDivision(ns) {
  const div = cashPlan.focus, d = hasDivDB[div], goods = cashPlan.goods?.[div] ?? []
  if (d && await growEstablishedTobacco(ns,d)) return
  const margin = d?.lastCycleRevenue - d?.lastCycleExpenses
  if (!(margin > 0) || !goods.some(g => g.product.actualSellAmount > 0)) return
  if (await growSecondDesign(ns)) return
  const available = await corpFunds(ns)
  if (!(available > 0)) return
  const sales = goods.reduce((n,g) => n + g.product.actualSellAmount, 0)
  const produced = goods.reduce((n,g) => n + g.product.productionAmount, 0)
  if (!(sales > 0 && produced > 0)) return
  const throughput = Math.min(1, sales / produced)
  let best
  function consider(fn, args, cost, gain) {
    const payback = cost / gain
    if (Number.isFinite(payback) && gain > 0 && cost > 0 && cost <= available &&
        payback <= cashHorizon && (!best || payback < best.payback)) best = {fn,args,cost,payback}
  }
  const specs = await corpRun(ns, 'getIndustryData', d.industry)
  const advertCost = await corpRun(ns, 'getHireAdVertCost', div)
  const wilson=await corpRun(ns,'getUpgradeLevel','Wilson Analytics')
  const advertising=(a,p)=>((a+1)**specs.advertisingFactor*(p+1)**specs.advertisingFactor*
    (a>0 ? Math.max(.01,(p+.001)/a) : .01))**.85
  const base=advertising(d.awareness,d.popularity)
  const wilsonCost=await corpRun(ns,'getUpgradeLevelCost','Wilson Analytics')
  if (d.awareness<Number.MAX_VALUE || d.popularity<Number.MAX_VALUE) for (const levels of [0,1]) {
    let cost=levels ? wilsonCost : 0,a=d.awareness,p=d.popularity
    const adv=1+.005*(wilson+levels)
    for (let ads=1;ads<=8;ads++) {
      cost+=advertCost*1.06**(ads-1)
      if (cost>available) break
      // Use the low end of the popularity roll. Wilson only affects adverts
      // bought AFTER the upgrade; a Wilson level alone has no modeled return.
      a=(a+3*adv)*1.005*adv; p=(p+adv)*1.005*adv
      consider('campaign',[levels,ads],cost,margin*(Math.sqrt(advertising(a,p)/base)-1))
    }
  }
  // Extra factory/office output only pays when existing output sells.
  if (throughput >= .9) {
    consider('levelUpgrade',['Smart Factories'],await corpRun(ns,'getUpgradeLevelCost','Smart Factories'),
      margin * throughput * .03 / (1 + .03 * cashPlan.factory))
    const sites = d.cities.filter(c => hasWarehouseDB[div+c] && hasOfficeDB[div+c]?.numEmployees > 0)
    const costs = await corporationBatch(ns, 'getOfficeSizeUpgradeCost', sites.map(c => [div,c,3]))
    const wh = await corporationBatch(ns, 'getWarehouse', sites.map(c => [div,c]))
    for (const [i,city] of sites.entries()) {
      const o = hasOfficeDB[div+city], cityGoods = goods.filter(g => g.city === city)
      const citySales = cityGoods.reduce((n,g) => n + g.product.actualSellAmount, 0)
      if (!(citySales > 0) || o.numEmployees < o.size) continue
      const cityProfit = margin * citySales / sales
      const grossOutputSpace = cityGoods.reduce((n,g) => n + g.product.productionAmount * g.product.size * 10, 0)
      if (grossOutputSpace > wh[i].size - wh[i].sizeUsed && wh[i].sizeUsed > .9 * wh[i].size)
        consider('upgradeWarehouse',[div,city],await corpRun(ns,'getUpgradeWarehouseCost',div,city),cityProfit / wh[i].level)
      else consider('upgradeOfficeSize',[div,city,3],costs[i],cityProfit * ((1 + 3/o.size)**.3 - 1))
    }
  }
  if (!best || best.cost>await corpFunds(ns)) return
  if (best.fn==='campaign') {
    const [levels,ads]=best.args
    if ((await getCorp(ns)).nextState!=='EXPORT' ||
        await corpRun(ns,'getHireAdVertCost',div)!==advertCost ||
        await corpRun(ns,'getUpgradeLevelCost','Wilson Analytics')!==wilsonCost) return
    if (levels) await corpRun(ns,'levelUpgrade','Wilson Analytics')
    for (let n=0;n<ads;n++) {
      if ((await getCorp(ns)).nextState!=='EXPORT' || await corpRun(ns,'getHireAdVertCost',div)>await corpFunds(ns)) break
      await corpRun(ns,'hireAdVert',div)
    }
  } else await corpRun(ns,best.fn,...best.args)
}

// Put the private investment to work while v1 is being designed. Preserve at
// least half the starting treasury and the entire pending design/operating bill.
async function fundFirstDesignOffice(ns) {
  const d=hasDivDB[div3], o=hasOfficeDB[div3+'Sector-12']
  if (!d || !o || cashPlan.focus!==div3 || cashPlan.goal || cashPlan.goods[div3]?.length ||
      o.size>=ROUND_THREE_TOBACCO_SEATS || d.products.some(n=>n!=='Prod v1')) return
  const corp=await getCorp(ns), cash=await corpFunds(ns,0,corp)
  if (!Number.isFinite(cash) || corp.public || corp.nextState!=='EXPORT') return
  cashPlan.launchReserve ??= Math.max(0,cash/2)
  const keep=Math.max(cashPlan.launchReserve,ROUND_ONE_OPERATING_RESERVE,corp.expenses*30)+2e9
  const budget=cash-keep
  // Use the engine's cost curve to choose a size, then confirm the live quote.
  const base=corporationConstants.officeInitialCost, max=ROUND_THREE_TOBACCO_SEATS-o.size
  const add=Math.min(max,Math.floor(3*Math.log1p(Math.max(0,budget)*.09/(base*1.09**(o.size/3)))/Math.log(1.09)))
  if (add<=0) return
  const cost=await corpRun(ns,'getOfficeSizeUpgradeCost',div3,'Sector-12',add)
  if (cost>0 && cost<=budget)
    await corpRun(ns,'upgradeOfficeSize','--first-design',div3,cost,keep+pendingInputPurchases,corp.nextState,corp.investorShares,add)
}

async function runCashPhase(ns, round) {
  const phase = (await getCorp(ns)).nextState
  if (phase === 'PURCHASE') {
    await buyCashInputs(ns)
    if (cashPlan.boost) await purchaseBoostMaterials(ns, [cashPlan.focus])
  } else if (phase === 'SALE') await sellCashOutput(ns)
  else if (phase === 'EXPORT') {
    if (round===3) await fundFirstDesignOffice(ns)
    await manageOffice(ns)
    await manageProducts(ns)
    await growCashDivision(ns)
    if (cashPlan.boost) await optimizeMats(ns, [cashPlan.focus])
    if (researchedDB.Export) await connectCashSuppliers(ns)
  } else if (phase === 'START') {
    teaNeeded = await teaParty(ns)
    await spendRP(ns)
    if (round < 5) round = await checkInvest(ns)
    await updateHud(ns)
  }
  return round
}

async function updateMisc(ns) {
  if (investmentReview) return
  const round = investOffer.round
  const mult = round === 3 ? 3 : 2.5
  let hasDiv3 = false
  let div3Count = 0
  for (const city of cities)
    if (hasWarehouseDB[div3 + city])
      div3Count++
  if (div3Count === 6) hasDiv3 = true


  if (round === 3 && !hasDiv3) return
  if (round >= 3
    && (await corpRun(ns, 'getUpgradeLevelCost', "Wilson Analytics")) < await corpFunds(ns)
    && hasDiv3 && ((await corpRun(ns, 'getDivision', div3)).awareness < Number.MAX_VALUE
      || (await corpRun(ns, 'getDivision', div3)).popularity < Number.MAX_VALUE)) {
    (await corpRun(ns, 'levelUpgrade', "Wilson Analytics"))
  }
  while ((round === 3)
    && (await corpRun(ns, 'getUpgradeLevelCost', "Wilson Analytics")) < await corpFunds(ns)
    && (await corpRun(ns, 'getUpgradeLevel', "Wilson Analytics")) < 2) {
    (await corpRun(ns, 'levelUpgrade', "Wilson Analytics"))
  }
  if (round < 5 && (await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots")) * mult / 2 < await corpFunds(ns)) {
    (await corpRun(ns, 'levelUpgrade', "ABC SalesBots"))
  }
  if ((round === 3 && (await getCorp(ns)).revenue >= 8e7) || round >= 4) {
    if (await corpRun(ns, 'getUpgradeLevel', "Neural Accelerators") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Neural Accelerators") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "Neural Accelerators"))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "Project Insight") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Project Insight") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "Project Insight"))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "Nuoptimal Nootropic Injector Implants") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Nuoptimal Nootropic Injector Implants") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "Nuoptimal Nootropic Injector Implants"))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "FocusWires") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "FocusWires") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "FocusWires"))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "Speech Processor Implants") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Speech Processor Implants") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "Speech Processor Implants"))
    }
  }

  if (round >= 3 && round <= 4) {
    for (const div of industries) {
      if (!hasDivDB[div]) continue
      if (["Tobacco", "Restaurant"].includes(hasDivDB[div].industry)
        && await corpFunds(ns) >= await corpRun(ns, 'getHireAdVertCost', div) * mult / 2
        && ((await corpRun(ns, 'getDivision', div)).awareness < Number.MAX_VALUE || (await corpRun(ns, 'getDivision', div)).popularity < Number.MAX_VALUE)) {
        (await corpRun(ns, 'hireAdVert', div))
      }
    }
  }
}

async function doResearch(ns, div, research, ratio) {
  if (researchedDB[div+research] === undefined)
    researchedDB[div+research]=await corpRun(ns,'hasResearched',div,research)
  if (!researchedDB[div + research]) {
    // Earlier purchases in this list have already spent research that also boosts product ratings.
    const rp = (await corpRun(ns, 'getDivision', div)).researchPoints
    if (rp / ratio > await corpRun(ns, 'getResearchCost', div, research)) {
      await corpRun(ns, 'research', div, research);
      researchedDB[div + research] = true
      return false
    }
    return true;
  }
  return false;
}

async function runResearchList(ns, div, list, ratio) {
  for (const item of list) {
    if (await doResearch(ns, div, item, ratio)) return true;
  }
  return false;
}
/** @param {NS} ns */
async function spendRP(ns) {
  for (const div of industries) {
    if (!hasDivDB[div]) continue
    switch (hasDivDB[div].industry) {
      case "Mining":
      case "Refinery":
      case "Computer Hardware":
      case "Water Utilities":
      case "Chemical":
      case "Agriculture":
        await runResearchList(ns, div, ["Hi-Tech R&D Laboratory", "Overclock", "Sti.mu", "Automatic Drug Administration", "Go-Juice", "CPH4 Injections"], 2);
        break
      case "Restaurant":
      case "Tobacco":
        if (usesCashPolicy(investOffer?.round)) {
          if (await doResearch(ns,div,'Hi-Tech R&D Laboratory',2)) break
          if (!researchedDB[div+'Market-TA.II']) {
            const names=['Market-TA.I','Market-TA.II']
            const owned=await corporationBatch(ns,'hasResearched',names.map(n=>[div,n]))
            const missing=names.filter((_,i)=>!owned[i])
            const costs=await corporationBatch(ns,'getResearchCost',missing.map(n=>[div,n]))
            const rp=(await corpRun(ns,'getDivision',div)).researchPoints
            if (!(rp>=2*costs.reduce((a,b)=>a+b,0))) break
            for (const name of missing) await corpRun(ns,'research',div,name)
            researchedDB[div+'Market-TA.II']=true
          }
        }
        await runResearchList(ns, div, ["Hi-Tech R&D Laboratory", "uPgrade: Fulcrum", "Self-Correcting Assemblers", "Drones", "Drones - Assembly", "Drones - Transport"], 10);
        break
    }
  }
}
/**
 * Select the candidate with the lowest finite score.
 * @param {{name: string, score: number}[]} candidates
 * @returns {string | null}
 */
export function selectLowestScoredProduct(candidates) {
  let worstProduct = null
  let worstScore = Infinity
  for (const candidate of candidates) {
    const score = Number(candidate?.score)
    if (!candidate?.name || !Number.isFinite(score) || score >= worstScore) continue
    worstProduct = candidate.name
    worstScore = score
  }
  return worstProduct
}

function clearProductPricingCache(div, productName) {
  if (!productName) return
  for (const city of cities) {
    delete ta2DB[div + city + productName]
  }
}

async function discontinueManagedProduct(ns, div, productName) {
  if (!productName) return false
  clearProductPricingCache(div, productName)
  await corpRun(ns, 'discontinueProduct', div, productName)
  return true
}

async function hasCompletedManagedProduct(ns, divisionName, suppliedDivision = null) {
  const division = suppliedDivision ?? await corpRun(ns, 'getDivision', divisionName)
  for (const productName of division?.products ?? []) {
    const product = await corpRun(ns, 'getProduct', divisionName, "Sector-12", productName)
    if (Number(product?.developmentProgress) >= 100) return true
  }
  return false
}

/** @param {NS} ns */
async function manageProducts(ns) {
  if (investmentReview) return
  for (const div of industries) {
    if (!hasDivDB[div] || !hasDivDB[div].makesProducts) continue
    if (usesCashPolicy(investOffer?.round) && div !== (cashPlan?.focus ?? div3)) continue

    let division = await corpRun(ns, 'getDivision', div)
    const completedProducts = []
    let active = 0
    let calculating = 0

    for (const productName of division.products) {
      const product = await corpRun(ns, 'getProduct', div, "Sector-12", productName)
      if (!product || product.developmentProgress !== 100) continue

      completedProducts.push({ name: productName, product })
      const ta2 = ta2DB[div + "Sector-12" + productName]
      if (ta2 && Number.isFinite(ta2.markupLimit) && ta2.markupLimit !== 0)
        active++
      else
        calculating++
    }

    // Keep the current lineup while any project is unfinished or its snapshot is unavailable.
    if (completedProducts.length !== division.products.length) continue

    // Let a full Tobacco lineup earn through the valuation average before retiring a seller.
    // Review each lineup once, then resume replacement even if the target remains out of reach.
    const round = Number(investOffer?.round)
    if (!bn3Reset && div === div3 && (round === 3 || round === 4) &&
        division.products.length === division.maxProducts && division.maxProducts > 0 &&
        hasCompleteDivisionInfrastructure(div3)) {
      const key = JSON.stringify(division.products)
      if (key !== reviewedProductLineup) {
        const corporation = await getCorp(ns)
        if (corporation?.public === false && Number.isFinite(corporation.funds) && corporation.funds >= 0 &&
            Number.isFinite(corporation.revenue - corporation.expenses) && corporation.revenue > corporation.expenses) {
          reviewedProductLineup = key
          beginInvestmentReview(ns, round, 'Tobacco product lineup complete')
          return
        }
      }
    }

    let worstProduct = null
    if (active + calculating === division.maxProducts) {

      if (calculating <= 1) {
        const priceCandidates = []
        for (const entry of completedProducts) {
          const sellPrice = await getSellPrice(ns, div, "Sector-12", entry.name)
          if (Number.isFinite(sellPrice) && sellPrice > 0)
            priceCandidates.push({ name: entry.name, score: sellPrice })
        }
        worstProduct = selectLowestScoredProduct(priceCandidates)
      } else {
        worstProduct = selectLowestScoredProduct(completedProducts.map(entry => ({
          name: entry.name,
          score: Number(entry.product.stats?.quality),
        })))
      }

      // If every completed product is still waiting for a valid price/quality, keep all slots intact and retry.
      if (!worstProduct) continue
      if (cashPlan?.goods && usesCashPolicy(round)) {
        // Keep at least one verified seller while its replacement would be in design.
        const othersSell = cashPlan.goods[div]?.some(g => g.product.name !== worstProduct && g.product.actualSellAmount > 0)
        if (!othersSell) continue
      }
    }

    if (!worstProduct && division.products.length >= division.maxProducts) continue

    // Price the next version before retiring anything, including when the newest product is weakest.
    const version = await getLatestProductVersion(ns, div)
    const cashMode = usesCashPolicy(round)
    const quote = cashMode ? await getCorp(ns) : undefined
    const investment = cashMode ? projectBudget(version, quote, round) / 2 : 1e9 * 2 ** version
    const reserve = Number(investOffer?.round) === 2 && div === div3 && !(supplyPlan && bnMults.CorporationValuation<1 && !version)
      ? ROUND_TWO_TOBACCO_RESERVE
      : 0
    if (!Number.isFinite(investment)) continue
    const second = round === 5 && version === 1 && !worstProduct && cashPlan?.v2?.div === div &&
      cashPlan.v2.progress === null && cashPlan.v2.income > 0 ? cashPlan.v2 : null
    // Only draw on retained earnings for a project that v1 can repay. Keep the
    // normal growth allowance available even to a slow starter.
    const useRetained = second && investment * 2 <= second.income * cashHorizon / 2
    const secondReserve = second ? Math.max(secondProductReserve(second,quote),
      useRetained ? 0 : cashGrowthReserve(quote, ROUND_ONE_OPERATING_RESERVE)) : 0
    const funds = second ? await corpFunds(ns, 0, quote) - secondReserve
      : await corpFunds(ns, ROUND_ONE_OPERATING_RESERVE, quote, true)
    if (!canAffordCorporationPurchase(funds, investment * 2, reserve)) {
      if (round === 2 && div === div3 && division.products.length < division.maxProducts)
        saveRoundTwoCapital(funds, investment * 2, reserve, false)
      if (cashMode && cashPlan && division.products.length < division.maxProducts) cashPlan.designHold = investment * 2
      if (second) second.note = second.keptForRep ? 'saving for the earlier faction bribe' : 'waiting for design funds above operating costs'
      continue
    }

    if (cashMode && cashPlan) {
      // Bribes can move cash between helper launches. Fund the new design and retire
      // the old seller in one game turn, or leave the whole lineup alone.
      const nextName = 'Prod v' + (version + 1)
      const kept = (second ? secondReserve : cashGrowthReserve(quote, ROUND_ONE_OPERATING_RESERVE)) + pendingInputPurchases
      const started = await corpRun(ns, 'makeProduct', '--cash-project', div, 'Sector-12', nextName,
        investment, worstProduct ?? '', kept, quote.nextState)
      if (started === true) {
        if (worstProduct) clearProductPricingCache(div, worstProduct)
        if (round === 5 && nextName === 'Prod v2' && cashPlan.v2) {
          cashPlan.v2.startedHere = true
          cashPlan.v2.note = 'design started in Sector-12'
        }
        cashPlan.designHold = 0
      } else if (second) {
        cashPlan.designHold = investment * 2
        second.note = 'retrying live cash, phase and home RAM checks'
      }
      continue
    }

    // An unfunded replacement must not remove an existing source of revenue.
    if (await discontinueManagedProduct(ns, div, worstProduct))
      division = await corpRun(ns, 'getDivision', div)
    if (division.products.length >= division.maxProducts) continue
    await corpRun(ns, 'makeProduct', div, "Sector-12", 'Prod v' + (version + 1), investment, investment)
    if (round === 2 && div === div3 && !roundTwoAllocation.forSetup) roundTwoAllocation.saved = 0
  }
}
/**
 * Function to get latest product version
 *
 * @param {NS} ns
 * @param {string} division
 * @return {number}
 */
async function getLatestProductVersion(ns, division) {
  const products = (await corpRun(ns, 'getDivision', division)).products
  let latest = 0;
  for (const prod of products) {
    let v = parseVersion(prod);
    if (v > latest) latest = v;
  }
  return latest;
}

/**
 * Function to parse product version from name
 *
 * @param {string} name
 * @returns {number}
 */
function parseVersion(name) {
  return Number(/(\d+)$/.exec(name)?.[1] ?? 0)
}

//setJob is used due to migrating to 3.0.0 breakages
/** @param {NS} ns */
async function setJob(ns, div, city, job, total) {
  (await corpRun(ns, 'setJobAssignment', div, city, job, total));
}

function cashOfficeJobs(n, remote, hasOutput) {
  const research = remote ? (hasOutput ? Math.floor(n / 4) : n) : 0
  const workers = n - research
  const eng = workers > 0 ? Math.max(1, Math.floor(workers / 4)) : 0
  const ops = workers > 1 ? Math.max(1, Math.floor(workers / 4)) : 0
  const sales = workers > 2 ? Math.max(1, hasOutput ? Math.floor(workers / 6) : 1) : 0
  return [ops, eng, sales, workers - ops - eng - sales, research, 0]
}

async function staffCashOffice(ns, div, city, hasOutput) {
  let office = hasOfficeDB[div + city]
  if (!office?.employeeJobs) office = await corpRun(ns, 'getOffice', div, city)
  const hires = Math.min(3, office.size - office.numEmployees)
  if (hires > 0) {
    await corporationBatch(ns, 'hireEmployee', Array.from({length:hires}, () => [div, city]))
    office = await corpRun(ns, 'getOffice', div, city)
  }
  const n = office.numEmployees, remote = city !== 'Sector-12'
  // Before v1 finishes the satellite labs help the design. Once it can sell, all
  // existing cities can manufacture it; keep a quarter of remote staff researching.
  const counts = cashOfficeJobs(n, remote, hasOutput)
  if (!remote && !hasOutput && n>=3 && bn3Reset && investOffer?.round===3 && div===div3) {
    counts[0]=Math.max(1,Math.round(n*.04))
    counts[1]=Math.max(1,Math.round(n*.51))
    counts[2]=0
    counts[3]=n-counts[0]-counts[1]
  }
  if (n===3 && !remote && hasOutput && await useSmallDesignTeam(ns,div,office)) {
    counts[2]=0; counts[3]=1
  }
  await assignOfficeJobs(ns,div,city,office,counts)
}

async function assignOfficeJobs(ns,div,city,office,counts) {
  const jobs = ['Operations', 'Engineer', 'Business', 'Management', 'Research & Development', 'Intern']
  if (jobs.every((j, i) => office.employeeJobs[j] === counts[i])) return
  const ok = await corporationBatch(ns, 'setJobAssignment', [
    ...jobs.map(j => [div, city, j, 0]), ...jobs.flatMap((j, i) => counts[i] ? [[div, city, j, counts[i]]] : []),
  ])
  if (ok.some(v => v !== true)) log(ns, `Could not staff ${div} in ${city}; will retry next cycle.`, false, 'warning')
}

async function manageOffice(ns) {
  const round = investOffer.round
  if (usesCashPolicy(round)) {
    for (const div of industries) {
      const d = hasDivDB[div]
      if (!d) continue
      const output = !d.makesProducts || (cashPlan?.goods ? cashPlan.goods[div]?.length > 0 : await hasCompletedManagedProduct(ns, div))
      for (const city of cities) if (hasOfficeDB[div + city]) await staffCashOffice(ns, div, city, output && !!hasWarehouseDB[div + city])
    }
    return
  }
  let hasDiv2 = false
  if (hasDivDB[div2]) {
    let cityCount = 0
    for (const city of cities) {
      if (hasWarehouseDB[div2 + city])
        cityCount++
    }
    if (cityCount === 6) hasDiv2 = true
  }
  let hasDiv3 = false
  if (hasDivDB[div3]) {
    let cityCount = 0
    for (const city of cities) {
      if (hasWarehouseDB[div3 + city]) {
        cityCount++
      }
    }
    if (cityCount === 6) hasDiv3 = true
  }

  for (const div of industries) {
    if (!hasDivDB[div]) continue
    for (const city of cities) {
      if (!hasOfficeDB[div + city]) continue
      switch (hasDivDB[div].industry) {
        case "Agriculture":
          switch (round) {
            case 1: {
              const division = await corpRun(ns, 'getDivision', div)
              const cityCount = Array.isArray(division?.cities) ? division.cities.length : 0
              const infrastructureComplete = cityCount >= cities.length
              let office = await corpRun(ns, 'getOffice', div, city)
              if (!office) break

              // In paid-API runs, productive home-office capacity is scarce after spending $100b on API unlocks.
              const officeTarget = getRoundOneOfficeTarget(
                city, cityCount, cities.length, capitalConstrainedBootstrap,
              )
              while (office.size < officeTarget) {
                const cost = Number(await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))
                if (!canAffordCorporationPurchase(await corpFunds(ns), cost, ROUND_ONE_OPERATING_RESERVE)) break
                const previousSize = office.size
                await corpRun(ns, 'upgradeOfficeSize', div, city, 1)
                office = await corpRun(ns, 'getOffice', div, city)
                if (!office || office.size <= previousSize) break
              }

              while (office && office.numEmployees < office.size) {
                const previousEmployees = office.numEmployees
                await corpRun(ns, 'hireEmployee', div, city)
                office = await corpRun(ns, 'getOffice', div, city)
                if (!office || office.numEmployees <= previousEmployees) {
                  break
                }
              }
              if (!office) break
              if (bn3Reset) hasOfficeDB[div + city] = office

              const plan = getRoundOneJobPlan(
                office.numEmployees,
                city,
                cityCount,
                division.researchPoints,
                cities.length,
                capitalConstrainedBootstrap,
              )
              if (bn3Reset && Object.entries(plan).every(([job, n]) => office.employeeJobs?.[job] === n)) break
              if (bn3Reset) {
                const jobs = Object.entries(plan)
                const to = (job, n) => [div, city, job, n]
                await corporationBatch(ns, 'setJobAssignment', [
                  ...jobs.map(([j]) => to(j, 0)), ...jobs.filter(([, n]) => n > 0).map(([j, n]) => to(j, n)),
                ])
              } else {
                await resetOffice(ns, div, city)
                for (const [job, count] of Object.entries(plan)) {
                  if (count > 0) await setJob(ns, div, city, job, count)
                }
              }
              break
            }
            case 2:
              while (hasDiv2 && (await corpRun(ns, 'getOffice', div, city)).size < 8 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              if ((await corpRun(ns, 'getDivision', div)).researchPoints < 700)
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2.66))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                const remainder = (await corpRun(ns, 'getOffice', div, city)).numEmployees - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2.66)
                await setJob(ns, div, city, "Management", remainder)
              }
              break
            case 3:
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4)
                await setJob(ns, div, city, "Research & Development", left)
              }
              if (!hasDiv3) break
              while ((await corpRun(ns, 'getOffice', div, city)).size < 8 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4)
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
            case 4:
              if ((await corpRun(ns, 'getOffice', div, city)).size < 60 &&
                  await corpFunds(ns) >= await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))
                await corpRun(ns, 'upgradeOfficeSize', div, city, 1)
              if ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size) (await corpRun(ns, 'hireEmployee', div, city))
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2) - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4)
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
          }
          break
        case "Chemical":
          switch (round) {
            case 2:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 3 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              if ((await corpRun(ns, 'getDivision', div)).researchPoints < 390)
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", 1)
                await setJob(ns, div, city, "Engineer", 1)
                await setJob(ns, div, city, "Business", 1)
              }
              break
            case 3:
              if (!hasDiv3) break
              while ((await corpRun(ns, 'getOffice', div, city)).size < 8 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", Math.max(1, Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4)))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - Math.max(1, Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4)) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
            case 4:
              if ((await corpRun(ns, 'getOffice', div, city)).size < 60 &&
                  await corpFunds(ns) >= await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))
                await corpRun(ns, 'upgradeOfficeSize', div, city, 1)
              if ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size) (await corpRun(ns, 'hireEmployee', div, city))
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
          }
          break
        case "Tobacco":
          switch (round) {
            case 2: {
              let office = await corpRun(ns, 'getOffice', div, city)
              if (!office) break
              const targetSize = getRoundTwoTobaccoOfficeTarget(city)
              while (office.size < targetSize) {
                const cost = Number(await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))
                if (!canAffordCorporationPurchase(
                  await corpFunds(ns), cost, ROUND_TWO_TOBACCO_RESERVE,
                )) break
                const previousSize = office.size
                await corpRun(ns, 'upgradeOfficeSize', div, city, 1)
                office = await corpRun(ns, 'getOffice', div, city)
                if (!office || office.size <= previousSize) break
              }
              while (office && office.numEmployees < office.size) {
                const previousEmployees = office.numEmployees
                await corpRun(ns, 'hireEmployee', div, city)
                office = await corpRun(ns, 'getOffice', div, city)
                if (!office || office.numEmployees <= previousEmployees) break
              }
              if (!office) break

              const division = await corpRun(ns, 'getDivision', div)
              const hasCompletedProduct = await hasCompletedManagedProduct(ns, div, division)
              const plan = getRoundTwoTobaccoJobPlan(
                office.numEmployees, city, hasCompletedProduct,
              )
              await resetOffice(ns, div, city)
              for (const [job, count] of Object.entries(plan)) {
                if (count > 0) await setJob(ns, div, city, job, count)
              }
              break
            }
            case 3: {
              // Round two uses every city for early sales. Round three needs the remote
              // research bank for stronger designs until the investment production push.
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              if (city !== "Sector-12" && !tobaccoBooster)
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Business", 1)
                const office = (await corpRun(ns, 'getOffice', div, city))
                const left = office.numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - 1
                await setJob(ns, div, city, "Management", left)
              }
              if (!hasDiv3) break
              const corpRev = (await getCorp(ns)).revenue
              while ((await corpRun(ns, 'getOffice', div, city)).size < ROUND_THREE_TOBACCO_SEATS && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 5e8)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 116 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 1e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 136 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 2.5e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 146 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 5e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 156 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 10e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 176 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 20e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 200 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 50e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 226 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              if (city !== "Sector-12" && !tobaccoBooster)
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Business", 1)
                const office = (await corpRun(ns, 'getOffice', div, city))
                const left = office.numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - 1
                await setJob(ns, div, city, "Management", left)
              }
            }
              break
            case 4: {
              const corpRev = (await getCorp(ns)).revenue
              if ((await corpRun(ns, 'getOffice', div, city)).size < ROUND_FOUR_TOBACCO_SEATS &&
                  await corpFunds(ns) >= await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))
                await corpRun(ns, 'upgradeOfficeSize', div, city, 1)
              if (corpRev > 100e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 270 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 200e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 290 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 400e9)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 320 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 1e12)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 360 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 2e12)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 380 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if (corpRev > 5e12)
                while ((await corpRun(ns, 'getOffice', div, city)).size < 380 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size) (await corpRun(ns, 'hireEmployee', div, city))
              await resetOffice(ns, div, city)
              if (city !== "Sector-12" && !tobaccoBooster)
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Business", 1)
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - 1
                await setJob(ns, div, city, "Management", left)
              }
            }
              break
          }
          break
      }
    }
  }
}
/** @param {NS} ns */
async function resetOffice(ns, div, city) {
  await setJob(ns, div, city, "Operations", 0)
  await setJob(ns, div, city, "Engineer", 0)
  await setJob(ns, div, city, "Business", 0)
  await setJob(ns, div, city, "Management", 0)
  await setJob(ns, div, city, "Research & Development", 0)
  await setJob(ns, div, city, "Intern", 0)
}
/** @param {NS} ns */
async function teaParty(ns) {
  let needed = false
  for (const div of industries) {
    if (!hasDivDB[div]) continue
    for (const city of cities) {
      if (!hasOfficeDB[div + city]) continue
      const office = (await corpRun(ns, 'getOffice', div, city))
      if (office.avgEnergy < office.maxEnergy - .5) {
        if (await corpFunds(ns, 0) >= office.numEmployees * 500000)
          await corpRun(ns, 'buyTea', div, city)
        needed = true
      }
      const moraleShortfall = office.maxMorale - office.avgMorale
      if (moraleShortfall > 0) {
        const price = moraleShortfall > 10 ? 500000 : moraleShortfall > 5 ? 200000 : moraleShortfall > .5 ? 100000 : 50000
        if (await corpFunds(ns, 0) >= office.numEmployees * price)
          await corpRun(ns, 'throwParty', div, city, price)
        if (moraleShortfall > .5) needed = true
      }
    }
  }
  return needed
}
/** @param {NS} ns */
async function purchase(ns) {
  pendingInputPurchases = 0
  for (const div of industries) {
    if (!hasDivDB[div]) continue
    for (const city of cities) {
      if (!hasWarehouseDB[div + city]) continue
      const smartBuy = []
      const warehouse = (await corpRun(ns, 'getWarehouse', div, city))
      if (!indDataDB[hasDivDB[div].industry]) {
        indDataDB[hasDivDB[div].industry] = (await corpRun(ns, 'getIndustryData', hasDivDB[div].industry))
      }
      /* Process purchase of materials, not from smart supply */
      for (const [matName, mat] of Object.entries(indDataDB[hasDivDB[div].industry].requiredMaterials)) {
        // Smart supply
        let buyAmt = await maxMatRequired(ns, div, city, matName)

        const stored = (await corpRun(ns, 'getMaterial', div, city, matName)).stored
        buyAmt -= stored
        if (!matDataDB[matName])
          matDataDB[matName] = (await corpRun(ns, 'getMaterialData', matName))
        const maxAmt = Math.max(0, Math.floor((warehouse.size - warehouse.sizeUsed) / matDataDB[matName].size));
        if (hasDivDB[div].industry === "Tobacco" && matName === "Plants" &&
            (buyAmt > maxAmt || (stored < 1 && maxAmt === 0)))
          await makeRoomForPlants(ns, div, city, warehouse)
        buyAmt = Math.min(buyAmt, maxAmt);
        smartBuy[matName] = [buyAmt, mat];
      } //End process purchase of materials

      // Use the materials already in the warehouse if the option is on.
      for (const [matName, [buy, reqMat]] of Object.entries(smartBuy)) {
        const buyAmt = buy
        const mult = await getMult(ns, div, city)
        if (mult[0] === 0) {
          await corpRun(ns, 'buyMaterial', div, city, matName, 0)
          await corpRun(ns, 'sellMaterial', div, city, matName, "MAX", "0")
        }
        else if (buyAmt > 0) {
          const price = (await corpRun(ns, 'getMaterial', div, city, matName)).marketPrice
          pendingInputPurchases += buyAmt * price
          await corpRun(ns, 'buyMaterial', div, city, matName, buyAmt / 10)
          await corpRun(ns, 'sellMaterial', div, city, matName, 0, "MP")
        }
        else {
          (await corpRun(ns, 'buyMaterial', div, city, matName, 0))
          if ((await corpRun(ns, 'getMaterial', div, city, matName)).quality <= 1) (await corpRun(ns, 'sellMaterial', div, city, matName, buyAmt / 10 * -1, "0"))
          else (await corpRun(ns, 'sellMaterial', div, city, matName, buyAmt / 10 * -1, "MP"))
        }
      }
    }//city
  }//div

}
/** @param {NS} ns */
async function basicExporImport(ns) {
  if (!researchedDB["Export"]) return
  for (const div of industries) {
    if (!hasDivDB[div]) continue
    if (!indDataDB[hasDivDB[div].industry])
      indDataDB[hasDivDB[div].industry] = await corpRun(ns, 'getIndustryData', hasDivDB[div].industry)
    if (!indDataDB[hasDivDB[div].industry].makesMaterials) continue
    for (const city of cities) {
      //We make this.  Export it
      for (const name of Object.values(indDataDB[hasDivDB[div].industry].producedMaterials)) {
        if (name === "Plants") { //(IPROD+IINV/10)*(-1)   (-IPROD-IINV/10)
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div3, "Sector-12", name) } catch { }
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div3, city, name) } catch { }
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div2, city, name) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div2, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div3, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div3, "Sector-12", name, `(IPROD+IINV/10)*(-1)`) } catch { }
        }
        else if (name === "Chemicals") {
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div1, city, name) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div1, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
        }
        else if (name === "Food") {
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div4, "Sector-12", name) } catch { }
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div4, city, name) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div4, "Sector-12", name, `(IPROD+IINV/10)*(-1)`) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div4, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
        }
        else if (name === "Water") {
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div1, city, name) } catch { }
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div2, city, name) } catch { }
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div4, city, name) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div1, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div2, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div4, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
        }
        else if (name === "Hardware") {
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div5, city, name) } catch { }
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div8, city, name) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div5, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div8, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
        }
        else if (name === "Metal") {
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div6, city, name) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div6, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
        }
        else if (name === "Ore") {
          try { await corpRun(ns, 'cancelExportMaterial', div, city, div7, city, name) } catch { }
          try { await corpRun(ns, 'exportMaterial', div, city, div7, city, name, `(IPROD+IINV/10)*(-1)`) } catch { }
        }
      }
    }
  }
}
/** @param {NS} ns */

export function canRunBoostMaterialOptimization(
  funds,
  estimatedCost,
  reserve = ROUND_ONE_OPERATING_RESERVE,
) {
  const corporationFunds = Number(funds)
  const cost = Number(estimatedCost)
  const workingCapital = Number(reserve)
  return Number.isFinite(corporationFunds) && Number.isFinite(cost) && Number.isFinite(workingCapital) &&
    corporationFunds >= Math.max(0, cost) + Math.max(0, workingCapital)
}

async function readTobaccoBoostStock(ns, div, city) {
  const units = {}
  let space = 0
  for (const name of BOOST_MATERIALS) {
    const data = matDataDB[name] ?? await corpRun(ns, 'getMaterialData', name)
    const stored = (await corpRun(ns, 'getMaterial', div, city, name))?.stored
    if (!Number.isFinite(stored) || stored < 0 || !Number.isFinite(data?.size) || data.size <= 0) return null
    matDataDB[name] = data
    units[name] = stored
    space += stored * data.size
  }
  return Number.isFinite(space) ? {units, space} : null
}

// The old maxProduced forecast counts only finished products. Before v1 or with an R&D-only
// office that can reserve zero. Size the first batch from the same office/boost calculation.
async function tobaccoWorkingSpace(ns, div, city, warehouse, stock, margin) {
  const [, productRate] = await getMult(ns, div, city)
  const industry = indDataDB.Tobacco ??= await corpRun(ns, 'getIndustryData', 'Tobacco')
  const plantSize = (matDataDB.Plants ??= await corpRun(ns, 'getMaterialData', 'Plants'))?.size
  const recipeSize = plantSize * industry?.requiredMaterials?.Plants
  const plants = (await corpRun(ns, 'getMaterial', div, city, 'Plants'))?.stored
  const names = (await corpRun(ns, 'getDivision', div))?.products
  if (!Array.isArray(names) || !Number.isFinite(productRate) || productRate < 0 || !Number.isFinite(recipeSize) ||
      recipeSize <= 0 || !Number.isFinite(plants) || plants < 0) return NaN
  let finished = 0, outputSize = 0, inventory = 0
  for (const name of names) {
    const p = await corpRun(ns, 'getProduct', div, city, name)
    if (!Number.isFinite(p?.developmentProgress)) return NaN
    if (p.developmentProgress !== 100) continue
    if (!Number.isFinite(p.size) || p.size <= 0 || !Number.isFinite(p.stored) || p.stored < 0) return NaN
    finished++; outputSize += p.size; inventory += p.size * p.stored
  }
  // Tobacco turns one Plant into an equal-volume product. With no productive staff yet,
  // keep at least one input/output unit per product instead of reserving a warehouse percentage.
  const batch = Math.max(1, productRate * 10)
  const cycleSpace = batch * (recipeSize * Math.max(1, finished) + (finished ? outputSize : recipeSize))
  const onHand = inventory + plants * plantSize
  const otherGoods = Math.max(0, warehouse.sizeUsed - stock.space - onHand)
  return otherGoods + Math.max(onHand, (inventory + cycleSpace) * margin)
}

// Can run while normal boost purchases are paused. Use the same calculated targets, but
// only cancel buys and sell excess; do not rebalance by buying other boosters during a jam.
async function makeRoomForPlants(ns, div, city, warehouse) {
  const stock = await readTobaccoBoostStock(ns, div, city)
  if (!stock) return
  const targets = await getBoostMaterialTargets(ns, div, city, stock, warehouse)
  if (!targets) return
  boostTargets = boostTargets.filter(p => p.div !== div || p.city !== city)
    .concat(BOOST_MATERIALS.map(mat => ({div, city, mat, target: targets[mat]})))
  let targetSpace = 0, surplusSpace = 0
  for (const name of BOOST_MATERIALS) {
    const size = matDataDB[name].size
    targetSpace += size * targets[name]
    surplusSpace += size * Math.max(0, stock.units[name] - targets[name])
  }
  // A lopsided warehouse needs only enough clearance for the batch, not a complete portfolio rebuild.
  const trim = surplusSpace > 0 ? Math.min(1, Math.max(0, stock.space - targetSpace) / surplusSpace) : 0
  for (const name of BOOST_MATERIALS) {
    const stored = stock.units[name], keep = stored - trim * Math.max(0, stored - targets[name])
    await adjustMaterialToTarget(ns, div, city, name, keep, 10, stored)
  }
}

async function getBoostMaterialTargets(ns, div, city, stock, warehouse) {
  warehouse ??= await corpRun(ns, "getWarehouse", div, city)
  if (!Number.isFinite(warehouse?.size) || warehouse.size <= 0) return null

  const margin = investOffer.round < 3 ? 1.01 : 1.1
  const tobacco = hasDivDB[div].industry === "Tobacco"
  let workingSpace
  if (tobacco) {
    stock ??= await readTobaccoBoostStock(ns, div, city)
    if (!stock || !Number.isFinite(warehouse.sizeUsed) || warehouse.sizeUsed < 0) return null
    workingSpace = await tobaccoWorkingSpace(ns, div, city, warehouse, stock, margin)
  } else workingSpace = (await maxProduced(ns, div, city)) * margin
  if (!Number.isFinite(workingSpace) || workingSpace < 0) return null
  const freeSpace = Math.max(0, warehouse.size - workingSpace)
  if (!(freeSpace > 0)) return Object.fromEntries(BOOST_MATERIALS.map(material => [material, 0]))

  let targets = await optimizeCorpoMaterials(ns, div, freeSpace, !tobacco)
  if (tobacco) {
    if (targets.length !== BOOST_MATERIALS.length || !targets.every(q => Number.isFinite(q) && q >= 0)) return null
    const rounded = targets.map(Math.round)
    const roundedSpace = BOOST_MATERIALS.reduce((sum, name, i) => sum + rounded[i] * matDataDB[name].size, 0)
    targets = roundedSpace <= freeSpace ? rounded : targets.map(Math.floor)
  }
  return Object.fromEntries(BOOST_MATERIALS.map((material, i) => [material, targets[i] ?? 0]))
}

async function estimateBoostMaterialOptimizationCost(ns, divisions = industries) {
  let total = 0
  for (const div of divisions) {
    if (!hasDivDB[div]) continue
    for (const city of cities) {
      if (!hasWarehouseDB[div + city]) continue
      const targets = await getBoostMaterialTargets(ns, div, city)
      if (!targets) return Infinity
      for (const materialName of BOOST_MATERIALS) {
        const material = await corpRun(ns, "getMaterial", div, city, materialName)
        const price = Number(material?.marketPrice)
        const stored = Number(material?.stored)
        const target = Number(targets[materialName])
        if (!Number.isFinite(price) || !Number.isFinite(stored) || !Number.isFinite(target)) return Infinity
        total += Math.max(0, target - stored) * price
      }
    }
  }
  return total
}

async function setRoundOneBoostMaterialOrders(ns, liquidate = false) {
  const division = await corpRun(ns, "getDivision", div1)
  for (const city of division?.cities ?? []) {
    if (await corpRun(ns, "hasWarehouse", div1, city) !== true) continue
    for (const materialName of BOOST_MATERIALS) {
      await corpRun(ns, "buyMaterial", div1, city, materialName, 0)
      await corpRun(ns, "sellMaterial", div1, city, materialName, liquidate ? "MAX" : 0, "MP")
    }
  }
}

async function setSeedSales(ns, configured) {
  // Install once per warehouse, including on restart. No SALE-phase polling is needed.
  const newCities = cities.filter(c => hasWarehouseDB[div1 + c] && !configured.has(c))
  await corporationBatch(ns, 'sellMaterial', newCities.flatMap(c => ['Plants', 'Food'].map(m => [div1, c, m, 'MAX', 'MP'])))
  newCities.forEach(c => configured.add(c))
}

// Price the contents as well as the building. A warehouse level with no cash left to
// stock it adds no production. Compare the next *affordable* physical upgrades, using
// the game's division-wide booster multiplier and each city's actual prices and stock.
function planSeedAgriculture(lots, sizes, weights, levels, prices, available) {
  const evaluate = (storage, factory, cityIndex) => {
    let shortage = 0, mult = 0
    const targets = lots.map((lot, i) => {
      const size = lot.size * (lot.level + (i === cityIndex ? 1 : 0)) / lot.level *
        (1 + .1 * storage) / (1 + .1 * levels[0])
      const room = Math.max(0, Math.min(.86 * size, size - lot.working))
      const qty = optimizeCorpoMaterials_raw(sizes, weights, room, false).map(Math.floor)
      let cityMult = 1
      for (const [j, n] of qty.entries()) {
        shortage += Math.max(0, n - lot.stock[j].stored) * lot.stock[j].marketPrice
        cityMult *= (1 + .002 * n) ** weights[j]
      }
      mult += cityMult ** .73
      return qty
    })
    return {targets, shortage, output: mult * (1 + .03 * factory)}
  }
  const [storage, factory] = levels
  const base = evaluate(storage, factory, -1)
  let best = null, score = 0
  function consider(name, cost, plan) {
    if (!(Number.isFinite(cost) && cost > 0 && cost + plan.shortage <= available)) return
    const gain = (plan.output - base.output) / (cost + Math.max(0, plan.shortage - base.shortage))
    if (gain > score) { score = gain; best = {name, cost, shortage: plan.shortage} }
  }
  if (base.shortage <= available) {
    consider('Smart Storage', prices[0], evaluate(storage + 1, factory, -1))
    consider('Smart Factories', prices[1], evaluate(storage, factory + 1, -1))
    lots.forEach((lot, i) => consider(lot.city, lot.upgrade, evaluate(storage, factory, i)))
  }
  return {targets: base.targets, upgrade: best}
}

async function growSeedAgriculture(ns) {
  boostTargets = []
  const locations = cities.map(c => [div1, c])
  const upgrades = [['Smart Storage'], ['Smart Factories']]
  const warehouses = await corporationBatch(ns, 'getWarehouse', locations)
  const stocks = await corporationBatch(ns, 'getMaterial', locations.flatMap(l => BOOST_MATERIALS.map(m => [...l, m])))
  const industry = indDataDB.Agriculture ??= await corpRun(ns, 'getIndustryData', div1)
  const names = [...BOOST_MATERIALS, ...Object.keys(industry.requiredMaterials), ...industry.producedMaterials]
  const missing = names.filter(n => !matDataDB[n])
  const data = await corporationBatch(ns, 'getMaterialData', missing.map(n => [n]))
  missing.forEach((n, i) => {matDataDB[n] = data[i]})
  const sizes = BOOST_MATERIALS.map(n => matDataDB[n].size)
  const weights = [industry.hardwareFactor, industry.robotFactor, industry.aiCoreFactor, industry.realEstateFactor]
  const volume = Object.entries(industry.requiredMaterials).reduce((s, [n, qty]) => s + qty * matDataDB[n].size, 0)
    + industry.producedMaterials.reduce((s, n) => s + matDataDB[n].size, 0)
  const levels = await corporationBatch(ns, 'getUpgradeLevel', upgrades)
  const prices = await corporationBatch(ns, 'getUpgradeLevelCost', upgrades)
  const costs = await corporationBatch(ns, 'getUpgradeWarehouseCost', locations)
  const lots = []
  for (const [i, city] of cities.entries()) {
    const {level, size, sizeUsed} = warehouses[i]
    const stock = stocks.slice(i * 4, i * 4 + 4)
    const occupied = sizeUsed - stock.reduce((s, m, j) => s + m.stored * sizes[j], 0)
    const [rate] = await getMult(ns, div1, city)
    const working = Math.max(0, occupied) + 10 * rate * volume * 1.01
    if (!(level > 0 && size > 0 && Number.isFinite(working) && stock.every(m =>
        Number.isFinite(m.stored) && m.stored >= 0 && Number.isFinite(m.marketPrice) && m.marketPrice > 0))) return
    lots.push({city, level, size, stock, working, upgrade: costs[i]})
  }
  const available=await corpFunds(ns)
  if (investOffer?.round===1 && bnMults.CorporationValuation<1 && !hasDivDB[div3]) {
    const line=indDataDB[div3] ??= await corpRun(ns,'getIndustryData',div3)
    const design=projectBudget(0,null,1), starter=line.startingCost+design
    // A normal investor can already fund a design investment. Let the farm grow
    // that offer; earmark the entire launch only when equity pays almost nothing.
    if (investOffer.funds<design/2 && available>=starter)
      savedForDivision=Math.max(savedForDivision,starter)
  }
  const {targets, upgrade} = planSeedAgriculture(lots, sizes, weights, levels, prices, available-savedForDivision)
  boostTargets = lots.flatMap((lot, i) => BOOST_MATERIALS.map((mat, j) => ({div: div1, city: lot.city, mat, target: targets[i][j]})))
  if (!upgrade || (await getCorp(ns)).nextState !== 'EXPORT' ||
      !canAffordCorporationPurchase(await corpFunds(ns), upgrade.cost, upgrade.shortage+savedForDivision)) return
  if (cities.includes(upgrade.name)) await corpRun(ns, 'upgradeWarehouse', div1, upgrade.name)
  else await corpRun(ns, 'levelUpgrade', upgrade.name)
}

async function manageRoundOneBoostMaterials(ns) {
  boostTargets = []
  const homeOffice = await corpRun(ns, "getOffice", div1, "Sector-12")
  if (!capitalConstrainedBootstrap) {
    if (!teaNeeded && Number(homeOffice?.employeeJobs?.Business) > 0) await optimizeMats(ns)
    return true
  }

  const corporation = await getCorp(ns)
  const funds = Number(corporation?.funds)
  if (!Number.isFinite(funds)) return false
  if (funds < 0) {
    await setRoundOneBoostMaterialOrders(ns, true)
    return false
  }

  const productive = isRoundOneBootstrapReady(hasDivDB[div1], homeOffice)
  if (teaNeeded || !productive) {
    await setRoundOneBoostMaterialOrders(ns, false)
    return false
  }

  const estimatedCost = await estimateBoostMaterialOptimizationCost(ns, [div1])
  if (!canRunBoostMaterialOptimization(funds, estimatedCost)) {
    await setRoundOneBoostMaterialOrders(ns, false)
    return false
  }

  await optimizeMats(ns)
  return true
}
async function optimizeMats(ns, divisions = industries) {
  const plans = []
  for (const div of divisions) {
    if (!hasDivDB[div]) continue
    for (const city of cities) {
      if (!hasWarehouseDB[div + city]) continue
      const tobacco = hasDivDB[div].industry === "Tobacco"
      const stock = tobacco ? await readTobaccoBoostStock(ns, div, city) : null
      if (tobacco && !stock) continue
      const targets = await getBoostMaterialTargets(ns, div, city, stock)
      if (!targets) continue
      for (const mat of BOOST_MATERIALS) plans.push({div, city, mat, target: targets[mat]})
    }
  }
  boostTargets = boostTargets.filter(p => !divisions.includes(p.div)).concat(plans)
}

// Compute targets in EXPORT, then use current stock/prices/cash just before PURCHASE. Long
// forecasts must not consume the short purchase window or leave stale buy rates behind.
async function purchaseBoostMaterials(ns, divisions = industries) {
  const selected = boostTargets.filter(p => divisions.includes(p.div))
  if (!selected.length) return false
  const materials = await corporationBatch(ns, 'getMaterial', selected.map(p => [p.div, p.city, p.mat]))
  const plans = []
  for (const [i, p] of selected.entries()) {
    const {stored, marketPrice} = materials[i]
    if (![stored, marketPrice, p.target].every(Number.isFinite) || stored < 0 || marketPrice <= 0 || p.target < 0) continue
    const industry = indDataDB[hasDivDB[p.div].industry]
    const input = !!industry.requiredMaterials[p.mat]
    const inputRate = input ? materials[i].buyAmount : 0
    if (!Number.isFinite(inputRate) || inputRate < 0) continue
    const managedAsGoods = input || industry.producedMaterials?.includes(p.mat)
    plans.push({...p, stored, marketPrice, inputRate, managedAsGoods})
  }
  const rateDivisor = investOffer.round >= 4 ? 100 : 10
  // One budget across all cities/divisions. Unsold inventory and future sales are not cash.
  const totalCost = plans.reduce((sum, p) => sum + Math.max(0, p.target - p.stored) * p.marketPrice, 0)
  const available = Math.max(0, await corpFunds(ns)-(bn3Reset && investOffer.round<=2 ? savedForDivision : 0))
  const fraction = totalCost > 0 && Number.isFinite(totalCost) ? Math.min(1, available / totalCost) : 0
  const buys = [], clears = [], sales = []
  for (const p of plans) {
    if (p.target <= p.stored || !(fraction > 0)) {
      if (!p.managedAsGoods) {
        clears.push([p.div, p.city, p.mat, 0])
        sales.push([p.div, p.city, p.mat, p.target < p.stored
          ? `MAX*((INV-${p.target})/(INV+1))/${rateDivisor / 10}` : 0, 'MP'])
      }
    } else {
      if (!p.managedAsGoods) sales.push([p.div, p.city, p.mat, 0, 'MP'])
      // Hardware/AI Cores can also be recipe inputs. Preserve their funded input order.
      buys.push([p.div, p.city, p.mat, p.inputRate + (p.target - p.stored) * fraction / rateDivisor, p.inputRate])
    }
  }
  // Retrying a cancellation after a confirmed helper exit cannot buy additional stock.
  try { await corporationBatch(ns, 'buyMaterial', clears) }
  catch (error) {
    if (error?.message !== 'corporation.buyMaterial: corporation.buyMaterial exited before returning a result') throw error
    await corporationBatch(ns, 'buyMaterial', clears)
    return false
  }
  await corporationBatch(ns, 'sellMaterial', sales)
  // Planning may span a state transition, especially with bonus time. Retry next cycle if late.
  if (!buys.length || (await getCorp(ns)).nextState !== 'PURCHASE') return false
  // The helper cancels the rates after the next state and also on interruption. No standing buys.
  return corporationBatch(ns, 'buyMaterial', buys, true)
}

/**
 * Retains the requested boosters while clearing buys and selling only excess stock.
 * @param {NS} ns
 */
async function adjustMaterialToTarget(ns, div, city, mat, target, rateDivisor, observedStock) {
  const EPS = 1e-6;

  const stored = observedStock ?? (await corpRun(ns, "getMaterial", div, city, mat)).stored;
  const delta = target - stored;

  // Once INV reaches the target, the engine clamps a negative sale amount to zero.
  const sellRate = delta < -EPS ? `MAX*((INV-${target})/(INV+1))/${rateDivisor / 10}` : 0;
  await corpRun(ns, "buyMaterial", div, city, mat, 0);
  await corpRun(ns, "sellMaterial", div, city, mat, sellRate, "MP");
}
function optimizeCorpoMaterials_raw(matSizes, divWeights, spaceConstraint, round) {
  let p = divWeights.reduce((a, b) => a + b, 0);
  let w = matSizes.reduce((a, b) => a + b, 0);
  let r = [];
  for (let i = 0; i < matSizes.length; ++i) {
    let m = (spaceConstraint - 500 * ((matSizes[i] / divWeights[i]) * (p - divWeights[i]) - (w - matSizes[i]))) / (p / divWeights[i]) / matSizes[i];
    if (divWeights[i] <= 0 || m < 0) {
      return optimizeCorpoMaterials_raw(matSizes.toSpliced(i, 1), divWeights.toSpliced(i, 1), spaceConstraint, round).toSpliced(i, 0, 0);
    } else {
      if (round) m = Math.round(m);
      r.push(m);
    }
  }
  return r;
}
//SpaceConstraint is how much space to dedicate to it
/** @param {NS} ns */
async function optimizeCorpoMaterials(ns, div, spaceConstraint, round = true) {
  const type = hasDivDB[div].industry
  if (!indDataDB[type])
    indDataDB[type] = await corpRun(ns, 'getIndustryData', type)
  let { hardwareFactor, robotFactor, aiCoreFactor, realEstateFactor } = indDataDB[type]
  if (isNaN(hardwareFactor)) hardwareFactor = 0
  if (isNaN(robotFactor)) robotFactor = 0
  if (isNaN(aiCoreFactor)) aiCoreFactor = 0
  if (isNaN(realEstateFactor)) realEstateFactor = 0

  const divWeights = [hardwareFactor, robotFactor, aiCoreFactor, realEstateFactor]
  if (!matDataDB["Hardware"])
    matDataDB["Hardware"] = await corpRun(ns, 'getMaterialData', "Hardware")
  if (!matDataDB["Robots"])
    matDataDB["Robots"] = await corpRun(ns, 'getMaterialData', "Robots")
  if (!matDataDB["AI Cores"])
    matDataDB["AI Cores"] = await corpRun(ns, 'getMaterialData', "AI Cores")
  if (!matDataDB["Real Estate"])
    matDataDB["Real Estate"] = await corpRun(ns, 'getMaterialData', "Real Estate")
  const matSizes = ["Hardware", "Robots", "AI Cores", "Real Estate"].map((mat) => matDataDB[mat].size)
  return optimizeCorpoMaterials_raw(matSizes, divWeights, spaceConstraint, round)
}
/** @param {NS} ns */
async function maxProduction(ns, div, city) {
  if (!hasWarehouseDB[div + city]) return [0, 0]
  const mult = await getMult(ns, div, city)
  return [10 * mult[0], 10 * mult[1]]
}
/** @param {NS} ns */
async function maxMatRequired(ns, div, city, matID) {
  if (!hasDivDB[div]) return 0
  if (!hasWarehouseDB[div + city]) return 0
  let productMult = 0
  if (indDataDB[hasDivDB[div].industry] === undefined)
    indDataDB[hasDivDB[div].industry] = await corpRun(ns, 'getIndustryData', hasDivDB[div].industry)
  if (indDataDB[hasDivDB[div].industry].makesProducts) {
    let products = 0
    const division = (await corpRun(ns, 'getDivision', div))
    for (const prod of division.products)
      if ((await corpRun(ns, 'getProduct', div, city, prod)).developmentProgress === 100)
        products++
    productMult = products
  }
  else productMult = 1

  for (const [matName, mat] of Object.entries(indDataDB[hasDivDB[div].industry].requiredMaterials)) {
    if (matName !== matID) continue
    // Smart supply
    let required = 0
    const mult = await getMult(ns, div, city)
    if (hasDivDB[div].makesProducts) required += 10 * mult[1] * mat * productMult
    if (indDataDB[hasDivDB[div].industry].makesMaterials) required += 10 * mult[0] * mat
    return required
  } //End process purchase of materials
  return 0
}
/** @param {NS} ns */
async function maxProduced(ns, div, city) {
  if (!hasWarehouseDB[div + city]) return 0
  const mult = await getMult(ns, div, city)
  const multMaterial = mult[0]
  const multProduct = mult[1]
  if (multMaterial === 0) return 0

  let totalSize = 0
  if (indDataDB[hasDivDB[div].industry] === undefined)
    indDataDB[hasDivDB[div].industry] = await corpRun(ns, 'getIndustryData', hasDivDB[div].industry)
  for (const [matName, matAmount] of Object.entries(indDataDB[hasDivDB[div].industry].requiredMaterials)) {
    if (matDataDB[matName] === undefined)
      matDataDB[matName] = await corpRun(ns, 'getMaterialData', matName)
    totalSize += await maxMatRequired(ns, div, city, matName) * matDataDB[matName].size
  }
  if (indDataDB[hasDivDB[div].industry].makesMaterials)
    for (const mat of indDataDB[hasDivDB[div].industry].producedMaterials) {
      if (matDataDB[mat] === undefined)
        matDataDB[mat] = await corpRun(ns, 'getMaterialData', mat)
      totalSize += matDataDB[mat].size * 10 * multMaterial
      totalSize += (await corpRun(ns, 'getMaterial', div, city, mat)).stored * matDataDB[mat].size
    }
  const division = (await corpRun(ns, 'getDivision', div))
  for (const prod of division.products)
    if ((await corpRun(ns, 'getProduct', div, city, prod)).developmentProgress === 100) {
      totalSize += (await corpRun(ns, 'getProduct', div, city, prod)).size * 10 * multProduct
      totalSize += (await corpRun(ns, 'getProduct', div, city, prod)).stored * (await corpRun(ns, 'getProduct', div, city, prod)).size
    }
  return totalSize
}
/** @param {NS} ns */
async function warehouseUpgrade(ns) {
  if (investmentReview) return
  const round = investOffer.round

  let hasDiv2 = false
  let count = 0
  for (const city of cities)
    if (hasWarehouseDB[div2 + city]) count++
  if (count === 6)
    hasDiv2 = true

  let hasDiv3 = false
  let cityCount = 0
  for (const city of cities)
    if (hasWarehouseDB[div3 + city]) cityCount++
  if (cityCount === 6) hasDiv3 = true

  while (count < 8) {
    if (round >= 3) count++
    let smartStorageIncrease = 0
    const smartStorage = await corpRun(ns, 'getUpgradeLevel', "Smart Storage")
    for (const div of industries) {
      if (!hasDivDB[div]) continue
      if (round === 2 && hasDivDB[div].industry === "Chemical") continue
      for (const city of cities) {
        if (!hasWarehouseDB[div + city]) continue
        const warehouse = await corpRun(ns, 'getWarehouse', div, city)
        let divMult = researchedDB[div + "Drones - Transport"] ? 1.5 : 1
        smartStorageIncrease += (warehouse.level * 100 * (1 + ((smartStorage + 1) * .1)) * divMult) - (warehouse.level * 100 * (1 + (smartStorage * .1)) * divMult)
      }
    }
    const funds = await corpFunds(ns)
    if ((hasDiv2 && smartStorage >= 30)
      || (!hasDiv2 && smartStorage >= 10))
      smartStorageIncrease = 0

    let bestUpgradeType = "none"
    let bestUpgradeCity = "none"
    let bestUpgradeRatio = 0
    let bestAgriCity = "none"
    let bestAgriRatio = 0
    let bestChemCity = "none"
    let bestChemRatio = 0
    let bestWaterCity = "none"
    let bestWaterRatio = 0
    let bestComputerCity = "none"
    let bestComputerRatio = 0
    let bestRefineryCity = "none"
    let bestRefineryRatio = 0
    let bestMiningCity = "none"
    let bestMiningRatio = 0
    const smartUpgrade = await corpRun(ns, 'getUpgradeLevelCost', "Smart Storage")
    let smartRatio = smartStorageIncrease === 0 ? 0 : smartStorageIncrease / smartUpgrade

    for (const div of industries) {
      if (!hasDivDB[div]) continue
      for (const city of cities) {
        if (!hasWarehouseDB[div + city]) continue
        const warehouse = await corpRun(ns, 'getWarehouse', div, city)
        const warehouseUpgrade = await corpRun(ns, 'getUpgradeWarehouseCost', div, city);
        const smartStorageMult = 1 + (smartStorage * .1)
        let divMult = 1
        try { divMult = researchedDB[div + "Drones - Transport"] ? 1.5 : 1 } catch { continue }
        let warehouseIncrease = ((warehouse.level + 1) * 100 * smartStorageMult * divMult) - warehouse.size
        let warehouseRatio = warehouseIncrease / warehouseUpgrade

        if (round === 2 && (warehouse.level === 2 || !hasDiv2) && hasDivDB[div].industry === "Chemical") warehouseRatio = 0 //Early break on Chemical warehouse upgrade until we get all of Chemical
        if (hasDivDB[div].industry === "Agriculture" && warehouseRatio > bestAgriRatio) {
          bestAgriCity = city
          bestAgriRatio = warehouseRatio
        }
        else if (hasDivDB[div].industry === "Chemical" && warehouseRatio > bestChemRatio) {
          bestChemCity = city
          bestChemRatio = warehouseRatio
        }
        else if (hasDivDB[div].industry === "Water Utilities" && warehouseRatio > bestWaterRatio) {
          bestWaterCity = city
          bestWaterRatio = warehouseRatio
        }
        else if (hasDivDB[div].industry === "Computer Hardware" && warehouseRatio > bestComputerRatio) {
          bestComputerCity = city
          bestComputerRatio = warehouseRatio
        }
        else if (hasDivDB[div].industry === "Refinery" && warehouseRatio > bestRefineryRatio) {
          bestRefineryCity = city
          bestRefineryRatio = warehouseRatio
        }
        else if (hasDivDB[div].industry === "Mining" && warehouseRatio > bestMiningRatio) {
          bestMiningCity = city
          bestMiningRatio = warehouseRatio
        }
        const maxProd = await maxProduction(ns, div, city)
        if (round >= 3 && hasDivDB[div].industry === "Agriculture") {
          if (maxProd[0] > await maxMatRequired(ns, div4, city, "Food") && maxProd[0] > (await maxMatRequired(ns, div2, city, "Plants") + await maxMatRequired(ns, div3, "Sector-12", "Plants")))
            warehouseRatio = 0
          else warehouseRatio *= .9
        }
        if (round >= 3 && hasDivDB[div].industry === "Chemical") {
          if (maxProd[0] > await maxMatRequired(ns, div1, city, "Chemicals") || !hasDiv3)
            warehouseRatio = 0
          else warehouseRatio *= .9
        }
        if (round >= 5 && hasDivDB[div].industry === "Water Utilities") {
          if (maxProd[0] > await maxMatRequired(ns, div1, city, "Water") + await maxMatRequired(ns, div2, city, "Water") + await maxMatRequired(ns, div4, city, "Water"))
            warehouseRatio = 0
          else warehouseRatio *= .9
        }
        if (round >= 5 && hasDivDB[div].industry === "Computer Hardware") {
          if (maxProd[0] > await maxMatRequired(ns, div5, city, "Hardware") + await maxMatRequired(ns, div8, city, "Hardware"))
            warehouseRatio = 0
          else warehouseRatio *= .9
        }
        if (round >= 5 && hasDivDB[div].industry === "Refinery") {
          if (maxProd[0] > await maxMatRequired(ns, div6, city, "Metal"))
            warehouseRatio = 0
          else warehouseRatio *= .9
        }
        if (round >= 5 && hasDivDB[div].industry === "Mining") {
          if (maxProd[0] > await maxMatRequired(ns, div7, city, "Metal"))
            warehouseRatio = 0
          else warehouseRatio *= .9
        }

        if (round === 2 && !hasDiv2 && hasDivDB[div].industry === "Agriculture") {
          warehouseRatio = 0
          smartRatio = 0
        }
        if (round === 2 && hasDiv2 && warehouse.level >= 20 && hasDivDB[div].industry === "Agriculture") {
          warehouseRatio = 0
          smartRatio = 0
        }
        if (round === 3 && !hasDiv3 && hasDivDB[div].industry === "Agriculture") {
          warehouseRatio = 0
          smartRatio = 0
        }
        if (round === 3 && !hasDiv3 && warehouse.level >= 3 && hasDivDB[div].industry === "Chemical") {
          warehouseRatio = 0
          smartRatio = 0
        }
        if (round === 3 && !hasDiv3 && hasDivDB[div].industry === "Tobacco") {
          warehouseRatio = 0
          smartRatio = 0
        }
        if (round === 2 && ((hasDivDB[div].industry === "Chemical" && (warehouse.level === 2 || !hasDiv2)))) {
          warehouseRatio = 0
          smartRatio = 0
        }
        if ((round >= 3) && ["Tobacco", "Restaurant"].includes(hasDivDB[div].industry) && warehouse.level >= 5)
          warehouseRatio = 0
        //Round 2 - upgrade chem once
        if (round === 2 && hasDivDB[div].industry === "Chemical" && warehouse.level === 1) {
          bestUpgradeType = div
          bestUpgradeCity = city
          bestUpgradeRatio = Infinity
        }
        else if (warehouseRatio > smartRatio && warehouseRatio > bestUpgradeRatio) {
          bestUpgradeType = div
          bestUpgradeCity = city
          bestUpgradeRatio = warehouseRatio
        }
        else if (smartRatio > bestUpgradeRatio) {
          bestUpgradeType = "Smart"
          bestUpgradeRatio = smartRatio
        }
      }
    }
    if (!["Smart", "none"].includes(bestUpgradeType)) {
      if (hasDivDB[bestUpgradeType].industry === "Agriculture") {
        bestUpgradeCity = bestAgriCity
      }
      else if (hasDivDB[bestUpgradeType].industry === "Chemical") {
        bestUpgradeCity = bestChemCity
      }
      else if (hasDivDB[bestUpgradeType].industry === "Water Utilities") {
        bestUpgradeCity = bestWaterCity
      }
      else if (hasDivDB[bestUpgradeType].industry === "Computer Hardware") {
        bestUpgradeCity = bestComputerCity
      }
      else if (hasDivDB[bestUpgradeType].industry === "Refinery") {
        bestUpgradeCity = bestRefineryCity
      }
      else if (hasDivDB[bestUpgradeType].industry === "Mining") {
        bestUpgradeCity = bestMiningCity
      }
    }
    if (round >= 3) {
      if (bestUpgradeType === "none") break
      else if (bestUpgradeType === "Smart" && funds >= await corpRun(ns, 'getUpgradeLevelCost', "Smart Storage") * 1.5) {
        (await corpRun(ns, 'levelUpgrade', "Smart Storage"))
      }
      else if (bestUpgradeCity !== "none" && funds >= await corpRun(ns, 'getUpgradeWarehouseCost', bestUpgradeType, bestUpgradeCity) * 1.5) {
        await corpRun(ns, 'upgradeWarehouse', bestUpgradeType, bestUpgradeCity)
      }
      else break
    }
    else {
      if (bestUpgradeType === "none") break
      else if (bestUpgradeType === "Smart" && funds >= await corpRun(ns, 'getUpgradeLevelCost', "Smart Storage")) {
        (await corpRun(ns, 'levelUpgrade', "Smart Storage"))
      }
      else if (bestUpgradeCity !== "none" && funds >= await corpRun(ns, 'getUpgradeWarehouseCost', bestUpgradeType, bestUpgradeCity)) {
        await corpRun(ns, 'upgradeWarehouse', bestUpgradeType, bestUpgradeCity)
      }
      else break
    }
  }
}
/** @param {NS} ns */
async function getSellPrice(ns, div, city, prod) {
  const ta2 = ta2DB[div + city + prod]
  if (Number.isFinite(ta2?.productQuote) && ta2.productQuote>0) return ta2.productQuote
  if (!ta2 || !Number.isFinite(ta2.markupLimit) || ta2.markupLimit === 0) return 0
  const product = await corpRun(ns, 'getProduct', div, city, prod)
  if (!product || !Number.isFinite(product.productionCost)) return 0
  const price = (ta2.markupLimit + (5 * product.productionCost)) * 10
  return Number.isFinite(price) && price > 0 ? price : 0
}

function isFiniteNonnegative(price) {
  return Number.isFinite(price) && price >= 0
}

/** Price one stocked item. An unusable observation resets only that item's calibration. */
async function manualSalePrice(ns, div, city, name, item, isProduct, exported = 0) {
  const key = div + city + name
  const { stored, productionAmount, actualSellAmount } = item
  const marketPrice = isProduct ? 5 * item.productionCost : item.marketPrice
  const quantity = stored + exported * 10
  const useMarketPrice = () => { delete ta2DB[key]; return "MP" }
  const setTrialPrice = price => {
    if (!isFiniteNonnegative(price)) return useMarketPrice()
    ta2DB[key] = { sellingPrice: price, sellingQuantity: quantity, markupLimit: 0 }
    return String(price)
  }

  if (!(stored > 0) || !Number.isFinite(stored) || !isFiniteNonnegative(marketPrice) ||
      !isFiniteNonnegative(quantity) || !Number.isFinite(productionAmount) || !isFiniteNonnegative(actualSellAmount))
    return useMarketPrice()

  const entry = ta2DB[key]
  if (!entry) {
    if (!isProduct) return setTrialPrice(marketPrice)
    const multiplier = 2 ** (parseVersion(name) - 1)
    // The game validates MP expressions with test prices up to 1.2e123 before using the real price.
    if (!isFiniteNonnegative(item.rating) || !Number.isFinite(multiplier * 1.2e123) ||
        !Number.isFinite(multiplier * item.productionCost)) return useMarketPrice()
    setTrialPrice(item.rating)
    return `MP*${multiplier}`
  }
  if (!isFiniteNonnegative(entry.sellingPrice) || !isFiniteNonnegative(entry.sellingQuantity) ||
      !Number.isFinite(entry.markupLimit)) return useMarketPrice()

  if (entry.markupLimit === 0) {
    if (actualSellAmount >= entry.sellingQuantity / 10)
      return setTrialPrice(entry.sellingPrice * (isProduct ? 1000 : 1.2))
    if (actualSellAmount <= entry.sellingQuantity / 10 * (isProduct ? 0.15 : 0.1))
      return setTrialPrice(isProduct ? entry.sellingPrice / 3 : entry.sellingPrice * 0.9)
    const mult = await getMult(ns, div, city)
    const production = mult[isProduct ? 1 : 0]
    if (!Number.isFinite(production) || production <= 0) return useMarketPrice()
    const markup = (entry.sellingPrice - marketPrice) * Math.sqrt(actualSellAmount / production)
    if (!Number.isFinite(markup)) return useMarketPrice()
    entry.markupLimit = markup
  }

  const price = (entry.markupLimit + marketPrice) * 10 * Math.min(1, (productionAmount - exported) / stored)
  if (!Number.isFinite(price)) return useMarketPrice()
  if (price < 0) return setTrialPrice(entry.sellingPrice * (isProduct ? 10 : 2))
  return String(price)
}

/** @param {NS} ns */
async function sellCashOutput(ns) {
  const divisions = await corporationBatch(ns, 'getDivision', industries.filter(d => hasDivDB[d]).map(d => [d]))
  const liveDivisions = new Map(divisions.map(d=>[d.name,d]))
  const ta = await corporationBatch(ns, 'hasResearched', divisions.map(d => [d.name, 'Market-TA.II']))
  const manual = researchedDB["Market Research - Demand"] && researchedDB["Market Data - Competition"]
  const prod = [], mats = [], taProd = [], taMat = []
  for (const [i,d] of divisions.entries()) {
    const data = indDataDB[d.industry] ??= await corpRun(ns, 'getIndustryData', d.industry)
    for (const city of d.cities) {
      if (!hasWarehouseDB[d.name+city]) continue
      for (const name of d.products) prod.push({key:[d.name,city,name], ta:ta[i]})
      for (const name of data.producedMaterials ?? []) mats.push({key:[d.name,city,name], ta:ta[i]})
    }
  }
  for (const [isProduct, rows] of [[true,prod], [false,mats]]) {
    const stock = await corporationBatch(ns, isProduct ? 'getProduct' : 'getMaterial', rows.map(r => r.key))
    const sales = []
    for (const [i,{key,ta}] of rows.entries()) {
      const item = stock[i]
      if ((isProduct && item.developmentProgress !== 100) || !(item.stored > 0)) continue
      if (ta && isProduct && !taProd.some(([d,n]) => d === key[0] && n === key[2])) taProd.push([key[0],key[2],true])
      if (ta && !isProduct) taMat.push([...key,true])
      // Use the live inventory after EXPORT. MAX sells what's actually left in this city.
      let price
      if (ta) price='0'
      else if (!manual) price='MP'
      else if (!isProduct && investOffer?.round===2 && supplyPlan) {
        const [div,city,mat]=key, d=liveDivisions.get(div), spec=indDataDB[d.industry]
        const data=matDataDB[mat] ??= await corpRun(ns,'getMaterialData',mat)
        const cap=2*tobaccoDemand(d,spec,hasOfficeDB[div+city].employeeProductionByJob.Business,item,supplyPlan.salesBots)*(item.quality+.001)
        const premium=item.quality/data.baseMarkup*Math.sqrt(cap*corporationConstants.secondsPerMarketCycle/item.stored)
        price=Number.isFinite(premium) && premium>0 ? 'MP+'+premium : 'MP'
      }
      else {
        const d=liveDivisions.get(key[0]), office=hasOfficeDB[key[0]+key[1]], spec=d && indDataDB[d.industry]
        const terms=isProduct && cashPlan?.tobacco && d?.industry==='Tobacco' && spec && office?.employeeProductionByJob &&
          tobaccoSaleTerms(item,d,spec,office.employeeProductionByJob.Business)
        // This is the game's Market-TA.II price for MAX, before that research is
        // available. API productionCost is already the UI market price (5x inputs).
        const premium=terms && terms.limit*Math.sqrt(terms.capacity*cashPlan.tobacco.seconds/item.stored)
        const quote=terms && terms.mp+premium
        if (Number.isFinite(quote) && quote>0) {
          price='MP+'+premium
          ta2DB[key.join('')]={productQuote:quote,markupLimit:terms.limit}
        } else price=await manualSalePrice(ns,...key,item,isProduct)
      }
      sales.push([...key,'MAX',price])
    }
    await corporationBatch(ns, isProduct ? 'setProductMarketTA2' : 'setMaterialMarketTA2', isProduct ? taProd : taMat)
    await corporationBatch(ns, isProduct ? 'sellProduct' : 'sellMaterial', sales)
  }
}

async function sell(ns) {
  for (const div of industries) {
    if (!hasDivDB[div]) continue
    const hasMTAII = await corpRun(ns, 'hasResearched', div, "Market-TA.II")
    for (const city of cities) {
      if (!hasWarehouseDB[div + city]) continue
      if (researchedDB["Market Research - Demand"] && researchedDB["Market Data - Competition"]) {
        if (indDataDB[hasDivDB[div].industry] === undefined)
          indDataDB[hasDivDB[div].industry] = await corpRun(ns, 'getIndustryData', hasDivDB[div].industry)
        if (indDataDB[hasDivDB[div].industry].makesProducts) {
          const division = (await corpRun(ns, 'getDivision', div))
          for (const prod of division.products) {
            const product = await corpRun(ns, 'getProduct', div, city, prod)
            if (product.developmentProgress !== 100 || product.stored === 0) continue
            //Setting Market TA II if researchedDB
            if (hasMTAII) { //I don't research it, but it could be there from manual purchase
              await corpRun(ns, 'setProductMarketTA2', div, prod, true)
              await corpRun(ns, 'sellProduct', div, city, prod, "MAX", "0")
              continue
            }

            const price = await manualSalePrice(ns, div, city, prod, product, true)
            await corpRun(ns, 'sellProduct', div, city, prod, "MAX", price)
          } //Products
        } //Product check
        if (indDataDB[hasDivDB[div].industry].producedMaterials)
          for (const mat of indDataDB[hasDivDB[div].industry].producedMaterials) {
            const material = await corpRun(ns, 'getMaterial', div, city, mat)
            let exported = 0
            for (const xp of material.exports)
              exported += (await corpRun(ns, 'getMaterial', xp.division, xp.city, mat)).importAmount
            if (material.stored === 0) continue
            //Set TA2 if we have it
            if (hasMTAII) {
              await corpRun(ns, 'setMaterialMarketTA2', div, city, mat, true)
              await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", "0")
              continue
            }
            const price = await manualSalePrice(ns, div, city, mat, material, false, exported)
            await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", price)
          }
      } //TA2
      else { // No TA2
        if (!indDataDB[hasDivDB[div].industry])
          indDataDB[hasDivDB[div].industry] = await corpRun(ns, 'getIndustryData', hasDivDB[div].industry)
        if (indDataDB[hasDivDB[div].industry].producedMaterials) {
          for (const mat of indDataDB[hasDivDB[div].industry].producedMaterials) {
            const material = await corpRun(ns, 'getMaterial', div, city, mat)
            if (material.stored === 0) continue
            const marketPrice = material.marketPrice
            if (!matDataDB[mat])
              matDataDB[mat] = await corpRun(ns, 'getMaterialData', mat)
            let price = marketPrice + (material.quality / matDataDB[mat].baseMarkup)
            const maxProd = await maxProduction(ns, div, city)
            const priceMult = maxProd[0] / (material.stored)
            price *= priceMult >= 1 ? 1 : priceMult >= .6 ? priceMult : priceMult / 10
            await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", isFiniteNonnegative(price) ? price : "MP")
          }
        }
      }
    }
  }
}
/** @param {NS} ns */
async function getMult(ns, div, city) {
  if (!hasOfficeDB[div + city]) return [0, 0]
  const seed = bn3Reset && ((investOffer?.round === 1 && div === div1) || investOffer?.round === 2)
  const cash = usesCashPolicy(investOffer?.round)
  const office = (seed || cash) && hasOfficeDB[div + city]?.employeeProductionByJob
    ? hasOfficeDB[div + city] : await corpRun(ns, 'getOffice', div, city)
  const operationEmployeesProduction = office.employeeProductionByJob.Operations
  const engineerEmployeesProduction = office.employeeProductionByJob.Engineer
  const managementEmployeesProduction = office.employeeProductionByJob.Management
  const totalEmployeesProduction = operationEmployeesProduction + engineerEmployeesProduction + managementEmployeesProduction;
  if (totalEmployeesProduction <= 0) return [0, 0]
  const managementFactor = 1 + managementEmployeesProduction / (1.2 * totalEmployeesProduction)
  const employeesProductionMultiplier = (Math.pow(operationEmployeesProduction, 0.4) + Math.pow(engineerEmployeesProduction, 0.3)) * managementFactor;
  const balancingMultiplier = 0.05;
  const officeMultiplierProduct = 0.5 * balancingMultiplier * employeesProductionMultiplier;
  const officeMultiplierMaterial = balancingMultiplier * employeesProductionMultiplier;

  // Multiplier from Smart Factories
  const factory = cash && Number.isFinite(cashPlan?.factory) ? cashPlan.factory : await corpRun(ns, 'getUpgradeLevel', "Smart Factories")
  const upgradeMultiplier = 1 + factory * 0.03
  // Multiplier from researches
  let researchMultiplier = 1
  researchMultiplier *=
    (researchedDB[div + "Drones - Assembly"] ? 1.2 : 1)
    * (researchedDB[div + "Self-Correcting Assemblers"] ? 1.1 : 1);
  const productResearch = hasDivDB[div].makesProducts && researchedDB[div + "uPgrade: Fulcrum"] ? 1.05 : 1
  if (seed || cash) {
    // The game publishes the division's booster multiplier. Fulcrum only boosts products.
    const mult = hasDivDB[div].productionMult
    if (Number.isFinite(mult) && mult >= 1)
      return [officeMultiplierMaterial * mult * upgradeMultiplier * researchMultiplier,
        officeMultiplierProduct * mult * upgradeMultiplier * researchMultiplier * productResearch]
  }
  researchMultiplier *= productResearch
  let multSum = 0;
  if (!indDataDB[hasDivDB[div].industry])
    indDataDB[hasDivDB[div].industry] = await corpRun(ns, 'getIndustryData', hasDivDB[div].industry)
  for (const scity of cities) {
    if (!hasWarehouseDB[div + scity]) continue
    let realestate = Math.pow(0.002 * (await corpRun(ns, 'getMaterial', div, scity, "Real Estate")).stored + 1, indDataDB[hasDivDB[div].industry].realEstateFactor)
    let hardware = Math.pow(0.002 * (await corpRun(ns, 'getMaterial', div, scity, "Hardware")).stored + 1, indDataDB[hasDivDB[div].industry].hardwareFactor)
    let robots = Math.pow(0.002 * (await corpRun(ns, 'getMaterial', div, scity, "Robots")).stored + 1, indDataDB[hasDivDB[div].industry].robotFactor)
    let aicores = Math.pow(0.002 * (await corpRun(ns, 'getMaterial', div, scity, "AI Cores")).stored + 1, indDataDB[hasDivDB[div].industry].aiCoreFactor);
    if (isNaN(realestate)) realestate = 1
    if (isNaN(hardware)) hardware = 1
    if (isNaN(robots)) robots = 1
    if (isNaN(aicores)) aicores = 1
    const cityMult =
      realestate *
      hardware *
      robots *
      aicores
    multSum += Math.pow(cityMult, 0.73);
  }
  const productionMult = multSum < 1 ? 1 : multSum
  const multMaterial = officeMultiplierMaterial * productionMult * upgradeMultiplier * researchMultiplier
  const multProduct = officeMultiplierProduct * productionMult * upgradeMultiplier * researchMultiplier
  return [multMaterial, multProduct]
}
