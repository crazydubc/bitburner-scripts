# Sleeve shock: when to recover, work, or rotate

**For XP or faction reputation, partial recovery can beat both extremes. For a wanted, affordable sleeve augmentation, at least one sleeve must reach exactly zero.** A mixed fleet can pursue both. Use remaining time until the objective, not time already spent in the BN. No universal shock threshold maximizes all of these goals.

## The XP calculation

For shock `S` on the game's 0–100 scale, work XP efficiency is `q = 1 − S/100`. A synchronized sleeve gives the player its shock-adjusted XP; at lower sync, the transfer is also multiplied by `sync/100`. A recovering sleeve can still receive XP from other working sleeves, scaled by its own recovery ratio. The single-sleeve table measures direct work XP, excluding incoming shared XP. Faction reputation is multiplied by `q`. The usual player augmentation installation does not reset sleeve shock; changing BitNodes does.

Let `I` be the sleeve's intelligence and `b = 1 + 0.75 × I^0.8 / 600`. With regular processing and no stored cycles, ordinary work removes `1.8 × b` shock points/hour; active recovery removes `5.4 × b`. An actually idle sleeve banks cycles rather than processing work. At zero INT, starting at 100 shock, that's **55.56 hours working** versus **18.52 hours recovering** to reach zero. At INT 230 the corresponding times are **50.65 and 16.88 hours**. Stored cycles, changed intelligence, damage and lower starting shock affect actual times.

For one sleeve with a fixed base XP rate, no aug purchase, and `H` hours left, set `s = S/100`, `r = 0.018 × b` and `a = 3r` (fractions/hour). Recover for `t` hours, then work. Until shock hits zero, total XP in equivalent full-efficiency worker-hours is:

```
XP(t) = (1 − s + a t)(H − t) + r(H − t)²/2
```

Moving a recovery interval ahead of a work interval leaves final shock unchanged before the cap and increases XP during that work. Thus a single recovery block followed by work suffices for this isolated objective. Accounting for the zero-shock cap, the maximizing recovery time is:

```
t = max(0, min(((a − r)H − (1 − s)) / (2a − r), (s − r/a)/a))
```

Equivalently, **continue active recovery while current efficiency is below `min(2/3, 2r × remainingHours)`; otherwise work**. For a fresh sleeve at 100 shock the short-window optimum is to recover for 40% of the window, then work. In a sufficiently long, XP-only run this stops at about **33.3 shock**, not zero. These numbers assume a constant work rate and no value from augmentations during that window.

| Hours remaining, starting at 100 shock / INT 0 | Recover first | Start working at shock | XP: partial | XP: work immediately | XP: fully recover first |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 4.00 h | 78.4 | 1.620 | 0.900 | 0 |
| 15 | 6.00 h | 67.6 | 3.645 | 2.025 | 0 |
| 24 | 9.60 h | 48.2 | 9.331 | 5.184 | 5.481 |
| 36 | 12.35 h | 33.3 | 20.568 | 11.664 | 17.481 |

For a sleeve **already at 73 shock** with five hours left at zero INT, work now: its 27% efficiency exceeds the 18% marginal threshold. Do not start a fresh 4–6 hour timer merely because an existing run is 10–15 hours old.

### When an augmentation changes the answer

The purchase gate is per sleeve and exact: even 0.00001 shock fails. Zero unlocks eligibility; it does not guarantee cash, availability, cooldown, or a worthwhile purchase. Sleeve augs persist across player aug installs within the BN. Buying one resets the sleeve's accumulated non-Intelligence skill XP, so its effective post-purchase rep or crime rate can differ from an advertised multiplier.

For a 24-hour window in the table, full recovery leaves `24 − 18.52 = 5.48` hours to use a new aug bundle. Its **effective** relevant XP rate would have to exceed `9.331 / 5.481 ≈ 1.70×` to beat the best unaugmented partial schedule. With a hypothetical immediately affordable 2× XP bundle, the model chooses full recovery and earns 10.96 equivalent hours. At 10 or 15 hours, full recovery cannot unlock that purchase from 100 shock under these assumptions. The calculator checks both partially recovered work and post-zero augmented work; this illustration does not claim a particular bundle delivers 2×.

## How the default uses the fleet

- Synchronize first. During an urgent gang-karma push or an explicitly requested crime, all synchronized sleeves can work and recover passively. At the same success probability, successful crime karma depends on sync, not shock; successful crime cash also has no direct shock penalty. Stats, success chance and other income sources still matter. The manager releases the workers when the gang-karma goal clears. Existing cash/reserve and sleeve-purchase guards are unchanged.
- With known rep jobs, keep workers on those jobs and recover the surplus concurrently. Keep an uninterrupted recovery slot for the next augmentation when multiple synchronized sleeves are available and shocked. A lone sleeve can serve an actual rep or Bladeburner goal immediately; it trades an earlier first aug for progress now. Without a concrete goal, retain the former schedule.
- With spare recovery workers, auto can transfer a **faction** job before zero. It uses the protected worker's estimated time to zero as its planning checkpoint, not a made-up BN completion time. A spare must be on the work side of the XP threshold while the incumbent is still on the recovery side. It must also improve the conservative same-job faction-rep comparison and preserve every relevant skill's XP rate. The relieved worker returns to recovery. Only one handoff is planned per tick, and the prior restart fix still releases the outgoing worker before the incoming assignment.
- No speculative early handoff for company work, active Bladeburner, paid training, cash pressure, or large stored-cycle backlogs on the participating sleeves. Prior worker capacity is retained during training/cash pressure/Bladeburner; Bladeburner keeps room beyond rep jobs when possible. Synthoid infiltration generates action counts without a direct shock multiplier, so zero shock is not a prerequisite for helping BN7.
- `auto` is the default. `--shock-policy staged` retains the original one-first schedule; `--shock-policy parallel` sends all synchronized shocked sleeves to recovery if earliest fleet-wide augmentation eligibility is the goal. Neither alternative is required for normal play. The XP-only examples above are comparisons, not timers forced on every sleeve.

## Measured policy comparison

Eight equally skilled sleeves, full sync, 100 initial shock, INT 0, two continuously useful faction jobs, sufficient cash, no training, no stored cycles or purchases. The model runs the production planner every 15 seconds and splits steps at zero shock. Rep is expressed as full-efficiency worker-hours at a fixed base rep rate; this is **not** a measured BN completion time.

| Policy | Rep by 15 h | Rep by 24 h | Aug-eligible at 24 h | All eight eligible |
| --- | ---: | ---: | ---: | ---: |
| Work immediately, recover passively | 4.05 | 10.37 | 0 | 55.56 h |
| Original staged recovery | 4.05 | 11.65 | 1 | 30.86 h |
| New auto with partial handoffs | 8.10 | 23.06 | 6 | 25.93 h |
| Full parallel recovery | 0 | 10.96 | 8 | 18.52 h |

Staged, auto and parallel all produce a first eligible sleeve at **18.52 h** here. The new schedule gives up fallback crime income: in the first 15 h the original used 75 background crime-worker-hours and auto used zero, while both kept the two rep routes staffed. Thus even a large rep improvement is not proof of faster completion when money is binding. For a **single** persistent rep job, working from the beginning gives earlier rep but can lose to recovering first over a long run. [Machine-readable comparisons](comparison.json) include INT 230, the single-sleeve case, the XP optimum and the hypothetical augmentation example.

## Restored tools and diagnostic cleanup

`dev.js` and `hacks.js` are restored from their last historical versions (the only source normalization is whitespace in a comment). They are downloaded by a normal pull and run only when invoked. The original cheat behavior is retained; none of the optional commented-out changes were enabled.

Removed the standalone `performance-diagnostic.js` and `stock-diagnostic.js` scripts and their obsolete standalone tests. HUD stats, stock valuation, Go stats, run logs, and the gameplay regressions still have active uses. The retirement catalog now recognizes both old diagnostics and no longer lists the restored tools. A complete successful sync verifies a backup and removes unchanged diagnostic scripts on the current host/deployment. Edited or running scripts and previously saved diagnostic data remain protected. A failed or partial listing cannot delete files.

If updating from the version that excluded `dev.js` and `hacks.js`, run the same command **twice**: the old updater downloads its replacement; the updated one restores all manual tools. Restart `sleeve.js` to load the policy.

```text
run git-pull.js --branch testing/bn1-go-audit
```

## Reproduction and sources

The source-based checks call the official per-cycle processing and recovery methods, XP/shock scaling, successful crime handling and zero-shock augmentation gate. A one-minute grid independently checks the closed-form XP optimum across 336 combinations of starting shock, remaining time, Intelligence and hypothetical augmentation effects. Integration tests exercise the real manager, helper calls, faction exclusivity, handoffs, retirement backups and fallback downloads. The restored manual utilities were compared with their Git history without running them against a save. Of 41 discovered regression suites, 39 passed; the two unrelated BN1/scan React UI fixtures were skipped because their separate dependencies were not installed here. All 119 deployed JavaScript files parsed. [Suite results](validation.json) and the [official RAM comparison](ram-impact.json) are included. `sleeve.js` remains 3.35 GB, `git-pull.js` 2.45 GB, and each restored manual entry point measures 1.60 GB when invoked.

```sh
python audit/2026-11-04-full-audit/run-checks.py ../bitburner-engine - audit/2026-11-07-sleeve-recovery/validation.json
node audit/2026-11-07-sleeve-recovery/checks/shock-model.mjs ../bitburner-engine --write
node audit/2026-11-04-sleeve-restart/checks/sleeve-restart.mjs ../bitburner-engine
node audit/2026-11-04-git-pull-prune/checks/git-pull-prune.mjs ../bitburner-engine
```

Official source, unchanged for these paths between the reported Steam 3.0.1 commit and the fixture checkout:

- [Sleeve processing, shock and augment purchases](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Sleeve.ts)
- [Recovery and individual work implementations](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Work)
- [Work-stat scaling, including the money exception](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/WorkStats.ts)
- [Faction rep formulas](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/formulas/reputation.ts)
