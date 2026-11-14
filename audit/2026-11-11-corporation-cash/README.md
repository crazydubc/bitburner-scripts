# BN3.1 round-two booster spending

## Report and correction

The fresh run showed corporation funds of -$91.883b while the first Tobacco product was 57.79% designed. The four boosters occupied 2,373.950 of a 2,400 warehouse, leaving 26.050 free. This differs from the earlier 0.005-free-space jam: the new split is approximately balanced and the unfinished product correctly needs no Plants yet. Subsequent cash recovery to about -$72b shows that the other divisions can repay the deficit; it does not make unbudgeted purchases safe.

The previous warehouse fix corrected the zero working-space forecast, but its regression did not model the corporation-wide material bill. The original booster optimizer reserves space, not dollars. Its orders could buy a full portfolio across Agriculture, Chemical and Tobacco irrespective of available funds. The narrow cash check in the paid-API round-one bootstrap did not apply to BN3 or round two.

The game's `Division.processMaterials` limits purchases by free storage, not funds. Material bills accumulate in `thisCycleExpenses` and are deducted at the next `Corporation.process` START. Consequently ordinary upgrades and products could spend the bank balance before those bills were deducted. Uncancelled positive buy rates could also repeat.

## Change

- Preserve the original booster target calculation and the first-product working-space forecast. Prepare those targets in EXPORT, then re-read stock and prices at PURCHASE.
- Share one affordable purchase budget across the selected cities and divisions. Pay for recipe inputs first and keep the existing $5b operating cushion; proportionally reduce additional booster purchases if the full targets are unaffordable. Do not count future sales as spendable cash.
- Subtract the current division bills when checking capital purchases, including product replacements. Reject a cash snapshot that straddles a phase transition. Tea and parties can use the operating cushion, but cannot spend money already owed.
- Execute booster buys through the existing RAM helper for one phase. Clear the rates after the next update and through `atExit` on interruption. Restart also clears orders inherited from older scripts.
- Batch calls of the same API method inside the existing helper, without increasing its RAM requirement. Each division result still strips the deprecated `type` getter before crossing the port.
- Let round-two Tobacco plan and rebalance independently while Agriculture's readiness check pauses Agriculture/Chemical. The Tobacco purchases still require available cash.
- Keep recipe-input purchases and manufactured-material sales intact where Hardware/AI Cores have another role. Retain bounded sales of excess boosters. No blanket debt liquidation, early investment acceptance, product cancellation, or warehouse replacement is added.

Employee morale and energy also affect development, not just manufacturing. `OfficeSpace.calculateEmployeeProductivity` includes their product; `Product.createProduct` uses that employee productivity for both progress and its accumulated creation factors. `finishProduct` uses those accumulated factors for final stats. At the reported 54.730 morale and 54.843 energy the productivity base is roughly 30% of 100/100; this is not a claim that design speed is exactly 30%. Later recovery cannot retroactively change the factors already accumulated, but the current product can still finish and be useful.

## Verification

[Regression](checks/corporation-cash.mjs) uses the real manager and RPC helper with the official material purchase/sale code, three divisions, and six warehouses per division. A deliberately constrained $20b fixture ends at approximately -$187.294b under the previous manager. With the fix, its first input/booster purchase costs $15b and leaves $5b after settlement. These are fixture results, not measurements of the user's live save.

Coverage includes debt/invalid funds, existing unpaid bills, cash/price changes after planning, phase-boundary snapshots, interruption cleanup, repeated unattended cycles, restart cleanup, Tobacco routing with Agriculture blocked, and preserving Water Utilities input purchases and Computer Hardware output sales. Existing product tests now verify that reduced employee productivity slows design and reduces product stats. The previous warehouse fixture still checks the historical allocations and recovery through actual product sales.

The [full regression run](validation.json) passed 43 suites, with the two optional React/MUI UI suites skipped because their fixtures were not supplied. [RAM comparison](ram-impact.json): `corporation.js` remains **5.50 GB**, and `bin/corpRun.js` remains **23.60 GB**. The one-phase helper requires base 1.6 + buyMaterial 20 + nextUpdate 2 = 23.6 GB. No game-side diagnostic or new background worker was added.

From home, run `run git-pull.js --branch testing/bn1-go-audit`, then stop the old `corporation.js` in Active Scripts and let autopilot relaunch it. Both the manager and `bin/corpRun.js` must be updated. Keep the existing corporation and v1; debt repayment depends on actual income and is not instant.

```sh
node audit/2026-11-11-corporation-cash/checks/corporation-cash.mjs ../bitburner-engine
node audit/2026-11-10-tobacco-warehouse/checks/tobacco-warehouse.mjs ../bitburner-engine --compare-baseline
python audit/2026-11-04-full-audit/run-checks.py ../bitburner-engine - audit/2026-11-11-corporation-cash/validation.json
```

Reference engine: `1da7316ffd9d281b45a86c4c54ec532276557892`; relevant Steam 3.0.1 code: [material purchases](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts), [bill settlement](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Corporation.ts), [employee productivity](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/OfficeSpace.ts), [development and product stats](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Product.ts).
