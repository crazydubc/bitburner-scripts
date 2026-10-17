# Helper reliability and authoritative reserve state

This follow-up is on `testing/bn1-go-audit` / [PR #34](https://github.com/crazydubc/bitburner-scripts/pull/34). It improves the B01/B02/B11 failure paths without changing batch timing, Go move selection, the BN order, or the $8b reserve formula. These findings remain **partially repaired** for the reasons below.

## Implemented

- **Bounded launches:** a missing/invalid home helper fails immediately. Repeated failed launches stop after ten seconds with the script name and RAM requirement. A transient failure can still recover within that window.
- **Reply recovery:** read an already-written reply immediately; otherwise keep event-driven replies and check the child's PID once per second. A child that exits without replying reports an error instead of leaving the parent waiting forever. Successful calls do not incur an artificial sleep. Existing response types, including `false`, `0`, `null`, and `undefined`, are preserved.
- **Long operations remain valid:** a live Go turn, backdoor, or target calculator is not killed merely because it takes longer than a fixed deadline. The watchdog detects dead children; it does not impose a universal response timeout.
- **Singularity RAM and results:** preallocate the effective function cost plus script base RAM using `getFunctionRamCost`, retaining a 6.6 GB minimum. The helper checks its allocation before calling the API. Singularity `ERROR:` responses throw an explicit caller error. The optional reset-time core upgrade loop stops on false/errors; Daedalus joining requires `true`.
- **Home fallback:** persistent managers still prefer remote hosts, but can use home while leaving the existing 16 GB reserve. RAM sizing reads the script on home even when the launcher is offloaded; a missing local copy cannot turn into a zero-RAM estimate. A script offloading itself from home cannot fall back to relaunching itself on home, which would create a restart loop.
- **Current reserve on home:** autopilot and reset preparation write the authoritative `reserve.txt` on home. Stock, server, sleeve, gang, hacknet, hash-capacity and status readers retrieve that value. Remote reads/writes use the small `bin/reserve.js` helper; stale remote files are ignored. Malformed values and transport failures prevent the spending decision instead of being converted to zero. A missing home reserve still means zero for standalone scripts, and explicit reserve options remain available.
- **Deployment configuration:** before a remote launch, `bin/sync-script-config.js` copies the script's current home configuration or removes a stale remote copy when home has none. A failed copy prevents launch. Configurations remain startup settings; this does not hot-reload already-running managers. Both new helpers are in the downloader's fallback list.
- **Process lookup:** `whichServerIsRunning` / `isScriptRunning` scan hostnames and processes directly, avoiding a home helper and full server snapshots. The BN1 guide still detects offloaded autopilot instances, including when home is nearly full.

## RAM and verification

The official 3.0.1 RAM calculator at `1da7316ffd9d281b45a86c4c54ec532276557892` was run with a JavaScript-only parser/module adapter. It caught an intermediate guide cost above 8 GB. Reusing the existing home snapshot and removing a redundant daemon-existence query restored the cold-start fit.

| Script | Before this follow-up | After |
| --- | --- | --- |
| `bn1-guide.js` | 7.95 GB | **8.00 GB**, still fits fresh home |
| `autopilot.js` declared override | 4.00 GB | 4.20 GB |
| `corporation.js` declared override | 5.00 GB | 5.30 GB |
| `kernel.js` | 5.20 GB | 5.30 GB |
| `go.js` | 3.10 GB | 3.50 GB |
| New reserve helper | — | 1.65 GB on home |
| New configuration helper | — | 2.90 GB on home |

The fixed manager overrides include the added helper API charges and a small margin. The RAM check compares added API costs with the previous revision; it does not prove every pre-existing dynamic path under an override. Some scripts intentionally omit static-only costs such as DOM access.

Passed checks:

```sh
node audit/2026-10-17-speedrun/checks/rpc-reserve.mjs
node audit/2026-10-17-speedrun/checks/resource-purchases.mjs
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/go-lifecycle.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src 21ca8ead1daf16c939adf06e3165f32ab982e675
```

The new transport checks execute the repository functions with mocked hosts/ports. They cover immediate and delayed replies, missing scripts, capacity recovery, exhausted retries, dead children, a live operation lasting over two minutes, effective SF4 RAM levels, denied APIs, failed RAM allocation, fresh remote reserve reads/writes, malformed state, configuration failures, persistent home fallback, self-relocation, and the unchanged $8b/Daedalus reserve calculations. Existing guide supervision, stock liquidation, resource purchases, and Go lifecycle checks also pass. Changed JavaScript parses and `git diff --check` passes.

## Remaining scope and game testing

- B01: helpers still execute on home. Nested helper chains can exceed an 8 GB home; they now report launch failure rather than retrying forever. A child that remains alive but makes no progress still needs operation-specific recovery. This is not a complete low-RAM bootstrap redesign.
- B02: the $8b spending rule is preserved, but a verified casino-completion gate is still separate work. Cash, process exit and port 40 are not sufficient proof of casino completion. There is no cross-script spending lock, and budget snapshots can still age across asynchronous operations. Existing explicit reserve exceptions are unchanged.
- B11: Singularity failures are handled at the wrapper boundary. Other API wrappers retain their legacy result contracts and need separate review; this is not a global RPC-envelope migration.
- Pull the same testing branch and restart affected managers to load the new helper/state code. Existing processes continue with their old imports and policies. Preserve any intentional stock liquidation hold (`run stockmaster.js --liquidate`) while testing installation preparation.
- In game, check that the guide runs on an otherwise empty 8 GB home, offloaded autopilot is detected, purchases on remote hosts follow home's reserve, missing helpers produce actionable errors, and normal long operations continue. A live save was not accessed or modified during these checks. No guarantee of zero regressions or measured speedup is claimed.

The reported Go record is preserved in [go-assessment.md](go-assessment.md). This follow-up changes no Go strategy.
