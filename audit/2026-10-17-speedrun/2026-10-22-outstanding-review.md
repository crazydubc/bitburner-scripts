# Outstanding review — October 22, 2026

Reviewed the combined testing branch at `6153dd3`, then reproduced and corrected the newly reported sharing behavior. PR #34 was open and mergeable, with no open GitHub issues or inline review threads at review time. The original 18 findings have fixes; the following are additional findings, not a claim of an exhaustive new audit.

| Finding | Status | Effect |
| --- | --- | --- |
| Sharing percentage uses installed RAM | Fixed in this follow-up | Large, busy hosts can have usable spare RAM but no sharing. |
| Sharing stops throughout calculations between batches | Fixed in the continuity follow-up | Stop-all cleanup introduced gaps despite spare RAM; selective dispatcher reclamation now retains unaffected workers. |
| NeuroFlux prefers donation access over existing reputation | Open | Unnecessary donations can reduce the number of affordable NF levels. |
| Faction-manager's fixed allocation misses partial-SF4 purchase costs outside BN4 | Open | Direct donation/purchase calls can exceed its 24 GB allocation. |

## Sharing regression

The user reported BN4.1, 97 GB free, a roughly $32b next home upgrade, and a brief 1.5 sharing multiplier followed by several minutes without it. The official home-upgrade formula gives $31,724,513,419 for upgrading 4,096 GB in BN4. This supports, but does not independently confirm, the inferred home capacity; no live save was inspected.

The old buffer reserved `max(64, 4096 * 0.05) = 204.8 GB`. The controller therefore allocated zero threads with 97 GB free, and could share only when enough batch RAM temporarily became free. This reproduced exactly in the real controller fixture. The change bases the percentage on the reclaimable spare pool: free RAM plus RAM occupied by this controller's workers. The same fixture now allocates eight 4.1 GB threads and leaves 64.2 GB free through three minutes of repeated polling. Whole-thread packing, helper buffers, work detection, explicit overrides and batch-boundary reclamation remain covered.

Cash and the next home purchase are not inputs to the share allocator. No purchase is needed to use those eight threads. Sharing can still vary when batch demand or faction work changes; this correction does not promise a constant 1.5 multiplier.

The user's next test confirmed improvement but reported approximately ten-second gaps. That exposed a second cause: the kernel stopped every worker before the next calculations/census/dispatch. The [continuity correction](2026-10-20-sharing.md) keeps workers alive, counts their capacity as reclaimable and passes ownership to the dispatcher for selective reclamation. The two faction-manager findings below remain open.

## Open: NeuroFlux provider selection

In `faction-manager.js`, `AugmentationData.getFromJoined()` sorts NF providers by donation eligibility before reputation. `managePurchaseableAugs()` then plans all additional NF levels against one `augNfFaction`.

A fixture executing the actual class method supplied CyberSec with 500 reputation and no donations, and NiteSec with zero reputation and donations enabled. For NF requiring 500 reputation, it selected NiteSec, creating a 500-reputation donation requirement despite CyberSec already meeting the requirement. Depending on cash, this can mean fewer affordable levels or none. Reputation is not consumed by augmentation purchases, so existing reputation should cover eligible NF levels before buying more reputation elsewhere.

A repair must select the provider per NF level and keep each purchase's provider and accumulated donation accounting consistent. Merely reversing the initial sort is insufficient: a later level may need to move to a donating faction. This is an efficiency defect; the current reset-value policy already includes NF utility.

## Open: partial-SF4 direct purchases

`faction-manager.js` declares `ns.ramOverride(24)` and performs `donateToFaction` and `purchaseAugmentation` directly in `purchaseDesiredAugs()`. The pinned official cost generator charges each API 5 GB in BN4 or at SF4.3, 20 GB at SF4.2 outside BN4, and 80 GB at SF4.1 outside BN4. SF4.1 exceeds the whole allocation with a single call; at SF4.2 the two calls together exceed it.

Using the official static RAM calculator with SF4 levels 1/2/3 outside BN4 gives 165.45 / 45.45 / 15.45 GB without the override, while the declared allocation remains 24 GB. Static totals include optional paths; the direct purchase costs alone establish the failing cases. The existing RAM regression adapter assumes effective SF4.3, so its usual result does not cover this condition.

This does **not** affect the user's current BN4.1: current BN4 supplies the base costs, and the planned BN4.1–4.3 block obtains full SF4 before leaving. It matters when taking a different route or revisiting another BN with only partial SF4. A repair should allocate purchases at their effective API costs without permanently increasing the planner's footprint in early runs.

## Verification and remaining measurements

All 22 positive suites in the audit README passed after the sharing correction, covering progression, reset decisions, purchases, RPCs, corporations, Go, infiltration, batch calculations and sharing. The official RAM comparison against `6153dd3` shows no script cost changes. The original baseline-only `reproduce.mjs` no longer passes against repaired code, as already documented; it is not a current regression gate.

Live BN4.1 completion time, sharing duty cycle, corporation payoff/bribe timing, and further Go strength/BN-order comparisons still need measurements. These are validation and optimization work, distinct from the two confirmed open code findings.

Primary references: official v3.0.1 checkout `1da7316ffd9d281b45a86c4c54ec532276557892`, `src/PersonObjects/Player/PlayerObjectServerMethods.ts`, `src/Netscript/RamCostGenerator.ts`, and `src/NetworkShare/Share.ts`; repository `share-controller.js`, `kernel.js`, `faction-manager.js`, and `audit/2026-10-17-speedrun/checks/share-allocation.mjs`.
