# Bitburner progression and speedrun audit — 2026-10-17

The highest-value work is fixing progression stalls and making the early-game launch/spending rules reliable. Keep the current hacking batcher as the performance baseline. Two confined batcher defects are documented separately; neither calls for replacing its scheduling design.

**The `testing/bn1-go-audit` branch combines the audit, BN1.1 on-screen prompts, and focused Go fixes for in-game testing.** The initial audit documented 18 repair candidates; B03 is fixed here and the other findings remain open. The current hacking batcher and $8b reserve policy are unchanged.

## Pull the combined testing branch

In the game terminal:

```text
home
run git-pull.js --branch testing/bn1-go-audit
```

Wait for `Pull complete` and check for download warnings. Keep `--branch testing/bn1-go-audit` on later pulls; the downloader's default remains `main`. If your older downloader falls back to a local file listing and misses the new guide, rerun the same command after it has updated itself.

On a fresh BN1.1, run `bn1-guide.js` first. Below 64 GB home RAM, the panel prints the next step and exits so coinflip has room; rerun it after each step. At 64 GB or more it refreshes automatically. Existing autopilot/Go processes need restarting to use their updated code.

For a single Go game without cheats, run `go.js --runOnce --disable-cheats` when another Go process is not running. Check the log for errors and whether play finishes normally. Record opponent, board size, wins/losses, and duration over repeated games before judging strength. The archived tactical rewrite is not active: it did not improve aggregate wins in the recorded comparison.

Combined-branch checks:

```sh
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/go-lifecycle.mjs
```

Both checks pass together. All 86 gameplay JavaScript files parse; the previously removed test directory stays removed. Live BN1 progression, tail layout, and Go win-rate changes still require in-game testing.

## Implementation follow-ups

The user clarified that BN1.1 guidance should appear on screen. The written runbook below is reference material for those prompts.

| PR | Scope |
| --- | --- |
| [#31 — BN1.1 on-screen guidance](https://github.com/crazydubc/bitburner-scripts/pull/31) | Adds `bn1-guide.js`, integrates the non-modal panel into autopilot, fixes B03, and corrects downloader fallback filenames. Start with `run bn1-guide.js` on a fresh BN1.1. |
| [#32 — Go correctness and assessment](https://github.com/crazydubc/bitburner-scripts/pull/32) | Fixes pattern crashes, stale opponent/move state, edge scans, and cheat threshold handling; secures winning two-pass finishes. Includes engine-backed comparisons and an archived tactical experiment that did not improve aggregate wins. |

PRs #31 and #32 are combined with the audit from [#33](https://github.com/crazydubc/bitburner-scripts/pull/33) on `testing/bn1-go-audit`; `main` is unchanged by this integration. The baseline reproductions below intentionally describe the original audited revision. B03's defect assertion now fails because its repair is applied; use the positive checks above to verify the combined implementation.

## Read in this order

| File | Purpose |
| --- | --- |
| [findings.md](findings.md) | 18 findings, source locations, reproduction evidence, and repair acceptance criteria |
| [bn1-guide.md](bn1-guide.md) | Practical instructions for a fresh BN1.1, including current-code workarounds |
| [bitnode-route.md](bitnode-route.md) | Proposed order for this automation suite, dependencies, and alternatives to benchmark |
| [optimization-plan.md](optimization-plan.md) | Implementation order and measurements that can establish real speed gains |
| [sources.md](sources.md) | Pinned repository/game references and scope limitations |
| [reproduce.mjs](reproduce.mjs) / [evidence.json](evidence.json) | Bounded offline reproductions and source/arithmetic checks |

## Conclusions

1. **Fix shared infrastructure first:** home-only RPC waits can hang indefinitely; reserve/configuration files are local to a host; cracker inventory is shifted; server purchases can violate the computed budget. These directly affect BN1 startup.
2. **Fix completion blockers next:** intelligence-farm readiness is stale, the sleeve buyer uses stale cash, reset tasks reference missing files, and Bladeburner access/completion handling misses valid BN6 progression.
3. **Move repeat rewards behind useful unlocks:** preserve BN1.1 → BN4.1–4.3, then finish SF1 and obtain SF5.1. Defer early BN11 and extra BN2/BN5 repetitions; make corporation, sleeves, and a working Bladeburner completion route available before the hard nodes.
4. **Optimize time to the next useful augmentation or BN completion.** Income per second alone does not capture faction reputation, restart delay, inaccessible APIs, wasted purchases, or manual interventions.

## Requirements preserved

- The **$8 billion reserve is intentional**: it stops stock purchases while `coinflip.js` is finishing. Do not remove it as an alleged optimization. B02 concerns whether that intent actually reaches remote consumers, plus a separate Daedalus stop flag that is not read.
- Preserve the successful batcher as the comparison baseline. Apply B15/B16 independently and verify completion order/security before changing allocation or target selection.
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
