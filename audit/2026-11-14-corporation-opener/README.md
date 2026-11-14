# BN3: get from Agriculture to a funded Tobacco division

The old opener could spend the seed on empty capacity and then pause growth for twelve cycles as soon as any revenue appeared. A first harvest does not mean the company can afford its next division. The change is limited to the BN3 seed round; other nodes retain their paid/free API bootstrap.

| Tactic | catloversg | Our testing branch |
| --- | --- | --- |
| Staffing | Six offices, four seats each. Everyone researches to 55 RP; then each office assigns one person each to Operations, Engineering, Business and Management. | Same final staff and two adverts. Keep Sector-12 selling while the other five research; they switch to production at 60 RP. The investment decision does not require that RP total. |
| Sales | Put Food and Plants on sale at market price in every warehouse before the first harvest. | Adopted for BN3 round one. The standing orders also survive a missed SALE phase. Market-data pricing for later rounds stays in place. |
| Upgrades and boosters | Search combinations of Smart Storage, equal warehouse levels and Smart Factories; the default four-seat configuration uses 86% of warehouse space for boosters. | Compare one warehouse in any city, Smart Storage and Smart Factories by added potential production per dollar. Include the missing stock at each city's prices, reserve current bills and operating cash, and buy at most one physical upgrade per cycle. The 86% allocation is a ceiling; inputs, outputs and existing goods can require more space. No automatic round-one SalesBots. |
| Investment and route | Wait ten cycles, then up to ten more while the offer is rising. The $490b expected offer triggers a warning, not a veto. Open Chemical in round two and Tobacco in round three. | Check each START while Agriculture keeps operating. Take a fully funded transition immediately. If only Tobacco is funded, sample net cash plus the offer: wait for Chemical only while its cost looks reachable soon. |

The Tobacco quote includes any missing Agriculture footprint, both market-data unlocks, all six Tobacco offices and warehouses, ten HQ seats, the first design and marketing, and working cash. The full quote adds the **missing** Chemical footprint and Export. With just Agriculture in all six cities and the ordinary fixture expenses these quotes are about $102.8b and $237.8b, respectively; neither is a configured offer gate. Reaching the smaller quote consistently starts a twelve-observation comparison. Growth continues throughout. At most one additional review period is allowed when both recent three-cycle slopes justify it. Losing the Tobacco budget restarts the comparison; paying for staff and inputs does not depend on that comparison.

The reference's [presets](https://github.com/catloversg/bitburner-scripts/blob/082f0b29ee8849916de0b521efea5abeb551f26e/src/corporation.ts#L81-L114), [opener](https://github.com/catloversg/bitburner-scripts/blob/082f0b29ee8849916de0b521efea5abeb551f26e/src/corporation.ts#L286-L359), [office setup](https://github.com/catloversg/bitburner-scripts/blob/082f0b29ee8849916de0b521efea5abeb551f26e/src/corporationUtils.ts#L643-L704), [upgrade comparison](https://github.com/catloversg/bitburner-scripts/blob/082f0b29ee8849916de0b521efea5abeb551f26e/src/corporationOptimizer.ts#L645-L719), and [offer loop](https://github.com/catloversg/bitburner-scripts/blob/082f0b29ee8849916de0b521efea5abeb551f26e/src/corporationUtils.ts#L1749-L1774) are pinned for comparison. The game's [division production](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts#L469-L704) and [private valuation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Corporation.ts#L198-L250) explain why unstocked space and repeated upgrade spending can hurt an offer.

**Controlled comparison.** Both managers start immediately after the common six-city/four-seat/two-advert build. Prices, employee attributes and morale are fixed; all market phases are delivered. The test runs the manager's funding, production purchases, booster orders and staffing with the game's office productivity, inventory, sales, offer and valuation code. It does not simulate the player's save, a game freeze, or the rest of BN3. At normal game speed one market cycle represents ten seconds of production.

| Starting conditions | Prior branch (200 cycles) | Updated: cycle and offer | Net company cash after offer |
| --- | --- | --- | ---: |
| Base prices, 0 RP | No acceptance | 34, $234b | $240.2b |
| Base prices, 60 RP | No acceptance | 30, $246b | $252.7b |
| Boosters cost twice the base price | No acceptance | 43, $175b | $180.4b |
| Recipe input and harvest prices at 75% of base | No acceptance | 41, $207b | $213.8b |

At base prices, the old branch spent $49.17b on physical upgrades and SalesBots; the new one spent $24.61b on physical upgrades and left funds for boosters. The minimum **settled cash before funding** in the new runs was above $5.6b. The two smaller investments buy a productive Tobacco division before Chemical; later corporate and player outcomes are not measured here.

The two additional costs removed from the opener are fetching 24 boost inventories per production forecast (the game already supplies the division multiplier) and rebuilding the HUD in every market phase. No new process or game-side test script is installed.

```sh
node audit/2026-11-14-corporation-opener/checks/seed-agriculture.mjs ../bitburner-engine
node audit/2026-11-14-corporation-offers/checks/offer-timing.mjs ../bitburner-engine
AUDIT_RAM_TARGETS=corporation.js,bin/corpRun.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine a6d6073
```

The audit uses engine revision `1da7316`; its corporation implementation and Netscript corporation API match Steam 3.0.1 revision `3162fd2`. The manager remains 5.50 GB; the ordinary helper remains 23.60 GB, and guarded offer acceptance still uses 31.60 GB briefly on home.
