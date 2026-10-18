# Batch startup regression after pulling c6a62fd

The user reported `kernel.js@CSEC` passing `undefined` batch fields and `NaN` preparation counts to `exec`, with an initial weaken count of 460. This was a regression introduced by the final audit patch, not evidence that the original batch scheduling needed replacing.

The new home calculators required a serialized multiplier argument. An already-running/offloaded kernel retained the old `utils.js`, which sends four arguments to `getHackP` and three to `getGrowThreads`. Both new helpers attempted `JSON.parse(undefined)` and returned their failure strings. The old wrapper returned those strings unchecked: batch fields became undefined and `Math.ceil` of the grow reply became NaN. The reported `serverRun` line 17 matches the previous utility file. The `daemon.js` label was stale kernel logging and is also corrected.

The multiplier argument is now optional. Current callers still prefetch it to keep helper RAM low. Legacy calls read multipliers inside the calculator without launching a nested RPC, allocating the additional effective RAM before reading reset/API data. Both interfaces return the same calculation results. The existing ordinary-BN fallback table is shared rather than duplicated.

Kernel validates batch/grow replies before preparation uses them, and the current dispatcher wrapper rejects undefined, nonfinite, negative or fractional counts before `exec`. No target-ranking, timing or placement change is included.

| Call path | Batch helper GB | Grow helper GB |
| --- | ---: | ---: |
| Current caller with prefetched multipliers | 5.1 | 4.1 |
| Legacy caller before SF5 | 6.1 | 5.1 |
| Legacy caller with SF5 or in BN5 | 10.1 | 9.1 |

The legacy path fails explicitly if that extra RAM is unavailable. Restarting from updated home files uses the lower-RAM current path. Kernel remains 5.3 GB and the BN1 guide remains 8 GB under the pinned official calculator.

`checks/batch-upgrade-compatibility.mjs` imports the actual utility file from `a9ae1be`, calls the new helpers, and executes the real kernel preparation loop through dispatcher argument construction. It covers the reported 460-weaken scenario, BN1/BN4/BN5, earned SF5, old/new result equality, effective RAM charging, denied allocation and invalid dispatch inputs. This adds the mixed-version upgrade case missing from the earlier checks. The twelve positive checks, formula comparisons, syntax checks and official RAM check pass; live confirmation is still required.

```sh
node audit/2026-10-17-speedrun/checks/batch-upgrade-compatibility.mjs
```

Pull `testing/bn1-go-audit` again. After the pull completes, stop the existing kernel and autopilot instances, then start `autopilot.js` from home. Its current launcher copies the current dependency bundle when offloading. Merely restarting an old remote copy can reload stale files. Other scripts need not be stopped to recover this particular kernel error.
