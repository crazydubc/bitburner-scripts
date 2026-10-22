# Persistent stock unavailability: cause not yet established

The retry and HUD changes prevent stock read failures from terminating other automation. They do not fix the underlying read failure. `Unavailable` now covers more than invalid symbols, including valuation-helper launch failures. The current HUD label alone does not identify the current error.

## What the PR demonstrably broke

- The guarded purchase quote passed `"Long"` / `"Short"` where the stock API requires `"L"` / `"S"`. Commit `80e2cfb` corrected the enum values. The original quote mock ignored the arguments and missed this defect.
- The purchase helper's RAM budget omitted `getHostname()`'s 0.05 GB charge. The resulting dynamic RAM termination produced `Purchase helper exited before reporting its result`. The subsequent purchase-RAM correction and official-engine enforcement checks are documented in [remaining-fixes.md](remaining-fixes.md#purchase-helper-ram-regression).

Neither defect explains a read-only `getPosition('ECP')` or `getMaxShares('ECP')` rejecting ECP. The live cause of those errors remains unconfirmed.

## What the comparison establishes

The pre-PR `getStocksValue()` in base commit `1c664793` already enumerated `getSymbols()` and queried every symbol's ask, bid and position. The PR's synchronous snapshot reads positions first, so it changes which lookup fails first when a symbol is unreadable. Comparing these paths does not establish why ECP became unreadable.

The shared `bin/stockRun.js` still forwards the supplied symbol unchanged. Its PR change adds an effective RAM check. The pinned [official v3.0.1 stock API](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/NetscriptFunctions/StockMarket.ts) enumerates a static symbol list but reads positions and limits from the live symbol map. An absent map entry reproduces the reported errors in offline checks; deliberately removing that entry is a test condition, not evidence of what removed or failed to populate it in this game.

## Collect the missing evidence

Pull the complete branch from home, wait for `Pull complete`, then run:

```text
run stock-diagnostic.js
```

This one-shot script prints a report and writes its full results to `/Temp/stock-diagnostic.json` on the server where it runs. It captures game version/platform, TIX/WSE access, home RAM and helper availability, direct reads for every listed symbol, the real RPC reads for ECP, and the actual portfolio valuation path. Direct ECP reads are repeated after the helpers to expose changes during collection. It does not trade, purchase access, stop other scripts, or manipulate game internals.

The diagnostic uses **13.35 GB**. Helper comparisons additionally need at least **5.6 GB free on home** while it runs; the snapshot valuation uses 9.65 GB if available. RAM snapshots include the diagnostic. Insufficient RAM or missing files are reported as skipped probes rather than stock API failures. Other automation can still change free RAM after a probe's initial check.

Paste the terminal report first. The detailed JSON preserves all symbols' results if further inspection is needed.

Interpretation depends on the observed output:

- Direct and helper reads both reject ECP: the failure also occurs without our transport. Investigate the exact game build and market state; this does not by itself prove a game/save defect or absolve earlier scripts of responsibility.
- Direct reads succeed while helper reads fail: inspect the reported transport, RAM or helper error.
- Reads succeed while valuation fails: inspect that specific aggregation/launch error.
- Everything succeeds: determine which running process still displays `Unavailable` and whether it loaded the current files. A single successful report cannot rule out an intermittent failure.

## Validation and limits

`stock-diagnostic.mjs` runs the diagnostic with the actual shared RPC helpers and official read API fixture. It verifies healthy results, listed-but-unreadable ECP, helper-only failure, insufficient home RAM, missing helpers and no TIX access. These cases pass. The official RAM comparison against `4ad7e19` measures the diagnostic at 13.35 GB and reports no changes to existing scripts.

```sh
node audit/2026-10-17-speedrun/checks/stock-diagnostic.mjs ../bitburner-engine
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 4ad7e19
```

No live diagnostic output is available yet. This change supplies evidence collection, not a claimed repair of the persistent failure.
