# Sleeve restart and faction handoff repair — November 4, 2026

## Report and cause

After killing all scripts and restarting autopilot, the sleeve manager attempted to assign a faction that another sleeve was already working for. Repeated failures could temporarily remove CyberSec or other useful factions from the route plan for five minutes.

Sleeve work survives script termination. The manager previously reset its cached task strings, planned new assignments without reading the fleet's existing work, and applied those assignments one sleeve at a time. Reordered routes could swap occupied factions and produce a cycle of assignment failures. The error handler interpreted these occupancy conflicts as unsupported work types and eventually applied the faction cooldown. Its periodic task check also accepted any active task, even when it was the wrong task.

## Change

- Read the fleet's actual tasks on startup and every five seconds. A failed or invalid read stops that planning pass before it changes assignments.
- Preserve existing holders within the selected reputation-worker slots before assigning new targets. The prior slot priority still reserves Bladeburner contract specialists when enough other sleeves are available.
- Calculate the whole fleet's tasks, then release changed faction/company assignments before assigning new work. Verify that each released sleeve is actually idle. This handles an earlier-index replacement taking over from a later-index sleeve that must recover or synchronize.
- Adopt matching live tasks, including ongoing crimes, without restarting their progress. Reconcile the identity of active tasks, not just whether a task exists.
- Treat a concurrent occupancy error as a reason to refresh the fleet next tick. It does not rotate faction work types or increment the faction failure/cooldown counters. Actual unsupported-work failures retain their existing fallback and cooldown behavior.

The patch changes `sleeve.js`; no new runtime helper or background process is added. The existing helper supports the void return from `setToIdle`, and its result is covered by a transport fixture. The normal resident RAM cost remains **3.35 GB**. Task polling stays at one read per sleeve per five seconds in steady state, with additional reads only to verify handoffs or recover from failures.

## Verification

The fixture runs the actual manager and the official `NetscriptSleeve` implementation's faction/company exclusivity checks. All six permutations of three active faction assignments survive a restart without assignment changes or API conflicts. Tests also cover company followers, synchronization/recovery handoffs, worker priorities, active/idle manual changes, crime progress, polling frequency, invalid snapshots, failed releases, errors arriving between observation and assignment, both thrown and serialized errors, and genuine unsupported-work fallback/cooldown behavior.

Running this fixture against parent `8c49ba6` reproduces **two faction occupancy errors** in the first swapped-route restart. The repaired code passes. The existing full-audit, API-wrapper, progression and guarded-purchase suites also pass. The official RAM calculator reports 3.35 GB before and after.

```sh
node audit/2026-11-04-sleeve-restart/checks/sleeve-restart.mjs ../bitburner-engine
# Expected failure: reproduce the pre-fix restart collision.
AUDIT_SLEEVE_BASELINE=8c49ba6 node audit/2026-11-04-sleeve-restart/checks/sleeve-restart.mjs ../bitburner-engine
node audit/2026-11-04-full-audit/checks/full-audit.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/progression.mjs
node audit/2026-10-17-speedrun/checks/resource-purchases.mjs
AUDIT_RAM_TARGETS=sleeve.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 8c49ba6
```

The engine fixture is pinned to `1da7316ffd9d281b45a86c4c54ec532276557892`. `src/NetscriptFunctions/Sleeve.ts` and `src/PersonObjects/Sleeve/Work/` are unchanged from the reported Steam 3.0.1 commit `3162fd2590e221eadd0c0fbd46151913f7c4c41c`. No live game was modified by these tests.

After pulling the testing branch, restart `sleeve.js` to load the repair. It can adopt the sleeves' existing tasks; manually setting all sleeves idle is unnecessary. The reported faction conflicts are fixed by this change. Other errors from forcibly killed in-flight helpers are separate and should be assessed from their own messages if they persist after startup.
