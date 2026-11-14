# BN3: when to take the next investment offer

The BN3 manager previously refused a round-two offer below $8.8t in combined cash and new funding, even after Tobacco was selling and the valuation window had settled. It used different fixed gates in the other three private rounds. None of those amounts is a BitNode completion requirement. Private investment goes to the **corporation**; it helps the player through productive investment, faction reputation or, after the IPO, dividends.

BN3 now prices the next stage from the current divisions, unlocks, office sizes, product version and operating expenses. Other BitNodes keep their existing policy.

| Offer | What the money can do |
| --- | --- |
| 1 → 2 | Finish the agricultural footprint; fund missing market data, Export, Tobacco, Chemical, their cities and warehouses, the Tobacco design office and first project. |
| 2 → 3 | Cover unfinished setup, the next Tobacco design and the first HQ hires. The larger opportunities are the HQ and then all six offices at the round-three staffing target. |
| 3 → 4 | Fund the next design and HQ hires. Compare raising the rest for the round-four offices now with earning it after advancing. |
| 4 → IPO | Price the missing Restaurant footprint and its next project. When a fresh augmentation plan is waiting for player cash, estimate dividends from actual profit, retained shares, tribute and the configured rate. |

Already-owned infrastructure costs zero. A new division includes its Sector-12 office and warehouse. The office quote uses the game's seat-cost curve. The cash comparison includes negative balances, bills already incurred and planned input purchases, and protects the existing operating reserve or three cycles of expenses, whichever is larger. Later offers protect a productive first step; the biggest offices are opportunities to compare, never mandatory gates.

The manager measures the real offer through the existing 12-cycle review, while sales, inputs and employee care continue. It compares two times for the next build: earning the shortfall after advancing, versus waiting for observed offer growth plus operating income. It waits past the review only if that saves more time than the delay and the improvement is reachable within the next review window. It uses the slower of two consecutive three-cycle offer slopes and never extends that deadline. A weak offer goes back to growth; a cash-rich company does not sell another tranche for a token amount. Twelve corporation cycles are about two minutes of production at normal speed; missed phases or bonus time change wall-clock timing.

A live faction work target can justify taking an otherwise marginal offer if it makes the whole bribe affordable, passes the game's valuation requirement and preserves the worker's bribe reserve and the next build. Only the faction worker executes a bribe. The final dividend comparison uses the gap to an affordable-in-reputation augmentation, never the investment itself as player money. Stale or missing plans fall back to the corporation-only decision. Autopilot can finish the node without waiting for an investment, an IPO or a bribe.

**Reported case.** A controlled run with the reported $7.355b cash, a steady $7.56t offer, $30.8m/s net income, complete infrastructure and one Tobacco product leaves $7.567355t after taking the offer. Using 10 seats in all six offices (only Sector-12 was shown) gives a $5.256t full build including the next design and working cash. The old manager remained in round two after 50 START checks. The new manager advanced on check 13: one to start measuring and twelve to collect offers. This reproduces the decision, not the whole save or the time to complete BN3.

**Validation.** [The regression](checks/offer-timing.mjs) runs both versions, the real home helper, and the official office, investment and dividend routines. It covers all four transitions, different office sizes, missing warehouses and divisions, growth versus flat offers, debt and unpaid bills, outside/manual acceptance, low RAM, stale plans, and both sides of a dividend-funded cash gap. The nine earlier corporation/warehouse suites, the speedrun integration suite and the RAM comparison also passed. The relevant engine sources in the pinned checkout match Steam 3.0.1 commit `3162fd2`.

```sh
node audit/2026-11-14-corporation-offers/checks/offer-timing.mjs ../bitburner-engine
AUDIT_RAM_TARGETS=corporation.js,bin/corpRun.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 8411a29
```

The manager stays at 5.50 GB and normal helper launches at 23.60 GB. Only the final guarded sale briefly needs 31.60 GB on home for a same-turn corporation read and action. If it cannot allocate that RAM, it sells nothing and resumes growth. The final check rejects a different tranche, public corporation, lower valuation or balance, or changed market phase.

**Try it on the existing save.** Run `run git-pull.js --branch testing/bn1-go-audit`, stop only the old `corporation.js` in Active Scripts, and let autopilot restart it. Open the corporation script log to see the review count, the offer decision and the priced build. No new company, flag or augmentation reset is required.
