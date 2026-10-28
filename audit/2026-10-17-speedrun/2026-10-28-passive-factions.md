# Passive faction memberships — October 28, 2026

Both Singularity faction managers skipped ordinary invitations after their useful augmentations were owned. Accepting safe extra memberships lets the game's passive reputation accumulate during other work. Augmentation installation converts that reputation into favor; merely joining does not immediately unlock donations. Passive gains are disabled in BN2 and exclude the currently worked faction, the gang faction and special factions.

## Behavior

- `work-for-faction2.js` and `faction-manager.js` now accept safe ordinary invitations even with no useful/unowned augmentations remaining. They do not make exhausted factions active work goals.
- The shared policy uses the game's `getFactionEnemies` API and all ordinary augmentation offerings. A spare city invitation is left alone if joining would newly block any faction with an unowned augmentation, even if that enemy is not yet invited or its stats are outside the current desired filters.
- Purchased augmentations awaiting installation count as owned. Repeatable NeuroFlux does not keep every city group permanently blocked. Already-chosen city allies can be joined because they create no new exclusion; competing groups still cannot be joined together.
- Unknown enemy/offering data defers optional exclusive memberships. The worker no longer silently turns a malformed augmentation list into an empty one. A failed optional enemy read does not stop existing useful non-city invitation handling.
- Company invitations reserved for the intelligence farm stay reserved. The periodic augmentation manager now checks the same progression/state policy before consuming them; a failed state read preserves the invitations. Completed farms release them. Existing explicit `--force-join` overrides remain deliberate overrides.
- Existing purposeful city route selection is retained. This change protects spare passive joins; it does not forbid choosing an exclusive city route to buy useful augmentations.

Enemy metadata uses the existing RAM-aware bulk helper, with one temporary API-specific RAM charge rather than one process per faction. The worker caches it. The manager fetches it only when invitations exist. At SF4.1 the temporary enemy reader needs 49.6 GB, falling back to the existing useful-join behavior if it cannot run.

## Apply

```text
run git-pull.js --branch testing/bn1-go-audit
```

After the pull finishes, stop the old `work-for-faction2.js` instance in Active Scripts, including any offloaded instance; autopilot will redeploy it from home. Subsequent `faction-manager.js` launches load the changes automatically. No new flag is needed for safe passive joins. The BN1 UI controller is not changed by this follow-up.

The separate [BN5 process-pressure follow-up](2026-10-28-bn5-responsiveness.md) records the supplied 300,081-process diagnostic and the optional batch-limit experiment.

## Verification

- `checks/passive-factions.mjs` runs both real invitation functions: all exclusive city pairs, not-yet-invited enemies, queued ownership, NF-only offerings, allied memberships, unknown data, failed joins, company reservations/completion and explicit overrides. Exhausted membership does not create an active augmentation goal.
- `checks/progression-throughput.mjs` exercises the actual parent/helper/port enemy-array read and official dynamic RAM enforcement at SF4.1/4.2/4.3 and in BN4. Existing bulk reads, live favor refresh and work polling checks still pass.
- Stock valuation/planning, progression, API error handling, scheduler paths, sharing allocation/handoff, old calculator callers, optional dispatch pressure and batch mathematics against the pinned engine pass.
- Official RAM analysis of 51 entry points shows no changes versus `0c68b91`: faction worker 8.5 GB, faction manager 24 GB, kernel 5.85 GB, autopilot 4.2 GB. This does not include API-specific temporary helper overrides described above.
- No live save was run; passive income rates and batch income must be observed in game.

Primary sources inspected in the official game checkout:

- [Passive faction reputation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/FactionHelpers.tsx)
- [Favor conversion at installation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/Faction.ts)
- [Faction enemies](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/FactionInfo.tsx)
- [Singularity enemy API](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Singularity.ts)
