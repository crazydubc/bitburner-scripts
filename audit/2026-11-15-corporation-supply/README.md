# What the second investment should buy

The reported company took $243.253b in round one and $11.728b in round two. The previous branch could sell the second tranche because *existing* cash covered a small next purchase. It could also start its valuation review while Agriculture was mostly doing research and Tobacco was still designing v1. Neither condition demonstrates an investor-worthy business. The offer is irreversible; this update resumes the company's actual round and keeps its existing divisions operating.

## What the manual changes

The July 3 *Corporation manual* (§§4, 12–13, 16–19) and the [v3.0.1 engine](https://github.com/bitburner-official/bitburner-src/blob/3162fd2/src/Corporation/Corporation.ts) describe different parts of the decision. The guide's $14.145t–$14.871t second offer is a BN3 benchmark for its full build, which assumes **at least $490b** going into round two. Section 21, on other BitNodes, is unfinished. The game prices an offer from the average of ten valuations, including the change in assets, treasury and infrastructure. Round two offers 0.70 times that valuation for 350 million initial shares. The corporation valuation multiplier is already in that quote. It does not discount an office, product design or faction bribe.

| Stage | What the manager does |
| --- | --- |
| Seed | Use the six-city Agriculture opening, with research, sales and an operating reserve. Price Export, Chemical infrastructure and the Agriculture upgrades from actual ownership and prices. Sample total available capital across producing cycles while farming continues. |
| Round two, BN3 | Buy Export and build Chemical before new Tobacco. Work toward eight Agriculture seats and eight adverts; keep Chemical at its small initial offices with one warehouse upgrade. The HQs keep working; other offices build toward 700 Agriculture / 390 Chemical RP, then return to production. Export Plants to Chemical and Chemicals back. Use the game's material sales terms with live inventory; sell at MP without market data. Existing Tobacco keeps operating. |
| Sell the second tranche | Observe actual Food production/sales and Chemical output after research, or profitable completed Tobacco sales. Run a 12-cycle review, extending briefly for a sustained rise that beats retained earnings. New investor money must buy meaningful Tobacco capacity; previously raised funds cannot substitute. Allow an immediate eligible player goal or an actual debt rescue. Buying boosters for one cycle is not recurring operating debt. |
| Discounted offers | Compare the actual quote to undiscounted construction and design costs. When investors cannot pay for Tobacco but Agriculture can, protect the starter cash, use the included HQ and design v1 without waiting for expensive market data. When necessary, keep producing privately instead of selling round-two shares. Once the next expansion is self-funded and a working line earns faster than a flat quote grows, advancement need not wait for a BN3-sized cheque. |
| After funding | Spend part of the new treasury on the v1 design office; protect bills, operating cash and at least half the initial available treasury. Recheck cash, company ownership, project, phase, price and available helper RAM at purchase. Give Tobacco first use of shared Plant exports, preserving custom quantities. Buy Market-TA.I and II in prerequisite order when the missing pair leaves at least half of the live RP bank. Consider Wilson together with the adverts it improves using observed margins and prices. No new Restaurant for valuation. |

The speedrun goal is a productive corporation and timely bribes, not the manual's endgame profit target. The existing startup policy still skips weak speculative $150b companies. Bribes still need the actual $100t corporate valuation and $1b of cash per reputation. An already accepted offer cannot be reversed; an existing Tobacco division, or a public company, can use the later changes immediately.

## Controlled comparison

The engine replay gives both managers the same six paid Agriculture offices, initial stock and $249.253b in round two ($243.253b seed offer plus $6b cash). It exercises the actual production, product development, sales and valuation methods with fixed employee attributes, morale and market conditions. Times are from the start of round two at ten seconds per market cycle. This is not a replay of the player's save or a prediction of the whole BitNode.

| BN3 metric | Previous testing branch, 20d64bc | This change |
| --- | ---: | ---: |
| Second offer accepted | $64.48b, 2m10s | $1.325t, 41m10s |
| Agriculture / Chemical RP at acceptance | 95 / 0 | 705 / 392 |
| First Tobacco sale | 3h24m | 1h32m |
| HQ seats at first sale | 3 | 96 |
| Treasury at first sale | $302.78b | $622.45b |

A separate quoted-offer regression uses the **reported $11.728b**, unfinished v1, measured zero sales and a documented assumed $20b treasury. The old code sold in 13 checks; this change neither sells nor freezes growth in 40. An established, selling company still accepts the earlier reported **$7.56t** offer. The $64.48b in the table is the independently generated offer, not a substitution for the reported one.

At **0.2×** with the same $249.253b start, the replay accepts **$251.61b** after the producing supply chain matures. At **0.001×** with the same treasury, it starts its own Tobacco product and makes a sale at cycle 671 without selling round-two equity. A less wealthy 0.2× company starting with $45b also makes a Tobacco sale before giving up that tranche. A separate seed test starts after the six basic farm offices are paid: at 0.2× it funds for $54b in 44 cycles; at 0.001× it protects existing cash and advances with $27.2b in 16 cycles. The lower-valuation test exercises the subsequent three-seat product launch as well. These are operating examples, not an argument to start a new corporation in every BitNode.

## Reproduce

Use Node 24 and a checkout of the Bitburner engine as the argument. Gameplay scripts have no new runtime dependencies. The manager remains **5.50 GB**, the ordinary home helper **23.60 GB**; the temporary guarded office purchase fits the existing **61.60 GB** helper peak. The checks live under `audit/`, excluded from game downloads.

~~~sh
node audit/2026-11-15-corporation-supply/checks/supply-market.mjs ../bitburner-engine
node audit/2026-11-15-corporation-supply/checks/manual-invariants.mjs
node audit/2026-11-14-corporation-opener/checks/seed-agriculture.mjs ../bitburner-engine
node audit/2026-11-14-corporation-offers/checks/offer-timing.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/corporation-products.mjs ../bitburner-engine
node audit/2026-11-15-corporation-production/checks/cash-production.mjs ../bitburner-engine
AUDIT_RAM_TARGETS=corporation.js,bin/corpRun.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 20d64bc
~~~
