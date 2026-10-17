# Findings

Locations refer to the audited commit recorded in [sources.md](sources.md). P1 means a conditional hang, progression blocker, reserve breach, or material correctness failure; P2 means lost output, fragile behavior, or a lower-priority affected path. Severity does not imply the condition is happening in the current save.

“Execution” below means the actual function or extracted function was run with bounded mocks. “Source” and “arithmetic” checks establish narrower facts; they are not live-game reproductions.

**Current testing-branch status:** B03, B04, B06, B10, B17, and B18 have implemented fixes and positive checks. B01, B02 and B11 are partially repaired. The table and original evidence below describe the audited baseline; follow-up notes distinguish applied changes from remaining work. See [resource-purchase-fixes.md](resource-purchase-fixes.md) and [helper-state-fixes.md](helper-state-fixes.md) for implementation and live-test limits.

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| B01 | P1 | Home-only RPC can wait forever; persistent launcher excludes home | Execution + source |
| B02 | P1 | Reserve/config state does not follow remote consumers; Daedalus stop flag is unused | Source |
| B03 | P2 | Cracker detection skips and shifts entries | Execution |
| B04 | P1 | Cloud-server purchases ignore the reserve/budget | Execution |
| B05 | P1 | Intelligence-farm readiness/completion can stall the current BN | Source |
| B06 | P1 | Sleeve buyer never refreshes purchase-loop cash | Execution |
| B07 | P2 | Reset/Bladeburner paths launch nonexistent scripts | Source + file existence |
| B08 | P1 | BN6 Bladeburner API access is rejected; alternate victory is not detected | Source + engine |
| B09 | P2 | `alwaysRun` prevents periodic tasks from running | Execution |
| B10 | P2 | Sleeve augmentation batches skip the first augmentation | Execution |
| B11 | P1 | Truthy RPC errors can loop forever; fixed Singularity RAM breaks partial SF4 | Execution + source + engine |
| B12 | P2 | Hash upgrades default to a server object; unnecessary target scans repeat | Source |
| B13 | P2 | Remote backdoor launcher lacks its child script | Source |
| B14 | P2 | Failed coding-contract answers are retried indefinitely | Execution |
| B15 | P1 | Batcher leftover count becomes `NaN`; target-switch calculator call is malformed | Execution + source |
| B16 | P1 | One batch calculator assumes 1.5 weakening per thread | Execution + engine |
| B17 | P2 | RAM-selection helper skips rooted hosts and counts unrooted ones | Execution |
| B18 | P2 | Darknet stasis spawn requests more RAM than fits | Arithmetic + source |

## B01 — Unbounded home RPC waits

**Testing-branch follow-up:** missing helpers and ten seconds of failed launches now produce explicit errors. A watchdog detects a child that dies without replying while preserving event-driven successful replies and legitimately long live operations. Persistent launches can fall back to home within its 16 GB reserve; self-offloading cannot loop back onto home. Process lookups no longer need a home RPC. Nested home RAM requirements and recovery for live-but-stalled children remain open; see [helper-state-fixes.md](helper-state-fixes.md).

**Where:** `utils.js:160–175,180–240`; nested helpers including `bin/getHackP.js` and `bin/getbnmultis.js`.

`runScriptLocal` always executes on `home`, despite its name/comment. PID 0 causes an unlimited 10 ms retry loop. A launched child that dies without writing its PID port leaves the parent in `nextPortWrite` forever. The outer remote launch timeout cannot rescue a nested home RPC that never returns.

This is particularly costly on a fresh 8 GB home. For example, `getHackP` awaits a nested BN-multiplier helper: the former needs at least 2.9 GB (base + `exec`), while the latter statically charges 6.6 GB (base + `getBitNodeMultipliers` + `getResetInfo`) in the reference engine. Together they exceed 8 GB before other processes. Moving the caller off home does not move these nested RPCs.

Separately, `runScriptSomewhere(..., persistent=true)` cannot use home: its home fast path requires `!persistent`, its scan skips home, and the final home fallback is commented out. Idle upgraded home RAM can therefore coexist with failed persistent launches.

**Evidence:** actual RPC function retried six impossible launches until the fixture stopped it; a dead-child fixture remained awaiting a port with no recovery check. Source establishes the persistent-home exclusion. RAM figures are a source calculation, not an engine measurement.

**Repair:** bound launch attempts and response waits; distinguish timeout, missing file, insufficient RAM, and dead child; register child replies early; separate process launch from request/reply calls. Reserve enough *home* RAM for the largest overlapping helper chain. Allow persistent home fallback within that reserve. Do not simply delete all RAM reservations.

**Accept when:** startup either advances or produces a bounded actionable error at 8/16/64 GB; killing a helper cannot hang its caller; a persistent process can start on home when that is the only suitable host. Measure actual Netscript RAM for nested calls.

## B02 — Host-local state undermines the intended casino gate

**Testing-branch follow-up:** the Daedalus stop flag gates normal stockmaster launches. Manual `--liquidate` stays active without buying, while automated callers use `--liquidate-once`. Reserve readers/writers now use home, and remote launches synchronize startup configuration. Checks cover stale remote files, failures and the preserved $8b formula. Verified casino completion, cross-script spending coordination and rollout to running processes remain separate concerns; B02 is still partial.

**Where:** `autopilot.js:274,365–380,151–155,727–787`; `utils.js:52–62,415–420`; `stockmaster.js:123,159,198`; other `reserve.txt` consumers.

The owner clarified that **the $8 billion reserve prevents stock buying until the coinflipper finishes**. That requirement is valid and must stay. The issue is transport: `ns.read`/`ns.write` use the executing server, autopilot can relocate off home, and the remote launch bundle contains code but no `reserve.txt` or script configuration. A fresh remote stockmaster reads missing reserve state as zero. A copied-once file can also become stale. Host manager, hacknet, gangs, and sleeves consume the same host-local pattern.

There is a second phase-control defect: `disableStockmasterForDaedalus` is set but never read in the stockmaster launch predicate. After liquidation/termination, autopilot can restart the trader while it is supposed to hold cash for the invitation.

**Evidence:** the actual bundle omits reserve/config files; empty local reserve is coerced to zero. Static inspection shows no launch-predicate read of the Daedalus flag. This does not establish that the current live trader is on an affected host.

**Repair:** make home the authoritative state owner and retrieve current state through a bounded RPC, or explicitly synchronize revisions before each spending decision. Include configuration in the deployment contract. Preserve the $8b pre-casino rule and model casino completion explicitly, scoped to `lastAugReset`, so unrelated cash cannot falsely signal completion. Keep Daedalus cash-holding state in the launch/buy decision.

Do not infer casino success merely from process exit or port 40: `coinflip.js` writes that port at the end of sampling and on exit. A successful earnings/banned-state check or a distinct verified completion result is needed.

Related small cleanup: the travel condition `!player.city != "Aevum"` is always true for city-name strings. It can add a pointless confirmation-element retry after successful travel. Use `player.city !== "Aevum"` and verify the refreshed city; the manual BN1 guide avoids that branch by traveling first.

**Accept when:** home and remote traders make the same reserve decision; zero trades occur before verified coinflip completion; crash/relaunch does not unlock buying; Daedalus liquidation remains in force until the invitation condition is resolved.

## B03 — Cracker inventory drops its first element

**Where:** `utils.js:405–407,557–560`; autopilot's new-cracker detection.

`filesExist` applies `slice(1)` to its filenames, then `getPortCrackers` uses those shifted booleans against the original names. BruteSSH-only ownership returns `[]`; FTP-only returns `['BruteSSH.exe']`; all five returns only four entries. New-tool root expansion can be delayed until another event, such as a hacking-level change, triggers a scan.

**Repair:** remove the slice and preserve one result per input. `Tasks/crack-host.js` can be run manually after a purchase until repaired. Its calls to unavailable port-opening programs are not a crash finding: the reference engine returns false for those calls.

**Accept when:** empty, each single-tool, and all-five inventories map exactly; purchasing BruteSSH triggers an immediate root pass.

## B04 — Initial cloud-server buying ignores its budget

**Testing-branch follow-up:** initial purchases and upgrades now share the original pass budget; actions recheck current cash/reserve and use engine prices. Tests cover the reported reserve breach, exact/partial affordability, spending during yields, and failed operations. B02's remote state transport and cross-script coordination remain separate limitations.

**Where:** `host-manager.js:15–29,33–50`.

The manager computes `min(money - reserve, money * 0.2)`, but its loop filling server slots never checks cost against that budget or subtracts purchases. Subsequent home/cloud upgrades also begin with the stale pre-purchase budget.

**Evidence:** executing the real function with $1m cash, $900k reserve, and $110k per 2 GB server purchases nine servers and leaves $10k. The function had correctly calculated only $100k as spendable.

**Repair:** check each purchase against current cash minus reserve and remaining iteration budget; decrement after success; re-read cash around competing buyers. Prefer buying useful capacity directly over filling 25 tiny slots when that has a shorter payback. Keep home-RAM prioritization, but account for the initial purchases before it.

**Accept when:** no successful purchase crosses the reserve or per-pass budget, including partial affordability and concurrent spending. Verify 2 GB purchase cost against the active BN, not a fixed constant.

## B05 — Intelligence farming lacks a live phase transition

**Where:** `autopilot.js:84–105,273,442`; `farm-intel.js:19–89`.

`shouldIntelFarm` is latched from startup intelligence. `readyToFarmIntel` is assigned only before the main loop. Invitations arriving later do not make the farm ready. Meanwhile `checkIfBnIsComplete` keeps returning false whenever the original farm intent was true, even if intelligence later reaches the threshold. The prerequisite logic has no explicit installed-CashRoot check.

The farm's low-ROI exit soft-resets into autopilot but records no completed-farm state. Autopilot can re-enter preparation below INT 230. Its stats file is local to the farm host, whereas the soft-reset callback starts on home; the first remote baseline may be lost.

**Repair:** implement explicit `prepare → farm → complete` state keyed to the current BN/run. Require installed CashRoot, refresh all ten company-faction access conditions, and keep farm progress on home. Make the completion latch survive augmentation/soft resets within that BN and release the BN finish gate. On farm completion, resume this same BN; do not flume.

The existing INT 230 threshold is a script policy, not a game cap. Add a finite time budget and compare expected remaining-run savings against time spent farming; a small continuing INT gain does not establish a speedrun benefit.

**Accept when:** invitations arriving after startup trigger farming; missing CashRoot prevents premature farming; low-ROI exit stays complete after restart; the existing BN can then finish. The runner checks the stale assignments, not the complete multi-reset state machine.

## B06 — Sleeve purchaser waits on stale money

**Testing-branch follow-up:** the buyer refreshes price/cash each iteration and proceeds when income crosses the price. Sleeve and memory purchase results require explicit success, supporting the current result object while rejecting truthy error strings/failed objects. A mocked full buyer run reaches the memory phase after purchasing.

**Where:** `purchaseSleeves.js:6–23`; BN10 completion gate at `autopilot.js:445–457`.

After Covenant membership is acquired, the purchase loop never refreshes `player`. If its captured money is below the next sleeve cost, the process waits forever even when income catches up. Autopilot refuses to leave BN10 until all purchasable sleeves and their memory are obtained, so this can block completion.

**Evidence:** the actual main function read the player once and attempted zero purchases after mocked live money rose above the price.

**Repair:** read current cash each iteration and after purchases; validate success explicitly. Preserve the separate memory loop's refresh behavior.

**Accept when:** starting below the price and subsequently crossing it causes a purchase without restarting the script; full sleeve/memory completion releases the BN10 gate.

## B07 — Missing filenames silently disable reset work

**Where:** `ascend.js:64,85,208`; `bladeburner.js:438,456`.

- `spend-hacknet-hashes.js` does not exist; the current script is `spend-hashes.js`.
- `Tasks/ram-manager.js` does not exist, so reset-time home RAM spending is skipped.
- The optional `daemon.js` reset fallback does not exist; the normal configured callback is `autopilot.js`.
- Bladeburner references the same absent hash spender, losing its intended rank/SP purchases.

`git-pull.js` also lists nonexistent `intel-farm.js` in its fallback files instead of `farm-intel.js`. This fallback deserves an inventory check; the normal GitHub tree path can hide the typo.

**Repair:** use existing entry points and verify positive launch PIDs. Implement a finite home-upgrade phase rather than replacing the missing reset helper with an unbounded manager. Likewise, ensure hash liquidation has a bounded completion contract before waiting on it. Refresh comments/status script names too.

**Accept when:** reset preparation actually spends eligible hashes, upgrades home under its budget, and starts the chosen existing callback. An absent phase must report failure instead of quietly continuing.

## B08 — Bladeburner access and victory are incomplete

**Where:** `autopilot.js:160,441–475`; `bladeburner.js:70,158`; `work-for-faction2.js:621`; `sleeve.js:462`.

The launch and entry gates require BN7/SF7. Reference game 3.0.1 grants the Bladeburner API through **BN6/SF6 or BN7/SF7**. A BN6-first route therefore has valid access that these scripts reject. Related faction/sleeve coordination also checks only 7.

After the final BlackOp, the Bladeburner manager alerts, but autopilot's completion path still requires the hacking/world-daemon route. The official `destroyW0r1dD43m0n` implementation accepts either legitimate completion condition. This forfeits much of the reason to obtain Bladeburner before difficult hacking nodes.

**Repair:** centralize capability detection for 6-or-7, respect BN-specific rank restrictions, and update all player-work coordination gates. Before The Blade's Simulacrum, player faction work and Bladeburner need explicit arbitration. Recognize completed BlackOps in the BN transition logic while retaining the user's intentional intelligence/sleeve completion gates.

**Accept when:** a BN6-only capability state launches and runs the manager; player work does not cancel it; final BlackOp completion can end the BN below world-daemon hacking requirements. Check behavior against the user's installed game version before rollout.

## B09 — Periodic `alwaysRun` is inverted

**Where:** `autopilot.js:218,225,397–402,170`.

`serverRunning = script.alwaysRun || await isScriptRunning(...)` makes `alwaysRun=true` entries permanently look active. The subsequent `!serverRunning` check prevents launch. The 8h/1% and effectively-unlimited-payback/0.1% hacknet passes never execute.

**Evidence:** executing the real scheduler with a due, eligible, absent `alwaysRun` process produced zero launches.

**Repair:** define whether the flag means “run despite another instance” or “ensure running,” then implement that behavior with a concurrency limit. Do not simply activate the enormous-payback pass without evaluating its reset economics. The hash-spender predicate also references `shouldUpgradeHacknet` as a truthy function instead of calling it; define hash *spending* eligibility independently from whether new hacknet investment is worthwhile.

**Accept when:** due eligible tasks launch once as intended, duplicate instances remain bounded, and false predicates suppress launches. Asynchronous helper `nextRun` fields are also currently unused by `checkOnRunningScripts`; honor or remove that misleading staggering configuration.

## B10 — Sleeve augmentation batch skips its first purchase

**Testing-branch follow-up:** all selected items are attempted in order, only successful purchases are removed/counted, and the cache is invalidated after a batch or exception. Partial failures preserve unbought items. Single-item, full-batch, failure, external-purchase, and cooldown cases pass.

**Where:** `sleeve.js:276` in `manageSleeveAugs`.

The generated purchase list is sliced with `.slice(1)`. A one-item batch makes no purchase call but is removed from the cached list and reported as fully spent. Larger batches omit their first augmentation.

**Evidence:** the real extracted function returned $100 spent for a one-item $100 batch while making zero purchase calls.

**Repair:** purchase the entire selected list, count only successful purchases, and refresh the cache after failure or external changes.

**Accept when:** one-item and multi-item batches purchase every eligible item; a failure does not erase unbought items or report fictitious spending.

## B11 — RPC errors are truthy; Singularity RAM is fixed

**Testing-branch follow-up:** `singRun` now budgets the effective API cost before launch and throws on its legacy `ERROR:` replies. The helper validates its RAM allocation; optional reset-core purchases stop on false/errors and Daedalus joining requires true. Other API wrappers still use legacy result contracts. SF4 cost cases and failure/recovery checks pass; see [helper-state-fixes.md](helper-state-fixes.md).

**Where:** `bin/singRun.js`; similar API wrappers; `ascend.js:162`; truthy result consumers including `autopilot.js:743`.

The Singularity helper returns strings such as `ERROR:...` on failure. Consumers that treat any truthy reply as success are unsafe. In particular, `while (await singRun(ns, 'upgradeHomeCores'))` can repeat forever on a persistent API error. The stray semicolon also places its explicit sleep after the loop, although each RPC itself yields.

**Evidence:** the actual helper returned a truthy error string after an injected API exception; the reset loop accepts that truthiness. Recent strict-result handling elsewhere in the repo is useful precedent to preserve and extend.

The helper's fixed 6.6 GB override is also insufficient outside BN4 with partial SF4. For example, `upgradeHomeCores` at SF4.1 costs 3 × 16 + 1.6 = 49.6 GB in the reference engine. Dynamic RAM enforcement may terminate the helper before its normal return, compounding B01. Finishing BN4.3 before leaving BN4 avoids this specific multiplier mismatch.

**Repair:** introduce an explicit success/error RPC envelope, or consistently validate each legacy return type at its boundary. Budget helpers from effective API RAM (`getFunctionRamCost`) rather than a universal constant. Convert errors to bounded caller failures, not success or endless waits.

**Accept when:** a denied/throwing API cannot hang reset or claim a faction join; SF4.1/.2/.3 outside BN4 either run within correct RAM or fail explicitly without hanging callers.

## B12 — Hash target has the wrong type and is recalculated unnecessarily

**Where:** `spend-hashes.js:43,81` and its server-specific `spendHashes` calls.

The default target is `await getOptimalTarget(ns)`, which returns a Server object. Reduce Minimum Security / Increase Maximum Money need a hostname string. An explicit `--spend-on-server n00dles` avoids this default-target bug.

The script also calls the expensive target selector every nominal 50 ms loop even for Sell for Money, which needs no server, and before deciding whether there are enough hashes. Actual iteration time will be longer because the selector awaits helpers.

**Repair:** resolve `.hostname` only for target-dependent purchases; validate it; cache the choice and refresh on meaningful progression/target changes. Skip targeting entirely for money, corporation, and Bladeburner hash purchases.

**Accept when:** omitted and explicit targets both pass valid hostnames for parameterized spends; non-server spends perform zero target scans; insufficient hashes cause a cheap wait.

## B13 — Remote backdoor deployment is incomplete

**Where:** `Tasks/backdoor-all-servers.js:77–99`; `utils.js:52–62`.

The backdoor task launches `Tasks/backdoor-all-servers.js.backdoor-one.js` with `ns.run` on its current host. The remote bundle omits that child. On a host without a previous copy, launching it returns PID 0. The duplicate-target scan also reads `script.scriptPath` instead of the server argument in `script.args[0]`.

**Repair:** include child scripts in a per-entry-point dependency manifest, or deliberately launch the child on home with checked RAM/PID. Deduplicate by normalized script filename plus target argument.

**Accept when:** a clean remote host can complete a backdoor using the deployed bundle and repeated sweeps do not launch duplicate work for the same server.

## B14 — Failed contract answers consume further attempts

**Where:** `Tasks/contractor.js.solver.js:60–80`; recurring contractor task in autopilot.

The failure file suppresses repeated messages; it does not skip a previously failed contract. Every sweep can submit the same wrong answer again until the contract disappears. The solver path does not consult remaining tries.

**Evidence:** two invocations of the real solver main, with an injected unsuccessful answer result, made two attempts on the same contract. This proves retry behavior, **not** that the prime-factor solver used in the fixture is incorrect.

**Repair:** quarantine failures by host, filename, type, data fingerprint, and solver version. Retry only after changed input/solver or explicit user action. Reserve the final try for validated algorithms and retain enough failure context for repair.

**Accept when:** an unchanged failed contract is not resubmitted on subsequent sweeps; a validated solver update or explicit retry can release quarantine.

## B15 — Two narrow batcher bookkeeping defects

**Where:** `kernel.js:169,239`.

`batchesTotal` is numeric, but leftover accounting reads `batchesTotal.H1/W1/G1/W2`. Subtracting the resulting undefined sum changes `threadsLeft` to `NaN`; later positive-thread checks cannot allocate that leftover work.

The target-switch branch calls `batchInfo = getHackP(ns, target, -1, -1, 1)` without `await` and passes the Server object instead of its hostname. Subsequent fields are read from a Promise; the helper invocation also receives an invalid script argument type.

**Evidence:** executing the exact subtraction with a numeric batch count produces `NaN`. The second call is a source assertion; a full live target transition was not run.

**Repair:** use the actual batch thread record in the first expression and await the correctly typed calculator call in the second. Keep timing, staggering, batch strategy, and target policy unchanged for these fixes.

**Accept when:** finite nonnegative leftover accounting survives batch placement; a forced target switch resolves a numeric batch record and launches no invalid arguments. Compare with the current batcher on the same save, target, and RAM.

## B16 — Batch calculator weakens at an impossible BN1 rate

**Where:** `bin/getHackP.js:9,27–48`; compare `kernel.js:17` and `bin/getOptimalServer.js`.

`weakenStrength = 1.5` conflicts with the engine's normal BN1 one-core 0.05 per thread, and with the other calculators' `ns.weakenAnalyze(1)`. Plans returned by this helper can substantially underbudget security recovery. It is used by preparation/fallback calculation; this does not prove every steady-state batch currently uses its output.

**Evidence:** executing the actual calculator with controlled server/growth/hack inputs returned 30 hack, 30 grow, and one weaken thread. Those actions add 0.18 security and remove only 0.05 in the BN1 one-core case. At least four weaken threads would be needed for the combined security amount, with placement depending on batch type.

**Repair:** use the correct engine weakening value, respecting the active BN and the cores of the worker hosts modeled by the plan. Keep the scheduler unchanged and check all supported batch types.

**Accept when:** planned weaken capacity covers the intended security increase at one and multiple cores and under altered BN weakening multipliers. Verify money/security after a controlled in-game sequence before enabling the fix in unattended runs.

## B17 — Maximum-RAM helper reverses the root test

**Testing-branch follow-up:** both root tests are corrected. Positive checks cover rooted home/workers, excluded unrooted hosts, optional hacknet capacity, and both persistent-capacity passes. Persistent-launch fallback remains part of B01.

**Where:** `utils.js:374,388` in `maxRun`.

Both passes skip a server when `hasRootAccess(server)` is true. They therefore ignore usable hosts and count unusable ordinary hosts when selecting the emergency reservation size.

**Evidence:** the actual function returned 512 GB from an unrooted host and ignored rooted home/worker hosts with 128/64 GB. The downstream allocator still checks root correctly, so the finding is misleading capacity/reserve calculations, not proven execution on an unrooted host.

**Repair:** invert the test and preserve the intended separate hacknet policy; make home inclusion explicit.

**Accept when:** only eligible rooted hosts contribute to available capacity, including home behavior for persistent and one-shot processes.

## B18 — Darknet stasis respawn overallocates RAM

**Testing-branch follow-up:** stasis/Labyrinth transitions now budget the full worker override plus a separate 13.6 GB stasis helper. Invalid or zero fits and shared-host conflicts are reported before `spawn`, which provides no return PID. Helper exit is checked against the actual link state, and the unused nonexistent `util.js` copy is removed. A mocked 128 GB transition clears stasis and returns to normal workers within the available RAM.

**Where:** `darknet.js:1410`.

The thread expression is `floor(freeRam / scriptCost + 12)`, but each spawned thread reserves `scriptCost + 12`. Adding 12 to the thread count is different from adding it to the denominator.

**Evidence:** at 128 GB free and script cost 12.55 GB, the expression requests 22 threads consuming 540.1 GB. This cannot fit.

**Repair:** divide by the full per-thread RAM override; reject non-finite or zero-thread results; report failed replacement launches. Check the surrounding missing `./util.js` copy reference against the real dependency manifest too, without assuming that unused missing file explains all darknet behavior.

**Accept when:** requested threads × per-thread override never exceed usable RAM, and the transition behaves safely when no replacement fits.
