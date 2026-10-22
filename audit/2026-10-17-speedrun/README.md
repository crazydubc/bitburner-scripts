# Bitburner progression and speedrun audit — 2026-10-17

The highest-value work is fixing progression stalls and making the early-game launch/spending rules reliable. Keep the current hacking batcher as the performance baseline. Two confined batcher defects are documented separately; neither calls for replacing its scheduling design.

**The `testing/bn1-go-audit` branch / [PR #34](https://github.com/crazydubc/bitburner-scripts/pull/34) now contains implemented fixes and positive offline checks for all 18 original findings.** It combines BN1.1 prompts, focused Go fixes, resource/purchase repairs, corporation lifecycle/expansion fixes, the revised BN route, and the remaining infrastructure/batcher corrections. See [remaining-fixes.md](remaining-fixes.md) for the final backlog pass and its limits. Batch timing/scheduling and the $8b reserve formula are unchanged. Live validation and route/performance measurements remain necessary.

**October 22 review:** [Current outstanding findings](2026-10-22-outstanding-review.md) records the corrected sharing-buffer regression and two further faction-manager issues: unnecessary NeuroFlux donations and partial-SF4 purchase RAM outside BN4. Those two findings remain open. All 22 current positive suites pass; passing fixtures do not cover every gameplay state.

**Stock valuation recovery:** [ECP lookup and HUD availability](2026-10-22-stock-valuation.md) reproduces a valid listed symbol whose position is unreadable in the official API. Whole valuations retry up to three times on that error; persistent failure stays unknown. The HUD displays `Unavailable` for stocks while continuing to refresh share power and other stats, with warnings limited to once per minute. The [faction-planning follow-up](2026-10-22-stock-planning.md) now continues planning using cash and explicitly marks stock holdings as unknown. Automatic installation waits for readable holdings, then resumes automatically; an existing Daedalus reserve is preserved. Six targeted suites and the official RAM comparison pass with no RAM increases. Pull and restart autopilot; subsequent faction-manager launches load the fix. Restart stats if the preceding HUD fix is not yet loaded. For a persistently unreadable market, try saving, fully closing and reopening the game.

**Stockmaster market recovery:** [Startup, trading and liquidation](2026-10-22-stockmaster-recovery.md) now wait through invalid-symbol errors with five-second retries and throttled warnings. Recovery rereads the market and rebuilds forecasts before trading; liquidation rereads remaining positions after partial sales. Eight focused suites pass, including healthy-market trade comparisons, with stockmaster unchanged at 6.05 GB. Pull and restart stockmaster to load this follow-up.

**BitNode-aware sharing:** [Share allocation and controls](2026-10-20-sharing.md) enables spare-RAM sharing automatically in BN1 before SF4, then follows player/sleeve faction work in BN4 or with SF4. Explicit `on`/`off` settings still override the default. It prioritizes sharing over optional Stanek charging and applies home/host buffers. The continuity follow-up keeps workers through batch boundaries and calculations; the planner counts their RAM as reclaimable, and the dispatcher stops them only where a hacking launch needs that RAM. Both main-target and botnet dispatches support the handoff. The old 1.2 TB gate and 6 GB divisor are gone. All 23 current positive suites pass, including delayed BN1/BN4 calculations and 24 dispatcher comparisons. Kernel remains 5.85 GB and workers 4.1 GB; the temporary dispatcher grows from 4.0 to 4.9 GB. Pull the complete branch and restart kernel from home to load the new handoff together. Autopilot can relaunch it; no separate sharing manager is needed. The BN1 panel explains automatic sharing; no manual toggle is required.

The percentage buffer now uses **available capacity, including owned share workers**, rather than total installed RAM. With 4 TB home and 97 GB free, default settings allocate 32.8 GB to sharing and retain 64.2 GB. Pull and restart kernel from the updated home copy to load this correction.

**Measured Go board defaults:** [Fixed boards and favor throughput](2026-10-20-go-board-profile.md) adds `--board-size profile` as the default, based on the supplied results. Netburners, Slum Snakes, Tetrads and Daedalus use 5×5; The Black Hand uses 7×7; Illuminati uses 13×13; the hidden opponent stays 19×19. Favor estimates account for consecutive wins and game time. Optional adaptive favor routes choose and execute the board forecast to reach the remaining rewards fastest. Three Go suites and the official RAM comparison pass; Go remains 3.5 GB. Restart Go after pulling, and use `--board-size profile` if an older config pins `auto` or a number.

**Goal-aware Go:** [Opponent selection and funded donation favor](2026-10-20-go-goals.md) replaces the default random rotation with current crime/combat, reputation, cash-production, and hacking priorities. A measured short Go favor route can take priority when cash above reserve covers a useful augmentation and its donation bill. All 21 regression checks pass; Go remains 3.5 GB. Pull, restart Go from home, and use `--opponent auto` if an older config pins another mode. Before SF4, `--goal rep/crime/combat/money/hacking` supplies the work goal explicitly.

**Upgrade hotfix:** `c6a62fd` broke old offloaded calculator callers after a pull. The [batch startup hotfix](batch-upgrade-hotfix.md) restores the old argument contracts and tests the actual old-utility/new-helper combination. Pull again and restart kernel/autopilot from updated home files as described there.

**Stock quote hotfix:** the shared purchase guard also passed `"Long"`/`"Short"` to an API that requires `"L"`/`"S"`. It now uses `ns.enums.PositionType`. Stricter checks reproduce the original failure and verify both purchase paths through the remote caller/home helper, including the $8b reserve and casino gate. See [the stock regression notes](remaining-fixes.md#stock-position-regression--2026-10-18), then pull the same testing branch.

**Purchase RAM hotfix:** the follow-up `Purchase helper exited before reporting its result` error exposed a separate missing 0.05 GB charge for `getHostname()`. Stock helpers now allocate 7.25 GB instead of 7.20 GB. The [RAM regression notes](remaining-fixes.md#purchase-helper-ram-regression) explain why the game killed the helper before its error handler could reply and document checks against the official RAM enforcement code.

**Darknet discovery fix:** offline devices return an empty model ID. Both discovery passes and authentication dispatch now skip those unavailable records, and cached empty passwords are reused correctly. See [the darknet lifecycle notes](remaining-fixes.md#darknet-discovery) for the reproduced warning, checks, and worker restart instructions.

**Automatic infiltration / SoA:** autopilot now enables bounded infiltration sessions after coinflip, joins Shadows of Anarchy, and buys WKS first. Other SoA augmentations can fill the Daedalus count within the reserve/spending limits. Pull and restart autopilot; see the [infiltration follow-up](2026-10-18-infiltration-adaptive-go.md#automatic-selection-through-autopilot) for the optional BN1 faction recipient, stop/configuration controls, and live-test limits. The same follow-up documents adaptive Go board selection.

**Planning/upgrade follow-up:** batch read-only faction metadata, refresh favor during a running installation, honor reputation/infiltration polling deadlines, and upgrade cloud RAM directly to the largest affordable size. All 19 checks pass with no RAM increase for existing scripts. See [the throughput follow-up](2026-10-18-throughput-followup.md) for evidence and restart instructions.

**Time-based reset follow-up:** include every NF level's stat value and wait only for a worthwhile goal with a bounded ETA. There is no twenty-augmentation target. Add goal/decision logging, count first NF correctly for Daedalus, and finish active infiltration sessions before installing. All 20 checks pass with no RAM increase. See [the reset follow-up](2026-10-19-neuroflux-reset.md).

## Pull the combined testing branch

In the game terminal:

```text
home
run git-pull.js --branch testing/bn1-go-audit
```

Wait for `Pull complete` and check for download warnings. Keep `--branch testing/bn1-go-audit` on later pulls; the downloader's default remains `main`. If your older downloader falls back to a local file listing and misses the new guide, rerun the same command after it has updated itself.

On a fresh BN1.1, run `bn1-guide.js` first. Below 64 GB home RAM, the panel prints the next step and exits so coinflip has room; rerun it after each step. At 64 GB or more it checks every five seconds and restarts a missing autopilot whenever 48 GB is free. It recognizes offloaded instances and has no once-per-cycle restriction. Rerun it after each installation, or use `--manual` for prompts only. Existing autopilot/Go processes need restarting to use their updated code.

The guide includes early darknet purchase/Charisma advice, `--roadmap` faction guidance, and an `--install` checklist. Leave autopilot running when using `run stockmaster.js --liquidate`: the liquidator sells, stays active without buying, and blocks normal trading until stopped or reset. Automated reset/Daedalus callers use the separate `--liquidate-once` mode. See [bn1-screen-guide.md](bn1-screen-guide.md).

For a single Go game without cheats, run `go.js --runOnce --disable-cheats` when another Go process is not running. Check the log for errors and whether play finishes normally. Record opponent, board size, wins/losses, and duration over repeated games before judging strength. The archived tactical rewrite is not active: it did not improve aggregate wins in the recorded comparison.

Combined-branch checks:

```sh
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/augmentation-reset.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/stock-valuation.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/stockmaster-recovery.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/resource-purchases.mjs
node audit/2026-10-17-speedrun/checks/darknet-lifecycle.mjs
node audit/2026-10-17-speedrun/checks/rpc-reserve.mjs
node audit/2026-10-17-speedrun/checks/go-lifecycle.mjs
node audit/2026-10-17-speedrun/checks/corporation-lifecycle.mjs
node audit/2026-10-17-speedrun/checks/hash-spending.mjs
node audit/2026-10-17-speedrun/checks/progression.mjs
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/remaining-paths.mjs
node audit/2026-10-17-speedrun/checks/purchase-ram.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/batch-correctness.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/batch-upgrade-compatibility.mjs
node audit/2026-10-17-speedrun/checks/speedrun-improvements.mjs
node audit/2026-10-17-speedrun/checks/infiltration.mjs
node audit/2026-10-17-speedrun/checks/go-adaptation.mjs
node audit/2026-10-17-speedrun/checks/share-allocation.mjs
node audit/2026-10-17-speedrun/checks/share-handoff.mjs
node audit/2026-10-17-speedrun/checks/go-goals.mjs
node audit/2026-10-17-speedrun/checks/soa-progression.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/progression-throughput.mjs /path/to/bitburner-src
```

The twelve earlier checks passed before the purchase RAM hotfix. That fix adds `purchase-ram.mjs` and reruns `api-errors`, `remaining-paths`, `stock-liquidation` and `resource-purchases`; all five pass. The darknet follow-up passes `darknet-lifecycle` and `resource-purchases`, and the official calculator confirms its 12.55 GB RAM cost is unchanged. The batch-correctness command compares calculations with the pinned engine checkout, and purchase-ram uses its effective cost table and dynamic RAM enforcement/termination functions. The official RAM check and restart/live-test notes are in [remaining-fixes.md](remaining-fixes.md) and [batch-upgrade-hotfix.md](batch-upgrade-hotfix.md). Live BN1 progression, tail layout, batch recovery, corporation behavior and Go win rates still require in-game testing.

## Implementation follow-ups

The user clarified that BN1.1 guidance should appear on screen. The written runbook below is reference material for those prompts.

| PR | Scope |
| --- | --- |
| [#31 — BN1.1 on-screen guidance](https://github.com/crazydubc/bitburner-scripts/pull/31) | Adds `bn1-guide.js`, integrates the non-modal panel into autopilot, fixes B03, and corrects downloader fallback filenames. Start with `run bn1-guide.js` on a fresh BN1.1. |
| [#32 — Go correctness and assessment](https://github.com/crazydubc/bitburner-scripts/pull/32) | Fixes pattern crashes, stale opponent/move state, edge scans, and cheat threshold handling; secures winning two-pass finishes. Includes engine-backed comparisons and an archived tactical experiment that did not improve aggregate wins. |

PRs #31 and #32 are combined with the audit from [#33](https://github.com/crazydubc/bitburner-scripts/pull/33) on `testing/bn1-go-audit`; `main` is unchanged by this integration. The baseline reproductions below intentionally describe the original audited revision. Defect assertions for repaired paths now fail as expected; use the positive checks above to verify the combined implementation.

The earlier [resource/purchase follow-up](resource-purchase-fixes.md) fixes cloud purchase budgets, stale sleeve cash/result handling, skipped sleeve augmentations, rooted-RAM eligibility, and darknet stasis worker/helper capacity. Its reserve/RPC limitations are addressed in the [final backlog pass](remaining-fixes.md). Restart the affected managers/workers after pulling.

The subsequent [helper/state follow-up](helper-state-fixes.md) adds bounded failed launches, dead-child recovery, effective Singularity RAM budgets, authoritative home reserve state, configuration deployment and persistent home fallback. An official-source RAM check preserves the guide's 8 GB cold-start fit and accounts for the added manager costs. The [reported Go baseline](go-assessment.md#user-reported-game-baseline--2026-10-17) is 26 wins from 30 games; Illuminati accounts for three of four losses. No Go strategy change accompanies this follow-up.

The [corporation follow-up](corporation-cross-bn.md) fixes creation eligibility/reserve checks, public-corporation resumption, and a $10^70 revenue gate that delayed dividends after all investments. It retains the 1% default payout with working-capital checks and keeps all four private offers. It also fixes B12 and makes hash funding explicit, with non-cash purchases preceding bulk cash sales. The follow-up explains the $150b entry cost, SF3.3's free APIs, hash commands, BN penalties and remaining experiments. Restart autopilot, corporation and hash-spending processes after pulling.

## Read in this order

| File | Purpose |
| --- | --- |
| [findings.md](findings.md) | 18 findings, source locations, reproduction evidence, and repair acceptance criteria |
| [bn1-guide.md](bn1-guide.md) | Practical instructions for a fresh BN1.1, including current-code workarounds |
| [bitnode-route.md](bitnode-route.md) | Implemented testing-branch order, rationale, and alternatives to benchmark |
| [progression-fixes.md](progression-fixes.md) | B05/B07/B08 fixes, integer route selection, finite intel farming, reset checks and live-test notes |
| [optimization-plan.md](optimization-plan.md) | Implementation order and measurements that can establish real speed gains |
| [resource-purchase-fixes.md](resource-purchase-fixes.md) | B04/B06/B10/B17/B18 changes, verification, and live-test notes |
| [helper-state-fixes.md](helper-state-fixes.md) | Earlier B01/B02/B11 repairs and RAM checks; superseded limits are marked |
| [remaining-fixes.md](remaining-fixes.md) | Final B01/B02/B09/B11/B13/B14/B15/B16 repairs, corporation expansion, checks and live-test limits |
| [corporation-cross-bn.md](corporation-cross-bn.md) | Corporation lifecycle/payout repairs, B12, funding options, BN suitability and remaining experiments |
| [sources.md](sources.md) | Pinned repository/game references and scope limitations |
| [reproduce.mjs](reproduce.mjs) / [evidence.json](evidence.json) | Bounded offline reproductions and source/arithmetic checks |

## Conclusions from the original audit

1. **Fix shared infrastructure first:** home-only RPC waits can hang indefinitely; reserve/configuration files are local to a host; cracker inventory is shifted; server purchases can violate the computed budget. These directly affect BN1 startup.
2. **Fix completion blockers next:** intelligence-farm readiness is stale, the sleeve buyer uses stale cash, reset tasks reference missing files, and Bladeburner access/completion handling misses valid BN6 progression.
3. **Move repeat rewards behind useful unlocks:** preserve BN1.1 → BN4.1–4.3, then finish SF1 and obtain SF5.1. Defer early BN11 and extra BN2/BN5 repetitions; make corporation, sleeves, and a working Bladeburner completion route available before the hard nodes.
4. **Optimize time to the next useful augmentation or BN completion.** Income per second alone does not capture faction reputation, restart delay, inaccessible APIs, wasted purchases, or manual interventions.

## Requirements preserved

- The **$8 billion reserve is intentional**: it is intended to prevent stock buying while `coinflip.js` finishes. The branch reads/writes the reserve on home, enforces the Daedalus launch flag, and requires verified $10b casino earnings before buying long or short positions.
- Preserve the successful batcher's timing/scheduling as the comparison baseline. B15/B16 correct arithmetic, argument/result types and security calculations; verify live completion order/money/security before considering allocation or target-policy experiments.
- Preserve the corporation sequence: six-city Agriculture bootstrap → Tobacco in investment round 2 → Chemical. This audit proposes no replacement corporation strategy.
- After SF5, preserve CashRoot + all ten corporate faction invitations → intelligence farming → resume the **same BN**. No BitFlume transition is proposed.
- BN8 remains part of normal progression.

## Evidence and limits

Audited scripts: [`a05225d5c63d877e35ba7d34d70d7adbbff9cc69`](https://github.com/crazydubc/bitburner-scripts/tree/a05225d5c63d877e35ba7d34d70d7adbbff9cc69).

Game mechanics reference: official stable source [`1da7316ffd9d281b45a86c4c54ec532276557892`](https://github.com/bitburner-official/bitburner-src/tree/1da7316ffd9d281b45a86c4c54ec532276557892), whose `Constants.ts` reports **3.0.1**. Your running game version, save, SF inventory, and live performance were not inspected.

- All 85 existing JavaScript files passed `node --check`.
- The evidence runner covers all 18 finding IDs using a mixture of real functions with mocked Netscript, extracted real functions, structural assertions, and arithmetic fixtures. It does **not** execute the game or emulate its RAM accounting.
- This is a prioritized audit, not exhaustive proof of correctness. Corporation market behavior, Go strength, every contract solver, and darknet puzzle coverage were not exhaustively validated.
- No percentage speedup or universally fastest route is claimed. The route is a source-informed proposal tailored to these scripts and the stated preferences.

Run from the repository root with Node 24:

```sh
node audit/2026-10-17-speedrun/reproduce.mjs
```

The runner describes defects in the audited revision. A repaired implementation should make the corresponding defect assertions fail; update or retire those checks when adding positive regression coverage. Do not restore bugs to keep this audit green.
