# Corporation sell-price crash in BN10.1

The reported `corporation.sellMaterial` stack came from the round-two sale loop. The manager runs on a remote server and sends its price to `bin/corpRun.js` on home. The helper correctly forwarded `Infinity`; the game uppercased it, stripped the letters and rejected the resulting empty price expression. The preceding product-development change did not introduce this pricing calculation.

## Reproduction and fix

The manual pricing loop estimates markup from `(trialPrice - marketPrice) * sqrt(actualSales / estimatedProduction)`. The production estimate can be zero in an office with no productive staff, even while the warehouse has inventory and a prior sales observation. With stock of 100, observed sales of 5/s, a $200 trial price, a $100 market price and zero estimated production, the old manager calculated an infinite markup. Its final quote check handled negative values and `NaN` but accepted positive infinity. The same defect existed in `sellProduct`. The trace identifies the invalid outgoing price; it does not record the live office figures or prove which intermediate value first overflowed.

`corporation.js` now checks the divisor before estimating markup, validates trial prices and fitted values, and guards both the final quote and initial product price expression. An unusable calculation drops only that item's pricing state and posts `MAX` at `MP` (market price). Later sale cycles can learn a fresh quote; other items keep their existing prices and continue through the loop. The simpler material price used before market-data unlocks also falls back to `MP` when invalid. Valid pricing steps, export adjustments, native Market-TA.II and intentional zero-price orders are preserved. No change to the home helper, funding, product development, or unrelated API error handling is needed.

## Verification and loading

`checks/corporation-sale-prices.mjs` exercises the real BN10 round-two manager path with scoped fixtures, the real remote caller and home helper, and the official port and sell-price parser. The relevant game actions match the previously reported Steam 3.0.1 source. The old revision reproduces the `INFINITY` error for materials and products. The patched code reaches the next corporation update, retains a sibling item's learned quote, and resumes calibration after production recovers. It also covers overflow, poisoned caches, pre-unlock sales, large product-name multipliers and unrelated RPC failures. Ordinary quote/cache results are compared against the previous manager. The corporation product, lifecycle, port and remaining-path suites pass. These are offline checks; no live BN timing or revenue is claimed.

The official RAM comparison shows no change across all 51 checked entry points. The manager remains 5.5 GB; its static calculation without the override remains 33.25 GB.

From `home`, run `run git-pull.js --branch testing/bn1-go-audit`. If an older `corporation.js` is still running, stop just that instance and let autopilot relaunch it; its remote launcher copies the updated file from home. No augmentation install or BN reset is required.
