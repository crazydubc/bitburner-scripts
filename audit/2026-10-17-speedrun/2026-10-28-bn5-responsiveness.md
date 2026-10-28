# BN5.1 unresponsive-window investigation — October 28, 2026

The report occurred during normal automated play with approximately 1.05 PB of home RAM and 99.9% utilization. The Electron warning does not identify a script or prove an infinite loop. The subsequent live diagnostic strongly points to process pressure, although it did not capture the earlier freeze itself.

## Live diagnostic supplied at 21:39 UTC

| Measurement | Value |
| --- | ---: |
| Home RAM | 1,048,576 GB |
| Free home RAM, before and after sample | 52,382.8 GB |
| Reachable hosts | 95 |
| Total processes | 300,081 |
| Total threads | 1,049,528 |
| Hack workers | 100,000 processes / 400,000 threads |
| Grow workers | 100,001 processes / 300,940 threads |
| Weaken workers | 100,044 processes / 101,217 threads |
| Share workers | 26 processes / 247,361 threads |
| 100 ms sleep overruns | 19 ms maximum / 6.8 ms mean |

About 300,000 tiny hacking workers match the existing 99,999-batch allowance plus prep/host splits. Free RAM comfortably exceeds helper requirements; this sample does not suggest helper starvation. The short timing sample shows no sustained stall at that moment. It cannot rule out a large launch/cleanup burst or prove which event caused the earlier warning. Sharing uses many threads in only 26 processes and is not the source of this process count.

This evidence warrants a live comparison with the optional 2,000-batch setting below. The lower limit remains opt-in because output depends on the actual target, stats, host placement and timing.

## Findings

- `utils.js` already sleeps 10 ms between failed home helper launches and stops retrying after ten seconds. Its request/reply watchdog also uses timers. Waiting for RAM through these paths is not a synchronous busy loop.
- At 1,048,576 GB, 99.9% utilization still leaves about 1,048.6 GB free. Actual free GB and process counts matter more than the rounded percentage. A single highly threaded share worker is very different from tens of thousands of separate scripts.
- `bin/serverRun.js` permits 99,999 batches in a wave. This limit predates the audit PR. A fast path can enqueue three or four worker processes per batch, plus host splits. Its existing elapsed-time guard is not a process-count limit.
- With the actual BN5 planner, representative server/player inputs and 1 PB capacity, the offline fixture permits 299,997 worker launches in one wave. This demonstrates the allowance in our code; it does **not** reproduce the user's renderer freeze or establish a hardware-specific failure threshold.
- The BN1 UI controller is not automatically enabled in BN5.1. Other scripts, including darknet solvers, remain possible causes without a live trace.

## Changes

**Default batch volume and launch pacing are preserved.** The user asked whether limits could reduce income. Extra sleeps can consume a short wave's remaining time, and a batch-count cap can reduce the first wave's output. Neither is assumed to be free.

`kernel.js` now accepts an optional `--max-batches` value from 1 through 99,999. The default remains 99,999. A lower value:

- Limits complete batches per dispatch wave and returns the existing recalculation signal when it truncates a requested wave.
- Before the first limited wave, asks the existing planner for larger individual batches using only RAM left after prep. Accepts a candidate only if it fits and its modeled total take within the selected limit is at least as high. The existing dispatch feedback also uses this comparison on later capped waves. Default 99,999 behavior is unchanged.
- The BN5 fixture adapts from four-thread batches to approximately 300-thread batches and retains more than 99% of the planned thread capacity in the first limited wave. This avoids an initial tiny capped wave. It is capacity coverage, **not a live income guarantee** or a claim of equal income to unlimited batching.
- Yields after 20 ms of launching or 25 complete batches, whichever comes first. It never inserts a sleep within a batch's operation group.

For the reported process overload, set `"max-batches": 2000` in `kernel.js.config.txt` on home, preserving any other settings, then stop the existing kernel in Active Scripts, including an offloaded instance. Autopilot's normal deployment copies that configuration when it launches a new offloaded kernel. Alternatively, launch one kernel with `run kernel.js --max-batches 2000` after stopping its existing instance. Do not start a second kernel alongside the first. Restore 99,999 to use the original behavior.

Compare several settled waves at the same target, stats and RAM using the income display and `performance-diagnostic.js`. Expect thousands of batch workers in this fixture, rather than hundreds of thousands. Prep, host splitting, changing stats and other kernels can change the count and output; let existing workers finish before interpreting the new steady state.

This is a per-wave batch limit, not a global process ceiling. Prep jobs, host splits, other scripts and any other kernel instances can add processes. Income effects must be measured in the user's game; do not enable the smaller limit solely because RAM utilization is high.

## Diagnosis in game

Pull the same branch:

```text
run git-pull.js --branch testing/bn1-go-audit
```

After the download finishes, while automation is running:

```text
run performance-diagnostic.js
```

The 3.25 GB diagnostic does not launch helpers, stop processes, change work or install augmentations. It reports actual free home RAM, counts of processes and threads grouped by script, bounded manager log excerpts, and ten short scheduling-delay samples. It yields while aggregating large inventories. Paste its terminal output; the fuller report is saved to `/Temp/performance-diagnostic.json` on the running host. Its `ns.scan` inventory does not include darknet-only hosts.

If the application is still frozen, the game's restart dialog offers a checked **Kill all running scripts** option. Restarting that way can recover the UI. Take the diagnostic during subsequent running automation; a snapshot after killing every script cannot identify the earlier culprit.

## Verification

- `checks/dispatch-pressure.mjs`: real BN5 planner plus the real dispatcher; original large-wave allowance; optional cap/recalculation; actual kernel prep through its first dispatch; post-prep capacity budgets; rejected unaffordable/lower-take candidates; identical default prep, operations, threads, delays and replies; identical default pacing under simulated launch costs and timer delays; optional complete-batch yields and argument validation.
- `checks/performance-diagnostic.mjs`: 50,001-worker inventory, highly threaded single-worker inventory, bounded output, yielding, disappeared hosts, remote execution and read-only behavior.
- `share-handoff`, `share-allocation`, `batch-upgrade-compatibility`, `batch-correctness` against the pinned engine, `rpc-reserve`, `remaining-paths` and `api-errors` pass. The kernel fixture now supplies its actual flag defaults and verifies forwarding the optional limit.
- The pinned official RAM calculator checks 51 entry points. All existing costs are unchanged: kernel 5.85 GB, dispatcher 4.9 GB, autopilot 4.2 GB. The new standalone diagnostic costs 3.25 GB.
- Changed JavaScript syntax and `git diff --check` pass. No live save was run; the freeze is not claimed fixed.

Primary-source references inspected in the local official game checkout:

- [Electron unresponsive-window handling](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/electron/utils.js)
- [Official frozen-game troubleshooting](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/programming/game_frozen.md)
- [Worker-script startup](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptWorker.ts)
