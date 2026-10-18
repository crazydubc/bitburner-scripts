# Implementation and measurement plan

**October 18 follow-up:** startup ordering, process/stock/Go observations, NeuroFlux-independent timing, reset-aware Hacknet ROI, engine-timestamp logging, and earlier guarded corporation bribes are now implemented. Board-size results, external Go assessment, hidden-opponent support, and an opt-in route comparison are in [2026-10-18-followup.md](2026-10-18-followup.md). The proposals below retain the original audit context; use that follow-up for current implementation status.

**Further implementation:** [the throughput follow-up](2026-10-18-throughput-followup.md) batches faction metadata, refreshes changing favor, honors worker deadlines, and combines cloud upgrades into one affordable jump. The remaining policy experiments still need live milestone comparisons.

Optimize wall-clock time to useful installed augmentations and completed BNs. Keep the existing batcher as the baseline and land bounded changes in the single testing PR. This document records the original proposed work order. All 18 finding fixes and the proposed route are now implemented with focused checks; see [remaining-fixes.md](remaining-fixes.md) and [progression-fixes.md](progression-fixes.md). The candidates below are experiments requiring live timing, not outstanding confirmed defect fixes.

## Repair order

| Order | Work | Reason and completion evidence |
| --- | --- | --- |
| 1 | B01, B11, B17: bounded RPC, typed results, correct host/RAM eligibility | Every progression manager depends on these helpers. Verify failure and recovery, including low home RAM and partial SF4. |
| 2 | B02, B03, B04: authoritative spending state, cracker inventory, purchase budgets | Make fresh-BN1 bootstrap predictable while preserving the coinflip gate. Verify zero pre-completion stock buys and no reserve breaches. |
| 3 | B05, B06, B07, B08: intelligence/sleeve/reset/Bladeburner progression | Remove conditions that can prevent finishing a run. Verify state transitions through actual resets in a backed-up test save. |
| 4 | B09, B10, B12, B13, B14, B18: scheduled tasks and subsystem correctness | Recover missing work and prevent repeated failed contract submissions. Verify only the affected paths. |
| 5 | B15, B16: isolated batcher arithmetic/type fixes | Keep scheduling behavior stable while checking thread accounting and security recovery. Do not combine with a target-policy rewrite. |
| 6 | Candidate route and measured policy changes below | Compare complete milestones after infrastructure no longer confounds the result. |

B15/B16 deserve early review because they affect correctness; their separate change set is about controlling regression risk, not dismissing them. A minimal fix with verified live invariants can be advanced independently of the rest of the queue.

## High-value optimization candidates

### Start productive work before optional startup sweeps

Autopilot calls its periodic sweep before ensuring its long-running helpers are up. The contractor and other optional work can therefore compete for the same home RPC RAM before the income process is established. Use a bootstrap phase with one working income path, enough RPC capacity, and then optional managers. A dedicated low-RAM entry point should be able to make progress or explain why it cannot; moving a process off home alone is not enough while its helpers still run on home.

The 1 TB sleeve, 2 TB Go, 3 TB stock, and 4 TB sleeve-purchase thresholds are proxies for readiness. Replace them only after measuring actual script/RPC fit and the benefit to the current objective. Preserve both coinflip completion and the $8b policy when revisiting stock eligibility. Early Go can be tested without SF14; its CPU use and bonus quality must justify running it beside the batcher.

### Reduce helper traffic without inflating every manager's RAM

`isScriptRunning` repeatedly scans the network/processes for individual helpers. Kernel RAM discovery makes per-host helper requests even where a server snapshot already contains RAM fields. `getStocksValue` collects several per-symbol values through separate requests. These are opportunities to remove process churn and control-plane delays while leaving batch timing alone.

Use one bounded snapshot helper per kind of observation: network/root/RAM inventory, process inventory, stock valuation, or faction augmentation data. Reuse a snapshot within one manager iteration; invalidate long-lived caches when capabilities, targets, augmentation state, or host inventory change. Keep API-heavy observation code in the helper instead of adding all APIs to every script.

B12 is the simplest direct win: the hash spender should not rerank hacking targets when selling hashes for money or waiting for sufficient hashes. Measure helper launches and loop latency before/after, not just source line count.

### Invest against the next reset horizon

The scheduler now retains one four-hour-payback hacknet manager and removes the ineffective eight-hour/unlimited-payback passes. Even four-hour investments can repay after the next augmentation reset. Compare that policy against a conservative estimate of remaining cycle time, with explicit exceptions for a valuable unlock or hash-funded objective.

Home RAM persists across augmentation installations and also supports the RPC architecture. First fund enough to operate reliably; then compare marginal income/progression benefit per dollar. Purchased-server slots need not all begin at 2 GB. Once B04 is fixed, compare direct useful-sized purchases and upgrades with the current incremental policy.

This is separate from the casino reserve: do not remove the $8b pre-completion guard to fund speculative purchases. Coordinate buyers through current authoritative budgets to prevent individually valid concurrent purchases from collectively breaching a reserve.

### Optimize installation decisions, not just augmentation count

Current momentum bookkeeping can be extended by cheap NeuroFlux levels, even when a productive non-NeuroFlux bundle is already affordable. Track useful new augmentations, prerequisites, distinct installed count for Daedalus, and expected next purchase time separately from repeat NeuroFlux.

Retain the existing four-hour hard stop as a fail-safe. Add reasons for each deliberate wait: next key augmentation ETA, donation threshold, invitation setup, or BN finish proximity. Favor resets should include a post-reset donation funding estimate. A reset that unlocks donations but cannot afford them may be slower than continued work.

After SF5, the intelligence farm should have the same discipline: finite budget, persistent completion, and estimated downstream savings. Do not let an optional farm own the BN finish gate forever.

### Preserve the corporation strategy while measuring its milestones

Keep six-city Agriculture → round-2 Tobacco → Chemical and the recent liquidity/bribe/sleeve-routing work. Log corporation creation, investment rounds, API unlocks, first useful bribe, and the next BN objective. These measurements tell us whether SF3.3 deserves its early three-run block or whether only SF3.1 should precede sleeves/Bladeburner. A large profit number does not itself establish earlier completion.

### Compare early targets only after arithmetic fixes

The current target ranking emphasizes steady-state money relative to resources. Early BN1 may instead be limited by time to prepare a target, reach a hacking level, or afford the next augmentation. Compare the existing policy with a preparation-aware choice at a few controlled checkpoints. Do not replace the working steady-state batcher based on an unmeasured score formula.

## Minimal useful telemetry

Use engine reset timestamps as the reference: `lastNodeReset` and `lastAugReset`. The existing logger starts from script startup and closes a previous record when another run is recorded, which can mix startup/restart gaps into the timing. Keep a unique run key such as `(currentNode, lastNodeReset)`, and record SF level separately. Resuming a logger must not create a new BN run.

| Measurement | Why it matters |
| --- | --- |
| Casino sample end and verified earning completion | Separates the two phases and proves stock gating |
| First productive hacking action and stable batch income | Exposes bootstrap/preparation delay |
| Home RAM, eligible worker RAM, RPC failures/waits | Distinguishes capacity from scheduling problems |
| Faction invitation, next key augmentation affordable, installation | Separates money, reputation, and decision delays |
| Daedalus cash ready, invitation, Red Pill installed, BN complete | Makes late-game stalls visible |
| Intel preparation/farm exit; sleeve purchase/memory completion | Verifies intentional gates have finite transitions |
| Time/cash lost to failed spawns, repeated prep, or unused investments | Identifies waste hidden by average income |

Log periodic summaries and meaningful events rather than every batch action. Extra logging can itself distort performance.

## Comparison protocol

1. Record game version, script commit, SF inventory, installed augmentations, starting RAM/cash/skills, and enabled managers.
2. Export a save at a repeatable checkpoint. Compare one change at a time from that checkpoint with the same browser/background conditions.
3. Use cold BN1 startup, a post-install BN1 cycle, and a later capability-rich node as separate cases. Do not infer cold-start performance from a developed save.
4. Measure time to the same milestone and count manual recoveries. For batcher changes also check completion ordering, money recovery, security recovery, failed launches, and sustained income.
5. Repeat only where variation could change the decision. Keep a change when it reduces milestone time without a material reliability regression; otherwise retain the baseline.

The delivered offline checks establish specific defects, not speed gains. Live measurements are the remaining requirement before calling a route or policy “faster.”
