# Remaining audit fixes — combined testing branch

All 18 original findings now have implemented fixes and positive offline checks on `testing/bn1-go-audit` / [PR #34](https://github.com/crazydubc/bitburner-scripts/pull/34). This closes the known implementation backlog, not the need for live testing or proof that every script is bug-free. The earlier follow-ups describe intermediate states.

| Findings | Completed behavior |
| --- | --- |
| B01, B11 | Bounded helper launches/replies, low-RAM calculator inputs, effective API RAM and error propagation |
| B02 | Authoritative home state, verified casino earnings before share purchases, fresh synchronous purchase checks |
| B03, B04, B06, B10, B17, B18 | Previously repaired cracker inventory, purchase budgets, sleeve cash/augs, rooted RAM and stasis capacity |
| B05, B07, B08 | Previously repaired intelligence handoff, reset preparation and Bladeburner progression |
| B09 | Due-time scheduling, one manager per filename, isolated launch failures |
| B12 | Previously repaired hash targets, caching and spending priority |
| B13 | Home backdoor children with explicit routes, target capture and duplicate prevention |
| B14 | Persistent failed-contract quarantine, version/input-aware retries and a reserved final attempt |
| B15, B16 | Finite leftover accounting, awaited hostname-based target changes and correct weakening/growth calculations |

## Helpers and purchases

The batch and grow wrappers collect BN multipliers **before** starting their calculators. Both calculators use shared pure formulas and make no nested home RPCs. Before SF5, the ordinary-BN multiplier table runs in 2.6 GB; with SF5 or in BN5, the wrapper allocates 6.6 GB for the real API. This removes the reported overlapping-helper deadlock. It does not make the entire automation suite fit beside other processes on 8 GB home; insufficient RAM still produces a bounded launch error.

Known `bin/` requests have reply budgets: 30 seconds for ordinary queries, two minutes for batch/target calculations and corporation `nextUpdate`, five minutes for the batch dispatcher, and ten minutes for Go turns and Stanek charging. A Singularity backdoor request uses its estimated installation time plus headroom. Custom non-`bin/` callers retain their lifetime contract. When a budget expires, a 2.1 GB helper is asked to kill only that child PID. If it cannot launch, the error identifies the PID and duplicate retries from that caller are suppressed until it stops. No timer can recover a fully blocked browser JavaScript thread.

Corporation, stock, sleeve, hacknet, Bladeburner, gang and Stanek wrappers now use the same error boundary as Singularity. Valid `false`, `0`, `null` and `undefined` results remain valid; `ERROR:` replies become exceptions. Helpers register their exit reply before calling the API, reject serialization failures, and check the effective RAM charge. Sleeve purchasing and optional Bladeburner completion checks recover without treating failure as success.

`bin/purchase.js` runs each supported purchase on home. It reads the current reserve, cash and price, then invokes the synchronous API without an intervening await. This closes the stale-budget window between competing automatic buyers without a persistent lock. Receipts report confirmed spending, including successful hacknet node index zero. Integrated callers are cloud/home upgrades, hacknet investment/capacity, gang equipment, sleeve augmentations, stock purchases/access and corporation creation.

Both long and short share buys additionally require `getMoneySources().sinceInstall.casino >= 10e9`. Unrelated wealth, port 40 and a crashed coinflipper cannot release that gate. An augmentation reset naturally clears it. The intentional $8b reserve formula, manual `stockmaster.js --liquidate`, and automated `--liquidate-once` behavior remain intact. The coinflipper's city comparison is also corrected.

Existing explicit reserve overrides and the small hash-capacity exception retain their meaning. These checks do not govern manual purchases, ongoing training costs, intentionally unrestricted BN10 sleeve acquisition, or final reset spending. They also do not preempt already-running older scripts; restart affected managers after pulling.

## Scheduling, backdoors and contracts

Autopilot honors `nextRun` for both manager lists, preserves startup staggering, and catches individual launch failures. It keeps one continuous four-hour-payback hacknet manager. The two ineffective duplicate passes (eight-hour and effectively unlimited payback) are removed instead of suddenly activating speculative spending.

The backdoor parent can run remotely, but launches each child on home with an explicit route and the effective SF4 RAM requirement. Each child connects and starts installation synchronously before yielding, so another child cannot change its selected target. It returns the terminal to home after installation and verifies success. Existing children are deduplicated per target; the exact hacking-level boundary is accepted. Automatic children never backdoor `w0r1d_d43m0n`, leaving BN transitions to autopilot.

Contract failures are recorded on home in `/data/contract-quarantine.json`. Identity includes server, filename, contract type, input fingerprint and solver-source fingerprint. Identical failed work is skipped across restarts. Changed data/code permits a new attempt; the last remaining attempt is still reserved. An attempt is journaled before submission, so interruption cannot silently cause an identical retry. Corrupt quarantine state fails explicitly. Solver algorithms are unchanged.

After reviewing a failed answer, explicit retries are available through the scanner:

```text
run Tasks/contractor.js --retry-failed
run Tasks/contractor.js --retry-failed --allow-last-attempt
```

The first command still protects final tries. The second permits them and can exhaust a contract; neither is enabled by autopilot. A fresh contract with only one remaining try is also skipped by default. Quarantine metadata is retained for inspection rather than automatically deleted.

## Batcher and corporation scope

Kernel leftover accounting now subtracts the actual batch thread record, and a target change awaits a calculator result using the hostname. The helper uses `weakenAnalyze(1, 1)` instead of 1.5, conservatively covering distributed one-core workers. Shared growth/chance/percent mechanics are checked against the pinned official engine; growth iteration is bounded and chance correctly groups the intelligence multiplier. All three existing batch types are exercised. Batch timing, staggering, placement and target-selection policy are unchanged.

Corporation missing-division checks now inspect the actual division list. An absent division can be created; an API failure is not mistaken for absence. Late Water Utilities, Computer Hardware, Refinery and Mining reuse the normal affordability/infrastructure path and respect the active BN division cap. The six-city Agriculture → round-two Tobacco → Chemical sequence, investment targets and late-industry revenue gate remain unchanged. Creation uses the shared purchase guard. SF3.3 still saves the corporation's API fees; it does not remove the player's $150b entry fee outside BN3.

The [BN route](bitnode-route.md), intelligence bounds and Go strategy have no further policy changes in this follow-up. Earlier IPOs, different investment thresholds, shorter SF3/SF10 blocks and stronger Go heuristics remain experiments requiring measurements, not unfinished defect fixes.

## Verification

All eleven positive checks listed in [README.md](README.md) pass. New checks cover real API helpers through PID ports, serialization/RAM failures, timed-out children, purchase-time changes, manager scheduling, home backdoors, contract quarantine and late corporation expansion. The batch fixture covers 243 planning combinations, every supported batch type, one/eight-core security capacity and money recovery. A separate comparison executes the pinned engine's growth, chance and percent functions.

```sh
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/remaining-paths.mjs
node audit/2026-10-17-speedrun/checks/batch-correctness.mjs /path/to/bitburner-src
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src a9ae1be1521746e24df8b1674b614be8c2fab45d
```

The reference checkout is official stable `1da7316ffd9d281b45a86c4c54ec532276557892`, version 3.0.1. Syntax and whitespace checks also pass. The official RAM calculator reports these changes from the previous testing head:

| Script | Before GB | After GB |
| --- | ---: | ---: |
| bn1-guide.js | 8 | 8 |
| autopilot.js | 4.2 | 4.2 |
| kernel.js | 5.3 | 5.3 |
| host-manager.js | 7.3 | 4.8 |
| sleeve.js | 7.35 | 3.35 |
| stockmaster.js | 5.05 | 6.05 |
| hacknet-upgrade-manager.js | 10.65 | 10.15 |
| spend-hashes.js | 8.25 | 7.25 |
| bin/getHackP.js | 3.1 | 5.1 |
| bin/getGrowThreads.js | 8.1 | 4.1 |
| bin/getbnmultis.js | 6.6 | 2.6 before SF5; 6.6 with API |
| backdoor parent | 8.7 | 5.45 |
| backdoor child | 3.6 | 7.6 at full SF4; higher with partial SF4 |
| contract solver | 11.6 | 13.85 |

Purchase/API helpers additionally allocate the exact effective cost of the requested methods; entry-point RAM alone is not the combined live footprint. The guide's 8 GB fit and a calculator chain within 8 GB are separate checks.

In-game testing should confirm a cold BN1/post-install start, zero share buys before casino completion, stock liquidation while autopilot remains active, a forced batch target switch with restored money/security, remote backdoor completion, and corporation expansion/payouts in another BN. Record time to the same augmentation/BN milestones when comparing the route. No live save, reset, BN transition or measured speed improvement is claimed by these offline checks.
