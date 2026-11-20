# Corporation startup, payouts, and use in other BitNodes

Implemented on `testing/bn1-go-audit` / PR #34. Reference engine: **3.0.1**, official commit `1da7316ffd9d281b45a86c4c54ec532276557892`. These are source-backed mechanics and bounded checks, not a measured corporation speedrun.

## Changes in this follow-up

| Finding | Repair |
| --- | --- |
| Creation treats `canCreateCorporation` as a boolean, but 3.x returns status strings, including truthy failure strings. Eligibility does not check personal cash. | Accept only `Success` or legacy `true`, wait for sufficient spendable cash, and verify `hasCorporation()` after creation. Disabled access exits with an explanation. Autopilot uses the same eligibility/funding boundary. |
| Self-funding can consume money reserved for other progression. | Require $150b **above the current home reserve**; re-read the reserve and cash on retries. BN3 still uses seed funding, and existing corporations resume even when personal cash is zero. The dynamic reserve can exceed $8b, so this may intentionally delay entry beyond $158b. No automatic stock sale or new $150b savings lock is added. |
| Going public and issuing dividends are both hidden behind `revenue >= 1e70`, even after all private investments. | After the fourth accepted offer, go public with **zero shares offered** and use the existing 1% dividend rate. Retain the remaining shares. Pause dividends if profit is nonpositive or funds fall below the larger of $5b and three market cycles of expenses. `--dividend-rate 0` retains all profits; values from 0 to 1 are accepted. |
| A corporation made public before all four private offers keeps reporting its old funding round. | Treat actual public state as the public-management phase; refresh the phase after preparation and never wait for another private offer. This is recovery support, not an automatic early IPO. |
| The hash spender scans hacking targets for cash/corporation purchases, and passes a Server object for default server upgrades (B12). | Skip targeting for non-server purchases; use a hostname and cache automatic targets for one minute. Explicit targets need no scan. |
| An implicit corporation purchase disables cash-only low-priority behavior; bulk cash sales run first and can consume all hashes. | Corporation hash spending is explicit. Try requested non-cash purchases before the bulk cash sale, deduplicate options, and enforce the per-loop cap inside mixed lists. The default cash seller remains low priority. |

The Agriculture → Tobacco in round 2 → Chemical sequence, boost-material rules, and all investment capital targets remain unchanged. Later industry expansion still has its existing revenue gate. Batch scheduling, Go tactics, and the intentional coinflip reserve policy are unchanged.

## The $150b entry cost

Outside BN3, the first corporation requires **$150b of personal money**. There is no ordinary seed-funding option outside BN3. In BN3, seed funding creates the corporation without a personal payment, adding 500 million investor shares to the original one billion shares.

The corporation starts with its own $150b balance. This is separate from the player's money. SF3.3 does **not** reduce the $150b personal entry fee; it grants Office API and Warehouse API free. Without it, they cost $50b each from corporation funds. This script then spends $40b opening Agriculture, leaving only $10b before further operating/expansion costs. The existing paid-API bootstrap is designed for that constraint. BN3 also grants the two APIs free.

The game's $50b restart price applies to replacing an existing self-funded corporation through the restart mechanism. It is not a discount on the first corporation and discards the existing business. It is not used by this script.

Corporations survive augmentation installations and soft resets within the same BN. They are cleared on the Source-File/BitNode reset. Therefore a corporation can support several augmentation cycles without paying the entry fee again. For a fast BN that is nearly finished, a new corporation may not recover its startup and growth time.

## Practical accelerators

1. **Finish SF3.3 before relying on repeated corporation bootstraps.** Saving $100b of corporate API expenses is substantial even though the personal entry cost stays fixed. The existing proposed BN route already recommends evaluating a BN3.1–3.3 block; the automatic route is not changed here.
2. **Use Hacknet server hashes after creating the corporation.** `Sell for Corporation Funds` adds $1b per purchase directly to the corporate balance. Its hash price increases with repeated purchases. It can relieve the paid-API bootstrap's early cash shortage. `Exchange for Corporation Research` adds 1,000 research points to every division that exists at purchase time, so it is more useful after the intended divisions exist. Neither option pays the initial personal entry fee. Before creation, `Sell for Money` contributes to personal savings instead.
3. **Use the existing faction-bribe path when reputation is the bottleneck.** `work-for-faction2.js` already checks eligibility and excess corporate funds before attempting a full target bribe. Bribes consume corporation funds directly; they need no dividend transfer to the player. There is no new automatic bribe policy in this patch.
4. **Measure actual player payout, not corporation revenue.** The tail now displays player dividends. A rough return-of-capital estimate is startup/growth time plus `$150b / player-dividends-per-second`; include lost investment opportunities when comparing it with finishing the BN directly.

With Hacknet servers unlocked, choose a focused spender while it is useful:

```text
run spend-hashes.js --spend-on "Sell for Corporation Funds" --liquidate
```

Or, after your divisions exist:

```text
run spend-hashes.js --spend-on "Exchange for Corporation Research" --liquidate
```

These are continuous spenders; stop the selected process when that priority is finished. The normal cash-only overflow spender may remain running in its default low-priority mode. Do not run a second **liquidating cash** spender alongside these if the goal is to save hashes for corporation purchases. Choosing both cash and corporation actions in one command buys the non-cash actions first, then converts the remaining budget to cash; it does not reserve hashes for the next corporation purchase.

Run only one corporation manager. To override its dividend rate, stop its existing process and restart it with the desired flag, for example `run corporation.js --dividend-rate 0.01`. Autopilot resumes the manager with its default 1% rate after an augmentation reset; this new flag is not a persistent configuration file.

## Which BNs are suitable?

These default multipliers are mechanics, not a measured ranking. Advanced options can change feature availability. The dividend exponent is the initial exponent **before tribute-reducing unlocks**; it applies to the player's share of each market cycle's dividend, not directly to displayed revenue.

| BN | Valuation multiplier | Initial dividend exponent | Implication |
| --- | ---: | ---: | --- |
| 1, 3, 4 | 1 | 0.85 | Relatively favorable corporation conditions; only BN3 offers seed funding. |
| 2 | 1 | 0.75 | Offers remain strong, but personal payouts are weaker. |
| 5 | 0.75 | 0.85 | Moderate offer penalty with the stronger payout exponent. |
| 6, 7 | 0.2 | 0.75 | Lower offers; compare the ramp time with the alternative Bladeburner route. |
| 8 | 0 | Disabled | Do not attempt corporation startup. |
| 9 | 0.5 | 0.60 | Hash support is available, but personal payouts are substantially compressed. |
| 10 | 0.5 | 0.75 | Useful for repeated costly progression if enough BN time remains. |
| 11 | 0.1 | 0.75 | Reduced offers make fixed funding targets slower. |
| 12 | Falls with BN level | 0.65 | Re-evaluate as node difficulty rises. |
| 13 | 0.001 | 0.25 | Especially poor for early dividend income; avoid assuming BN3 timing. |
| 14 | 0.4 | 0.75 | Moderate offer/payout penalties. |
| 15 | 0.2 | 0.25 | Strong payout compression despite corporations being available. |

## Remaining optimizations to benchmark

- **Funding targets for rounds 2–4:** these remain $8.8t, $12q, and $500Q in every BN. Round 1 already scales with valuation, with a $190b transition floor. Later-round targets deserve BN-specific timing experiments, especially BN11/13/15. Multiplying every target by the valuation multiplier blindly can leave too little for fixed-price infrastructure and product development.
- **Earlier public payouts:** could help a money-starved player sooner, but going public forfeits all remaining private offers. The patch waits for all four offers by default and only resumes an early IPO if the player already made that decision. Benchmark time to useful player income before adding an automatic early-IPO policy.
- **Dummy Restaurant divisions:** current valuation rewards offices and warehouses. The official guide describes cheap, unstaffed six-city Restaurant divisions to improve offers. Reserve slots for this script's eight planned real divisions first: BN13 and BN15 allow only eight divisions. Do not automatically fill those slots with dummies.
- **Late division creation is now repaired:** the [final backlog pass](remaining-fixes.md) checks actual division membership and reuses affordable creation/expansion with the BN division cap. It preserves the existing late revenue gate; changing when those industries pay off still requires timing.
- **Investment manipulation:** old noodle-click recipes are obsolete in the reference engine; the official guide explicitly calls the current effect negligible. The current valuation also averages ten cycles. Prefer measured improvements to products, staffing, research and capacity over assuming an old guide's offer spike still works.

## Verification and game testing

Passed:

```sh
node audit/2026-10-17-speedrun/checks/corporation-lifecycle.mjs
node audit/2026-10-17-speedrun/checks/hash-spending.mjs
node audit/2026-10-17-speedrun/checks/rpc-reserve.mjs
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src f5cfaa749aaea9bafe02c6f00de18aedb0fe6578
```

The official RAM calculator reports corporation manager 5.5 GB (previously 5.3), autopilot 4.2 GB, hash spender 8.25 GB, and BN1 guide 8 GB. The corporation RPC helper still needs 23.6 GB on home while calls run; the manager's displayed RAM is not its full home-helper requirement. The extra API cost is covered by the updated override. Syntax and diff-whitespace checks pass.

Lifecycle checks cover truthy failure statuses, seed funding, exact affordability, changing reserves, failed/stale creation replies, existing corporations with no personal cash, private/public phase transitions, failed IPOs, working-capital protection, and unchanged bootstrap targets. Hash tests execute the real spending loop with mocked transport.

After pulling, restart the affected `autopilot.js`, `corporation.js`, and `spend-hashes.js` processes so they use the updated code. In a test save, check BN3 seed startup; a non-BN3 paid-API startup; management after an augmentation reset; public payouts after investment four; and a short focused hash-funding run. Record time to first product, each investment, first player dividend, and useful faction bribes. Live market behavior, end-to-end profit growth, and actual speedup remain unmeasured. Cash checks are not an atomic lock against another script spending during the helper launch.

## Official references

- [Creation eligibility and costs](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Corporation/helpers.ts), [creation and IPO actions](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Corporation/Actions.ts).
- [SF3 API grants and seed shares](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/PersonObjects/Player/PlayerObjectCorporationMethods.ts), [API unlock costs](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Corporation/data/CorporationUnlocks.ts).
- [Valuation, public offer behavior, dividend exponent and division cap](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Corporation/Corporation.ts), [BN multipliers](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/BitNode/BitNode.tsx).
- [Hash purchase values](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Hacknet/data/HashUpgradesMetadata.tsx), [hash effects and corporation prerequisite](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Hacknet/HacknetHelpers.tsx).
- [Augmentation versus Source-File reset](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts).
- [Official growth advice](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Documentation/doc/en/advanced/corporation/general-advice.md), [dummy divisions, exports, and noodles](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Documentation/doc/en/advanced/corporation/miscellany.md).
