# Tobacco product ratings and spending safeguards

The reported **effective** ratings were 22.664 for `Prod v1` and 18.179 for `Prod v2`. Their inventory was 128.729 and 273.624 respectively; their estimated production costs and market prices matched. These observations do not establish that v2 has a weaker design, earns less money, or wasted its development budget.

## What the game actually measures

The reference engine's `Product.ts`, `Division.ts`, `ProductElem.tsx`, industry data and research costs are unchanged between the user's previously reported Steam 3.0.1 commit `3162fd2590e221eadd0c0fbd46151913f7c4c41c` and the local reference checkout `1da7316ffd9d281b45a86c4c54ec532276557892`.

- **Design rating:** determined by development-progress-weighted employee productivity, job mix, design investment and the division's unspent research points at completion. Tobacco weights quality at 70%, durability at 10%, and aesthetics at 20%. The version number has no effect. Rating calculation has no random roll; the subsequent competition roll is separate.
- **Effective rating:** reflects the design and the quality of manufacturing inputs. For a new Tobacco production batch, the engine computes `min(designRating, (1 + Plants.quality) * sqrt(designRating))`. It then averages this with the city's remaining inventory by quantity. Older and newer products can therefore show different effective ratings even when the newer design is stronger.
- **Funding:** under the existing manager policy, v1 receives $1b each for design and marketing; v2 receives $2b each. Doubling design investment at that level improves its rating multiplier by only about **0.528%** if everything else is identical. Marketing does not raise design rating. Weaker development staffing or less banked research can outweigh the design investment increase.
- **Sales:** the quantity's parenthesized rate is production minus sales, not gross sales. Equal estimated costs/market prices do not establish equal actual sale prices or earnings. Another completed product can earn additional revenue, subject to material, warehouse and sales constraints.

Hover over each product's **Effective rating** to read its underlying **Rating**. Compare those two design ratings first. Hover over its inventory quantity to inspect **Prod** and **Sell** separately. Without these values or development history, the specific cause of the reported difference remains unknown. Do not discard v2 solely because its displayed effective rating is lower.

Primary source locations: [product development](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Product.ts), [manufacturing and sales](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/Division.ts), and [product UI](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Corporation/ui/ProductElem.tsx).

## Confirmed script defects fixed

1. **Stale research budget:** the research list read its balance only once, then reused it after spending points. A Tobacco balance of 101,000 approved both the 5,000-point laboratory and 10,000-point Fulcrum, even though the second purchase failed the intended cost-versus-current-balance threshold. The manager now rereads the balance before each uncached research decision. In the fixture it retains 96,000 points instead of 86,000 and resumes Fulcrum when its threshold is actually met. This enforces the existing per-purchase policy; it does not promise that research spending can never lower later ratings.
2. **Unfunded product retirement:** the manager could discontinue a selling product before discovering it lacked replacement funding. It now determines the next version and checks the combined design/marketing cost and existing round-two reserve before discontinuing anything. An unfinished or missing product snapshot also defers replacement.
3. **Newest-version reuse:** if the newest product was selected for retirement, the old code recomputed the version from the reduced lineup and recreated that same version with the smaller budget. It now captures the version before retirement, so replacing v3 correctly creates v4. Existing price/quality selection remains in use.

These are independently reproduced defects, not proof of what caused the reported effective-rating difference. The fixes do not impose a monotonically increasing rating requirement, delay the first available product slots, change staffing, change the funding formula, or alter product pricing.

## Validation and loading

`checks/corporation-products.mjs` executes the actual manager functions and the official product development/manufacturing methods. It reproduces the old spending/retirement/version defects, verifies their fixes, and demonstrates a stronger design with a lower effective rating because of input quality. It also covers the first three slots, an in-progress project, missing snapshots, invalid scores, nonfinite budgets, the round-two reserve, price-based selection and pricing-cache cleanup.

The corporation lifecycle, corporation port and remaining-path checks pass. The official RAM comparison reports unchanged costs for all 51 checked entry points, including the corporation manager and helper. No live profitability or speed improvement has been measured.

Pull `testing/bn1-go-audit` and restart the running `corporation.js` to load the manager fixes. Existing products and their accumulated ratings are not rewritten by this update.
