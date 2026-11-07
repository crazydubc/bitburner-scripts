export const MAX_AUGMENTATION_WAIT_MS = 4 * 60 * 60 * 1000;

/** Gang reputation/augmentations remain useful even when cash generation is weak. */
export function shouldUseGangs(sourceFiles, currentNode, mode = 'auto', multipliers = {}) {
  return mode !== 'off' && Number(sourceFiles?.[2]) > 0 && Number(currentNode) !== 8 &&
    !(multipliers.GangSoftcap === 0 && multipliers.GangUniqueAugs === 0);
}

/** Conservative new-company policy; existing corporations are handled separately and always resume. */
export function shouldFundNewCorporation(currentNode, mode = 'auto', multipliers = {}) {
  if (mode === 'off' || Number(currentNode) === 8 || multipliers.CorporationSoftcap === 0) return false;
  if (Number(currentNode) === 3 || mode === 'on') return true;
  // BN13/15 severely penalize dividends and startup funding. Avoid speculative $150b starts.
  // Corporate funds still support bribes; use on to deliberately pursue that route.
  // Valuation affects funding offers, not operating profit, so it is not an independent cutoff.
  const softcap = multipliers.CorporationSoftcap ?? ([13, 15].includes(Number(currentNode)) ? 0.4 : 1);
  return Number.isFinite(softcap) && softcap >= 0.75;
}

/** A fresh affordable queue bounds cash-production investments before the reset safeguard. */
export function getHacknetPayoffSeconds(configured, snapshot, reset, now = Date.now(), planned) {
  if (!(configured > 0) || !Number.isFinite(configured)) return 0;
  if (!snapshot || !reset || Number(snapshot.current_node) !== Number(reset.currentNode) ||
    Number(snapshot.last_aug_reset) !== Number(reset.lastAugReset) ||
    !Number.isFinite(snapshot.generated_at) || now - snapshot.generated_at > 90_000 ||
    now < snapshot.generated_at - 5_000) return configured;
  if (!Array.isArray(snapshot.affordable_augs) || !Array.isArray(snapshot.awaiting_install_augs)) return configured;
  const queue = snapshot.affordable_augs.concat(snapshot.awaiting_install_augs);
  const favorReady = Array.isArray(snapshot.donation_favor_progress) &&
    snapshot.donation_favor_progress.some(entry => entry?.ready === true && entry.desired_augs?.length > 0);
  if (!queue.length && !favorReady) return configured;
  if (queue.includes('The Red Pill')) return 0;
  // Leave a minute of cash headroom. The deadline never extends the explicitly requested ROI.
  let deadline = Number(reset.lastAugReset) + MAX_AUGMENTATION_WAIT_MS;
  if (planned?.last_aug_reset === reset.lastAugReset && planned?.current_node === reset.currentNode &&
    Number.isFinite(planned.deadline) && planned.deadline > 0) deadline = Math.min(deadline, planned.deadline);
  return Math.min(configured, Math.max(0, (deadline - now) / 1000 - 60));
}

/** Allow a milestone bribe while retaining growth capital and ten minutes of operating costs. */
export function getCorporationBribeReserve({funds, expenses = 0} = {}, round = 5) {
  if (!Number.isFinite(funds) || funds < 0 || !Number.isFinite(expenses) || expenses < 0 ||
    !Number.isInteger(round) || round < 1 || round > 5) return Infinity;
  // Never interrupt Agriculture/Tobacco/Chemical setup in the first two private rounds.
  if (round <= 2) return Infinity;
  return Math.max(1e12, expenses * 600, funds * 0.9);
}
