# Faction planning and server upgrade follow-up

This change is on `testing/bn1-go-audit` / PR #34, following `3984b1a`. The original 18 audit findings already have implementations. This pass addresses four additional issues found while reviewing the remaining speedrun candidates.

## Changes

| Issue | Result |
| --- | --- |
| Faction/augmentation tables launch one home helper per item. | `singReadMany` performs up to 512 reads of one API in a single helper. Both faction scripts use it. A fixture with 30 factions and 100 augmentations performs the same 490 reads in seven helper launches. |
| The faction worker treats favor as fixed for the whole installation. Go streak rewards and export bonuses can change it sooner. | Refresh favor on each planning pass, while keeping static offerings/statistics/prerequisites cached. Donation eligibility and favor targets use the fresh values. |
| A fixed 30-second sleep overrides five-second reputation checks and 15-second invitation planning. It also delays infiltration's screen acknowledgement. | Sleep until the next relevant deadline, polling screen requests at most every five seconds between planning passes. Keep the existing acknowledgement before navigation. Publish changed targets immediately and refresh unchanged ones every 30 seconds. |
| Cloud server upgrades launch a guarded purchase for every RAM doubling. | Find the largest affordable power-of-two upgrade and buy it once per server/pass. Use live API quotes and the existing synchronous purchase guard. |

The new read helper accepts only the eight read methods used by these planners. It rejects mutations, malformed requests, API failures, insufficient RAM, and serialization failures. The caller allocates the effective cost for the selected API, including SF4.1/4.2 multipliers. One API per helper preserves the existing peak RAM requirement instead of adding the costs of different APIs together. Earlier helpers and argument contracts remain supported.

Cloud upgrades retain the 20% pass allowance, live reserve, current server order, initial 2 GB slot purchases, and existing home-upgrade priority. The engine calculates an upgrade as the new server price minus its existing price; intermediate doublings telescope to the same cost. A reserve/cash change before the helper executes can reject the purchase. A later pass can retry with a fresh budget. There is no server deletion or worker termination.

## Verification

All **19 positive regression checks** passed, along with changed-JS/MJS syntax and whitespace checks. The new `checks/progression-throughput.mjs`:

- Executes the real bulk caller/helper/PID-port path, including chunking, duplicate names, failures, and rejected mutations.
- Runs the actual faction table builder and counts seven launches for 490 reads.
- Reproduces stale favor and 30-second polling using the previous worker, then executes the updated functions/loop to verify live donation eligibility, five-second progress/screen polling, and paused planning while infiltration holds the screen.
- Runs the actual host-manager purchase pass and existing guard: a 2 GB server reaches 131,072 GB in one upgrade, with the same $131.07m cost in the fixture and the $800m reserve intact.
- Executes the new helper against the pinned engine's RAM costs and dynamic enforcement for eight read APIs across SF4.1, SF4.2, SF4.3, and native BN4 access (32 combinations).
- Checks direct RAM upgrades against the official cost curve across BN cost/softcap multipliers, with 108 budget/current-RAM combinations.

The official RAM comparison against `3984b1a` reports no increases for existing scripts: faction worker **8.5 GB**, faction manager **24 GB**, host manager **4.8 GB**, autopilot **4.2 GB**, infiltration **5.75 GB**, and BN1 guide **8 GB**. The new helper has the same **6.6 GB minimum** as `bin/singRun.js`; effective API costs may require more at lower SF4 levels.

```sh
node audit/2026-10-17-speedrun/checks/progression-throughput.mjs /path/to/bitburner-src
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src 3984b1a
```

The timings and launch counts above are controlled fixtures, not measured end-to-end speedrun gains. An in-flight planning pass or delayed helper can still delay a screen acknowledgement. Live progression and server upgrades need the user's testing save.

## Pull and restart

Pull the same testing branch, including the new `bin/singReadMany.js` helper, then restart `work-for-faction2.js` and `host-manager.js`. Stop any older faction-manager instance so its next periodic launch uses the updated code. Autopilot can relaunch these processes; it can stay running for this follow-up. Existing offloaded processes keep their imported code until restarted.

The remaining corporation funding/IPO thresholds, BN-order alternatives, and target-ranking ideas need comparative run timings before changing defaults. This pass adds no new route, investment-threshold, Go-tactics, or batch-scheduling policy.

Official source reviewed at `bitburner-official/bitburner-src@1da7316ffd9d281b45a86c4c54ec532276557892` (v3.0.1): `src/Go/boardAnalysis/scoring.ts` (immediate favor), `src/ExportBonus.tsx`, `src/Server/ServerPurchases.ts` and `src/NetscriptFunctions/Cloud.ts` (upgrade pricing), and `src/Netscript/RamCostGenerator.ts` / `NetscriptHelpers.tsx` (effective/dynamic RAM).
