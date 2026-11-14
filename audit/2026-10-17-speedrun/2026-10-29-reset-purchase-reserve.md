# Augmentation-install purchase reserve regression — October 29, 2026

The reported `gangs.js` startup failure is reproducible on `be77c4c`: `Purchase failed: ERROR:Error: Invalid purchase budget/reserve`. The strict shared purchase guard rejected a valid explicit reserve supplied as a string.

## Cause and correction

`ascend.js` launches the final gang and sleeve spending passes with `--reserve '0'`. Their flag schemas default `reserve` to `null`; the game's `Flags` implementation selects `String` for that default. Gang budget arithmetic already converts the option to a number, but its purchase request forwards the original string. The helper's `Number.isFinite('0')` rejects it. Gang initialization runs this purchase pass before its main-loop error handler, explaining the startup stack and stopped gang manager.

`purchase-guard.js` now converts nonempty numeric reserve strings before the existing validation. This shared boundary also covers sleeves, hacknet and stock callers, including already-running offloaded callers sending the old argument shape. No manager's spending policy or reset launch arguments change.

- Explicit numeric zero, as a number or string, retains its intended reserve override for the final spending pass.
- Nonzero numeric strings retain their protected cash amount. Blank strings, booleans, arrays, objects, negative amounts, invalid text and nonfinite amounts are rejected.
- An omitted/null override still rereads the authoritative home reserve in the purchase helper. Current cost, budget, home cash and casino checks remain in place.
- No new API or RAM charge is introduced.

## Apply

```text
run git-pull.js --branch testing/bn1-go-audit
```

Wait for the pull to finish. New home purchase-helper launches load the correction, including requests from an existing offloaded manager. If gangs already stopped, a running autopilot will relaunch them. Keep the normal cash reserve; setting the global reserve to zero is not the fix.

## Verification

- `checks/reset-purchase-reserves.mjs` extracts the actual reset launch arguments and runs the real gang upgrade planner and sleeve buyer through `utils.purchase` and the home helper. Both reproduce the old error and successfully buy with the corrected guard. It checks numeric/string zero, nonzero/scientific-notation reserves, invalid values, a home reserve changed after planning, and insufficient budget/cash.
- `checks/api-errors.mjs` preserves purchase API errors, fresh home state, stock position enums and the casino/$8b gate.
- `checks/purchase-ram.mjs` passes all 23 guarded operations across 115 BN/SF4 combinations, including old callers and denied RAM increases.
- `checks/resource-purchases.mjs` passes existing spending limits, sleeve batch accounting and other resource purchase checks.
- The official RAM comparison checks 51 entry points against `be77c4c`; costs are unchanged. Syntax and whitespace checks pass.

These checks use offline fixtures; no live augmentation reset was performed.

The flag-type behavior was verified against the local official [Flags implementation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Flags.ts).
