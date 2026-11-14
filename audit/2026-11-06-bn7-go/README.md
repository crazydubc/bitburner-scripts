# BN7 Go goal selection — November 6, 2026

The reported BN7.1 run was over 15 hours old, with slow hacking progression and Go repeatedly playing The Black Hand. The automatic Go selector looked only at ordinary Singularity work. Bladeburner has a separate action slot, so an active Bladeburner player could appear idle and fall through to the generic hacking goal.

## Confirmed mechanics

In the user's Steam 3.0.1 engine, The Black Hand increases **hacking money**, not hacking level or hacking experience. Tetrads increases **strength, defense, dexterity and agility levels**. These combat multipliers help the Bladeburner route without requiring a hacking-based finish.

| BN7 multiplier | Value |
| --- | ---: |
| Hacking level | 0.35× |
| Hacking experience | 0.25× |
| Bladeburner rank gains | 0.60× |
| Bladeburner skill costs | 2× |

BN7 can therefore take longer than a normal hacking-oriented run even with an appropriate Go target. Changing the opponent does not establish that the full 15-hour slowdown is explained or resolved.

## Change

- Automatic Go goals default to **combat/Tetrads in BN6 and BN7**, including when the optional context read is unavailable, the player appears idle, ordinary faction work is running, or the Red Pill is installed.
- A valid funded donation-favor opportunity retains its existing measured time budget and priority. Active crime still uses the established crime-versus-combat policy. Explicit goals and opponents remain overrides.
- The context reader optionally checks Bladeburner membership and current action through the existing temporary helper, once per completed game. Both calls respect access and effective RAM requirements. Failure leaves the existing context usable.
- In other BNs, active Bladeburner work replaces the generic hacking fallback; concrete ordinary crime/faction/company goals retain their priority. Stale or malformed action data is ignored, and BN8 does not infer a Bladeburner goal.
- The existing **5×5 Tetrads profile**, move strategy, statistics cohorts and game-boundary switching are unchanged. Pulling and restarting Go preserves the current board; the new opponent is selected after it ends.

No new background process or runtime helper is introduced. Official RAM measurements remain unchanged for Go (3.5 GB), its context helper (6.6 GB), autopilot (4.2 GB declared), Bladeburner (3.3 GB), sleeves (3.35 GB) and the kernel (5.85 GB).

## Separate possible cause of a long run

Autopilot already has a Bladeburner launch condition and accepts completion of the final Black Operation independently of the World Daemon hacking requirement. However, `shouldIntelFarm` suppresses Bladeburner startup and BN completion while intelligence preparation is needed. Its company-invitation preparation still has no independent time limit; slow hacking can make that preparation expensive. The actual farm has a one-hour/ROI stop, which does not bound the invitation preparation phase.

That code path is confirmed, but its activity in this live save is unknown. This patch does not change the established intelligence-farming behavior or claim to fix that potential stall. If the run remains slow, inspect the current `autopilot.js` and `bladeburner.js` logs: intelligence preparation, waiting for all four combat stats to reach 100, a busy player without Simulacrum, and low action success estimates require different remedies. Go selection alone cannot distinguish these.

## Verification

The pre-fix selector chooses The Black Hand for a fresh BN7 context with no ordinary work; the repaired selector chooses Tetrads. The mechanics fixture executes the official Go multiplier switch and verifies BN7's penalties. The expanded goal tests cover BN6/BN7, unavailable context, separate Bladeburner actions, funded favor, manual overrides, stale/malformed state, real temporary-helper transport, RAM gating and actual completed-game transitions.

Go adaptation and lifecycle tests, API wrappers, progression and sharing regressions pass. See `validation.json` for results.

```sh
node audit/2026-11-06-bn7-go/checks/bn7-mechanics.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/go-goals.mjs
node audit/2026-10-17-speedrun/checks/go-adaptation.mjs
node audit/2026-10-17-speedrun/checks/go-lifecycle.mjs
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/progression.mjs
node audit/2026-10-17-speedrun/checks/share-allocation.mjs
AUDIT_RAM_TARGETS=go.js,bin/go-context.js,autopilot.js,bladeburner.js,sleeve.js,kernel.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine dd57f3f
```

The checked official files are unchanged between the user's Steam commit `3162fd2590e221eadd0c0fbd46151913f7c4c41c` and fixture commit `1da7316ffd9d281b45a86c4c54ec532276557892`:

- [Go bonus definitions](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Go/Constants.ts)
- [Go multiplier implementation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Go/effects/effect.ts)
- [BitNode multipliers](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/BitNode/BitNode.tsx)
- [Bladeburner current-action API](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Bladeburner.ts)
