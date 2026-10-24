export const MAX_AUGMENTATION_WAIT_MS = 4 * 60 * 60 * 1000;

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
