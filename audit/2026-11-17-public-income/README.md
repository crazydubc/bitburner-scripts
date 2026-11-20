# Round five: earn the money for recurring faction bribes

An augmentation install restarts the scripts, but leaves the corporation, its upgrades and its products in place. Ending the BitNode is the relevant time limit. An upcoming install or an unaffordable faction reputation target should not stop a profitable investment. The faction worker still pays a live, eligible target when the cash is available.

## What went wrong in BN3.3

Tobacco's three finished products were all selling 19.38 units/s in Sector-12. The problem was the $17.5m/s company income relative to the reported $3t treasury: at that rate it would take about 48 hours to earn the treasury again. The old general growth allowance opened with just $10.5b at that income. Some office and advertising decisions could spend outside that allowance, but the manager never offered the four employee upgrades as a public investment. It also sized the next product at $2b total and treated the next reachable faction payment as a reason to stop reinvesting.

Putting all $3t into one design is poor value. The game's design multiplier is `1 + 0.01 × designInvestment^0.1`. Moving from $1b to $1.5t on the design slider (half of a $3t project) adds only 7.93% to **that multiplier**, with the office and research held constant. The marketing slider has the same diminishing exponent but affects different parts of the sale calculation. Division AdVerts and Wilson Analytics can increase the market for products already selling.

## What the manager does now

- Keeps current bills, input orders, operating cash (at least $5b or ten minutes of expenses), and room for the next design. It does not earmark a future bribe. The paying helper rechecks valuation, actual rep, cash, and bills.
- After a full, managed Tobacco lineup posts three priced cycles, compares keeping the cash, a better-funded replacement, employee upgrades, Smart Factories, and different sizes of advertising campaign with or without Wilson. Forecasts use all selling cities, observed sales, input quality, warehouse room, dividends, and the time a retired product would stop earning. The four employee upgrades affect both the existing production line and future designs. Input growth above the measured supply is valued at market quality until the office shows it can do better.
- Uses the recorded or estimated node finish when available. Without one, it uses the longer of the time to develop a full generation of products and the time to earn back the available treasury at the observed retained income. An estimate is not a guarantee; a missed historical estimate does not permanently disable growth.
- Purchases one quoted group at a time and waits three corporation cycles to see the results before the next capital decision. The home helper verifies the active lineup, phase, invoice total, price and remaining cash before buying. Sales continue during this process. Existing warehouse, office, input, and second-product handling remain available. Private investment offers are unchanged.

## Eight-hour comparison

The [replay](checks/recurring-bribes.mjs) uses the Steam 3.0.1 engine's office, product development, production, sale and market functions. It starts with $3t, $17.5m/s company profit, the reported Sector-12 employee distribution, 18 AdVerts, 3,133 RP, Plants quality 122.27, and the prices and ratings of v7/v10/v11. It restarts the manager and requests $1.2t of faction reputation at hours 2, 4 and 6. Payouts use the repository's actual bribe guard and are deducted from the treasury. This compares policies on a reconstructed case, not on the player's save.

| Eight-hour policy | Company profit at 1 h | Company profit at 8 h | Actual bribes | Cash after all spending |
| --- | ---: | ---: | ---: | ---: |
| Previous testing branch (`f451753`) | $15m/s | $20.4m/s | 2 × $1.2t | $1.137t |
| Design only | — | $20.4m/s | 2 × $1.2t | $1.137t |
| Design plus division advertising | — | $20.4m/s | 2 × $1.2t | $1.137t |
| Design plus production and offices | — | $2.82b/s | 3 × $1.2t | $41.245t |
| Production, design and division advertising together | $390m/s | $60.32b/s | 3 × $1.2t | $424.717t |

The previous branch paid at hours 2 and 4 and did not earn enough for the third request. The mixed policy paid at approximately 2 h 42 min, 4 h, and 6 h. It spent most of the starting cash on employee upgrades, then paid for division advertising, factories and a $32b replacement project. These are **outcomes, not budget settings**. The first payment was later; a larger recurring income paid for the third. The mixed run retained about $537.4t from operations and spent $112.1t on growth, so the difference did not come from counting unspent seed money as income.

The modeled satellite offices have three workers each; starting employee upgrades are zero. Background division income is held constant. The main comparison uses deterministic market rolls, an eligible valuation, and an eight-hour node horizon. Both the script's own pricing and native Market-TA.II were checked. An additional case used a locked $50t valuation, smaller warehouses, a poor competition roll, dilution of the Plants supply and no prior node finish: the manager invested, raised income, paid no ineligible bribe, and kept its operating cushion. Actual sales, upgrade quotes, valuation and time left in a save can differ substantially.

The same checks cover a near-immediate BitNode finish, inadequate helper RAM, a changed lineup or quote, a new bill from a different division, and an intervening bribe. The running manager still uses 5.50 GB and its ordinary home helper 23.60 GB. A guarded employee/factory/AdVert purchase needs 51.60 GB temporarily; Wilson with its extra quote needs 61.60 GB, already the prior campaign peak. If the extra RAM is unavailable the purchase defers. The replay is outside the game; no diagnostic or background script is installed for it.

To reproduce, use Node 24 and a local checkout of [the Steam engine revision](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c). From this repository: `node audit/2026-11-17-public-income/checks/recurring-bribes.mjs /path/to/bitburner-src`. The engine documents the [design and marketing multipliers](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/advanced/corporation/product.md) and [Wilson and division advertising](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/advanced/corporation/wilson-analytics-advert.md).

In game: `run git-pull.js --branch testing/bn1-go-audit`, stop just the old `corporation.js` in Active Scripts, and let autopilot relaunch it. Keep the corporation, products and sell orders. Its log shows **Operating reserve**, **Last public investment**, and **Product lineup**.
