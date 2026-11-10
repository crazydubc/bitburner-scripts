# BN3.1: Tobacco warehouse full before its first product

The reported figures match the old boost optimizer **exactly** when it budgets an entire 2,240-space Tobacco warehouse to boosters:

| Material | Units | Storage used |
| --- | ---: | ---: |
| Hardware | 9,394 | 563.640 |
| Robots | 1,083 | 541.500 |
| AI Cores | 5,437 | 543.700 |
| Real Estate | 118,231 | 591.155 |
| **Total** | | **2,239.995** |

Before a product is finished, or when the office has no manufacturing productivity, the old manager could estimate zero working storage. The 0.005 space left cannot accommodate one Plant (0.05). The game's purchasing **and** export code round available capacity down to whole input units. Consequently neither buying Plants nor receiving a shipment can start production. With no product in stock, a manual `MAX` at `MP` sale brings in no product revenue.

**Fix.** Tobacco boost targets reserve at least 10% of total capacity for incoming stock, above other goods already stored. A larger forecast for input/output space still wins. At 2,240 capacity that reserves at least 224 space in the targets, enough for 4,480 Plants before other deliveries. Rounded booster units cannot exceed the budget. The space is usable by production and deliveries, not a requirement that the warehouse always look 10% empty.

If Plants cannot fit, the normal purchase phase cancels the four managed booster buys and sells only excess boosters at market price. This also repairs an existing jam if the ordinary round-two boost routine is waiting on Agriculture. The sell amount uses current inventory and the engine's per-cycle `MAX`; even a persistent order or several market cycles processed together cannot run the retained stock below its target. No added warehouse purchase, product retirement, new game script, or change to product pricing is necessary for this repair.

**In the game:** From home run `run git-pull.js --branch testing/bn1-go-audit`. Stop the old `corporation.js` in Active Scripts and let autopilot relaunch it. Watch Tobacco's storage breakdown and the **Prod** and **Sell** quantities for v1 through the following corporation cycles. Plants can be consumed immediately; a zero Plants balance by itself is not evidence of an ongoing jam. How quickly excess boosters sell depends on your offices and market. Division profit also includes expenses.

**Verification:** [Regression fixture](checks/tobacco-warehouse.mjs) reproduces the exact inventory on the previous testing commit, including repeated zero sales at `MAX/MP` and a rejected shipment even from a stocked supplier. With the same capacity and the fix, the official purchasing/export, manufacturing, sale-amount parser, and sales methods accept Plants, make v1, and generate revenue from the product itself. Coverage includes R&D-only cities, stored unrelated goods, larger production forecasts, a paused normal boost routine, restart-style stale buy orders, and sell floors across multi-cycle processing. The [full suite](validation.json) had 42 passes and two unrelated optional UI skips. The official RAM comparison against `f35f675` remained 5.50 GB for `corporation.js` (33.25 GB without its override).

```sh
node audit/2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs ../bitburner-engine --compare-baseline
```

Pinned Steam 3.0.1 source: [material sizes](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/MaterialInfo.ts), [Tobacco inputs](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/data/IndustryData.ts), [warehouse and sale processing](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts).
