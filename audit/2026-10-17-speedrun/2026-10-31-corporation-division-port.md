# Corporation division deprecation warning — October 31, 2026

All direct corporation division reads in the testing branch already use `.industry`. The remaining `ns.corporation.getDivision().type` warning comes from the return transport in `bin/corpRun.js`.

The official `getDivision` result includes a supported `industry` field and an enumerable, non-configurable deprecated `type` getter. Writing the whole result to a Netscript port calls `structuredClone`, which reads enumerable values and therefore invokes that getter. No explicit `.type` read in the manager is required.

## Fix

The helper now copies `getDivision` results while excluding the `type` key **before reading its value**. It retains all other enumerable fields, including future supported fields. `Object.entries`, object spread or copying then deleting would read the getter too early; deleting the alias on the original game result would fail because it is non-configurable.

The original game result is not changed. Other corporation responses, including unrelated `type` fields, primitives and asynchronous results, retain their existing behavior. API and serialization failures still propagate. No management strategy, spending, dividends or batcher behavior changes.

## Apply

```text
run git-pull.js --branch testing/bn1-go-audit
```

Wait for the pull to finish. Subsequent home `bin/corpRun.js` launches load the fix, including calls from an offloaded corporation manager. Historical terminal warnings remain in the terminal; the patch prevents new getter reads. The game displays each deprecation warning only once per session, so lack of a repeated message in the same session alone does not prove the fix.

## Verification

- `checks/corporation-port.mjs` uses the official division-result builder, deprecation helper and port implementation with the real `utils.corpRun`/home helper. The old helper reproduces the exact warning; the new one returns the same supported fields with no deprecated getter access.
- Checks cover an alias getter that throws, its non-configurable descriptor, future public fields, a result after the alias has been removed, unrelated response types, asynchronous results, and API/serialization errors.
- Existing API-wrapper, corporation lifecycle and bounded corporation expansion checks pass.
- Official RAM comparison across 51 entry points versus `9655efa` shows no changes. `bin/corpRun.js` remains 23.6 GB at its base allocation; API-specific overrides remain unchanged. Syntax and whitespace checks pass.

No live game save was run. Primary source code inspected locally:

- [Division result and deprecated alias](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Corporation.ts)
- [Deprecated property getter](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/utils/DeprecationHelper.ts)
- [Port cloning](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptPort.ts)
