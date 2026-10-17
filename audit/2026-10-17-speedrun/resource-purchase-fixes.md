# Resource and purchase fixes on the combined testing branch

These changes address B04, B06, B10, B17, and B18 on `testing/bn1-go-audit` / [PR #34](https://github.com/crazydubc/bitburner-scripts/pull/34). The hacking batcher, $8b reserve policy, BitNode order, and corporation strategy are unchanged.

| Finding | Change | Focused evidence |
| --- | --- | --- |
| B04: cloud purchases exceed the budget | Initial server purchases and later upgrades share the original `min(cash - reserve, 20% of cash)` allowance. Each action rechecks current cash and reserve. Successful initial purchases reduce the allowance; failed purchases stop the slot-filling loop. Home-upgrade RPC errors no longer count as success. | The $1m cash / $900k reserve / $110k server case makes zero purchases. Tests cover exact affordability, combined purchases/upgrades, competing spending during yields, reserve increases, later income, failed purchases, and invalid costs. |
| B06: sleeve purchases wait on stale cash | Refresh the next sleeve price and player cash each iteration. Accept only explicit success from boolean or `{success: true}` results, including memory purchases. | A buyer starting below the price purchases after income rises and reaches the memory phase. Failed result objects and RPC error strings produce no success reports. |
| B10: sleeve aug batches skip the first item | Attempt every selected augmentation in order, remove only confirmed purchases, and return only confirmed spending. Reconcile the cache after a batch or exception. Apply purchase cooldown and stat invalidation only after a successful purchase. | One-item and multi-item batches buy all selected items. Partial failures retain unbought items, refresh after external purchases, and preserve correct spending/cooldown state. |
| B17: usable-RAM calculation includes unrooted hosts | Correct both root filters in `maxRun`. Keep the existing home, optional hacknet, and emergency-reservation policies. | Rooted home/worker RAM counts; unrooted ordinary hosts do not. Both passes, persistent calls, and optional hacknet inclusion are covered. |
| B18: darknet stasis respawn overallocates | Divide worker capacity by its full RAM override and leave 13.6 GB for the separate stasis helper. Apply the same capacity check when entering the Labyrinth worker mode and returning to normal work. Reject invalid/zero fits and postpone replacement while another process shares the host. Confirm the actual stasis state after the helper exits. Remove the unused nonexistent `util.js` copy. | On an unblocked 128 GB host, the transition uses one worker with four threads at 24.55 GB each plus a 13.6 GB helper, then returns to ten normal threads at 12.55 GB each. Tests execute the actual transition and clear-stasis entry path, not just the thread formula. |

The host manager still starts new cloud slots at 2 GB and retains its existing home-before-cloud-upgrades order. Directly buying larger servers and changing investment policies are separate optimizations to measure later.

The official game reference remains stable `1da7316ffd9d281b45a86c4c54ec532276557892` (3.0.1). In that source, sleeve purchases/memory upgrades return result objects, sleeve augmentation purchases return booleans, and `spawn` terminates its caller without returning a PID. The stasis helper's 13.6 GB is the 1.6 GB script base plus the 12 GB `setStasisLink` API cost. Preflight checks are therefore necessary before replacing a darknet worker.

## Verification

From the repository root:

```sh
node audit/2026-10-17-speedrun/checks/resource-purchases.mjs
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/go-lifecycle.mjs
```

These checks pass with mocked Netscript transport. Changed gameplay scripts also pass `node --check` and `git diff --check`. No save, purchases, or live game actions were performed during verification. The original `reproduce.mjs` remains historical evidence of the pre-fix bugs; its defect assertions are expected to fail on repaired paths.

## In-game checks and remaining limits

- After pulling, restart the affected running managers/workers to load their new code. Watch host purchases against the reserve and the per-pass allowance.
- For darknet, check that stasis transitions can launch their helper and return to ordinary workers. If another script shares the host, the transition reports that it is waiting rather than sizing a replacement as though it owned all RAM.
- In a later BN10 run, let income cross a sleeve price without restarting `purchaseSleeves.js`; confirm the purchase and subsequent memory upgrades. Watch an eligible one-augmentation sleeve batch complete.
- The later [helper/state follow-up](helper-state-fixes.md) makes home the authoritative reserve/configuration source. Cloud purchases/upgrades check current cash immediately before their synchronous API calls, but the home upgrade still goes through asynchronous Singularity RPC. Cross-script spending locks and verified casino completion remain open.
- The same follow-up bounds failed launches, detects dead children and budgets Singularity RAM. Other wrapper contracts, live-but-stalled children and nested low-RAM chains remain open. These checks do not establish full low-RAM bootstrap reliability or measured speed improvements.
