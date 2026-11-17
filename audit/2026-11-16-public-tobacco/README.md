# Why a 106-person Tobacco office kept releasing similar products

The [public income follow-up](../2026-11-17-public-income/README.md) supersedes the faction-saving rule below. A future bribe or augmentation install no longer ends the investment window.

In the reported BN3.3 save, the company was public and earning $8.45m/s. Tobacco was profitable ($3.952m/s), and both finished products in Sector-12 were selling the full 19.261 units/s. At the displayed prices, v2 grossed about $905k/s in that city and v13 about $777k/s. Keeping v2 made sense; the version number says nothing about a product's earnings. The $0 offer is normal after the four private rounds. The screenshot shows the player's balance, not the corporation's treasury.

The previous manager could retire a seller as soon as the latest design finished. It compared headquarters price or quality, without charging the new design for the income lost while its slot was empty. It could also leave a productive division with no researcher when the satellite offices were small. Finally, it rejected any advertising campaign with a payback over ten minutes, even when the next bribe or the end of the node was hours away.

**What changes in a public company**

- Keep selling all finished products. Before retiring a managed Tobacco product from a full lineup, observe at least three complete, priced cycles. Rank products by actual units sold at the applied price across all cities, less the input cost of actual production. Compare the weakest to the proposed design using office productivity, research, Plants quality, market conditions and the game's design time. The expected gain, after dividends, must cover both the new project and the old product's lost selling time before the next cash target or expected node finish. Competition on the new product is random; use the midpoint of its range. An open slot, a design already in progress and a manually named lineup retain their existing behavior.
- When the satellites cannot staff R&D, a headquarters with a spare manager assigns one existing employee to research. When a staffed satellite can take over, headquarters returns to its normal jobs. This trades a small amount of immediate productivity for research that improves later products; it does not require buying seats.
- For established sellers, compare the price premium an advertising campaign can add with its cost over that same period. Protect bills, the next design and faction savings. Recheck the live treasury, lineup, phase and quote before each purchase. Once the bribe is close enough to protect, stop discretionary growth. A missed historical estimate of the node finish no longer suppresses all growth indefinitely; an actual finish-ready milestone still takes precedence.

**Replay with the Steam 3.0.1 engine.** The fixture matches the supplied Sector-12 jobs, XP, RP, Plants quality, production multiplier, finished ratings and observed prices, with v14 already 16.59% complete. The screenshot does not disclose the satellite staffing, treasury or remaining node duration. We assumed five three-person satellites, $250b in corporate funds, a six-hour horizon, an eligible valuation, a 1% dividend and the same outside income for both versions. Product development, rating, production, sales, office productivity and advertising effects use the pinned game source. The market and material quality are held constant; warehouse and office purchases are priced out to isolate the decisions tested. The active-target scenario measures the first time the treasury covers a $300b bribe **plus** its operating reserve; it does not execute the bribe.

| Measure | Previous testing branch | This change |
| --- | ---: | ---: |
| Active bribe affordable, script pricing | 84.0 min | 75.5 min |
| Active bribe affordable, native Market-TA.II | 116.7 min | 95.7 min |
| Company cash after 6 hours, no faction target, script pricing | $482.96b | $544.55b |
| Company cash after 6 hours, no faction target, native Market-TA.II | $421.65b | $484.36b |
| New paid designs in those 6 hours (script / native) | 7 / 7 | 0 / 1 |
| Tobacco RP after 6 hours, starting at 658.6 | 659 | 1,246 |

The weak-product case still retires v2 when a replacement can repay its cost. The cash and phase checks also exercise an intervening invoice from another division, a changed lineup with the same number of products, insufficient home RAM, and an ad quote that changes before purchase. These comparisons measure this policy on the stated fixture; they are not a prediction of your live income or node completion time. Private offer logic and BitNode valuation multipliers are unchanged.

**In game:** Run `run git-pull.js --branch testing/bn1-go-audit`, stop just the old `corporation.js` in Active Scripts, and let autopilot relaunch it. Leave v14 and the sell orders alone. After the lineup finishes and the new manager sees settled sales, open its log and look for **Product lineup** to see why it is holding or replacing a seller. The manager still launches at 5.50 GB; the regular home helper is 23.60 GB. A guarded campaign step briefly needs up to 61.60 GB on home and defers if it cannot fit.

[Reproduce the comparison](checks/late-line.mjs) with `node audit/2026-11-16-public-tobacco/checks/late-line.mjs /path/to/bitburner-src` (Node 24, game commit `3162fd2`). [Product design](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Product.ts) · [Production, sales and advertising](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts) · [Earlier investment rounds](../2026-11-15-corporation-supply/README.md)
