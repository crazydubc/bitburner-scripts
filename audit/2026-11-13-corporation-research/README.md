# BN3.1 round-three research starvation

## Evidence and cause

The reported run was 19h39m into BN3.1 and still in investment round three. Tobacco had three finished products (v5-v7), about $3.039b/s profit in Sector-12, 146 employees there, and only 1.340k scientific research. Its Sector-12 assignment was Operations 48, Engineer 48, Business 1 and Management 49, with no R&D. The investment offer was approximately $384t against the existing $12q capital target. The screenshot now shows production, sales, healthy morale and working inventory; it does not show the earlier complete warehouse blockage.

Zero R&D **in Sector-12** is intentional. Zero R&D **in all six cities** is the regression reproduced from the current manager. Commit `c7efc82492c77d4310a04c30ea7967e30fa53589`, which prioritized early Tobacco sales, also changed both round-three remote-office conditions from `!tobaccoBooster` to `!tobaccoBooster && !hasCompletedProduct`. Consequently, completing any product assigned every Tobacco employee to production permanently during round three, even before the investment push. The original strategy kept the other five cities researching until that push. Buying Project Insight cannot generate research with no researchers.

The original January script (`24b6f093585bd19fa313b7e8e7806207e90400d8`) also used the $12q round-three target in BN3 and switched to all-city production at approximately one quarter of that offer. That target was not raised by this PR. The current offer is still below the start of investment-peak tracking, so its two-cycle confirmation does not explain this delay.

The user confirmed the stale faction-manager queue warning followed a 33-minute game freeze/reload. No faction-manager or stale-warning changes are included. The freeze and earlier warehouse/cash problems contribute to elapsed time; the screenshots do not quantify each contribution.

## Correction

Restore the original round-three remote-office condition in both assignments: before infrastructure checks and after office growth/hiring. Sector-12 keeps its existing design/production staff. The other five cities research until the existing `tobaccoBooster` signal switches them to production for the investment offer. Accepting round three resets that signal, preserving the round-four research phase.

This removes the unnecessary completed-product read from every round-three city. No new runtime function, worker, API, configuration, or diagnostic is added. Round-two early sales, investment targets, product replacement, pricing, warehouse working-space forecasts, and cash safeguards are retained.

There is a real short-term tradeoff: moving five cities to research reduces immediate manufacturing revenue. The benefit is accumulating the division's research bank and producing stronger future designs. Finished products do not have their design ratings rewritten when the research balance rises. Sector-12 continues producing and selling the existing lineup while replacements follow the usual affordability and development rules.

## Verification

The [regression](checks/corporation-research.mjs) runs the real `manageOffice` functions from before the regression, the previous testing head (`8e37475`), and the fixed source. It checks that the restored assignments match the original and exercises unfinished products, missing warehouses, hiring/office upgrades, negative cash, round-two sales, the round-three investment push, acceptance, and the return to research in round four.

The fixture also uses the official `OfficeSpace.calculateEmployeeProductivity`, `Division.processMaterials`, and `Product` code. With six 146-person offices, fixed employee stats, no employee/research upgrade multipliers, 100 morale and 99.397 energy, the old assignment stays at 1,340 research points for an hour; the fixed assignment reaches approximately 7,198. An otherwise identical subsequent design has about 1.55 times the design rating. These are controlled fixture results, **not a forecast of this save's revenue, effective rating, or completion time**. Existing upgrades, future spending, input quality, product cycles, advertising and elapsed game time affect those outcomes.

The [full regression run](validation.json) passed **44 suites**; the two optional React/MUI UI suites were skipped because their fixtures were not supplied. The [RAM comparison](ram-impact.json) is unchanged: `corporation.js` **5.50 GB**, `bin/corpRun.js` **23.60 GB**. The broader suites cover the existing material-budget, warehouse-recovery, product, investment and helper behavior.

```sh
node audit/2026-11-13-corporation-research/checks/corporation-research.mjs ../bitburner-engine
python audit/2026-11-04-full-audit/run-checks.py ../bitburner-engine - audit/2026-11-13-corporation-research/validation.json
AUDIT_RAM_TARGETS=corporation.js,bin/corpRun.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 8e37475
```

Reference engine: `1da7316ffd9d281b45a86c4c54ec532276557892`; the four source files below are unchanged from the reported Steam 3.0.1 commit. Relevant sources: [research generation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts), [employee productivity](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/OfficeSpace.ts), [product design](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Product.ts), and [valuation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Corporation.ts).

## Loading and observing

From home, run `run git-pull.js --branch testing/bn1-go-audit`, then stop the old `corporation.js` in Active Scripts and let autopilot relaunch it. Keep the current corporation and products.

After the next staffing cycle, inspect **Tobacco → Aevum** (or another city outside Sector-12). Before the investment push its employees should be assigned to **Research & Development**, and the division's scientific research should increase between corporation cycles. Sector-12 should retain production. The original all-city production phase returns as the investment offer approaches the target. No live-save performance result is claimed.
