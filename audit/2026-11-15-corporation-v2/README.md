# Getting a public corporation's second product to market

The objective is **time until the company can actually afford faction reputation**. In round five, the old manager valued three new Sector-12 seats only by their share of today's product sales. That missed what the same staff do for tomorrow's sales: only the office designing v2 advances it, but once it finishes, every equipped city can sell it alongside v1.

The public corporation now uses its existing office and sales snapshots to make two decisions:

- **Start v2:** When the primary division sells at least 90% of v1 output for two profitable cycles, let the project use retained cash if five minutes of demonstrated net income would cover its full design and marketing budget. Keep unpaid bills, queued input orders and operating cash covered. A bribe that current earnings can fund before v2 is expected to finish gets first claim. An ordinary, funded design can still start under the regular spending policy.
- **Bring v2 to market earlier:** Compare the current design rate with three more Sector-12 employees under the existing job mix. Allow two cycles to hire and assign them. Buy seats only if their price is covered by half the proven after-dividend net income over the time saved, capped at ten minutes of extra sales. Recheck the live project, phase, price, bills and balance at purchase. Stop buying for design speed when the time saved no longer covers the price. Vacant seats are filled first; other cities keep making and selling v1.

Making a larger design or marketing payment would **not** speed up an in-progress product. For a project inherited after a restart, the Steam API doesn't report the design city. The manager looks for two progress changes that match Sector-12 and distinguish it from the other offices. If the data is ambiguous it continues normal sales and growth and leaves the existing design in place. No product is discontinued to use this policy. [Game design and rating formulas](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Product.ts#L109-L150) · [design office and finished products](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts#L820-L848).

**Controlled comparison at normal game speed.** Both runs start with $80b of corporation cash, six ten-person Tobacco offices, a selling v1 earning about $800m/s net, 1% dividends and the same eligible $8t faction target. They spend the same $4b to start v2, use the game’s product development, office prices, production and sales code, and count the bribe only when actual cash covers it after the reserve. The target and the resulting office sizes are test inputs and results, not settings.

| Pricing | v2 ready, before → after | $8t bribe affordable, before → after |
| --- | ---: | ---: |
| Script prices, no Market-TA.II | 91m 20s → 65m 20s | 126m 30s → 74m 00s |
| Market-TA.II | 91m 20s → 65m 20s | 125m 40s → 73m 40s |

Office purchases across all cities rose from $32.0b to $202.6b **over the design period**. V1 remained on sale throughout. This spends cash earlier in exchange for a chance at two profitable sellers sooner. Both runs have the same market and starting workforce; the comparison holds research and input quality fixed, makes only office upgrades competitive and stops adding seats or starting new products after v2 finishes. These numbers are not predictions for a live save. If a new product sells poorly, the extra hires may take longer to repay.

**In game:** run `run git-pull.js --branch testing/bn1-go-audit`, stop the running `corporation.js` in Active Scripts and let autopilot relaunch it. Open its log for the v2 percentage, normal-speed ETA once the design office is known, and recent spending decision. No company or design reset is needed. The manager still uses 5.50 GB and ordinary home calls 23.60 GB; the live design-seat check briefly needs 61.60 GB, the same peak as an existing guarded replacement. If home cannot supply it, that purchase is deferred.

[Reproducible comparison and safeguards](checks/second-design.mjs) · [production and bribe policy](../2026-11-15-corporation-production/README.md). Run from the repository root with a Bitburner engine checkout next to it:

```sh
node audit/2026-11-15-corporation-v2/checks/second-design.mjs ../bitburner-engine
```
