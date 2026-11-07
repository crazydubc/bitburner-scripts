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

### Automatic full-fleet session

The sleeve manager starts a dedicated farm when **exactly eight sleeves are owned, all eight have zero shock and 100% sync, and each is below the configured INT target**. The default target is **50**. Seven recovered sleeves with one at 0.01 shock do not start it. A fresh roster with one already at the target does not start it either. No separate process, worker-count setting, player action or soft reset is involved.

Once the fleet qualifies, all eight take **free Computer Science at ZB Institute of Technology in Volhaven**. Travel costs $200,000 per sleeve that needs to move ($1.6m maximum). The manager checks headroom for the whole fleet, then rechecks the live reserve on each purchase. If a trip fails it resumes normal assignments and retries later. Existing students are adopted on restart. Routine sleeve rep and training pause during study; the player's own tasks continue. Explicit or urgent crime, new shock or lost sync, cash at reserve, or low Bladeburner supplies/high chaos pause the farm. The contract/operation checks protect the player's supply; while studying, sleeves do temporarily stop earning contract rank themselves. Normal augmentation installs and BitNode completion never wait for the farm.

The home marker is separate from the player's INT farm and scoped to the actual BitNode run and the target. After starting, faster sleeves keep donating until the **last** reaches the target, including across a manager restart or a player augmentation install in the same run. Set `sleeve-intel-target` in the home file `sleeve.js.config.txt` to change the goal; `0` disables it. `--disable-training` also disables the farm. Keep the player's invite farm on its own schedule.

| Fully recovered/synced students at ZB | INT XP/hour per recovered sleeve (also to the player) | Time from zero XP to INT 50 |
| --- | ---: | ---: |
| One student, no study upgrades | 144 | 13 h 27 min |
| Eight students, no study upgrades | 1,152 | 1 h 41 min |
| Eight students, five Improve Studying upgrades | 2,304 | 50 min |

These are normal-speed, uninterrupted class rates. Shares are added, not divided among the recipients. Each Hacknet **Improve Studying** level adds 20% of the base rate; five cost 750 hashes total from level zero. The upgrades expire on installing player augmentations; earned INT persists. The fleet farm honors existing study upgrades and does not buy them automatically. INT 230 from zero would take about 594 hours at eight unboosted students, which is why it is not the default fleet milestone. With all eight held at 96 shock and full sync, the same fleet produces only 7.37 XP/hour per sleeve at those instant rates: the learner's shock reduces its work and each recipient's shock reduces the shared portion again.

## Verification

The manager fixture reproduces eight Homicides on commit `7a1f189` using eight weak, shocked sleeves (1.026% chance, 295.4 karma/hour). With the same inputs the new manager defers, keeps the normal training/recovery assignments and resumes crime if the karma gap drops to five. Other cases exercise uneven stats, no Singularity, scarce cash, explicit policies, Bladeburner supply the last recovering sleeve, mixed INT at entry vs. mid-session, adopting live classes, reserve failures, normal-work handoff and isolation from the player farm.

[The engine check](checks/karma-intel.mjs) runs the official crime chances, player invite and travel calls, sleeve creation, university XP transfer and reset methods in memory. [Regression results](validation.json): 40 suites passed; two unrelated React UI fixtures (BN1 and scan) were skipped. All 119 gameplay JavaScript files parsed. Compared with the previous testing branch, the official RAM calculator reported unchanged costs: `sleeve.js` 3.35 GB, `autopilot.js` 4.20 GB, and the existing home INT state helper 2.65 GB. These are fixtures, not timing measurements from a live save.

```sh
node audit/2026-11-04-full-audit/checks/full-audit.mjs ../bitburner-engine --compare-karma-baseline
node audit/2026-11-07-karma-and-sleeve-intel/checks/karma-intel.mjs ../bitburner-engine
```

Official Steam 3.0.1 source (the relevant files match the audited engine checkout): [crime stats](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Crime/Crimes.ts), [sleeve crime completion](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Work/SleeveCrimeWork.ts), [INT storage](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Person.ts), [sleeve resets](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Sleeve.ts), [sleeve acquisition](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx), [sleeve XP transfer](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Work/Work.ts), [class rewards](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/ClassWork.tsx) and [Singularity payouts](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Singularity.ts).

Additional primary sources: [INT skill curve](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/formulas/skill.ts), [study upgrade price and effect](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Hacknet/data/HashUpgradesMetadata.tsx), [study multiplier and reset](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Hacknet/HashManager.ts).
