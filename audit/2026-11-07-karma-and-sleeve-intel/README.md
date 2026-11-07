# BN7 sleeve karma and persistent Intelligence

Eight synchronized sleeves at 96 shock were all assigned Homicide at about 1% success. The previous automatic gang-unlock branch selected Homicide before looking for training, faction work or Bladeburner tasks. It did not estimate how long the remaining karma would take. Homicide earns no Intelligence XP or Bladeburner rank.

## Is the gang close enough?

A successful Homicide gives 3 karma toward the gang requirement and takes 3 seconds; failure gives zero. At exactly 1% success and full sync, that averages **36 karma/hour per sleeve**, or **288/hour with eight**. At unchanged odds and normal processing speed, a gap of 100 would take about 21 minutes; a gap of 54,000 would take about 188 hours. Shock does not directly reduce successful karma. It does reduce work XP: at 96 shock and 1% success, expected Homicide stat XP is `0.04 × (0.01 + 0.99 × 0.25) = 0.0103` of an always-successful, zero-shock sleeve's XP per attempt.

- The manager ranks each available sleeve's crimes by expected karma/hour: chance × karma × sync fraction × attempts/hour. It fetches the crime catalogue once through the existing bulk helper when available and has a local Homicide/Mug/Shoplift fallback.
- In BN6/7 with Bladeburner enabled, automatic gang work takes priority only when the **remaining karma** is within 30 minutes at the fleet's current pace. This is a rolling estimate, not a timer, a promise of gang membership, or a prediction of BitNode completion. It does not credit future stat growth, banked cycles, or other sources of karma. Look for `Gang karma: deferring` or `pursuing` in the sleeve log.
- If the unlock is distant, useful Bladeburner work, faction/company assignments and affordable training can proceed. In automatic mode, spare shocked sleeves can recover; cash pressure still preserves background earners. Explicit crime and shock policies remain available. Autopilot no longer forces the player's faction worker into crime in default BN6/7. Use autopilot's `--gang-mode on` for a deliberate gang run, or `--force-gang-karma` on the sleeve manager alone. BN2 does not require the karma grind, and BN8 cannot use a gang.

## Keep the two INT farms separate

**Keep the existing player farm on its normal schedule.** Singularity travel and accepting faction invitations credit the player alone. Owning extra sleeves when those calls happen does not change who receives XP.

A sleeve has its **own** persistent Intelligence XP. With Intelligence unlocked, existing sleeves retain it across personal aug purchases, player aug installs and normal BitNode changes. A newly acquired sleeve starts with no previously earned XP. When a *sleeve* studies, the player and other existing sleeves receive shares of the XP: the learner's shock affects its own output, its sync affects transfer, and each receiving sleeve's shock applies to its share.

Once **all eight sleeves actually exist**, `sleeve.js` may assign **one** fully synchronized, zero-shock spare to free Computer Science. It prefers ordinary background crime slots, then the fastest available local university, and keeps the same student on a tie. A redundant generic synthoid supplier can study only when another supplier remains and **all contract and operation inventories** exceed the minimum. The optional operation check uses existing helpers, at most once per 30 seconds when considering a supplier; an unreadable inventory keeps that sleeve working. Recovery, explicit or urgent crime, reputation work, funded stat training, designated contracts and other Bladeburner assignments take precedence. The student needs no travel, tuition, new process or automatic hash purchases. The policy yields when cash reaches reserve, and never gates a reset.

| Free local course | Student INT XP/hour | Share to a sibling at 96 shock |
| --- | ---: | ---: |
| Rothman, Sector-12 | 72 | 2.88 |
| Summit, Aevum | 108 | 4.32 |
| ZB, Volhaven | 144 | 5.76 |

Rates assume full learner sync, zero learner shock, normal game speed and no study hash upgrades. A recovered sibling gets the full rate. Existing sleeves can still earn INT through ordinary work before the eighth arrives; only the dedicated student waits. The default personal target is 230; set `sleeve-intel-target` to `0` in the sleeve configuration to disable the assignment.

## Verification

The manager fixture reproduces eight Homicides on commit `7a1f189` using eight weak, shocked sleeves (1.026% chance, 295.4 karma/hour). With the same inputs the new manager defers, keeps the normal training/recovery assignments and resumes crime if the karma gap drops to five. Other cases exercise uneven stats, no Singularity, scarce cash, explicit policies, Bladeburner supply and the seven/eight-sleeve boundary.

[The engine check](checks/karma-intel.mjs) runs the official crime chances, player invite and travel calls, sleeve creation, university XP transfer and reset methods in memory. [Regression results](validation.json): 40 suites passed; two unrelated React UI fixtures (BN1 and scan) were skipped. All 119 gameplay JavaScript files parsed. Compared with the previous testing branch, the official RAM calculator reported unchanged costs: `sleeve.js` 3.35 GB, `autopilot.js` 4.20 GB, and the existing bulk helper 6.60 GB declared. These are fixtures, not timing measurements from a live save.

```sh
node audit/2026-11-04-full-audit/checks/full-audit.mjs ../bitburner-engine --compare-karma-baseline
node audit/2026-11-07-karma-and-sleeve-intel/checks/karma-intel.mjs ../bitburner-engine
```

Official Steam 3.0.1 source (the relevant files match the audited engine checkout): [crime stats](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Crime/Crimes.ts), [sleeve crime completion](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Work/SleeveCrimeWork.ts), [INT storage](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Person.ts), [sleeve resets](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Sleeve.ts), [sleeve acquisition](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx), [sleeve XP transfer](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Work/Work.ts), [class rewards](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/ClassWork.tsx) and [Singularity payouts](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Singularity.ts).
