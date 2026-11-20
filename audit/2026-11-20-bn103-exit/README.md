# BN10.3 exit preparation and repeated memory messages

The reported log showed eight fully upgraded sleeves, an exit held for study, and repeated `purchaseSleeves.js: Upgrading sleeve memory...` messages.

Two problems were reproducible:

- The buyer correctly returned when every memory was full, but autopilot's scheduling predicate remained true and launched it again. Its unconditional announcement made those empty runs look like ongoing upgrades. Autopilot now remembers its verified permanent-purchase completion for its lifetime, and the buyer announces memory upgrades only when it finds one. Restarting autopilot verifies the fleet again; missing bodies, incomplete memory and unreadable results do not count as complete.
- Final augment preparation inherited the normal 10% spending budget while requiring the available shop to be empty before study. For example, eight remaining $3b implants could stay unbought with over $24b of spendable cash because the per-pass budget was only $2.4b. During the final hold, the manager uses spendable cash after the reserve and the $200k travel cost for each sleeve outside Volhaven. Ordinary spending and an explicit zero augment budget retain their prior behavior. Every purchase still uses the live cash/reserve guard.

The original message did not identify the actual hold reason. Sleeve progress now goes through the existing home-state helper at most once per 30 seconds. Autopilot reports the latest recovery/synchronization counts, remaining implant shop, travel wait, study status or manager error. Changes appear on the next 15-second check; unchanged notices repeat at most every five minutes. Progress older than 90 seconds or from a different augmentation reset is identified as missing rather than being shown as live.

This does not bypass final study. Full memory alone is not readiness: synchronization, zero shock, implant checks and two measured low-return windows are still required. A progress update cannot mark study complete, reopen completed study or replace a different set of requested thresholds. The given log cannot establish which preparation step was blocking this particular save; the new messages expose that distinction.

## Validation

The expanded [existing end-to-end fixture](../2026-11-07-bn103-final-study/checks/bn103-final-study.mjs) failed on the incoming branch when asked to buy those eight affordable implants. It now buys all eight, travels to ZB and starts class with exactly the cash reserve plus $1 left. It also checks:

- No repeat permanent-upgrade reads/launches after confirmation, with a new verification after autopilot restart.
- Ordinary 10% spending, a zero budget, insufficient cash, cooldowns, failed travel and failed augmentation reads.
- Fresh/stale progress, recovery before study, interrupted measurements, both victory routes and actual completion proof.
- Rejected progress writes after completion or after a reset/threshold change.

The existing progression, resource-purchase, sleeve restart, karma/INT, shock and stock-valuation checks also pass. Official RAM calculations remain unchanged: autopilot 4.20 GB, sleeve manager 3.35 GB, buyer 3.15 GB and state helper 2.65 GB. No new game script or diagnostic is added; the audit directory is excluded from normal game downloads.

## Update in game

Run `run git-pull.js --branch testing/bn1-go-audit`. Stop the old `autopilot.js`, `sleeve.js` and `purchaseSleeves.js` through Active Scripts, including any offloaded instances, then run `run autopilot.js`. Autopilot starts the updated sleeve manager. There is no need to reset the BitNode or recreate the sleeves. Genuine recovery or study can still take time; the autopilot log should now say which stage it is waiting for.
