# Product replacement and investment valuation

## Report and reproduced mechanism

The user reported approximately $12b/second of corporation income but only a $56b investment offer. All three finished Tobacco products were producing and selling. Manufacturing is calculated independently per product; removing two sellers does not transfer their production capacity to the remaining one.

The existing manager already retires one weak product when it can pay the combined design/marketing cost of its replacement. It uses calibrated sale-price ranking when available, otherwise design quality. The problem addressed here is the spending around that replacement and the investment offer: continuing to spend cash on growth can obscure operating income in the game's valuation and prevent the next product budget from accumulating.

The checked Steam 3.0.1 engine computes private valuation from **asset growth**, not just the revenue/expense display. It averages ten cycle valuations. Its `gainFunds`/`loseFunds`, `updateTotalAssets`, `determineCycleValuation`, `determineValuation` and `getInvestmentOffer` methods are executed directly by the regression. No extrapolated profit estimate is used to approve an offer.

In a controlled three-division, 36-office/warehouse accounting fixture:

| Policy | Operating income | Investment offer |
| --- | ---: | ---: |
| Spend the $120b cycle income on upgrades each cycle | $12b/s | $56.0015b |
| Keep the same income and pause growth purchases for 12 cycles | $12b/s | $2.5158456515q |

The fixture starts with $222.45b cash and stable inventory/recoupable assets. Under continuous spending, cash never covers the next $256b product plus the operating cushion. After the review, the manager can fund v8, retires v5, and retains v6 and v7. These results demonstrate a mechanism consistent with the report; they are **not measurements of the user's save**, a promised live offer, or proof of the exact expenses in that save. "Income" in this fixture is net operating income because modeled operating expenses are zero.

The reviewed offer remains below the existing **$12q round-three capital target**, so that case correctly resumes growth rather than accepting prematurely.

## Change

- In private rounds three and four, a profitable, fully completed Tobacco lineup gets one investment review before replacement. Required Tobacco infrastructure must already exist. There is also a review when the actual offer plus cash reaches the existing investment target, including during an unfinished design.
- Hold discretionary growth purchases and new product starts for **12 observed corporation cycles**: the ten-cycle valuation average plus two cycles for phase/staffing changes. Twelve regular cycles are approximately two minutes; bonus time speeds game cycles up, and missed script updates can extend wall time.
- Continue ingredient purchases, imports/exports, product/material sales, employee care, research and staffing. Existing in-progress designs continue. Existing emergency warehouse clearance remains active. Booster purchases, upgrades, advertisements, warehouse expansion and product replacement pause through the existing cash-budget path. Three previously unconditional round-four office upgrades now use that budget too.
- If the normal investment push switches remote Tobacco offices from research to production during the review, restart the averaging window once so the increased output can be represented. The trigger is one-way within a round; it cannot extend the window repeatedly.
- At the end, read a fresh real offer and funds. Accept only when their combined capital satisfies the original target. Otherwise release the pause and resume growth/funded replacement. The same completed lineup is not reviewed repeatedly, nor immediately re-reviewed just because an investment advances the round.
- Avoid waiting indefinitely for an offer decline after the averaging window: accumulating cash can keep a healthy offer rising. The original peak logic is retained for rounds one and two. Public-corporation behavior and funding targets are unchanged.
- Show the review and remaining cycles in the corporation script's log. No flag, background worker, cross-script state file, or game-side diagnostic is added.

Product count, production limits and retirement ranking are unchanged. This keeps selling products while giving their earnings a chance to register in the investment offer. Bribes or purchases made manually/by other scripts can still affect the actual offer; the review is bounded even when the target remains unreachable.

## Validation

[Regression](checks/corporation-valuation.mjs) covers the high-income/low-offer reproduction, preservation of all three sellers during review, a funded single-product replacement afterward, unaffordable replacement, no repeated review of the same lineup, production-push timing, a steadily rising offer, stale quotes, failed acceptance, public/manual round changes, employee care, and round-four upgrade suppression. The existing cash regression now exercises ingredient purchases and employee care while booster purchases are held. The research regression retains its staffing/round-transition assertions with the bounded valuation review.

The [full-suite results](validation.json) record **43 passed, two failed, two optional UI suites skipped**. All eight corporation/warehouse suites passed. Both failures were reproduced in an untouched checkout of the incoming branch head `9bd8d36`, before this corporation change; see [baseline comparison](baseline-failures.json):

- `rpc-reserve`: the home-helper launch timeout was removed in `6df886b`. The blocked-launch test consequently never receives the expected rejection and its mock exhausts memory. A second reproduction used a 96 MB heap limit and five-second external timeout. This fixture failure does not establish that the live game has the same memory growth, but the helper's launch retry is unbounded.
- `share-allocation`: the additional kernel sleep in `9bd8d36` changes the test's dispatch timing; it observes one dispatch where it expects two. This is a baseline test failure, not proof that live sharing has stopped.

The incoming `utils.js`/`kernel.js` edits are retained. [RAM comparison](ram-impact.json): corporation manager **5.50 GB**, helper **23.60 GB**, both unchanged. The reference engine is `1da7316ffd9d281b45a86c4c54ec532276557892`; the four referenced accounting/production files are unchanged from Steam 3.0.1 commit `3162fd2590e221eadd0c0fbd46151913f7c4c41c`.

```sh
node audit/2026-11-13-corporation-valuation/checks/corporation-valuation.mjs ../bitburner-engine
python audit/2026-11-04-full-audit/run-checks.py ../bitburner-engine - audit/2026-11-13-corporation-valuation/validation.json
AUDIT_RAM_TARGETS=corporation.js,bin/corpRun.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 9bd8d36
```

Primary source: [accounting and valuation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Corporation.ts), [fund-source classification](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/data/FundsSource.ts), [cycle/offer constants](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/data/Constants.ts), and [independent product production](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts).

## Loading

From home, run `run git-pull.js --branch testing/bn1-go-audit`, stop the old `corporation.js` in Active Scripts, and let autopilot restart it. Keep the existing corporation and products. With a completed, profitable Tobacco lineup in round three/four, the log should show **Investment review**, continuing sales, and a declining cycle count. At completion it either advances the investment round or explicitly resumes growth. Judge the offer after the review instead of immediately after an upgrade purchase.
