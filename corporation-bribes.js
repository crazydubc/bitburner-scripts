import {corpRun, getOwnedAugs, getPlayerInfo, log, singRun} from './utils.js'
import {
  DEFAULT_DESIRED_AUGS, DEFAULT_PRIORITY_AUGS, NEUROFLUX,
  buildDesiredAugSet, getDefaultDesiredStats
} from './faction-route-planner.js'

export const POST_ROUND_BRIBE_MIN_RESERVE = 1e18
export const POST_ROUND_BRIBE_RESERVE_RATIO = 0.5
export const POST_ROUND_BRIBE_MAX_SPEND_RATIO = 0.05
export const POST_ROUND_BRIBE_OPERATING_RESERVE_SECONDS = 10 * 60
const STATUS_INTERVAL = 30_000

const factionAugMetadataCache = Object.create(null)
let lastStatus = ''
let lastStatusAt = 0

function isApiError(value) {
  return typeof value === 'string' && value.startsWith('ERROR:')
}

function logStatus(ns, signature, message, style = 'info') {
  const now = Date.now()
  if (signature === lastStatus && now - lastStatusAt < STATUS_INTERVAL) return
  lastStatus = signature
  lastStatusAt = now
  log(ns, message, true, style)
}

/** Preserve product growth and operating capital before treating corporation funds as excess. */
export function getFactionBribeReserve(
  corporationFunds,
  corporationExpenses = 0,
  minimumReserve = POST_ROUND_BRIBE_MIN_RESERVE,
  reserveRatio = POST_ROUND_BRIBE_RESERVE_RATIO,
  operatingReserveSeconds = POST_ROUND_BRIBE_OPERATING_RESERVE_SECONDS,
) {
  const funds = Math.max(0, Number(corporationFunds) || 0)
  const expenses = Math.max(0, Number(corporationExpenses) || 0)
  return Math.max(
    Math.max(0, Number(minimumReserve) || 0),
    funds * Math.max(0, Number(reserveRatio) || 0),
    expenses * Math.max(0, Number(operatingReserveSeconds) || 0),
  )
}

/** Limit a bribe to the exact reputation gap and a bounded share of current funds. */
export function calculateFactionBribeAmount({
  corporationFunds,
  corporationValuation,
  corporationExpenses = 0,
  currentRep,
  targetRep,
  bribeThreshold,
  bribeAmountPerReputation,
  minimumReserve = POST_ROUND_BRIBE_MIN_RESERVE,
  reserveRatio = POST_ROUND_BRIBE_RESERVE_RATIO,
  maxSpendRatio = POST_ROUND_BRIBE_MAX_SPEND_RATIO,
  operatingReserveSeconds = POST_ROUND_BRIBE_OPERATING_RESERVE_SECONDS,
}) {
  const funds = Number(corporationFunds)
  const valuation = Number(corporationValuation)
  const threshold = Number(bribeThreshold)
  const costPerRep = Number(bribeAmountPerReputation)
  const current = Number(currentRep)
  const target = Number(targetRep)
  if (!Number.isFinite(funds) || funds <= 0 || !Number.isFinite(valuation) ||
    !Number.isFinite(threshold) || valuation < threshold || !Number.isFinite(costPerRep) ||
    costPerRep <= 0 || !Number.isFinite(current) || !Number.isFinite(target) || target <= current)
    return 0

  const reserve = getFactionBribeReserve(
    funds,
    corporationExpenses,
    minimumReserve,
    reserveRatio,
    operatingReserveSeconds,
  )
  const available = Math.max(0, funds - reserve)
  const required = Math.ceil((target - current) * costPerRep)
  const perCycleCap = Math.max(0, funds * Math.max(0, Number(maxSpendRatio) || 0))
  const amount = Math.floor(Math.min(required, available, perCycleCap))
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

/** Select the next desired augmentation threshold reachable through this faction. */
export function selectFactionBribeTarget({
  augmentationNames = [],
  desiredAugSet = new Set(),
  ownedAugs = [],
  currentRep = 0,
  augRepReqs = {},
  augPrereqs = {},
}) {
  const desired = desiredAugSet instanceof Set ? desiredAugSet : new Set(desiredAugSet ?? [])
  const owned = new Set(ownedAugs ?? [])
  const offered = new Set(augmentationNames ?? [])
  const current = Number(currentRep) || 0
  const requirement = aug => {
    const value = Number(augRepReqs?.[aug])
    return Number.isFinite(value) ? value : Infinity
  }
  const reachableAt = (aug, targetRep, visiting = new Set()) => {
    if (owned.has(aug)) return true
    if (visiting.has(aug)) return false
    visiting.add(aug)
    for (const prereq of augPrereqs?.[aug] ?? []) {
      if (owned.has(prereq)) continue
      if (!offered.has(prereq) || requirement(prereq) > targetRep ||
        !reachableAt(prereq, targetRep, visiting)) {
        visiting.delete(aug)
        return false
      }
    }
    visiting.delete(aug)
    return true
  }

  const candidates = [...offered].filter(aug => aug !== NEUROFLUX && desired.has(aug) &&
    !owned.has(aug) && requirement(aug) > current)
  const thresholds = [...new Set(candidates.map(requirement))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  for (const targetRep of thresholds) {
    const unlockedAugs = candidates
      .filter(aug => requirement(aug) <= targetRep && reachableAt(aug, targetRep))
      .sort((a, b) => requirement(a) - requirement(b) || a.localeCompare(b))
    if (unlockedAugs.length > 0) return {targetRep, unlockedAugs}
  }
  return null
}

async function getFactionAugMetadata(ns, faction) {
  const augmentationNames = await singRun(ns, 'getAugmentationsFromFaction', faction)
  if (isApiError(augmentationNames) || !Array.isArray(augmentationNames)) return null
  const key = augmentationNames.slice().sort().join('|')
  if (factionAugMetadataCache[faction]?.key === key) return factionAugMetadataCache[faction]

  const augRepReqs = {}
  const augStats = {}
  const augPrereqs = {}
  for (const aug of augmentationNames) {
    const repRequirement = await singRun(ns, 'getAugmentationRepReq', aug)
    const stats = await singRun(ns, 'getAugmentationStats', aug)
    const prereqs = await singRun(ns, 'getAugmentationPrereq', aug)
    if (isApiError(repRequirement) || isApiError(stats) || isApiError(prereqs)) return null
    const rep = Number(repRequirement)
    augRepReqs[aug] = Number.isFinite(rep) ? rep : Infinity
    augStats[aug] = stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {}
    augPrereqs[aug] = Array.isArray(prereqs) ? prereqs : []
  }

  return factionAugMetadataCache[faction] = {
    key,
    augmentationNames,
    augRepReqs,
    augStats,
    augPrereqs,
  }
}

/**
 * Use only post-investment excess funds to finish the active faction's next desired augmentation threshold.
 * Returns true only when a bribe was actually paid.
 */
export async function manageActiveFactionBribe(ns, resetInfo) {
  const work = await singRun(ns, 'getCurrentWork')
  if (!work || typeof work !== 'object' || Array.isArray(work) ||
    work.type !== 'FACTION' || !work.factionName) return false

  const faction = work.factionName
  const corporation = await corpRun(ns, 'getCorporation')
  const constants = await corpRun(ns, 'getConstants')
  if (!corporation || !constants || typeof corporation !== 'object' || typeof constants !== 'object') return false

  const valuation = Number(corporation.valuation)
  const bribeThreshold = Number(constants.bribeThreshold)
  const costPerRep = Number(constants.bribeAmountPerReputation)
  if (!Number.isFinite(valuation) || !Number.isFinite(bribeThreshold) ||
    !Number.isFinite(costPerRep) || costPerRep <= 0) return false
  if (valuation < bribeThreshold) {
    logStatus(ns, `valuation:${faction}`,
      `Corporation bribes are waiting for valuation ${ns.format.number(valuation, 3)}/` +
      `${ns.format.number(bribeThreshold, 3)}.`, 'info')
    return false
  }

  const playerInfo = await getPlayerInfo(ns)
  const ownedAugs = await getOwnedAugs(ns, true)
  if (!playerInfo || !Array.isArray(playerInfo.factions) ||
    !playerInfo.factions.includes(faction) || !Array.isArray(ownedAugs)) return false

  const metadata = await getFactionAugMetadata(ns, faction)
  if (!metadata) {
    logStatus(ns, `metadata:${faction}`,
      `Unable to load augmentation metadata for corporation bribes to ${faction}.`, 'warning')
    return false
  }

  const currentRepResult = await singRun(ns, 'getFactionRep', faction)
  if (isApiError(currentRepResult)) return false
  const currentRep = Number(currentRepResult)
  if (!Number.isFinite(currentRep)) return false

  const desiredStats = getDefaultDesiredStats({
    bitNode: resetInfo?.currentNode,
    ownedAugCount: ownedAugs.length,
    factions: playerInfo.factions,
    lastAugReset: resetInfo?.lastAugReset,
  })
  const desiredAugSet = buildDesiredAugSet({
    augmentationNames: metadata.augmentationNames,
    augStats: metadata.augStats,
    augPrereqs: metadata.augPrereqs,
    ownedAugs,
    desiredStats,
    desiredAugs: DEFAULT_DESIRED_AUGS,
    priorityAugs: DEFAULT_PRIORITY_AUGS,
  })
  const target = selectFactionBribeTarget({
    augmentationNames: metadata.augmentationNames,
    desiredAugSet,
    ownedAugs,
    currentRep,
    augRepReqs: metadata.augRepReqs,
    augPrereqs: metadata.augPrereqs,
  })
  if (!target) return false

  const amount = calculateFactionBribeAmount({
    corporationFunds: corporation.funds,
    corporationValuation: valuation,
    corporationExpenses: corporation.expenses,
    currentRep,
    targetRep: target.targetRep,
    bribeThreshold,
    bribeAmountPerReputation: costPerRep,
  })
  if (!(amount > 0)) {
    const reserve = getFactionBribeReserve(corporation.funds, corporation.expenses)
    logStatus(ns, `reserve:${faction}:${target.targetRep}`,
      `Holding corporation growth reserve ${ns.format.number(reserve, 3)} before bribing ${faction} ` +
      `toward [${target.unlockedAugs.join(', ')}].`, 'info')
    return false
  }

  if (await corpRun(ns, 'bribe', faction, amount) !== true) {
    logStatus(ns, `failed:${faction}:${target.targetRep}`,
      `Corporation failed to bribe ${faction} with ${ns.format.number(amount, 3)}; retrying later.`,
      'warning')
    return false
  }

  const reputationGain = amount / costPerRep
  lastStatus = ''
  log(ns, `Bribed ${faction} with $${ns.format.number(amount, 3)} for approximately ` +
    `${ns.format.number(reputationGain, 3)} reputation toward ` +
    `[${target.unlockedAugs.join(', ')}] (target ${Math.ceil(target.targetRep).toLocaleString()} rep).`,
    true, 'success')
  return true
}
