# Time-based augmentation resets, including NeuroFlux

The user reported a roughly ten-hour BN1.1 run, usually installing around twenty augmentations including NF. That is useful run history, **not an installation target**. The user explicitly requested decisions based on whether a worthwhile next goal is achievable in reasonable time. No twenty-augmentation trigger ships with this change.

## Decision

Autopilot now compares the useful bundle ready to install with the additional value and estimated completion time of the next goal. Every pending NF level contributes its stat utility. The utility calculation reuses the faction planner's weighted logarithmic stat/priority model; repeat NF receives no per-level distinct-augmentation bonus. These are planning estimates, not predictions of an exact percentage speedup.

Faction-manager publishes prices, current reputation, net worth, hacking level, pending utility, and candidate goals using data it already reads. Goals include:

- Another useful augmentation or NF level. Quotes include the current planned bundle, purchase inflation, reachable prerequisites, and incremental donation costs.
- An active faction-invitation route reported by the worker, including its augmentation/reputation work after joining. These are the worker's heuristic ETAs; missing, stale, failed, or unrelated work is ignored.
- A near donation-favor milestone. Present wealth must cover at least one desired augmentation and its full post-reset reputation bill. This is a funding proxy: cash does not survive installation, and the script does not guarantee equivalent income after the reset.
- An almost-funded 4S upgrade or finishing the current BitNode after installing The Red Pill, provided measured progress supports a short ETA.

Autopilot collects at least three distinct snapshots spanning one minute, retaining up to three minutes of observations. Money and reputation ETAs use observed progress; the largest interval is discarded so a single casino payout, bribe, or market jump is not assumed to recur. Net-worth changes include spending and stock fluctuations, making cash estimates conservative and potentially noisy.

For an augmentation goal, waiting must improve estimated useful installed value per cycle time: `ETA <= elapsed cycle time × additional utility / ready utility`. Waits are also bounded by fifteen minutes and the remaining four-hour cycle safeguard. A selected goal receives a fixed deadline with limited forecast slack; refreshed estimates can shorten that deadline but cannot slide it later. A goal that becomes unproductive, stalls, or misses its deadline releases the reset. Goal changes and genuinely completed goals may justify another wait, within the existing four-hour limit.

There is no hard augmentation-count minimum. A small useful bundle can install when no worthwhile goal is close, while a large bundle can wait for a valuable near-term goal. Existing immediate Red Pill, distinct-count Daedalus, and completed donation-favor milestones retain priority. The first installed NF counts once toward Daedalus; subsequent NF levels add stat value but no distinct count.

Existing Daedalus invitation reservations, BlackOps protection, BN8 behavior, and intelligence-farm preparation remain. Old or malformed planner output falls back to historical momentum timing until updated output is available. The four-hour cap remains a fallback, subject to the existing safety checks. Installation also waits for an active infiltration screen lease to finish, including for immediate milestones, so it does not kill an unclaimed reward. An unknown lease result defers installation until the next check.

## Visibility and testing

The autopilot log names the goal, its ETA, the remaining wait allowance, and the ready ordinary/NF counts. Installation telemetry records the decision, elapsed cycle time, pending counts, and forecast details in the existing run journal. Hacknet's investment horizon uses the selected deadline.

All **20 positive regression checks pass**. The new `checks/augmentation-reset.mjs` executes the actual quote builder, utility model, reset policy, autopilot installation branches, safeguard checks, ascend arguments, and telemetry. It covers NF-only bundles, no count threshold, short/far/stalled goals, cash plus reputation constraints, single-payout rejection, prerequisites, invitations, bounded 4S/BN-finish waits, old/stale/corrupt data, first-versus-repeat NF counts, and active/unknown infiltration leases. Existing infiltration, progression, purchase, batch, corporation, Go, and bulk-planning checks pass as well.

The pinned official v3.0.1 RAM calculator reports no existing script increases: autopilot **4.2 GB**, faction manager **24 GB**, faction worker **8.5 GB**, kernel **5.3 GB**, and BN1 guide **8 GB**. New policy code is pure JavaScript; no new game API is required. Syntax and whitespace checks pass. No live installation or BN4.1 run was performed; the ten-hour BN1.1 report does not establish how fast this policy will complete BN4.1.

```sh
node audit/2026-10-17-speedrun/checks/augmentation-reset.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src 016e6ae
```

Pull `testing/bn1-go-audit`, including `augmentation-reset-policy.js`, then restart autopilot from home and restart the faction worker. Stop any older faction-manager process so its next launch publishes the new snapshot. The policy module is included in remote dependency copying and the downloader fallback. There is no new count setting to configure.

For BN4.1, compare cycle durations, installed NF/ordinary counts, reasons for waiting/installing, Daedalus entry, Red Pill installation, and final hacking time. Corporation funding thresholds, alternative BN routes, and new Go tactics still need comparative run data before changing their defaults. The hacking batch schedule, intentional casino/stock reserve, and persistent manual liquidation behavior are preserved.

Game mechanics reviewed against `bitburner-official/bitburner-src@1da7316ffd9d281b45a86c4c54ec532276557892`: `src/Augmentation/Augmentations.ts`, `src/Augmentation/AugmentationHelpers.ts`, `src/BitNode/BitNode.tsx`, and `src/Netscript/RamCostGenerator.ts`. NF's ordinary per-level multipliers compound; native BN4 provides Singularity without the external SF4.1 RAM penalty, while BN4's income/experience/endgame multipliers differ from BN1.
