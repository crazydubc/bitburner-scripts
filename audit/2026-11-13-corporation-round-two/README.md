# Round-two investment spending pause

## Report and cause

After the previous valuation change, rounds three and four advanced quickly, but round two remained on `Prod v1` for more than ten hours. The supplied screenshot shows $5.291b of corporation cash, a $4.83t offer, negative reported corporation income and continuing Tobacco booster purchases.

The round-two loop was excluded from the investment review. It could keep spending toward the unchanged $8.8t capital target without allowing the valuation average to settle. That also keeps a completed v1 from funding v2: the next $4b product requires the $5b operating cushion, the $10b round-two reserve and outstanding input bills in addition to its design/marketing cost. A full-lineup or positive-displayed-profit requirement would miss this case.

The actual effect of spending depends on the game's accounting. Retained materials are assets; buying boosters is not automatically a loss of their entire purchase price. Upgrades, advertising, changing inventories and other spending can nevertheless affect the offer. The screenshot identifies the affected phase and cash level, not the full transaction history of the save.

## Change

- Once Agriculture, Chemical and Tobacco infrastructure is complete and at least one Tobacco product is finished, round two can measure its offer below the target. Cash must be finite and nonnegative and there must be recorded revenue. Positive displayed **net profit is not required** because purchases contribute to reported expenses.
- Reuse the existing **12-cycle investment review** to pause discretionary purchases: boosts, upgrades, advertisements, expansion and new products. Keep input purchases, sales, exports, staffing, employee care and any ongoing design running. Existing warehouse input-space protection remains active.
- Read a fresh offer and cash balance after the review. Accept only when the existing $8.8t capital target is met. Do not wait indefinitely for a decline in an otherwise adequate, rising offer.
- If the target is missed, release the pause, allow 12 observed cycles of growth, then check again. This works even when v1 is still the only product. An already adequate offer can start a review without waiting for the cooldown or an unfinished design to complete.
- Preserve round-one peak handling, round-three/four product-lineup review and public-corporation behavior. No new option, worker, game-side diagnostic, persistence file or corporation API call type is added.

Twelve ordinary game cycles are approximately two minutes; bonus time speeds them up, while missed script updates can lengthen the observation period. This is a bounded measurement window, not a promised completion time for a particular corporation.

## Validation

The [new regression](checks/corporation-round-two.mjs) executes the actual manager against the official engine's cash/asset/valuation/offer methods. In a controlled fixture with $32m/s of operating profit, continuously spending $80m per cycle on upgrades and $240m on retained boosters keeps cash at $5.291b and the offer at **$4.7067t**. Pausing those growth purchases for 12 cycles produces a **$9.4032t** offer, advances to round three and keeps v1. This is a mechanism reproduction, **not a replay or prediction of the user's save**.

The test also covers negative displayed profit, incomplete infrastructure, unfinished v1, missing revenue, invalid cash, below-target retries with real growth time, stale/invalid offers, failed acceptance and external round/public changes. The existing [cash regression](../2026-11-11-corporation-cash/checks/corporation-cash.mjs) now enters the review through the real round-two decision and exercises ingredient purchases and employee care through the actual material-processing code and RPC helper.

All **nine corporation/warehouse suites pass**; see [validation.json](validation.json). Syntax and whitespace checks pass. [RAM comparison](ram-impact.json): manager **5.50 GB**, helper **23.60 GB**, unchanged. Unrelated full-suite failures previously reproduced on the incoming branch remain documented in the [preceding audit](../2026-11-13-corporation-valuation/baseline-failures.json); this change does not edit `utils.js` or `kernel.js`.

Reference engine: `1da7316ffd9d281b45a86c4c54ec532276557892`. Its accounting, fund-source and cycle/offer constant files are unchanged from the reported Steam 3.0.1 commit `3162fd2590e221eadd0c0fbd46151913f7c4c41c`.

```sh
node audit/2026-11-13-corporation-round-two/checks/corporation-round-two.mjs ../bitburner-engine
node audit/2026-11-11-corporation-cash/checks/corporation-cash.mjs ../bitburner-engine
AUDIT_RAM_TARGETS=corporation.js,bin/corpRun.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 3e9e522
```

Primary sources: [accounting and valuation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Corporation.ts), [fund-source classification](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/data/FundsSource.ts) and [cycle/offer constants](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/data/Constants.ts).

## Loading

Run `run git-pull.js --branch testing/bn1-go-audit`, stop the old `corporation.js` in Active Scripts and let autopilot restart it. Keep the current corporation and products. The script log should show **Investment review** and its decreasing cycle count. At the end it either takes an eligible offer or explicitly resumes growth before a later review. Sales and production should continue throughout.
