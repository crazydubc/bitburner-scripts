# Stock lookup failure confirmed; initiating event unresolved

The retry and HUD changes prevent stock read failures from terminating other automation. They do not fix the underlying read failure. `Unavailable` now covers more than invalid symbols, including valuation-helper launch failures. The current HUD label alone does not identify the current error.

## Live diagnostic received — October 22

The user's v1 report at `2026-10-22T21:13:16.988Z` identifies Steam **3.0.1, commit `3162fd2`**, with both TIX and WSE access and approximately **871.95 GB free on home** while the diagnostic runs. All four expected helpers are present with their expected RAM costs.

- `getSymbols()` returns all **33** standard tickers.
- Direct `getPosition`, `getMaxShares`, `getBidPrice` and `getAskPrice` each fail for **all 33** tickers with invalid-symbol errors.
- The real RPC helpers fail for ECP in the same way; valuation fails in its snapshot helper.
- Direct ECP reads still fail after the helper probes.

In the exact [Steam build's stock API](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/StockMarket.ts), these errors mean the requested entries in `SymbolToStockMap` are null or absent. Enumeration instead returns the static `StockSymbol` values. Thus the immediate failure is now established: all standard symbols are unreadable through the game's live lookup. It is not an ECP spelling problem, missing TIX entitlement, a helper-only transport failure, or insufficient RAM in this diagnostic.

This does **not** establish what left the lookup in this state, or whether the underlying full-name market records and holdings still exist. The observed failure does not by itself prove that no earlier script could have contributed to the state.

## Recovery supported by the source

The exact build's [startup path](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/engine.tsx) calls `initSymbolToStockMap()` after loading a save when TIX or WSE access exists. That [mapping routine](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/StockMarket/StockMarket.ts) points tickers at existing market records; it does not recreate stocks or clear positions.

1. Export a backup through Options → Export Game, then save normally.
2. Fully close Bitburner and reopen it through Steam. Restarting stockmaster alone does not run the engine's startup mapping code.
3. Run `stock-diagnostic.js` again. If the saved market records are intact, the map rebuild should restore reads. This remains an expected recovery, not a confirmed live result.

If this diagnostic already followed a full restart, or the failure survives it, inspect the Stock Market page in All stocks mode with its watchlist cleared and inspect the saved market records before choosing a repair. A blank page is useful evidence but does not alone prove holdings are gone. Rebuying TIX/WSE is ineffective when the ownership flags are already true: those API methods return early. Do not use `initStockMarket()` as a lookup repair; it deletes and recreates stock records, including their positions. Do not install augmentations or perform a soft reset solely to address this failure.

An isolated offline execution of **the exact `3162fd2` mapping function** restored all 33 symbol lookups from fixture market records while preserving object identity, serialized fields, long/short positions and the resulting $5.2m fixture valuation. Rebuilding from empty records left all 33 absent. This verifies the mapping routine's behavior and its limitation; it does not execute a full Steam reload or inspect the user's saved records. The stock/load/prestige/schema sources in the earlier pinned `1da7316` checkout are byte-identical to this Steam build.

## What the PR demonstrably broke

- The guarded purchase quote passed `"Long"` / `"Short"` where the stock API requires `"L"` / `"S"`. Commit `80e2cfb` corrected the enum values. The original quote mock ignored the arguments and missed this defect.
- The purchase helper's RAM budget omitted `getHostname()`'s 0.05 GB charge. The resulting dynamic RAM termination produced `Purchase helper exited before reporting its result`. The subsequent purchase-RAM correction and official-engine enforcement checks are documented in [remaining-fixes.md](remaining-fixes.md#purchase-helper-ram-regression).

Neither defect explains a read-only `getPosition('ECP')` or `getMaxShares('ECP')` rejecting ECP. The initiating event behind the missing live lookup entries remains unconfirmed.

## What the comparison establishes

The pre-PR `getStocksValue()` in base commit `1c664793` already enumerated `getSymbols()` and queried every symbol's ask, bid and position. The PR's synchronous snapshot reads positions first, so it changes which lookup fails first when a symbol is unreadable. Comparing these paths does not establish why ECP became unreadable.

The shared `bin/stockRun.js` still forwards the supplied symbol unchanged. Its PR change adds an effective RAM check. The pinned [official v3.0.1 stock API](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/NetscriptFunctions/StockMarket.ts) enumerates a static symbol list but reads positions and limits from the live symbol map. An absent map entry reproduces the reported errors in offline checks; deliberately removing that entry is a test condition, not evidence of what removed or failed to populate it in this game.

## Diagnostic usage

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

The live diagnostic is recorded above. It establishes the failed lookup layer; the initiating event, saved market contents and outcome of a full restart remain unconfirmed. No automatic market reinitialization or other gameplay change accompanies this evidence update.
