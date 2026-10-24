# Stockmaster recovery from unreadable market symbols

The next ECP report came from `getMaxShares()` in stockmaster startup. The earlier fixes protected valuation consumers, but stockmaster still initialized its symbol metadata outside error handling. Its trading-loop catch was also commented out, and liquidation errors could terminate the process that was keeping buying paused.

The official API's `getMaxShares()` uses the same live symbol-map lookup as price reads. The reported error is consistent with an entry missing from that map even though `getSymbols()` lists ECP. This was verified against the pinned v3.0.1 engine and [the current official API source](https://github.com/bitburner-official/bitburner-src/blob/dev/src/NetscriptFunctions/StockMarket.ts). The cause in the user's live game is still unconfirmed.

## Changes

- Startup and trading now share recovery handling for stock API `Invalid stock symbol` errors. The process remains alive, pauses stock actions, and waits five seconds between attempts. Warnings are limited to once per minute, with consecutive identical messages also deduplicated. Its HUD reads `Unavailable` during the outage.
- Every recovery rebuilds the symbol list and maximum-share metadata, then rereads prices, positions, cash and reserve before making decisions. A partially read market is never treated as a complete snapshot. An interrupted trading pass is discarded instead of replaying its pending orders.
- Pre-4S history and cycle estimates are rebuilt after missing data. The trader waits for sufficient new history before trading on those estimates. 4S trading resumes after a successful complete refresh.
- Manual `--liquidate` and `-l` processes remain alive during invalid-symbol failures, preserving their no-buy role. `--liquidate-once` also waits through these failures. Each retry rereads positions, so shares already sold before the error are not sold again. The ordinary persistent hold and one-shot exit behavior remain intact after the liquidation pass succeeds.
- A failed or rejected buy no longer books an extra commission against the profit display. That accounting now follows a successful purchase.
- Mock-mode positions survive reinitialization. Two existing short-position field-name mismatches were corrected so refresh does not erase simulated shorts.
- Malformed symbol lists and unrelated exceptions still fail visibly. No generic retry was added to the shared stock RPC or purchase helpers, and no game-internal market reset is attempted.

## Validation

`stockmaster-recovery.mjs` executes the entire actual stockmaster module with the real RPC helper and pinned official stock read APIs. A deterministic adapter records simulated trade execution; stockmaster's selection, sizing and liquidation logic remain the production implementation. The common official-market fixture is now shared with the earlier valuation tests.

Coverage includes persistent startup failure, failures late in all six market-read stages, throttled HUD warnings, pre-4S history rebuilding, changed reserves during recovery, partial trading and liquidation, no-TIX/duplicate-instance behavior through the existing liquidation suite, failed-buy commission accounting, mock holdings, malformed lists and unexpected errors. Three healthy-market scenarios produce exactly the same trade choices, sizes and final cash as `2e66a6b`, including casino and reserve gating.

Eight focused suites pass: `stockmaster-recovery`, `stock-valuation`, `stock-liquidation`, `resource-purchases`, `speedrun-improvements`, `augmentation-reset`, `api-errors` and `rpc-reserve`. The official RAM comparison against `2e66a6b` reports no increases; stockmaster remains **6.05 GB**.

```sh
node audit/2026-10-17-speedrun/checks/stockmaster-recovery.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/stock-valuation.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/resource-purchases.mjs
node audit/2026-10-17-speedrun/checks/speedrun-improvements.mjs
node audit/2026-10-17-speedrun/checks/augmentation-reset.mjs
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/rpc-reserve.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 2e66a6b
```

Pull `testing/bn1-go-audit` and restart stockmaster, or let autopilot relaunch it from the updated home copy if it has already exited. This patch keeps automation stable while reads are unavailable; it does not repair the game's market. Saving, fully closing and reopening Bitburner remains a recovery step to try. If the error persists across a full restart, record the game version and whether its Stock Market screen can display ECorp before investigating the save.
