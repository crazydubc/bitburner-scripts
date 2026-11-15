# Late corporation income and faction bribes

On the previous testing branch, reaching round five opened Restaurant, expanded its footprint, and could grow Tobacco and Restaurant offices to 1,500 seats. In *each* product division, five of six offices put every employee in research even after a product was ready for sale. Those offices helped future designs but did not make anything to sell. The faction worker also left 90% of the treasury untouched even after the IPO. An $800m/s HUD reading alone cannot tell us which factor dominates a particular save.

**What to look for in game.** Pull `testing/bn1-go-audit` with `run git-pull.js --branch testing/bn1-go-audit`. Stop the running copies of `corporation.js` and `work-for-faction2.js` in Active Scripts and let autopilot relaunch them. Keep the company, offices and product lineup. In the corporation script log, look for the growth division, product sales by city, operating profit, bribe cash after bills, valuation eligibility and the current faction savings target if one is close. Allow a few corporation cycles for new assignments, input orders and prices. The corporation's money and the player's wallet are separate.

| Decision | Current behavior |
| --- | --- |
| BN3 rounds 3 and 4 | Continue producing during offer checks. Compare a real offer with the next design, any missing startup costs at that division and working capital. Do not wait for a six-city 250-seat build, a new Restaurant or a valuation-only spending pause. Do not take a token offer or sell successive tranches immediately. Seed and round-two behavior is unchanged. |
| Public / final round | Manage existing operations. No speculative new Restaurant or other side industries. Default to Tobacco; an existing product division can win new spending with actual product sales and greater positive operating profit for three cycles against an established seller. If the company lacks a selling line, it may bootstrap Tobacco. |
| Production and research | Before v1 finishes, the home office designs and satellites research. Once there is a completed product, use already-paid seats in every stocked city for manufacturing, management and business. Keep one quarter of satellite staff, rounded down, in R&D. Existing secondary projects and product sales continue. Order recipe inputs for every finished line within warehouse space and available cash. |
| Growth spending | Compare estimated repayment time for advertising, three extra seats, factory capacity and a congested warehouse at the winning division. Choose at most one of these each cycle with an estimated payback within ten minutes. Buy boosters only for a profitable focus that sells at least 90% of output. Prices and payback are estimates; later sales determine whether the line remains the focus. |
| New designs | Keep an operating line selling while a funded replacement develops. Cap design plus marketing at the smaller of the old version budget and one minute of current net income (minimum budget $2b). Before retiring a seller the home helper checks the live lineup, cash, bills, phase and retained balance, then makes both changes synchronously. If cash or RAM is unavailable, it leaves the products in place. |
| Cash to bribe | In an established company, initial growth credit is capped at 25% of available cash and at ten minutes of net income (minimum credit limit $2b). Thereafter protect half of positive profit after dividends per observed cycle. An eligible, fresh faction target reachable within roughly ten minutes gets priority over growth. An unfunded company without an earning line can use its cash above the operating cushion for the first product. |
| Executing a bribe | The faction worker rechecks the exact remaining rep, valuation, investor shares, funds and all divisions' actual unpaid bills in the same turn it spends. Rounds 1–2 cannot bribe; round 3 retains its private growth reserve. In rounds 4–5 keep ten minutes of recent operating expenses or $5b, whichever is larger, in addition to unpaid bills. Do not buy rep that has already been earned. |

**Controlled comparison.** Both sides use the branch's actual staffing and price controller with the game's office-productivity, manufacturing and market sales code. Six Tobacco offices have 100 paid seats each, identical employee attributes, three finished products, sufficient Plants, and the same fixed demand, quality and competition. The comparison warms up pricing for 30 cycles, then measures 12; net subtracts consumed Plants and payroll. No office expansion, new product, investment offer or bribe is included in the income figures.

| Pricing | Before: net/s and selling cities | Updated: net/s and selling cities |
| --- | ---: | ---: |
| Script pricing (no Market-TA.II) | $370.39m · 1/6 | $2.907b · 6/6 |
| Market-TA.II | $370.39m · 1/6 | $2.907b · 6/6 |

The fixture goes from 500 researchers to 125. It measures the immediate use of existing assets, not future product ratings, an optimal research fraction or time to clear BN3. Smaller or unequal satellite offices, different prices, input shortages and bonus time can give different results. Separately, $800m/s **net** with 1% dividends and no transfers adds $237.6b to the protected balance across 60 ten-second cycles. This is not the amount guaranteed spendable on a faction; eligibility and bills still apply.

[Production and treasury regression](checks/cash-production.mjs) · [offer decisions](../2026-11-14-corporation-offers/checks/offer-timing.mjs) · [bribe worker and home helper](../2026-10-17-speedrun/checks/speedrun-improvements.mjs). The company and faction managers still launch at 5.50 GB and 8.50 GB, the regular RPC helper at 23.60 GB and the bribe helper at 42.60 GB. A late product launch briefly uses 41.60 GB on home, or 61.60 GB for an atomic replacement. It defers the project if that much is unavailable. No new in-game script.

Tested with the official engine at `1da7316`; the corporation simulation and API match Steam 3.0.1 `3162fd2`. See [division production and sales](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts), [bribe rules](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Actions.ts#L633-L680), and [corporation constants](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/data/Constants.ts#L61-L62).

```sh
node audit/2026-11-15-corporation-production/checks/cash-production.mjs ../bitburner-engine
node audit/2026-11-14-corporation-offers/checks/offer-timing.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/speedrun-improvements.mjs
AUDIT_RAM_TARGETS=corporation.js,bin/corpRun.js,bin/bribe-faction.js,work-for-faction2.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 96a131b
```
