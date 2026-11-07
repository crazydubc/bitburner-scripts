# Progression and route follow-up

This change stays on `testing/bn1-go-audit` / PR #34. It fixes B05/B07/B08 and applies the [revised route](bitnode-route.md). The subsequent [final backlog pass](remaining-fixes.md) completes fixes for all 18 original findings. This is implementation status, not proof that the suite has no other bugs.

## Route behavior

`progression.js` owns integer BN IDs, target SF levels, and an explicit BN12 repeat policy. Autopilot credits the current run once, skips targets already owned, and logs the selected next node. BN12 levels 10 and above no longer collapse into decimal labels or an exhausted target array.

The route preserves BN4.1–4.3 immediately after the initial BN1.1, postpones BN11 and extra BN2/BN5 repetitions, groups BN3.1–3.3 for its free corporation APIs, and puts sleeves/Bladeburner before BN9. This ordering is a suite-specific hypothesis. The alternative BN3.1-only and BN10.1-only early blocks still deserve timing. BN8 remains in normal progression.

## Intelligence preparation and farming

- Preparation begins only with earned SF4/SF5 and INT below 230. Readiness checks installed CashRoot and all ten corporate factions/invitations, refreshing every 30 seconds. INT reaching the target releases the gate immediately.
- `/data/intel-farm-state.json` lives on home, keyed by `currentNode` and `lastNodeReset`. Augmentation resets retain progress/completion; entering a new BN run starts preparation afresh. Missing state means preparation, while malformed JSON produces an explicit error and prevents untracked farming.
- The farm runs on home. It retains the existing three-city join/reset cycle and never uses BitFlume. One initial empty cycle may reset to recover already-joined corporate invitations, which the official engine preserves on installation. A second empty cycle ends the farm.
- Completion occurs at INT 230, one hour elapsed since farming started, five minutes without a skill-level increase, or the previous projected intelligence-bonus gain falling below 0.5%/hour. The ROI observation is at least one minute. These policies are conservative bounds, not a measured speedrun optimum; integer skill levels can hide small XP gains.
- The one-hour limit excludes CashRoot/faction preparation and includes downtime after the farm has started. Completing the farm records a reason and resumes the same BN without an additional reset. An already-running, offloaded autopilot is reused.
- A farm RPC failure attempts to resume autopilot. A failed restart prints an actionable RAM/start command. Autopilot state-read failures keep ordinary managers running, retry preparation, and cannot start an untracked farm. The automatic faction worker exits collection mode when completion occurs without a reset; a manually requested `--all-company-invites` retains its meaning.

The prerequisite phase still deliberately waits for all ten factions, as requested. Its time should be included when comparing farm payback. A corrupted state file needs repair before the farm gate can be trusted; it is not silently discarded.

## Bladeburner and reset preparation

BN6/SF6 or BN7/SF7 now qualifies throughout the launch, sleeve and player-work coordination paths. Existing busy-action/Simulacrum arbitration remains. Autopilot recognizes completion only with exact Bladeburner membership and the official `getNextBlackOp() === null` result. Undefined replies and error strings never qualify. The INT preparation gate and the BN10 sleeve purchase/memory gate still apply before either hacking or BlackOps victory. Failed sleeve reads cannot silently bypass the latter. A world daemon missing on the first scan is rescanned later.

Bladeburner starts `spend-hashes.js` on home with rank/SP purchases and exact-argument duplicate detection. Insufficient home RAM for this optional helper produces a warning while Bladeburner continues. Default hash-spender eligibility no longer depends on whether buying more hacknet capacity is currently affordable. B09's scheduler is now repaired in the final backlog pass; the unused duplicate investment passes are removed and the four-hour continuous manager is retained.

`ascend.js` sells the initial eligible hashes in one bulk call. It no longer launches an absent or infinite reset-time hash process. Home RAM upgrades use the existing intended 80% phase allowance, fresh prices/cash, explicit success results and a finite iteration cap. Failed optional hash/RAM operations warn and continue. A missing reset callback aborts before killing scripts; the default callback is autopilot.

## Verification and live checks

```sh
node audit/2026-10-17-speedrun/checks/progression.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src ac9af0619ea15781e8e3cd693505cac6e057ab5a
```

The focused progression check executes real modules/functions against mocked Netscript transport. It covers the complete integer route and BN12 repeats, exact BlackOps success, late daemon visibility, preserved BN10/INT gates, late invitations, completion persistence and new-run isolation, farm RPC recovery, offloaded autopilot reuse, a bounded empty-join cycle, automatic-worker release, finite reset spending, missing callbacks, and optional hash-launch failure/deduplication. The seven existing positive check files also pass. Changed JavaScript parses and `git diff --check` passes.

The pinned 3.0.1 official RAM calculator reports:

| Entry point | Previous GB | New GB |
| --- | ---: | ---: |
| autopilot.js | 4.2 | 4.2 |
| bn1-guide.js | 8 | 8 |
| bladeburner.js | 4.3 | 3.3 |
| work-for-faction2.js | 8.5 | 8.5 |
| sleeve.js | 7.35 | 7.35 |
| farm-intel.js | 3.1 | 3.55 |
| bin/intel-farm-state.js | — | 2.65 |
| ascend.js | 7.05 | 8.65 |

Ascend's extra RAM comes from direct finite hash liquidation. The state helper runs alongside its caller on home; these figures do not prove every nested helper fits at every low-RAM checkpoint.

After pulling, restart affected managers to load the new route/imports. In a backed-up game save, verify one CashRoot/company preparation → farm → completion handoff, one BN6-only Bladeburner start, a final BlackOp below daemon hacking requirements, and BN10 sleeve/memory gating. Confirm reset-time spending and the autopilot callback. No game save, augmentation installation, or BN transition was performed during these offline checks.

## Subsequent completion and remaining measurement

The [final backlog pass](remaining-fixes.md) repairs B09/B13/B14/B15/B16, completes the B01/B02/B11 implementation, and fixes late corporation industry creation. Investment thresholds, alternative BN blocks and Go strength still need measurements before additional policy changes. Go strategy and batch scheduling remain unchanged.

Primary sources are the pinned official Bladeburner and Singularity API implementations, Source-File/BN definitions, and `Prestige.ts` invitation preservation, linked in [sources.md](sources.md). Official route guidance supports the mechanics; the exact order and farming bounds are our policy choices and need measurement.
