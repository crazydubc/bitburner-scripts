// Time/value policy. Values are the faction planner's utility estimates, not measured speedups.
export const RESET_SAMPLE_WINDOW_MS = 3 * 60_000;
export const RESET_SAMPLE_MIN_MS = 60_000;
export const RESET_GOAL_MAX_WAIT_MS = 15 * 60_000;
const SETTLE_MS = 30_000;
const HARD_CAP_MS = 4 * 60 * 60_000;

function finiteNonnegative(value) { return Number.isFinite(value) && value >= 0; }

/** Drop the largest interval so one casino payout, bribe, or stock jump is not recurring income. */
function observedRate(samples, read) {
  const rates = [];
  for (let i = 1; i < samples.length; i++) {
    const before = read(samples[i - 1]), after = read(samples[i]);
    const elapsed = samples[i].at - samples[i - 1].at;
    if (finiteNonnegative(before) && finiteNonnegative(after) && elapsed > 0)
      rates.push((after - before) * 1000 / elapsed);
  }
  if (rates.length < 2) return 0;
  rates.sort((a, b) => a - b).pop();
  return Math.max(0, rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
}

/** Mutates only the caller's observation state. All game actions remain in autopilot/ascend. */
export function evaluateAugmentationReset(snapshot, reset, state, now = Date.now(), finishHack = 0, stockUpgradeCost = 0) {
  const plan = snapshot?.reset_planning;
  if (plan?.version !== 1 || !finiteNonnegative(plan.wealth) || !finiteNonnegative(plan.readyUtility) ||
      !finiteNonnegative(plan.hacking) || !plan.reputation || typeof plan.reputation !== 'object' ||
      !Array.isArray(plan.goals) || !Number.isFinite(snapshot.generated_at) ||
      snapshot.generated_at < reset.lastAugReset ||
      snapshot.current_node !== reset.currentNode || snapshot.last_aug_reset !== reset.lastAugReset ||
      now - snapshot.generated_at > 120_000 || snapshot.generated_at > now + 5_000)
    return {action: 'fallback', reason: 'missing-goal-data'};
  if (!Object.values(plan.reputation).every(finiteNonnegative) || plan.goals.some(goal =>
    typeof goal?.key !== 'string' || typeof goal?.label !== 'string' || !(goal.utility > 0) ||
    !Number.isFinite(goal.utility) || !finiteNonnegative(goal.money) || !finiteNonnegative(goal.rep) ||
    typeof goal.faction !== 'string' || (goal.eta !== undefined && !finiteNonnegative(goal.eta))))
    return {action: 'fallback', reason: 'invalid-goal-data'};

  const identity = `${reset.currentNode}:${reset.lastAugReset}`;
  if (state.identity !== identity) Object.assign(state, {identity, samples: [], wait: null});
  const sample = {at: snapshot.generated_at, wealth: plan.wealth, reputation: plan.reputation, hacking: plan.hacking};
  const previous = state.samples.at(-1);
  if (!previous || sample.at > previous.at) state.samples.push(sample);
  state.samples = state.samples.filter(entry => sample.at - entry.at <= RESET_SAMPLE_WINDOW_MS).slice(-12);

  if (!(plan.readyUtility > 0)) { state.wait = null; return {action: 'none', reason: 'nothing-useful-ready'}; }
  const elapsed = Math.max(0, now - reset.lastAugReset);
  if (elapsed >= HARD_CAP_MS) return {action: 'reset', reason: 'hard-cap'};
  if (state.samples.length < 3 || sample.at - state.samples[0].at < RESET_SAMPLE_MIN_MS)
    return {action: 'wait', reason: 'measuring-progress', deadline: now + RESET_SAMPLE_MIN_MS};

  const moneyRate = observedRate(state.samples, entry => entry.wealth);
  const remaining = HARD_CAP_MS - elapsed;
  const candidates = [];
  for (const goal of plan.goals) {
    const moneyGap = Math.max(0, goal.money - plan.wealth);
    const repGap = Math.max(0, goal.rep - (plan.reputation[goal.faction] ?? 0));
    const repRate = observedRate(state.samples, entry => entry.reputation[goal.faction]);
    const moneyEta = moneyGap === 0 ? 0 : moneyRate > 0 ? moneyGap / moneyRate * 1000 : Infinity;
    const repEta = repGap === 0 ? 0 : repRate > 0 ? repGap / repRate * 1000 : Infinity;
    const eta = Math.max(moneyEta, goal.eta ?? repEta);
    // Waiting should improve useful installed value per cycle time. The absolute bound also
    // prevents high-priority utility scores justifying hours of waiting for one augmentation.
    const budget = Math.min(RESET_GOAL_MAX_WAIT_MS, remaining, elapsed * goal.utility / plan.readyUtility);
    if (Number.isFinite(eta) && eta <= budget)
      candidates.push({...goal, eta, budget, score: goal.utility / Math.max(eta, SETTLE_MS)});
  }

  // Preserve the existing near-4S opportunity, but require a finite ETA instead of an endless money-ratio wait.
  if (Number.isFinite(stockUpgradeCost) && stockUpgradeCost > 0 && plan.wealth >= stockUpgradeCost * 0.9) {
    const gap = Math.max(0, stockUpgradeCost - plan.wealth);
    const eta = gap === 0 ? 0 : moneyRate > 0 ? gap / moneyRate * 1000 : Infinity;
    const budget = Math.min(RESET_GOAL_MAX_WAIT_MS, remaining);
    if (eta <= budget) candidates.push({key: 'stock-4s', label: '4S stock upgrade', eta, budget, score: Number.MAX_VALUE});
  }

  // Finishing the BN takes precedence over installing a larger bundle. Require measured progress.
  const hackingRate = observedRate(state.samples, entry => entry.hacking);
  if (Number.isFinite(finishHack) && finishHack > plan.hacking && hackingRate > 0) {
    const eta = (finishHack - plan.hacking) / hackingRate * 1000;
    const budget = Math.min(RESET_GOAL_MAX_WAIT_MS, remaining);
    if (eta <= budget) candidates.push({key: 'finish-bn', label: 'finish this BitNode', eta, budget, score: Infinity});
  }

  const goal = candidates.sort((a, b) => b.score - a.score || a.eta - b.eta || a.key.localeCompare(b.key))[0];
  if (!goal) { state.wait = null; return {action: 'reset', reason: 'no-worthwhile-goal', moneyRate}; }
  const deadline = now + Math.min(goal.budget, Math.max(SETTLE_MS, goal.eta * 1.5 + SETTLE_MS));
  state.wait = state.wait?.key === goal.key
    ? {...state.wait, deadline: Math.min(state.wait.deadline, deadline)} : {key: goal.key, deadline};
  return {action: now >= state.wait.deadline ? 'reset' : 'wait',
    reason: now >= state.wait.deadline ? 'goal-timeout' : 'productive-goal',
    goal: goal.label, eta: goal.eta, deadline: state.wait.deadline, moneyRate};
}
