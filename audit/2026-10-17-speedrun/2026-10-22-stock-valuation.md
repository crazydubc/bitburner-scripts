# Stock valuation availability and HUD recovery

**Follow-up:** [Faction planning during a stock outage](2026-10-22-stock-planning.md) addresses the subsequent faction-manager failure after these retries expire. It adds cash-only planning, explicit unavailable-portfolio metadata, and automatic installation/purchase protection with recovery. The original changes and evidence below remain applicable.

The reported warning was `stock.getPosition: Invalid stock symbol: ECP` from `bin/getStockValue.js`. The helper already obtains its symbols from `ns.stock.getSymbols()`; it does not hardcode ECP or reuse an old symbol list.

In the official v3.0.1 implementation, `getSymbols()` returns the static `StockSymbol` values, while `getPosition()` reads `SymbolToStockMap`. ECP belongs to the enum, but an absent map entry produces exactly this error. The regression executes those actual API functions with an empty/incomplete map and reproduces it. The user's live save was not inspected, so the event that made that entry unavailable is **not established**. Loading/resetting the market involves separate initialization code; this patch does not call those internal functions or reset a market.

The repository defect was allowing an unavailable stock snapshot to cancel the entire HUD update, including the later `Share Pwr`, income and reserve rows. It could also prevent initial HUD creation. A stale share-power display is not evidence that share workers themselves stopped.

## Changes

- `getStocksValue()` retries the complete valuation for an invalid-symbol error from a position/bid/ask lookup: at most three attempts, with two 250 ms waits. This applies to both the synchronous snapshot helper and the low-RAM per-call fallback. Every attempt rereads API access, capacity, symbols and positions; any partial sum is discarded.
- Persistently unreadable holdings still throw to callers. The valuation helper does not invent a zero or omit an invalid symbol. Known lack of TIX access and genuinely empty portfolios retain their existing zero-value behavior. Unexpected errors are not retried; malformed access results are rejected.
- The snapshot helper validates the position tuple before using it, matching the fallback's existing finite-value checks.
- `stats.js` catches valuation errors at the stock row, displays **Unavailable**, and keeps collecting/rendering other stats. Normal values return automatically after recovery. Repeated stock warnings are limited to one per minute, regardless of changing helper PIDs. Hidden stock rows and stockmaster's own HUD remain respected.

No purchases, sales, market reinitialization, reserve changes, batch changes or extra persistent scripts are introduced. Existing financial callers retain their own error policies.

## Validation

Six focused suites pass: `stock-valuation`, `speedrun-improvements`, `augmentation-reset`, `stock-liquidation`, `api-errors`, and `rpc-reserve`.

The new fixture executes the actual helper and RPC client with the official stock API implementation. It covers initial ECP failure, recovery on either RAM path, failure after an earlier holding was valued, changed positions across retries, persistent failure, unexpected/malformed data, no TIX access, empty holdings and access loss. It also executes the complete HUD-data reader through failure and recovery, checking share power, income, reserve, final rows, warning throttling and hidden-row behavior.

The official RAM comparison against `dc8e0d7` shows no cost changes: stats **3.75 GB**, stock snapshot **9.65 GB**, autopilot **4.2 GB**, faction manager **24 GB**, kernel **5.85 GB**. `ram-impact.mjs` now includes stats and gives clearer override diagnostics. These remain offline checks; persistent game-side market corruption would require separate diagnosis.

```sh
node audit/2026-10-17-speedrun/checks/stock-valuation.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/speedrun-improvements.mjs
node audit/2026-10-17-speedrun/checks/augmentation-reset.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/rpc-reserve.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src dc8e0d7
```

Pull `testing/bn1-go-audit` completely, then restart **stats.js** from the updated home copy. Restart autopilot to load the shared valuation retry for its own reads; subsequent faction-manager launches load it automatically. No kernel restart is required for this stock-only follow-up.

Primary source: official v3.0.1 commit `1da7316ffd9d281b45a86c4c54ec532276557892`, `src/NetscriptFunctions/StockMarket.ts`, `src/StockMarket/Enums.ts`, `src/StockMarket/StockMarket.ts`, and `src/engine.tsx`.
