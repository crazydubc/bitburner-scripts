/** Shared policy for donation-favor milestones produced by faction-manager and consumed by autopilot. */
export const NEUROFLUX = "NeuroFlux Governor";
export const DONATION_FAVOR_DELAY_RATIO = 0.9;
export const DONATION_FAVOR_SNAPSHOT_MAX_AGE = 90_000;
export const DONATION_FAVOR_STALL_TIMEOUT = 120_000;
export const FACTIONS_WITHOUT_DONATIONS = [
  "Bladeburners",
  "Church of the Machine God",
  "Shadows of Anarchy",
];

const asSet = values => values instanceof Set ? values : new Set(values ?? []);

/**
 * Find joined factions whose current reset is close to, or has reached, the favor needed to donate.
 * Only productive augmentations which are still reputation-locked through every joined provider count.
 */
export function buildDonationFavorProgress({
  joinedFactions = [],
  gangFaction = null,
  excludedFactions = FACTIONS_WITHOUT_DONATIONS,
  favorToDonate = 0,
  factionFavor = {},
  factionProjectedFavor = {},
  factionRep = {},
  factionAugs = {},
  desiredAugmentations = [],
  ownedAugmentations = [],
  augRepRequirements = {},
  augPrerequisites = {},
  donationFactions = [],
  minimumProgressRatio = DONATION_FAVOR_DELAY_RATIO,
} = {}) {
  const requiredFavor = Number(favorToDonate);
  if (!(requiredFavor > 0)) return [];

  const joined = [...new Set(joinedFactions ?? [])];
  const excluded = asSet(excludedFactions);
  const desired = asSet(desiredAugmentations);
  const owned = asSet(ownedAugmentations);
  const donations = asSet(donationFactions);
  const progress = [];

  const prerequisitesReachable = (aug, donationFaction, visiting = new Set()) => {
    if (visiting.has(aug)) return false;
    visiting.add(aug);
    const reachable = (augPrerequisites[aug] ?? []).every(prerequisite => {
      if (owned.has(prerequisite)) return true;
      const repRequired = Number(augRepRequirements[prerequisite]);
      if (!Number.isFinite(repRequired)) return false;
      const hasProvider = joined.some(provider => (factionAugs[provider] ?? []).includes(prerequisite) &&
        (provider === donationFaction || donations.has(provider) ||
          (Number(factionRep[provider]) || 0) >= repRequired));
      return hasProvider && prerequisitesReachable(prerequisite, donationFaction, visiting);
    });
    visiting.delete(aug);
    return reachable;
  };

  for (const faction of joined) {
    if (faction === gangFaction || excluded.has(faction) || donations.has(faction)) continue;

    const currentFavor = Number(factionFavor[faction] ?? 0);
    const projectedFavor = Number(factionProjectedFavor[faction]);
    const currentRep = Number(factionRep[faction] ?? 0);
    if (!Number.isFinite(currentFavor) || !Number.isFinite(projectedFavor) || !Number.isFinite(currentRep) ||
      currentFavor >= requiredFavor || projectedFavor < requiredFavor * minimumProgressRatio) continue;

    const desiredAugs = (factionAugs[faction] ?? []).filter(aug => {
      if (aug === NEUROFLUX || !desired.has(aug) || owned.has(aug)) return false;
      const repRequired = Number(augRepRequirements[aug]);
      if (!Number.isFinite(repRequired) || repRequired <= currentRep) return false;

      // Unlocking donations for a redundant provider does not justify a reset.
      const accessibleElsewhere = joined.some(other => other !== faction &&
        (factionAugs[other] ?? []).includes(aug) &&
        ((Number(factionRep[other]) || 0) >= repRequired || donations.has(other)));
      return !accessibleElsewhere && prerequisitesReachable(aug, faction);
    });
    if (desiredAugs.length === 0) continue;

    progress.push({
      faction,
      current_favor: currentFavor,
      projected_favor: projectedFavor,
      favor_gain: projectedFavor - currentFavor,
      required_favor: requiredFavor,
      progress_ratio: projectedFavor / requiredFavor,
      desired_augs: desiredAugs,
      ready: projectedFavor >= requiredFavor,
    });
  }

  return progress.sort((a, b) => Number(b.ready) - Number(a.ready) ||
    b.progress_ratio - a.progress_ratio || a.faction.localeCompare(b.faction));
}

/** Ignore favor milestones written before the current BitNode, augmentation reset, or recent manager cycle. */
export function getFreshDonationFavorProgress(factionManagerOutput, resetInfo, {
  now = Date.now(),
  maxAge = DONATION_FAVOR_SNAPSHOT_MAX_AGE,
} = {}) {
  const generatedAt = Number(factionManagerOutput?.generated_at);
  const snapshotAge = now - generatedAt;
  if (!factionManagerOutput || !resetInfo ||
    !Number.isFinite(generatedAt) || generatedAt < Number(resetInfo.lastAugReset) ||
    snapshotAge < -5_000 || snapshotAge > maxAge ||
    Number(factionManagerOutput.current_node) !== Number(resetInfo.currentNode) ||
    Number(factionManagerOutput.last_aug_reset) !== Number(resetInfo.lastAugReset) ||
    !Array.isArray(factionManagerOutput.donation_favor_progress)) return [];

  return factionManagerOutput.donation_favor_progress.flatMap(entry => {
    const currentFavor = Number(entry?.current_favor);
    const projectedFavor = Number(entry?.projected_favor);
    const requiredFavor = Number(entry?.required_favor);
    const desiredAugs = Array.isArray(entry?.desired_augs) ? entry.desired_augs.filter(aug => typeof aug === "string") : [];
    if (typeof entry?.faction !== "string" || !(requiredFavor > 0) ||
      !Number.isFinite(currentFavor) || !Number.isFinite(projectedFavor) ||
      currentFavor >= requiredFavor || projectedFavor < requiredFavor * DONATION_FAVOR_DELAY_RATIO ||
      desiredAugs.length === 0) return [];
    return [{
      ...entry,
      current_favor: currentFavor,
      projected_favor: projectedFavor,
      required_favor: requiredFavor,
      desired_augs: desiredAugs,
      ready: projectedFavor >= requiredFavor,
    }];
  });
}

/** Only delay a normal install when the player is actively finishing the near-favor route. */
export function getActiveNearDonationFavorProgress(progress, currentWork) {
  if (currentWork?.type !== "FACTION") return null;
  return (progress ?? []).find(entry => !entry.ready && entry.faction === currentWork.factionName) ?? null;
}

/** Bound near-favor delays unless fresh snapshots show that projected favor is still increasing. */
export function updateDonationFavorDelayState(previousState, activeProgress, {
  now = Date.now(),
  stallTimeout = DONATION_FAVOR_STALL_TIMEOUT,
} = {}) {
  if (!activeProgress) return { state: null, shouldDelay: false, stalled: false };
  const projectedFavor = Number(activeProgress.projected_favor);
  const madeProgress = !previousState || previousState.faction !== activeProgress.faction ||
    !Number.isFinite(previousState.projectedFavor) || projectedFavor > previousState.projectedFavor + 1e-9;
  const state = {
    faction: activeProgress.faction,
    projectedFavor,
    lastProgressAt: madeProgress ? now : previousState.lastProgressAt,
  };
  const stalled = now - state.lastProgressAt >= stallTimeout;
  return { state, shouldDelay: !stalled, stalled };
}

export function buildAscendArgs(onResetScript, allowSoftReset = false) {
  const args = [
    "--install-augmentations", true,
    "--on-reset-script", onResetScript,
  ];
  if (allowSoftReset) args.push("--allow-soft-reset", true);
  return args;
}
