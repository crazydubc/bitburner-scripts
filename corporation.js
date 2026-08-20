import { getReset, log, corpRun, getBNMults } from './utils.js'

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

const round1Money = 440e9 //440b
const round2Money = 8.8e12 //8.8t
const round3Money = 12e15 //12q
const round4Money = 500e18 //500Q
let tobaccoBooster = false
const ta2DB = Object.create(null) // TA2 cache keyed by division + city + item
const indDataDB = []
const matDataDB = []
let researchedDB = []
let hasDivDB = []
let hasOfficeDB = []
let hasWarehouseDB = []
let roundTrigger = false
let bnMults
let oldRound
let teaNeeded
let investOffer
let corporationConstants
let lastBootstrapWarning = 0

const REQUIRED_CORPORATION_APIS = ["Office API", "Warehouse API"]
const ROUND_ONE_OPERATING_RESERVE = 5e9

//I want to impliment helper functions for ram dodge across all corp functions.
async function getCorp(ns) {
  return (await corpRun(ns, 'getCorporation'));
}

/** Keep a corporation purchase from consuming working capital needed to reach the next market cycle. */
export function canAffordCorporationPurchase(funds, cost, reserve = 0) {
  return Number.isFinite(funds) && Number.isFinite(cost) && Number.isFinite(reserve)
    && funds >= cost + reserve
}

/** The home office must be producing before round-one expansion is allowed to consume the remaining cash. */
export function isRoundOneBootstrapReady(division, office) {
  return Number(division?.numAdVerts) >= 2
    && Number(office?.numEmployees) >= Number(office?.size)
    && Number(office?.employeeJobs?.Operations) > 0
    && Number(office?.employeeJobs?.Engineer) > 0
}

function logBootstrapWarning(ns, message) {
  if (Date.now() - lastBootstrapWarning < 30_000) return
  lastBootstrapWarning = Date.now()
  log(ns, message, true, 'warning')
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
      logBootstrapWarning(ns, `Unable to read the ${unlock} unlock cost; corporation bootstrap paused.`)
      return false
    }
    missing.push({ unlock, cost })
    totalCost += cost
  }

  if (missing.length === 0) return true

  const funds = await corpFunds(ns)
  if (!canAffordCorporationPurchase(funds, totalCost)) {
    logBootstrapWarning(ns, `Corporation bootstrap needs ${ns.format.number(totalCost, 3)} for ` +
      `${missing.map(item => item.unlock).join(' + ')}, but only ${ns.format.number(funds, 3)} is available.`)
    return false
  }

  for (const { unlock } of missing) {
    await corpRun(ns, 'purchaseUnlock', unlock)
    if (await corpRun(ns, 'hasUnlock', unlock) !== true) {
      logBootstrapWarning(ns, `Failed to purchase ${unlock}; corporation bootstrap will retry.`)
      return false
    }
    researchedDB[unlock] = true
  }

  log(ns, `Purchased required corporation APIs: ${missing.map(item => item.unlock).join(', ')}.`,
    true, 'success')
  return true
}

async function hireAdVertsUpTo(ns, divisionName, target) {
  let division = await corpRun(ns, 'getDivision', divisionName)
  if (!division) return false

  while (division.numAdVerts < target) {
    const cost = Number(await corpRun(ns, 'getHireAdVertCost', divisionName))
    const funds = await corpFunds(ns)
    if (!canAffordCorporationPurchase(funds, cost, ROUND_ONE_OPERATING_RESERVE)) return false

    const previousCount = division.numAdVerts
    await corpRun(ns, 'hireAdVert', divisionName)
    division = await corpRun(ns, 'getDivision', divisionName)
    if (!division || division.numAdVerts <= previousCount) {
      logBootstrapWarning(ns, `Unable to buy AdVert ${previousCount + 1} for ${divisionName}; retrying later.`)
      return false
    }
  }
  return true
}

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(5)
  ns.disableLog("ALL")
  //ns.ui.openTail();
  ns.clearLog()
  hasDivDB = []
  researchedDB = []
  hasOfficeDB = []
  hasWarehouseDB = []
  const myBN = (await getReset(ns)).currentNode;
  bnMults = await getBNMults(ns)
  const selfFund = myBN === 3 ? false : true;
  while (!ns.corporation.hasCorporation() && ns.corporation.canCreateCorporation(selfFund)
    && !(await corpRun(ns, 'createCorporation', corpName, selfFund))) await ns.sleep(1000)
  log(ns, `Corporation is up, detecting investment round`, true)
  let round = (await corpRun(ns, 'getInvestmentOffer')).round;
  log(ns, `Round ${round}!`, true)
  teaNeeded = true
  oldRound = 0
  tobaccoBooster = false
  while (true) {
    while (round === 1) {
      if (!(await prep(ns))) {
        await ns.corporation.nextUpdate()
        continue
      }
      await updateHud(ns)
      await hireAdVertsUpTo(ns, div1, 2)
      const nState = (await getCorp(ns)).nextState
      if (nState === "SALE")
        await sell(ns)
      if (nState === "PURCHASE") {

        if (!teaNeeded && (await corpRun(ns, 'getOffice', div1, "Sector-12")).employeeJobs.Business > 0) {
          await optimizeMats(ns)
        }
        await purchase(ns)
      }
      if (nState === "START") {
        teaNeeded = await teaParty(ns)
        round = await checkInvest(ns)
      }
      if (nState === "EXPORT") {
        await manageOffice(ns)
        if (hasCompleteDivisionInfrastructure(div1))
          await warehouseUpgrade(ns)
      }
      if (hasCompleteDivisionInfrastructure(div1)) {
        const upgradeCost = Number(await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots"))
        if (canAffordCorporationPurchase(await corpFunds(ns), upgradeCost, ROUND_ONE_OPERATING_RESERVE))
          await corpRun(ns, 'levelUpgrade', "ABC SalesBots")
      }
      await ns.corporation.nextUpdate();
    }
    while (round === 2) {
      if (!(await prep(ns))) {
        await ns.corporation.nextUpdate()
        continue
      }
      await updateHud(ns)
      let hasDiv2 = false
      //Set up Tobacco    
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
        await basicExporImport(ns)
        await purchase(ns)
        while (await corpFunds(ns) > (await corpRun(ns, 'getHireAdVertCost', div1)) && (await corpRun(ns, 'getHireAdVertCount', div1)) < 12 && hasDiv2)
          await corpRun(ns, 'hireAdVert', div1)
        if ((await corpRun(ns, 'getHireAdVertCount', div1)) < 11 && (await corpRun(ns, 'getMaterial', div1, "Sector-12", "Plants")).stored > 200)
          await corpRun(ns, 'hireAdVert', div1)
        else if (hasDiv2 && (await corpRun(ns, 'getMaterial', div1, "Sector-12", "Plants")).stored > 200)
          await corpRun(ns, 'hireAdVert', div1)
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
          await optimizeMats(ns)
        }
        while (await corpFunds(ns) >= (await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots")) && (await corpRun(ns, 'getUpgradeLevel', "ABC SalesBots")) < 10)
          await corpRun(ns, 'levelUpgrade', "ABC SalesBots")
      }
      await ns.corporation.nextUpdate();
    }
    while (round === 3 || round === 4) {
      if (!(await prep(ns))) {
        await ns.corporation.nextUpdate()
        continue
      }
      await updateHud(ns)
      while ((await corpRun(ns, 'getUpgradeLevel', "Smart Factories")) < 20 && (await corpRun(ns, 'getUpgradeLevelCost', "Smart Factories")) <= await corpFunds(ns))
        (await corpRun(ns, 'levelUpgrade', "Smart Factories"))
      await manageProducts(ns)
      await spendRP(ns)
      const nState = (await getCorp(ns)).nextState
      if (nState === "SALE")
        await sell(ns)
      if (nState === "PURCHASE") {
        await basicExporImport(ns)
        await purchase(ns)
        if ((await corpRun(ns, 'getMaterial', div1, "Sector-12", "Plants")).stored > 200)
          await corpRun(ns, 'hireAdVert', div1)
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
      if (!(await prep(ns))) {
        await ns.corporation.nextUpdate()
        continue
      }
      await updateHud(ns)
      await manageProducts(ns)
      await spendRP(ns)
      const nState = (await getCorp(ns)).nextState
      if (nState === "SALE")
        await sell(ns)
      if (nState === "PURCHASE") {
        await updateMisc(ns)
        await basicExporImport(ns)
        await purchase(ns)
      }
      if (nState === "START") {
        await manageOffice(ns)
        teaNeeded = await teaParty(ns)
      }
      if (nState === "EXPORT") {
        await warehouseUpgrade(ns)
        await optimizeMats(ns)
      }
      await ns.corporation.nextUpdate();
    }
    log(ns, `Unexpected corporation investment round ${String(round)}; refreshing state.`, true, 'warning')
    await ns.sleep(1000)
    round = (await corpRun(ns, 'getInvestmentOffer'))?.round
  }
}

async function getUpgradeLevel(ns, type) {
  return await corpRun(ns, 'getUpgradeLevel', type)
}

/** @param {NS} ns */
async function updateHud(ns) {
  ns.clearLog()
  const cObj = await getCorp(ns)
  const bnMults = await getBNMults(ns)
  ns.printf("%s", cObj.name)
  ns.printf("Funds : $%s  Profit: $%s/s", ns.format.number(cObj.funds, 3), ns.format.number(cObj.revenue - cObj.expenses, 3))
  const invest = investOffer
  const upgrades = await getUpgradeLevel(ns, "Neural Accelerators")
    + await getUpgradeLevel(ns, "Project Insight")
    + await getUpgradeLevel(ns, "Nuoptimal Nootropic Injector Implants")
    + await getUpgradeLevel(ns, "FocusWires")
    + await getUpgradeLevel(ns, "Speech Processor Implants")
    + await getUpgradeLevel(ns, "FocusWires")
  const offer = invest.round === 1 ? (round1Money * bnMults.CorporationValuation)
    : invest.round === 2 ? (round2Money * bnMults.CorporationValuation)
      : invest.round === 3 ? (round3Money * bnMults.CorporationValuation)
        : invest.round === 4 ? (round4Money * bnMults.CorporationValuation)
          : 0
  const minRound = invest.round === 2 ? "-BareMin 30b" : ""
  const produpgrades = await getUpgradeLevel(ns, "Smart Factories") + await getUpgradeLevel(ns, "Smart Storage")
  //ns.printf(`${invest.round} ${invest.funds} ${offer} ${minRound}`)
  ns.printf("Round: %s Offer: %s FundsReq: %s %s", invest.round, ns.format.number(invest.funds, 3), ns.format.number(offer, 3), minRound)

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

/** @param {NS} ns */
async function checkInvest(ns) {
  const round = investOffer.round
  const corp = await getCorp(ns);

  if (round === 1) {
    const totalValuation = investOffer.funds + (corp.funds * bnMults.CorporationValuation);
    if (round1Money * bnMults.CorporationValuation < totalValuation || roundTrigger) {
      roundTrigger = true
      if (oldRound <= totalValuation) {
        oldRound = totalValuation;
      }
      else {
        (await corpRun(ns, 'acceptInvestmentOffer'))
        teaNeeded = true
        roundTrigger = false
        log(ns, "Off to round 2!", true, 'info', 20);
        return 2
      }
    }
    return 1
  }
  if (round === 2) {
    let hasDiv2 = false
    //Set up Tobacco    
    let count = 0
    if (researchedDB["Export"])
      for (const city of cities)
        if (hasWarehouseDB[div2 + city]) count++
    if (count === 6)
      hasDiv2 = true
    if ((hasDiv2 && investOffer.funds + corp.funds > 30e9 && round2Money * bnMults.CorporationValuation < investOffer.funds + corp.funds) || roundTrigger) {
      roundTrigger = true
      if (oldRound <= investOffer.funds + (Math.min(30e9, corp.funds))) {
        oldRound = investOffer.funds + (Math.min(30e9, corp.funds))
      }
      else {
        (await corpRun(ns, 'acceptInvestmentOffer'))
        teaNeeded = true
        roundTrigger = false
        log(ns, "Off to round 3!", true, 'info', 20);
        return 3
      }
    }
    return 2
  }
  if (round === 3) {
    if (round3Money * bnMults.CorporationValuation < (investOffer.funds * 4) + (corp.funds * bnMults.CorporationValuation)) {
      tobaccoBooster = true
    }
    if ((round3Money * bnMults.CorporationValuation < investOffer.funds + (corp.funds * bnMults.CorporationValuation)) || roundTrigger) {
      roundTrigger = true
      if (oldRound <= investOffer.funds + (corp.funds * bnMults.CorporationValuation)) {
        oldRound = investOffer.funds + (corp.funds * bnMults.CorporationValuation)
      }
      else {
        (await corpRun(ns, 'acceptInvestmentOffer'))
        teaNeeded = true
        roundTrigger = false
        tobaccoBooster = false
        log(ns, "Off to round 4!", true, 'info', 20);
        return 4
      }
    }
    return 3
  }
  if (round === 4) {
    if (round4Money * bnMults.CorporationValuation < (investOffer.funds * 4) + (corp.funds * bnMults.CorporationValuation)) {
      tobaccoBooster = true
    }
    if ((round4Money * bnMults.CorporationValuation < investOffer.funds + (corp.funds * bnMults.CorporationValuation)) || roundTrigger) {
      roundTrigger = true
      if (oldRound <= investOffer.funds + (corp.funds * bnMults.CorporationValuation)) {
        oldRound = investOffer.funds + (corp.funds * bnMults.CorporationValuation)
      }
      else {
        (await corpRun(ns, 'acceptInvestmentOffer'))
        teaNeeded = true
        roundTrigger = false
        log(ns, "Off to round 5!", true, 'info', 20);
        return 5
      }
    }
    return 4
  }
}
/** @param {NS} ns */
async function corpFunds(ns) {
  return (await getCorp(ns)).funds
}

async function expandCities(ns, division, options = {}) {
  const allowExpansion = options.allowExpansion !== false
  const reserve = Number(options.reserve) || 0
  let divisionInfo = await corpRun(ns, 'getDivision', division)

  if (!divisionInfo) {
    const industryData = await corpRun(ns, 'getIndustryData', division)
    const startingCost = Number(industryData?.startingCost)
    const funds = await corpFunds(ns)
    if (!canAffordCorporationPurchase(funds, startingCost, reserve)) {
      logBootstrapWarning(ns, `Waiting to create ${division}: ${ns.format.number(startingCost, 3)} required, ` +
        `${ns.format.number(funds, 3)} available.`)
      return false
    }

    await corpRun(ns, 'expandIndustry', division, division)
    divisionInfo = await corpRun(ns, 'getDivision', division)
    if (!divisionInfo) {
      logBootstrapWarning(ns, `Failed to create ${division}; corporation bootstrap will retry.`)
      return false
    }
  }

  hasDivDB[division] = divisionInfo
  const constants = await getCorporationConstants(ns)
  if (!constants) {
    logBootstrapWarning(ns, 'Unable to read corporation infrastructure costs; expansion paused.')
    return true
  }

  for (const city of cities) {
    const key = division + city
    const cityExists = Array.isArray(divisionInfo.cities) && divisionInfo.cities.includes(city)

    if (!cityExists) {
      delete hasOfficeDB[key]
      delete hasWarehouseDB[key]
      if (!allowExpansion) continue

      const combinedCost = Number(constants.officeInitialCost) + Number(constants.warehouseInitialCost)
      const funds = await corpFunds(ns)
      if (!canAffordCorporationPurchase(funds, combinedCost, reserve)) return true

      await corpRun(ns, 'expandCity', division, city)
      const office = await corpRun(ns, 'getOffice', division, city)
      if (!office) {
        logBootstrapWarning(ns, `Failed to open the ${division} office in ${city}; retrying later.`)
        return true
      }
      hasOfficeDB[key] = office

      await corpRun(ns, 'purchaseWarehouse', division, city)
      if (await corpRun(ns, 'hasWarehouse', division, city) !== true) {
        logBootstrapWarning(ns, `Failed to purchase the ${division} warehouse in ${city}; retrying later.`)
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
      logBootstrapWarning(ns, `The ${division} office in ${city} could not be read; expansion paused.`)
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
    if (!canAffordCorporationPurchase(funds, warehouseCost, reserve)) return true

    await corpRun(ns, 'purchaseWarehouse', division, city)
    if (await corpRun(ns, 'hasWarehouse', division, city) !== true) {
      logBootstrapWarning(ns, `Failed to purchase the ${division} warehouse in ${city}; retrying later.`)
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
  if (!canAffordCorporationPurchase(await corpFunds(ns), cost)) return false

  await corpRun(ns, 'purchaseUnlock', purchase)
  const unlocked = await corpRun(ns, 'hasUnlock', purchase) === true
  if (unlocked) researchedDB[purchase] = true
  return unlocked
}
/** @param {NS} ns */
async function prep(ns) {
  investOffer = await corpRun(ns, 'getInvestmentOffer')
  const round = Number(investOffer?.round)
  if (!Number.isFinite(round)) {
    logBootstrapWarning(ns, 'Unable to read the corporation investment round; bootstrap paused.')
    return false
  }

  if (!(await ensureCorporationApis(ns))) return false

  if (round >= 1) {
    const agriculture = await corpRun(ns, 'getDivision', div1)
    const homeOffice = agriculture ? await corpRun(ns, 'getOffice', div1, "Sector-12") : undefined
    const allowExpansion = round > 1 || isRoundOneBootstrapReady(agriculture, homeOffice)
    const reserve = round === 1 ? ROUND_ONE_OPERATING_RESERVE : 0
    if (!(await expandCities(ns, div1, { allowExpansion, reserve }))) return false
  }
  if (round >= 2) {
    if (await tryPurchaseUnlock(ns, "Export"))
      await expandCities(ns, div2);
  }
  if (round >= 3) {
    const hasResearched = await tryPurchaseUnlock(ns, "Market Research - Demand") &&
      await tryPurchaseUnlock(ns, "Market Data - Competition");
    if (!hasDivDB[div3] && hasResearched) {
      await expandCities(ns, div3);
    }
  }
  if (round >= 5) {
    await expandCities(ns, div4);
    if ((await getCorp(ns)).revenue >= 1e70) {
      await tryPurchaseUnlock(ns, "Government Partnership")
      await tryPurchaseUnlock(ns, "Shady Accounting")
      if (!(await getCorp(ns)).public) {
        await corpRun(ns, 'goPublic', 0)
      }
      if ((await getCorp(ns)).public) {
        await corpRun(ns, 'issueDividends', 0.01)
      }
      try {
        const div = (await corpRun(ns, 'getDivision', div5))
        hasDivDB[div5] = div
      }
      catch {
        try { (await corpRun(ns, 'expandIndustry', div5, div5)) } catch { }
        try {
          const div = (await corpRun(ns, 'getDivision', div5))
          hasDivDB[div5] = div
        }
        catch { }
      }
      try {
        const div = (await corpRun(ns, 'getDivision', div6))
        hasDivDB[div6] = div
      }
      catch {
        try { (await corpRun(ns, 'expandIndustry', div6, div6)) } catch { }
        try {
          const div = (await corpRun(ns, 'getDivision', div6))
          hasDivDB[div6] = div
        }
        catch { }
      }
      try {
        const div = (await corpRun(ns, 'getDivision', div7))
        hasDivDB[div7] = div
      }
      catch {
        try { (await corpRun(ns, 'expandIndustry', div7, div7)) } catch { }
        try {
          const div = (await corpRun(ns, 'getDivision', div7))
          hasDivDB[div7] = div
        }
        catch { }
      }
      try {
        const div = (await corpRun(ns, 'getDivision', div8))
        hasDivDB[div8] = div
      }
      catch {
        try { (await corpRun(ns, 'expandIndustry', div8, div8)) } catch { }
        try {
          const div = (await corpRun(ns, 'getDivision', div8))
          hasDivDB[div8] = div
        }
        catch { }
      }
      for (const city of cities) {
        //Set up divs
        const divs = [div5, div6, div7, div8]
        for (const div of divs) {
          if (!hasOfficeDB[div + city]) {
            try { (await corpRun(ns, 'expandCity', div, city)) } catch { }
            try {
              (await corpRun(ns, 'getOffice', div, city))
              hasOfficeDB[div + city] = true
            }
            catch { }
          }
          if (!hasWarehouseDB[div + city]) {
            try { (await corpRun(ns, 'purchaseWarehouse', div, city)) } catch { }
            if ((await corpRun(ns, 'hasWarehouse', div, city)))
              hasWarehouseDB[div + city] = true
          }
        }
      }
    }
  }
  return true
}
/** @param {NS} ns */
async function updateMisc(ns) {
  const round = investOffer.round
  let corp = (await getCorp(ns))
  const mult = round === 3 ? 3 : 2.5
  let hasDiv4 = false
  let hasDiv3 = false
  let div3Count = 0
  for (const city of cities)
    if (hasWarehouseDB[div3 + city])
      div3Count++
  if (div3Count === 6) hasDiv3 = true


  let div4Count = 0
  for (const city of cities)
    if (hasWarehouseDB[div4 + city])
      div4Count++
  if (div4Count === 6) hasDiv4 = true

  if (round === 3 && !hasDiv3) return
  if (round >= 3
    && (await corpRun(ns, 'getUpgradeLevelCost', "Wilson Analytics")) < corp.funds
    && (((round >= 5)
      && (hasDiv4
        && ((await corpRun(ns, 'getDivision', div4)).awareness < Number.MAX_VALUE
          || (await corpRun(ns, 'getDivision', div4)).popularity < Number.MAX_VALUE)))
      || (hasDiv3
        && (await corpRun(ns, 'getDivision', div3)).awareness < Number.MAX_VALUE
        || (await corpRun(ns, 'getDivision', div3)).popularity < Number.MAX_VALUE))) {
    (await corpRun(ns, 'levelUpgrade', "Wilson Analytics"))
    corp = (await getCorp(ns))
  }
  while ((round === 3)
    && (await corpRun(ns, 'getUpgradeLevelCost', "Wilson Analytics")) < await corpFunds(ns)
    && (await corpRun(ns, 'getUpgradeLevel', "Wilson Analytics")) < 2) {
    (await corpRun(ns, 'levelUpgrade', "Wilson Analytics"))
    corp = (await getCorp(ns))
  }
  if (round < 5 && (await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots")) * mult / 2 < await corpFunds(ns)) {
    (await corpRun(ns, 'levelUpgrade', "ABC SalesBots"))
    corp = (await getCorp(ns))
  }
  while (round >= 5 && await corpRun(ns, 'getUpgradeLevelCost', "ABC SalesBots") * mult / 2 < await corpFunds(ns)) (await corpRun(ns, 'levelUpgrade', "ABC SalesBots"))
  corp = (await getCorp(ns))
  if ((round === 3 && (await getCorp(ns)).revenue >= 8e7) || round >= 4) {
    if (await corpRun(ns, 'getUpgradeLevel', "Neural Accelerators") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Neural Accelerators") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "Neural Accelerators"))
      corp = (await getCorp(ns))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "Project Insight") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Project Insight") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "Project Insight"))
      corp = (await getCorp(ns))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "Nuoptimal Nootropic Injector Implants") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Nuoptimal Nootropic Injector Implants") * mult < corp.funds) {
      (await corpRun(ns, 'levelUpgrade', "Nuoptimal Nootropic Injector Implants"))
      corp = (await getCorp(ns))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "FocusWires") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "FocusWires") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "FocusWires"))
      corp = (await getCorp(ns))
    }
    if (await corpRun(ns, 'getUpgradeLevel', "Speech Processor Implants") < 500 && await corpRun(ns, 'getUpgradeLevelCost', "Speech Processor Implants") * mult < await corpFunds(ns)) {
      (await corpRun(ns, 'levelUpgrade', "Speech Processor Implants"))
      corp = (await getCorp(ns))
    }
  }

  if (round >= 3 && round <= 4) {
    for (const div of industries) {
      if (!hasDivDB[div]) continue
      if (["Tobacco", "Restaurant"].includes(hasDivDB[div].industry)
        && corp.funds >= await corpRun(ns, 'getHireAdVertCost', div) * mult / 2
        && ((await corpRun(ns, 'getDivision', div)).awareness < Number.MAX_VALUE || (await corpRun(ns, 'getDivision', div)).popularity < Number.MAX_VALUE)) {
        (await corpRun(ns, 'hireAdVert', div))
        corp = (await getCorp(ns))
      }
    }
  }
  if (round === 5) {
    for (const div of industries) {
      if (!hasDivDB[div]) continue
      while (["Tobacco", "Restaurant", "Computer Hardware"].includes(hasDivDB[div].industry)
        && await corpFunds(ns) >= await corpRun(ns, 'getHireAdVertCost', div) * mult / 2
        && ((await corpRun(ns, 'getDivision', div)).awareness < Number.MAX_VALUE || (await corpRun(ns, 'getDivision', div)).popularity < Number.MAX_VALUE))
        (await corpRun(ns, 'hireAdVert', div))
    }
  }
}

async function doResearch(ns, rp, div, research, ratio) {
  if (!researchedDB[div + research]) {
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
  const rp = (await corpRun(ns, 'getDivision', div)).researchPoints
  for (const item of list) {
    if (await doResearch(ns, rp, div, item, ratio)) return true;
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

/** @param {NS} ns */
async function manageProducts(ns) {
  for (const div of industries) {
    if (!hasDivDB[div] || !hasDivDB[div].makesProducts) continue

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

    if (active + calculating === division.maxProducts) {
      let worstProduct = null

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
      if (await discontinueManagedProduct(ns, div, worstProduct))
        division = await corpRun(ns, 'getDivision', div)
    }

    let researching = false
    for (const productName of division.products) {
      const product = await corpRun(ns, 'getProduct', div, "Sector-12", productName)
      if (product?.developmentProgress < 100) {
        researching = true
        break
      }
    }

    if (researching || division.products.length >= division.maxProducts) continue

    const version = await getLatestProductVersion(ns, div)
    const investment = 1e9 * 2 ** version
    const corp = await getCorp(ns)
    if (Number.isFinite(investment) && corp.funds >= investment * 2) {
      await corpRun(ns, 'makeProduct', div, "Sector-12", 'Prod v' + (version + 1), investment, investment)
    }
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
 * Function to get earliest product version
 *
 * @param {NS} ns
 * @param {string} division
 * @returns {number}
 */
async function getEarliestVersion(ns, division) {
  const products = (await corpRun(ns, 'getDivision', division)).products
  let earliestVersion = Number.MAX_SAFE_INTEGER;
  for (let product of products) {
    let version = parseVersion(product);
    if (version < earliestVersion) earliestVersion = version;
  }
  return earliestVersion;
}

/**
 * Function to parse product version from name
 *
 * @param {string} name
 * @returns {number}
 */
function parseVersion(name) {
  let version = '';
  for (let i = 1; i <= name.length; i++) {
    let slice = name.slice(-i);
    if (!isNaN(slice)) version = slice;
    else if (version === '') throw new Error(`Product name must end with version number`);
    else return parseInt(version);
  }
}

//setJob is used due to migrating to 3.0.0 breakages
/** @param {NS} ns */
async function setJob(ns, div, city, job, total) {
  (await corpRun(ns, 'setJobAssignment', div, city, job, total));
}
async function manageOffice(ns) {
  const round = investOffer.round
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
            case 1:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 4 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              if ((await corpRun(ns, 'getDivision', div)).researchPoints < 60)
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", 1)
                await setJob(ns, div, city, "Engineer", 1)
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Management", 1)
              }
              break
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
              if ((await corpRun(ns, 'getOffice', div, city)).size < 60) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
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
            case 5:
              if ((await corpRun(ns, 'getOffice', div, city)).size < 300) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size) (await corpRun(ns, 'hireEmployee', div, city))
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", 1)
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2.5))
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2.5))
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - 1 - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2.5) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 2.5) - 1
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
              if ((await corpRun(ns, 'getOffice', div, city)).size < 60) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
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
            case 5:
              if ((await corpRun(ns, 'getOffice', div, city)).size < 300) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              if ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size) (await corpRun(ns, 'hireEmployee', div, city))
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                const office = (await corpRun(ns, 'getOffice', div, city))
                const left = office.numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
          }
          break
        case "Tobacco":
          switch (round) {
            case 3: {
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
              while ((await corpRun(ns, 'getOffice', div, city)).size < 106 && (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1)) * 1.5 <= await corpFunds(ns)) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
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
              if ((await corpRun(ns, 'getOffice', div, city)).size < 250) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
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
            case 5:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 1500 && await corpFunds(ns) >= (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              if (city !== "Sector-12")
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Management", left)
              }
              break
          }
          break
        case "Restaurant":
          switch (round) {
            case 5:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 1500 && await corpFunds(ns) >= (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              if (city !== "Sector-12")
                await setJob(ns, div, city, "Research & Development", (await corpRun(ns, 'getOffice', div, city)).numEmployees)
              else {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                const left = (await corpRun(ns, 'getOffice', div, city)).numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Management", left)
              }
              break
          }
          break
        case "Water Utilities":
          switch (round) {
            case 5:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 6500 && await corpFunds(ns) >= (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                const office = (await corpRun(ns, 'getOffice', div, city))
                const left = office.numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
          }
          break
        case "Computer Hardware":
          switch (round) {
            case 5:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 4500 && await corpFunds(ns) >= (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                const office = (await corpRun(ns, 'getOffice', div, city))
                const left = office.numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
          }
          break
        case "Refinery":
          switch (round) {
            case 5:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 6500 && await corpFunds(ns) >= (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                const office = (await corpRun(ns, 'getOffice', div, city))
                const left = office.numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Research & Development", left)
              }
              break
          }
          break
        case "Mining":
          switch (round) {
            case 5:
              while ((await corpRun(ns, 'getOffice', div, city)).size < 1500 && await corpFunds(ns) >= (await corpRun(ns, 'getOfficeSizeUpgradeCost', div, city, 1))) (await corpRun(ns, 'upgradeOfficeSize', div, city, 1))
              while ((await corpRun(ns, 'getOffice', div, city)).numEmployees < (await corpRun(ns, 'getOffice', div, city)).size && (await corpRun(ns, 'hireEmployee', div, city))) { }
              await resetOffice(ns, div, city)
              {
                await setJob(ns, div, city, "Operations", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4))
                await setJob(ns, div, city, "Business", 1)
                await setJob(ns, div, city, "Engineer", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                await setJob(ns, div, city, "Management", Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3))
                const office = (await corpRun(ns, 'getOffice', div, city))
                const left = office.numEmployees - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 3) - Math.floor((await corpRun(ns, 'getOffice', div, city)).numEmployees / 4) - 1
                await setJob(ns, div, city, "Research & Development", left)
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
        await corpRun(ns, 'buyTea', div, city)
        needed = true
      }
      if (office.avgMorale < office.maxMorale - 10) {
        await corpRun(ns, 'throwParty', div, city, 500000)
        needed = true
      }
      else if (office.avgMorale < office.maxMorale - 5) {
        await corpRun(ns, 'throwParty', div, city, 200000)
        needed = true
      }
      else if (office.avgMorale < office.maxMorale - .5) {
        await corpRun(ns, 'throwParty', div, city, 100000)
        needed = true
      }
      else if (office.avgMorale < office.maxMorale) {
        await corpRun(ns, 'throwParty', div, city, 50000)
        needed = false
      }
    }
  }
  return needed
}
/** @param {NS} ns */
async function purchase(ns) {
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

        buyAmt -= (await corpRun(ns, 'getMaterial', div, city, matName)).stored
        if (!matDataDB[matName])
          matDataDB[matName] = (await corpRun(ns, 'getMaterialData', matName))
        const maxAmt = Math.floor((warehouse.size - warehouse.sizeUsed) / matDataDB[matName].size);
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
async function optimizeMats(ns) {
  const round = investOffer.round;

  // Buying/selling rates are "per second". Corp cycles are ~10s.
  // Using /10 (one cycle) or /100 (10 cycles) in later rounds.
  const rateDivisor = round >= 4 ? 100 : 10;

  const materials = [
    ["Hardware", 0],
    ["Robots", 0],
    ["AI Cores", 0],
    ["Real Estate", 0],
  ];

  for (const div of industries) {
    if (!hasDivDB[div]) continue;

    for (const city of cities) {
      if (!hasWarehouseDB[div + city]) continue;

      let maxProd = await maxProduced(ns, div, city);
      maxProd *= (round < 3) ? 1.01 : 1.1;

      const warehouse = await corpRun(ns, "getWarehouse", div, city);

      // free space for materials
      const freeSpace = warehouse.size - maxProd;

      // returns TARGET amounts: [Hardware, Robots, AI Cores, Real Estate]
      const [tHardware, tRobots, tAICores, tRealEstate] =
        await optimizeCorpoMaterials(ns, div, freeSpace);

      const targets = {
        "Hardware": tHardware,
        "Robots": tRobots,
        "AI Cores": tAICores,
        "Real Estate": tRealEstate,
      };

      for (const [mat] of materials) {
        await adjustMaterialToTarget(ns, div, city, mat, targets[mat], rateDivisor);
      }
    }
  }
}

/**
 * Adjusts a material toward a target by setting buy OR sell rates.
 * @param {NS} ns
 */
async function adjustMaterialToTarget(ns, div, city, mat, target, rateDivisor) {
  const EPS = 1e-6;

  const stored = (await corpRun(ns, "getMaterial", div, city, mat)).stored;
  const delta = target - stored;

  // Always clear the opposite action so you don't fight yourself
  if (Math.abs(delta) <= EPS) {
    await corpRun(ns, "buyMaterial", div, city, mat, 0);
    await corpRun(ns, "sellMaterial", div, city, mat, 0, "MP");
    return;
  }

  if (delta > 0) {
    const buyRate = delta / rateDivisor;
    await corpRun(ns, "sellMaterial", div, city, mat, 0, "MP");
    await corpRun(ns, "buyMaterial", div, city, mat, buyRate);
  } else {
    const sellRate = (-delta) / rateDivisor;

    await corpRun(ns, "buyMaterial", div, city, mat, 0);

    // If you truly want to "dump" (not sell for money), use price "0".
    // If you want normal selling, use "MP".
    const price = "MP";
    await corpRun(ns, "sellMaterial", div, city, mat, sellRate, price);
  }
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
  if (!ta2 || !Number.isFinite(ta2.markupLimit) || ta2.markupLimit === 0) return 0
  const product = await corpRun(ns, 'getProduct', div, city, prod)
  if (!product || !Number.isFinite(product.productionCost)) return 0
  const price = (ta2.markupLimit + (5 * product.productionCost)) * 10
  return Number.isFinite(price) && price > 0 ? price : 0
}
/** @param {NS} ns */
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
            if ((await corpRun(ns, 'getProduct', div, city, prod)).developmentProgress !== 100) continue
            if ((await corpRun(ns, 'getProduct', div, city, prod)).stored === 0) continue
            //Setting Market TA II if researchedDB
            if (hasMTAII) { //I don't research it, but it could be there from manual purchase
              await corpRun(ns, 'setProductMarketTA2', div, prod, true)
              await corpRun(ns, 'sellProduct', div, city, prod, "MAX", "0")
              continue
            }

            let ta2 = ta2DB[div + city + prod]
            const product = await corpRun(ns, 'getProduct', div, city, prod)
            if (ta2 === undefined) { //No TA2 data
              ta2DB[div + city + prod] = {
                "sellingPrice": product.rating,
                "sellingQuantity": product.stored,
                "markupLimit": 0
              }
              const version = parseVersion(prod);
              await corpRun(ns, 'sellProduct', div, city, prod, "MAX", 'MP*' + (2 ** (version - 1)))
              continue
            }
            const prodMarketPrice = 5 * product.productionCost
            if (ta2.markupLimit === 0) { //Not calculated yet
              const actualSellAmount = product.actualSellAmount
              if (actualSellAmount >= ta2.sellingQuantity / 10) { // We failed to set it high enough.  Set it higher and try again
                const oldSalePrice = ta2DB[div + city + prod].sellingPrice
                ta2DB[div + city + prod].sellingPrice = oldSalePrice * 1000
                ta2DB[div + city + prod].sellingQuantity = product.stored
                await corpRun(ns, 'sellProduct', div, city, prod, "MAX", (oldSalePrice * 1000).toString())
                continue
              }
              else if (actualSellAmount <= ta2.sellingQuantity / 10 * .15) { //Not enough sold, lower the price!
                const oldSalePrice = ta2DB[div + city + prod].sellingPrice
                ta2DB[div + city + prod].sellingPrice = oldSalePrice / 3
                ta2DB[div + city + prod].sellingQuantity = product.stored
                await corpRun(ns, 'sellProduct', div, city, prod, "MAX", (oldSalePrice / 3).toString())
                continue
              }
              const mult = await getMult(ns, div, city)
              const m = mult[1]
              const markupLimit = (ta2.sellingPrice - prodMarketPrice) * Math.sqrt(actualSellAmount / m)
              ta2DB[div + city + prod].markupLimit = markupLimit
              ta2 = ta2DB[div + city + prod]
            }
            const prodStored = product.stored
            let sellingPrice = (((ta2.markupLimit * Math.sqrt(prodStored)) / Math.sqrt(prodStored)) + prodMarketPrice) * 10
            const priceMult = product.productionAmount / prodStored
            if (priceMult !== Infinity) sellingPrice *= priceMult >= 1 ? 1 : priceMult
            if (sellingPrice < 0 || isNaN(sellingPrice)) {
              const oldSalePrice = ta2DB[div + city + prod].sellingPrice
              ta2DB[div + city + prod].sellingPrice = oldSalePrice * 10
              ta2DB[div + city + prod].sellingQuantity = prodStored
              ta2DB[div + city + prod].markupLimit = 0
              await corpRun(ns, 'sellProduct', div, city, prod, "MAX", (oldSalePrice * 10).toString())
              continue
            }
            await corpRun(ns, 'sellProduct', div, city, prod, "MAX", sellingPrice.toString())
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
            let ta2 = ta2DB[div + city + mat]
            if (ta2 === undefined) { //No TA2 data              
              ta2DB[div + city + mat] = {
                "sellingPrice": material.marketPrice,
                "sellingQuantity": material.stored + (exported * 10),
                "markupLimit": 0
              }
              await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", material.marketPrice.toString())
              continue
            }
            const prodMarketPrice = material.marketPrice
            const mult = await getMult(ns, div, city)
            const m = mult[0]
            if (ta2.markupLimit === 0) { //Not calculated yet
              const actualSellAmount = material.actualSellAmount
              if (actualSellAmount >= (ta2.sellingQuantity) / 10) { // We failed to set it high enough.  Set it higher and try again
                const oldSalePrice = ta2DB[div + city + mat].sellingPrice
                ta2DB[div + city + mat].sellingPrice = oldSalePrice * 1.2
                ta2DB[div + city + mat].sellingQuantity = material.stored + (exported * 10)
                await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", (oldSalePrice * 1.2).toString())
                continue
              }
              else if (actualSellAmount <= (ta2.sellingQuantity) / 10 * .1) { //Not enough sold, lower the price!
                const oldSalePrice = ta2DB[div + city + mat].sellingPrice
                ta2DB[div + city + mat].sellingPrice = oldSalePrice * .9
                ta2DB[div + city + mat].sellingQuantity = material.stored + (exported * 10)
                await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", (oldSalePrice * .9).toString())
                continue
              }
              const markupLimit = (ta2.sellingPrice - prodMarketPrice) * Math.sqrt(actualSellAmount / m)
              ta2DB[div + city + mat].markupLimit = markupLimit
              ta2 = ta2DB[div + city + mat]
            }
            const prodStored = material.stored
            let sellingPrice = (((ta2.markupLimit * Math.sqrt(prodStored)) / Math.sqrt(prodStored)) + prodMarketPrice) * 10
            const priceMult = (material.productionAmount - exported) / prodStored
            if (priceMult !== Infinity) sellingPrice *= priceMult >= 1 ? 1 : priceMult
            if (sellingPrice < 0 || isNaN(sellingPrice)) {
              const oldSalePrice = ta2DB[div + city + mat].sellingPrice
              ta2DB[div + city + mat].sellingPrice = oldSalePrice * 2
              ta2DB[div + city + mat].sellingQuantity = prodStored + (exported * 10)
              ta2DB[div + city + mat].markupLimit = 0
              await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", (oldSalePrice * 2).toString())
              continue
            }
            await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", sellingPrice.toString())
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
            await corpRun(ns, 'sellMaterial', div, city, mat, "MAX", price)
          }
        }
      }
    }
  }
}
/** @param {NS} ns */
async function getMult(ns, div, city) {
  if (!hasOfficeDB[div + city]) return [0, 0]
  const office = (await corpRun(ns, 'getOffice', div, city))
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
  const upgradeMultiplier = 1 + (await corpRun(ns, 'getUpgradeLevel', "Smart Factories") * 0.03)
  // Multiplier from researches
  let researchMultiplier = 1
  researchMultiplier *=
    (researchedDB[div + "Drones - Assembly"] ? 1.2 : 1)
    * (researchedDB[div + "Self-Correcting Assemblers"] ? 1.1 : 1);
  if (hasDivDB[div].makesProducts) {
    researchMultiplier *= (researchedDB[div + "uPgrade: Fulcrum"] ? 1.05 : 1);
  }
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