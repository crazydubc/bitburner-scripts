# BN10.3: finish sleeve study before leaving

On the third standard BN10 run (current node 10, earned SF10.2), autopilot now waits for a final sleeve study session before destroying the World Daemon. Either a hacking or Bladeburner victory can trigger it. It does **not** start the dedicated INT farm before victory, or hold BN10.1, 10.2, later repeats or other nodes. The other BitNodes keep their existing sleeve policy. Player invite farming is separate.

**What to do in game:** Pull `testing/bn1-go-audit`, stop the old autopilot and sleeve manager if running, and run `autopilot.js` on home. No manual study command is needed. Autopilot logs the hold; the sleeve log identifies pending purchases, course assignments and measured returns.

1. The usual BN10 checks still require all Covenant sleeve purchases and max memory on every body. The game grants the third Source-File sleeve *during* the third run. The final gate requires eight bodies and an otherwise available exit.
2. During this hold, ordinary player aug installs wait; income and the other managers can keep running. The sleeve manager syncs/recovers the fleet in parallel. The buyer can finish small batches using its normal budget, cooldown, live purchase checks and cash reserve.
3. All eight must have 100 memory, full sync, zero shock, **at least one actual installed sleeve augmentation each**, and no remaining augmentations in their current faction shops. The shop is based on faction membership/rep, not every augmentation in the game. An empty shop with an empty implant list, a failed RPC or a quoted but unsuccessful purchase is not readiness. Newly unlocked implants are bought and the measurement restarts. When all are ready, they take free Computer Science at ZB in Volhaven, with guarded travel only if needed.
4. Autopilot leaves only after the manager records two consecutive qualifying five-minute windows. Both the rate and return must be low. If already above an old fixed INT target, the fleet still measures; faster runs through this phase can train to higher INT.

## What the rate means

Use the **least-trained** sleeve's actual `exp.intelligence`; all eight fully recovered students share their XP. For cumulative XP `x`, the engine's continuous level curve is `L(x) = 32 ln(x + 534.6) − 200`. We retain the fraction instead of differencing the rounded levels in the UI. For a valid study window lasting `h` hours:

- Observed levels/hour = `(L(x_end) − L(x_start)) / h`.
- Observed XP/hour = `(x_end − x_start) / h`. Project *another hour* at that measured XP rate: `L_next = L(x_end + XP/hour)`.
- As in the player farm, use the general Intelligence multiplier `B(I) = 1 + I^0.8 / 600` as a proxy for the payoff. Return = `100 × (B(L_next) / B(L(x_end)) − 1)`. This is a projected improvement in the general INT bonus, not a claim about overall BitNode or Bladeburner speed.

The defaults are **below 6 INT levels/hour AND below 0.5% projected return**. There is no fixed personal level or unconditional one-hour timeout in this exit gate. Two clean low windows, valid positive XP, confirmed courses and a final fresh implant check are required. Observed interruptions, missing/invalid data, a polling gap over a minute, a regressing XP counter, zero XP between confirmed observations, a manager restart or an intervening player installation do not count as a low-return decision. Completed proof is separate from both earlier farms, scoped to the actual node run, installation and configured thresholds.

| Model from zero INT XP | Per-sleeve XP/hour | Qualifying finish | Active study time |
| --- | ---: | ---: | ---: |
| Eight unboosted ZB students | 1,152 | INT 79.92 | 5 h |
| Same fleet, five Improve Studying levels | 2,304 | INT 102.20 | 5 h 15 min |

These are simulated steady rates with five-second observations. Starting XP, stored cycles, hash upgrades and interruptions change the result. Sleeve implants **do not** multiply class INT XP; they are installed first as requested. Implants go away at the BitNode change, whereas earned INT persists. Existing Hacknet study upgrades do boost class INT; no new hash spending is required by this change.

To tune, merge these keys into `autopilot.js.config.txt` on home, then restart autopilot:

```json
{
  "bn10-sleeve-int-per-hour": 6,
  "bn10-sleeve-return-percent": 0.5
}
```

Set the first key to `0` to explicitly skip this final hold. The ordinary `sleeve-intel-target` does not set an exit threshold. Explicit sleeve `--crime` or `--disable-training` choices are respected and logged if they prevent the requested study; clear the override or opt out at autopilot. Without unlocked INT, with sleeve XP/augments disabled, or with an ambiguous SF10 override, autopilot does not impose this extra requirement. The gate applies to automated exits, not manually leaving through the game UI.

## Validation

[End-to-end fixture](checks/bn103-final-study.mjs) runs the real victory check, sleeve manager, home-state RPC and guarded purchase logic against one in-memory game, using the official skill curve. It exercises both victory routes, earlier/later BNs, missing/failed implant reads, newly offered implants, insufficient reserve, failed travel, restarts, interrupted actions, mixed INT levels, stale completion and independent rate/return cutoffs. Additional existing checks cover the game XP sharing and class rate, player invite farm, and continued helper scheduling while normal installs are held.

[Regression results](validation.json): 41 passed; two unrelated React UI suites were skipped. All 119 deployable scripts parsed. The official game RAM comparison against `5c33f88` remained unchanged: autopilot 4.20 GB, sleeve manager 3.35 GB, existing state helper 2.65 GB. No new in-game script or daemon is deployed.

Pinned game source: [sleeve count](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx), [augment shops, installation and node reset](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Sleeve.ts), [university stat multipliers](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/WorkStats.ts), [skill curve](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/formulas/skill.ts) and [INT bonus](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/formulas/intelligence.ts).
