# Full audit — 4 November 2026

Audited the combined `testing/bn1-go-audit` branch from `e3858a7` for progression, sleeve use, gang/corporation value, runtime RAM, and production cleanup. The user's current run is BN10.1. Changes belong to PR #34; this is not a merge to `main` or a live-game deployment.

## Scope and confidence

The review covers the runtime script inventory, dependency/import use, existing audit findings, and bounded regression suites for batching, sharing, stocks, purchasing, progression/reset decisions, factions, Go, infiltration/BN1 UI, gangs, and corporations. Sleeves, subsystem startup policy, and NF purchasing received additional execution tests. Game mechanics were checked against the official engine checkout `1da7316ffd9d281b45a86c4c54ec532276557892` and the relevant Steam 3.0.1 source paths.

This is source review and fixture-based verification, not a claim that every gameplay state has been tested. No save was loaded, no augmentation/BN reset was triggered, and no end-to-end speed improvement has been measured in a live run. Policy choices below are explicit heuristics, not a proven globally optimal route.

## Fixed findings

| Area | Finding and consequence | Change |
| --- | --- | --- |
| Sleeves | Training reads `skills.str/def/dex/agi` and nonexistent `train-to-str` flags, so physical training is skipped. | Read full stat/flag names; translate only the gym API argument to its short name. |
| Sleeves | Bladeburner contract selection reads the player's chance, which can be much higher than the assigned sleeve's chance. | Pass the assigned sleeve index to the API; unknown estimates defer the contract. Preserve the >99% lower-bound requirement and failure cooldown. |
| Sleeves | Heist and Assassination require a chance strictly above 100%, so neither can be selected. | Accept equality; honor the configured Homicide threshold. |
| Sleeves | Crime estimates omit augmentation, intelligence and BN14 multipliers. | Match the official success formula; verify against the actual engine method. |
| Sleeves | `--crime` changes the log but does not override task choice. | Apply the requested crime after mandatory synchronization/recovery and before automatic work/training. |
| Sleeves | No-SF4 runs still call Singularity and dereference unavailable crime metadata. | Keep synchronization/recovery/crime operational without SF4; skip unsupported reputation queries and unavailable crime estimates. |
| Sleeves | Hash-upgrade helpers run without SF9; faction metadata makes one helper launch per item. | Gate hash spending on access and use the existing batched read helper for metadata/rep maps. |
| Sleeves | An explicit zero training reserve is ignored; travel bypasses cash protection. | Honor numeric zero, budget prospective trainees/students with a conservative margin, and use the guarded purchase path for travel. Failed travel falls back to crime. |
| Sleeves | Sleeve/memory purchases spend against stale cash without the shared reserve. | Recheck costs, cash and the home reserve synchronously in the purchase helper. The binary-search memory budget also subtracts the current reserve. |
| Startup | Sleeves wait for 1,000 GB home RAM and permanent sleeve purchases wait for 4,000 GB. | Use 128 GB and 64 GB launch thresholds respectively. The purchaser starts only after joining the Covenant and exits once all memory is maxed; actual launch/helper capacity checks still apply. |
| Gangs | `await findPids(...).length` reads the Promise's length and fails to prevent duplicate managers. | Await the PID array before checking its length. |
| Gangs | Alternate routes can unlock gangs without SF5, but initialization unconditionally requires the multiplier API. | Use the current BN's known gang softcap when SF5 is unavailable; reject invalid values. |
| Gangs | BN8 can launch a waiting gang process and direct player/sleeve effort toward an unavailable feature. | Skip the manager and gang-specific karma preparation; direct `gangs.js` also exits in BN8. |
| Corporations | Startup does not distinguish severely penalized new companies from existing productive companies. | Add an explicit, overrideable startup policy described below. |
| NeuroFlux | A donating faction is chosen even when another faction already has enough rep; all levels use one provider. | Prefer existing reputation, select a provider per level using incremental donation cost, and preserve the budgeted provider in the purchase order. Honor `--disable-donations`. |
| Augmentation purchases | Direct Singularity donation/purchase calls can exceed the 24 GB planner allocation at SF4.1/.2 outside BN4. | Use correctly sized temporary purchase helpers; reduce the planner allocation to 5.5 GB. |
| Intelligence preparation | Company-invite collection can monopolize the worker before CashRoot Starter Kit is installed. | Leave normal augmentation routes available until CashRoot is installed, then collect the invites. Generic `--all-company-invites` behavior is retained. |
| Production cleanup | Developer scripts and audit fixtures can enter normal downloads. | At the November 4 checkpoint, remove the unused corporation function and imports and exclude audit fixtures. The [November 7 follow-up](../2026-11-07-sleeve-recovery/README.md) restores `dev.js` and `hacks.js` as manual utilities and retires the standalone diagnostics. |

## Sleeve strategy

At this audit checkpoint the priority was synchronization, coordinated recovery, an explicit crime override or urgent gang karma, distinct useful faction/company routes, bounded training, safe Bladeburner work, then crime. A new default task hierarchy has not been imposed without measurements.

- **Shock and synchronization differ.** At full sync, successful crime karma is not multiplied by the shock penalty. A shocked sleeve can therefore still help unlock a gang, and shock reduces XP and faction rep. Correction: the engine excludes successful crime payouts and company salary from direct shock scaling. That supports retaining some workers while one sleeve recovers.
- **Staged recovery is a throughput tradeoff.** One anchor recovers first, then recovered sleeves work while the rest recover. It does not make that anchor recover faster than an all-recovery policy. The misleading comment claiming a speed advantage is corrected. At zero intelligence and ordinary processing speed, full active shock recovery alone takes about 18.5 hours; intelligence and stored cycles change wall time. Short runs should not assume all sleeves will buy augmentations.
- **Recovery and sleeve augmentations persist through player augmentation installs.** A new BN resets sleeve shock, stats and augmentations. Permanent sleeve purchases and memory persist between BNs. Memory sets starting synchronization on the next BN; buying it does not instantly synchronize the current sleeve. Keep the BN10 completion check that buys all five Covenant sleeves and maxes every owned sleeve's memory.
- **Support the current bottleneck.** Existing routing assigns distinct faction targets and a company follower. This remains preferable to blindly sending every sleeve into crime. Sleeve Bladeburner contracts now use sleeve-specific safety estimates; contract generation is the fallback.
- **Cash discipline.** The global reserve remains authoritative for purchases and travel, including the intentional $8b casino/stock boundary. Ongoing classes cannot be made perfectly atomic with other managers: the five-second training buffer is conservative headroom, not a promise that cash can never cross a threshold between polls. Explicit training-reserve overrides remain available.
- **Follow-up:** the [recovery comparison](../2026-11-07-sleeve-recovery/README.md) tests partial recovery, uninterrupted recovery, working throughout, and faction handoffs. It separates eligibility at zero shock from the unmeasured value of individual aug bundles.

## When gangs and corporations should run

| Situation | Default behavior | Reason / override |
| --- | --- | --- |
| Gangs unavailable or BN8 | Skip manager and gang-karma preparation | No productive gang feature to unlock. `on` does not override a game restriction. |
| Gangs available with reduced money generation | Keep enabled | Reputation, gang augmentations and BN2's Red Pill route can outweigh money penalties. A weak cash multiplier alone is insufficient to disable them. |
| User wants to skip gang investment/preparation | `--gang-mode off` | Controls future manager launches and autopilot's gang-specific player/sleeve preparation. |
| BN3 with corporation access | Allow free seed-funded startup | No $150b player-cash entry cost. |
| BN10, and other supported nodes with softcap at least 0.75 | Allow new corporation after reserve + $150b | Keeps the user's BN10 corporation and its potential bribes useful. Ordinary creation/API checks still apply. |
| New corporation in BN13/BN15, or a softcap below 0.75 | Skip in `auto` | Conservative avoidance of a large speculative startup with severe dividend/funding penalties. This is a policy threshold, not an ROI theorem; a deliberate bribe strategy can still justify one. |
| Existing corporation in a penalized BN | Resume in `auto` | Startup is already paid; ongoing funds and bribes can retain value. |
| Deliberate corporation strategy | `--corporation-mode on` | Overrides the conservative economic startup filter, while retaining game access and cash/reserve checks. |
| User wants no new corporation manager launches | `--corporation-mode off` | Does not destroy a corporation or sell assets. |

These flags govern autopilot launches/preparation; they do not terminate an already-running manager. Stop an existing manager once if deliberately opting out, and restart autopilot/worker processes to apply changed arguments. A manual manager launch remains a manual choice. No new policy liquidates an existing business or gang.

**Corporations for reputation:** bribes spend corporation funds for faction reputation. Favor is gained indirectly when reputation converts at an augmentation reset, not at the bribe itself. In the checked engine, bribing requires $100t valuation and costs $1b per reputation; buying a full 2.5m-rep Red Pill requirement from zero would cost $2.5q in corporate funds. This is a late growth milestone, not an immediate benefit of paying the $150b entry cost.

`CorporationSoftcap` influences the dividend tribute exponent, not a universal multiplier on operating profit. `CorporationValuation` influences offers/valuation; it does not discount infrastructure costs. Keep the current round-one capital floor, round-two supply infrastructure check, real-dollar later funding targets, protected operating cash, and bribes targeted at useful reputation milestones. The current bribe policy protects rounds 1–2, then retains the greater of $1t, ten minutes of expenses, and 90% of funds. Changing that reserve or forcing early IPOs needs comparative timing evidence.

Existing regression checks retain coverage for low-capital bootstrap, public-corporation restart, product/research spending, current division fields, structured-clone transport, and finite sale prices. A newer Tobacco product is still not guaranteed to have a higher effective rating: development productivity, banked research, material quality and unsold inventory all matter.

## BitNode order

Keep the default route stable: SF4.3 first for economical automation, SF1.3 for broad multipliers, SF5.1 for intelligence/formulas, SF2.1 for gangs, SF3.3, then SF10.3. Later milestones remain SF6.1, SF7.3, SF9.3, SF13.3, SF14.3, SF15.3, remaining SF5/2/6 levels, SF11.3, SF8.3, then repeating BN12. Completion credits the current run exactly once and skips already-owned target levels.

The existing `unlocks-first` route defers the repeated BN3/BN10 runs until after first sleeve access and the Bladeburner block. It is a useful experiment, not a measured default winner. Full SF3 also removes corporation API startup costs, and SF10 repeats add permanent sleeves, so deferring those repeats has a real cost.

For the current BN10.1 run, assuming the preceding route milestones are already complete:

| Route | Next milestones | Tradeoff |
| --- | --- | --- |
| `current` | BN10.2 → BN10.3 → BN6.1 → BN7.1–7.3 | Complete the permanent sleeve fleet first. |
| `unlocks-first` | BN6.1 → BN7.1–7.3 → remaining BN3/BN10 levels | Unlock and strengthen an alternative completion path sooner. |

To choose the experiment, restart autopilot with `--bn-route unlocks-first`; set `bn-route` in `autopilot.js.config.txt` to retain it across resets. CLI flags alone are not promised to survive the reset callback. No change silently reorders this run. Moving a first SF9 unlock earlier is another reasonable candidate for measured trials, particularly around Bladeburner, but is not added to the production route here.

## Remaining limitations / experiments

1. **Intelligence preparation still has no independent completion-time budget.** The farm itself has a one-hour cap and ROI/no-progress stops. Obtaining its invitations can still delay a completed BN; the CashRoot starvation fix closes one cause, not every possible preparation stall. A bounded preparation policy needs an explicit tradeoff between persistent intelligence and immediate BN completion. Do not mistake the farm timer for a preparation timer.
2. **Economic subsystem selection is conservative, not predictive.** An exact decision to skip a gang or start a bribe-focused corporation needs estimates for startup time, faction-rep saved, current cash income and remaining BN duration. Multipliers alone do not supply these. The new overrides make the decision controllable without removing useful assets.
3. **No new Go win-rate claim.** Opponent/board policies and tactics are unchanged; existing adaptation, goals, tactics and lifecycle tests are rerun. A new stochastic tournament is not evidence needed for this patch, and no board-size change is inferred from an unrelated sample.
4. **No batch scheduling or income-policy rewrite.** Existing correctness, compatibility, dispatcher-pressure and share-allocation/handoff regressions remain the safety gates. Static checks cannot prove a live game's responsiveness or income under 300,000 concurrent processes.
5. **Retired-file cleanup is now included in normal full pulls.** The [follow-up sync change](../2026-11-04-git-pull-prune/README.md) backs up and removes recognized, unchanged retired repo scripts automatically. Unknown/edited/running files and game data remain protected; failed or partial pulls do not delete files. The November 7 change retires the two standalone diagnostics; regression helpers stay under excluded `audit/`. Exported compatibility wrappers and manual utilities remain because absence of an internal caller does not prove that users never invoke them.

## Validation and reproduction

All **39 suites passed**, including the real React/MUI UI fixtures, with no skips. All **119 runtime JS files parsed**; the top-level scan found no remaining unused imports or private functions. Among **52 measured entry points**, the planner falls from 24 to 5.5 GB, the sleeve purchaser increases from 3.10 to 3.15 GB for authoritative reserve reads, and the other 50 remain unchanged. The planner also measures 5.45 GB without its override at SF4.1 and SF4.2; helper allocation is separately tested against official dynamic RAM enforcement.

See `validation.json` for per-suite results and `ram-impact.json` for the official calculator comparison. `inventory.json` records the runtime parse/import scan. The inventory is a top-level reference check, not proof that all dynamically selected code is reachable.

```sh
python audit/2026-11-04-full-audit/run-checks.py ../bitburner-engine /tmp/bitburner-terminal-ui-check
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine e3858a7
AUDIT_SF4_LEVEL=1 AUDIT_RAM_TARGETS=faction-manager.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine e3858a7
AUDIT_SF4_LEVEL=2 AUDIT_RAM_TARGETS=faction-manager.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine e3858a7
```

UI fixture dependencies are React/ReactDOM 17, MUI 5, Emotion, jsdom 26 and TypeScript 5, installed outside the production repo. Missing UI dependencies are reported as skipped, not passed. The new tests execute actual manager functions and compare crime arithmetic with official source; they do not merely inspect replacement text.

After pulling the testing branch, restart automation so already-running offloaded processes load the new modules. No augmentation or BN reset is needed. Use the existing controlled restart procedure; a hot pull alone does not replace code already executing in a remote process.

## Primary mechanics references

Pinned paths in the official [engine checkout](https://github.com/bitburner-official/bitburner-src/tree/1da7316ffd9d281b45a86c4c54ec532276557892):

- `src/Crime/Crime.ts`, `src/PersonObjects/formulas/intelligence.ts`
- `src/NetscriptFunctions/Sleeve.ts`, `src/NetscriptFunctions/Bladeburner.ts`
- `src/PersonObjects/Sleeve/Sleeve.ts`, `SleeveCovenantPurchases.tsx`, and sleeve work classes
- `src/Corporation/Corporation.ts`, `Actions.ts`, `data/Constants.ts`
- `src/BitNode/BitNode.tsx`, `src/Netscript/RamCostGenerator.ts`, `src/Script/RamCalculations.ts`
- The official [BitNode guide](https://github.com/bitburner-official/bitburner-src/blob/dev/src/Documentation/doc/en/advanced/bitnode_recommendation_comprehensive_guide.md) for qualitative progression tradeoffs; policy and costs above were checked against the pinned implementation.
