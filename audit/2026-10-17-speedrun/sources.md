# Sources and audit scope

## Pinned revisions

- User repository: `crazydubc/bitburner-scripts`, main at `a05225d5c63d877e35ba7d34d70d7adbbff9cc69`.
- Game reference: `bitburner-official/bitburner-src`, stable at `1da7316ffd9d281b45a86c4c54ec532276557892` (version string **3.0.1**).
- The report uses immutable links so later changes to either default branch do not silently change its evidence. Verify the running game's version before implementing compatibility-sensitive fixes.

## Script evidence

| Area | Pinned source | Used for |
| --- | --- | --- |
| Shared launch, file/config, stock-value, and cracker helpers | [utils.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/utils.js#L160) | B01/B02/B03/B11/B13/B17 |
| Autopilot policies and progression | [autopilot.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/autopilot.js#L17) | B02/B05/B06/B08/B09; route and thresholds |
| Cloud/home budget manager | [host-manager.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/host-manager.js#L13) | B04 |
| Intelligence reset loop | [farm-intel.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/farm-intel.js#L19) | B05 |
| Sleeve purchaser | [purchaseSleeves.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/purchaseSleeves.js#L6) | B06 |
| Reset preparation | [ascend.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/ascend.js#L64) | B07/B11 |
| Bladeburner manager | [bladeburner.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/bladeburner.js#L70) | B07/B08 |
| Sleeve augmentation manager | [sleeve.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/sleeve.js#L260) | B10 |
| Singularity RPC | [bin/singRun.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/bin/singRun.js#L1) | B11 |
| Hash spender | [spend-hashes.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/spend-hashes.js#L43) | B12 |
| Backdoor launcher | [Tasks/backdoor-all-servers.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/Tasks/backdoor-all-servers.js#L77) | B13 |
| Contract solver dispatcher | [Tasks/contractor.js.solver.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/Tasks/contractor.js.solver.js#L1) | B14 |
| Batch controller | [kernel.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/kernel.js#L150) | B15 |
| Fallback batch calculator | [bin/getHackP.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/bin/getHackP.js#L9) | B16 |
| Darknet manager | [darknet.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/darknet.js#L1410) | B18 |
| Coinflipper | [coinflip.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/coinflip.js#L13) | Completion signal; BN1 bootstrap |
| Run logger | [logger.js](https://github.com/crazydubc/bitburner-scripts/blob/a05225d5c63d877e35ba7d34d70d7adbbff9cc69/logger.js#L29) | Timing methodology |

The finding text gives the additional line locations within each file. The offline runner reads the working tree, so it is intended to run against the audited revision plus these audit files.

## Official mechanics references

| Claim area | Primary source |
| --- | --- |
| Version, augmentation inflation, donation favor | [src/Constants.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Constants.ts) |
| BitNode restrictions and source-file reward descriptions | [src/BitNode/BitNode.tsx](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/BitNode/BitNode.tsx) |
| Actual source-file multiplier application | [src/SourceFile/applySourceFile.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/SourceFile/applySourceFile.ts) |
| Singularity RAM scaling and API costs | [src/Netscript/RamCostGenerator.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Netscript/RamCostGenerator.ts) |
| Bladeburner API access through either BN6 or BN7 | [src/NetscriptFunctions/Bladeburner.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/NetscriptFunctions/Bladeburner.ts) |
| Singularity reset and both BN completion conditions | [src/NetscriptFunctions/Singularity.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/NetscriptFunctions/Singularity.ts) |
| Corporation API unlocks at corporation creation | [src/PersonObjects/Player/PlayerObjectCorporationMethods.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/PersonObjects/Player/PlayerObjectCorporationMethods.ts) |
| Augmentation costs, bonuses, CashRoot, and Red Pill | [src/Augmentation/Augmentations.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Augmentation/Augmentations.ts) |
| SF11 purchase-scaling calculation | [src/Augmentation/AugmentationHelpers.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Augmentation/AugmentationHelpers.ts) |
| Faction prerequisites and incompatible city factions | [src/Faction/FactionInfo.tsx](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Faction/FactionInfo.tsx) |
| Server port/hacking requirements | [src/Server/data/servers.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Server/data/servers.ts) |
| Port-program and Formulas prices | [src/DarkWeb/DarkWebItems.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/DarkWeb/DarkWebItems.ts) |
| Weaken/core calculation | [src/Server/ServerHelpers.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Server/ServerHelpers.ts) |
| Base weakening constant | [src/Server/data/Constants.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Server/data/Constants.ts) |
| Augmentation/BN reset behavior | [src/Prestige.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Prestige.ts) |
| Intelligence mechanics | [src/Documentation/doc/en/advanced/intelligence.md](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Documentation/doc/en/advanced/intelligence.md) |
| Official general BitNode-order guidance | [src/Documentation/doc/en/advanced/bitnode_recommendation_short_guide.md](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Documentation/doc/en/advanced/bitnode_recommendation_short_guide.md) |

Reward descriptions are cross-checked against implementation where the distinction matters (notably Bladeburner API access, SF4 RAM, SF11 scaling, and weakening). Route placement is an inference combining these mechanics with the suite's capabilities and the user's preferences; it is not a claim made by the official source.

## Method

Mapped startup, launch transport, money reservations, augmentation/reset decisions, target calculations, progression gates, and the larger subsystem entry points. Used syntax checks plus targeted bounded execution of relevant functions. Source checks were used where realistic UI/reset/engine behavior would require a running game.

The evidence runner's transport, cash, and API responses are mocks. It does not prove live Netscript scheduling, dynamic RAM enforcement, DOM compatibility, market performance, solver correctness for every contract type, or a measured speed improvement. In particular, the B14 fixture injects a failed answer result; it does not identify a faulty prime-factor algorithm.

No save was imported or changed. No game action, trade, augmentation installation, or BitNode transition was performed. Gameplay source files are unchanged in this audit branch.
