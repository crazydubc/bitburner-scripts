# BN5.1 unresponsive-window investigation — October 28, 2026

The report occurred during normal automated play with approximately 1.05 PB of home RAM and 99.9% utilization. The Electron warning does not identify a script or prove an infinite loop. There is no live process snapshot from the incident, so its cause remains unconfirmed.

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
- Lets the existing planner search for larger individual batches on the next wave. The BN5 fixture adapts from four-thread batches to 300-thread batches and retains more than 99% of the planned thread capacity. This is capacity coverage, **not a live income guarantee**.
- Yields after 20 ms of launching or 25 complete batches, whichever comes first. It never inserts a sleep within a batch's operation group.

For a deliberate experiment after diagnosing process overload, set `"max-batches": 2000` in `kernel.js.config.txt`, preserving any other settings, then restart the existing kernel. Autopilot's normal deployment copies that configuration when it launches an offloaded kernel. Alternatively, launch one kernel with `run kernel.js --max-batches 2000` after stopping its existing instance. Do not start a second kernel alongside the first. Restore 99,999 to use the original behavior.

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

- `checks/dispatch-pressure.mjs`: real BN5 planner plus the real dispatcher; original large-wave allowance; optional cap/recalculation; identical default operations, threads, delays and replies; identical default pacing under simulated launch costs and timer delays; optional complete-batch yields and argument validation.
- `checks/performance-diagnostic.mjs`: 50,001-worker inventory, highly threaded single-worker inventory, bounded output, yielding, disappeared hosts, remote execution and read-only behavior.
- `share-handoff`, `share-allocation`, `batch-upgrade-compatibility`, `batch-correctness` against the pinned engine, `rpc-reserve`, `remaining-paths` and `api-errors` pass. The kernel fixture now supplies its actual flag defaults and verifies forwarding the optional limit.
- The pinned official RAM calculator checks 51 entry points. All existing costs are unchanged: kernel 5.85 GB, dispatcher 4.9 GB, autopilot 4.2 GB. The new standalone diagnostic costs 3.25 GB.
- Changed JavaScript syntax and `git diff --check` pass. No live save was run; the freeze is not claimed fixed.

Primary-source references inspected in the local official game checkout:

- [Electron unresponsive-window handling](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/electron/utils.js)
- [Official frozen-game troubleshooting](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/programming/game_frozen.md)
- [Worker-script startup](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptWorker.ts)
