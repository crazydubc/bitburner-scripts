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

## Where the forecast broke

- [January's original synchronous manager](https://github.com/crazydubc/bitburner-scripts/blob/24b6f093585bd19fa313b7e8e7806207e90400d8/corporation.js) already reserved one cycle of inputs and outputs plus unsold product, applied a 1.01 safety multiplier before investment round three or 1.10 thereafter, then gave the remaining capacity to the industry-weighted booster optimizer. Its input/output forecast counted **only finished products** and returned **zero** for an unproductive office.
- [The 2.0 conversion](https://github.com/crazydubc/bitburner-scripts/commit/214f98108d43748b2631e0364b94c6c3b78dbf34) moved calls into RAM helpers. [The August bootstrap refactor](https://github.com/crazydubc/bitburner-scripts/commit/83dbea20abc736ea1fda993c569a3a4eb7b94bd0) extracted the storage budget into a helper. Neither fixed the zero forecast. The weighted solver is identical from January through the pre-fix testing head. The working-space forecast and optimizer were also identical on the PR base and immediately before this fix.
- [The round-two Tobacco change](https://github.com/crazydubc/bitburner-scripts/commit/c7efc82492c77d4310a04c30ea7967e30fa53589) moved the first project from round three to round two and expanded into remote R&D offices while v1 was developing. That exposes the old zero-forecast state earlier. The game report establishes the resulting allocation, not the precise sequence of phases in a live save.
- Once full, purchase orders were capped at zero Plants; an export based on actual past consumption cannot seed a city with neither Plants nor production. The old manager depended on a later boost optimization pass with a nonzero forecast. In round two that pass could also be skipped while Agriculture was not ready.

## Repair

**There is no permanent percentage split.** A staffed Tobacco city forecasts a ten-second batch from the same employee productivity, division boosts, factory upgrades and research as before. While v1 is being designed it sizes that batch as one future product; this does not buy Plants before they're needed. If there is genuinely no manufacturing staff, it keeps only a seed of one input/output unit per product. When products are finished it reserves their actual sizes and stored inventory, keeps the original investment-round margin, and accounts for other occupied space without counting normal Plants inventory twice.

The unchanged optimizer splits the remaining space across Hardware, Robots, AI Cores and Real Estate. It keeps the original nearest-unit targets when they fit; when rounding would encroach on the working reserve, it rounds down. In the historical comparison, healthy offices at several production levels in rounds two, three and four retained the old quantities to within one unit per booster.

When Plants cannot fit, the purchase pass immediately cancels booster buys and sells at market price only the amount needed to reach that same calculated budget, taking it from above-target boosters. Even a lopsided warehouse is not liquidated to rebuild its portfolio. Persistent sell orders cannot drive retained stock below their targets, including when several market cycles are processed together. This runs even if the usual boost optimization is paused. No warehouse upgrade, new product, or change to selling prices is needed.

**In the game:** From home run `run git-pull.js --branch testing/bn1-go-audit`. Stop the old `corporation.js` in Active Scripts and let autopilot relaunch it. Watch Tobacco's storage breakdown and the **Prod** and **Sell** quantities for v1 through the following corporation cycles. Plants can be consumed immediately; a zero Plants balance by itself is not evidence of an ongoing jam. How quickly excess boosters sell depends on your offices and market. Division profit also includes expenses.

**Verification:** [Regression fixture](checks/tobacco-warehouse.mjs) replays the original January script, 2.0, the August bootstrap and Tobacco commits, and the previous testing head against the same inputs. All five reproduce the exact inventory. The stuck-warehouse replay on the previous testing head includes repeated zero sales at `MAX/MP` and a rejected shipment even from a stocked supplier. With the same capacity and the fix, the official purchasing/export, manufacturing, sale-amount parser, and sales methods accept Plants, make v1, and generate revenue from the product itself. Coverage includes R&D-only cities, stored unrelated goods, multiple completed products plus a new design, larger production forecasts, recovery of lopsided booster stocks, a paused normal boost routine, restart-style stale buy orders, and sell floors across multi-cycle processing. The [full suite](validation.json) had 42 passes and two unrelated optional UI skips. The official RAM comparison against `f35f675` remained 5.50 GB for `corporation.js` (33.25 GB without its override).

```sh
node audit/2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs ../bitburner-engine --compare-baseline
```

Pinned Steam 3.0.1 source: [material sizes](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/MaterialInfo.ts), [Tobacco inputs](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/data/IndustryData.ts), [warehouse and sale processing](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts).
