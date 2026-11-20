# Testing-branch BitNode order

This route is now implemented on **`testing/bn1-go-audit` / PR #34**, preserving the automation-first preference and normal BN8 progression. It is a candidate for reducing total progression time with this suite, not a measured universal optimum. Main is unchanged. The associated intelligence/reset/Bladeburner repairs and checks are recorded in [progression-fixes.md](progression-fixes.md).

Targets mean keep selecting a BN until that Source-File level is earned, not “only play the last run.” Start with the mandatory first BN1 completion. The implementation uses separate integer node/level fields in `progression.js`, credits the run being finished once, and skips already-owned targets.

## Default testing route

| Stage | Complete | Why here / required preparation |
| --- | --- | --- |
| 1 | **BN1.1** | Initial required run; follow the BN1 guide. |
| 2 | **BN4.1–4.3** | Preserve the automation-first plan. Outside BN4, SF4 levels 1/2/3 charge Singularity RAM at 16×/4×/1×. This suite's fixed helper budgets particularly benefit from finishing all three. |
| 3 | **BN1.2–1.3** | Broad bonuses on familiar mechanics. SF1's cumulative bonus is 16%/24%/28%, correcting the current comment that ends at 24%. |
| 4 | **BN5.1** | Unlock persistent intelligence and Formulas early. Then perform the agreed intelligence preparation/farm within a subsequent active BN when its prerequisites are satisfied; do not interrupt progress by fluming. B05 is repaired on this branch. |
| 5 | **BN2.1** | Obtain gang access. Defer two extra repetitions whose primary additional benefit is larger stat bonuses. Outside BN2, gang formation still needs the karma requirement; sleeves later reduce the player's time spent on it. |
| 6 | **BN3.1–3.3** | Use the existing corporation strategy; SF3.3 gives free Office/Warehouse API access in corporations. This is a suite-specific reason to finish a three-run block. Measure its payback versus taking only 3.1 initially. |
| 7 | **BN10.1–10.3** | Sleeves support crime, reputation, and Bladeburner preparation. Buy the five purchasable sleeves and their memory while in BN10; three SF levels add three more sleeves. B06/B10 are repaired; the completion gate now also rejects failed sleeve RPC results. |
| 8 | **BN6.1 → BN7.1–7.3** | Establish an alternate completion method before the hard hacking nodes. SF7.3 grants The Blade's Simulacrum on joining Bladeburner, allowing concurrent player work. B08 and the missing hash spender reference are repaired. |
| 9 | **BN9.1–9.3** | Use the earlier systems to tackle the hard node. SF9.2 starts later BNs with 128 GB home RAM; SF9.3 starts them with an upgraded hacknet server. These are distinct startup benefits. |
| 10 | **BN13.1–13.3 → BN14.1–14.3 → BN15.1–15.3** | Add remaining specialized systems once income, sleeves, and alternate victory work. Ordering inside this block depends on measured Stanek/Go/darknet performance. B18's stasis capacity fix is included. |
| 11 | **BN5.2–5.3 → BN2.2–2.3 → BN6.2–6.3 → BN11.1–11.3** | Collect remaining repeat bonuses after the major systems are available. Reorder these by observed time saved per completion hour. |
| 12 | **BN8.1–8.3** | Retain normal BN8 progression. Existing sleeves/grafting and market automation give more options. Verify the casino/reserve startup policy specifically in BN8, where ordinary non-market income is disabled. |
| 13 | **BN12 repeats** | Open-ended scaling after core unlocks; use measured marginal benefit rather than a presumed finite finish. |

Readable route labels (these are display labels, not JavaScript decimal encodings):

```text
BN1.1 → BN4.1–4.3 → BN1.2–1.3 → BN5.1 → BN2.1
→ BN3.1–3.3 → BN10.1–10.3 → BN6.1 → BN7.1–7.3 → BN9.1–9.3
→ BN13.1–13.3 → BN14.1–14.3 → BN15.1–15.3
→ BN5.2–5.3 → BN2.2–2.3 → BN6.2–6.3 → BN11.1–11.3
→ BN8.1–8.3 → BN12 repeats
```

The current save's SF inventory was not inspected. Autopilot selects from the owned levels at runtime and logs its next choice at startup.

## Largest changes from the previous array

**Move BN11 later.** The previous route completed it three times before corporations or sleeves. Its augmentation inflation discount is useful, but it introduces no new progression system, and its server money/growth modifiers are hostile to a hacking-led route. The purchase multiplier becomes `1.9 × 0.96`, `1.9 × 0.94`, or `1.9 × 0.93` at SF11 levels 1–3; those are meaningful across many purchases, but the later levels add only two and one percentage points of reduction. Time the three runs against the benefit before buying them that early.

**Separate first unlocks from repeat stat bonuses.** SF2.1 already unlocks gangs; SF5.1 already supplies intelligence/Formulas. Extra levels can wait while a new subsystem would address a current bottleneck. SF4.3, SF3.3, SF7.3, and sleeve-count progression have more specific operational reasons for three-run blocks.

**Put a working Bladeburner finish before BN9.** The previous ordering visited BN9.3 before BN6.1 despite its own comment recommending the reverse. Current engine API access allows BN6 first; the obsolete script gate and missing alternate-victory detection are now repaired.

**Remove duplicate targets and clarify level encoding.** The previous SF5.3 and SF9.3 targets appeared twice; the later entries were normally skipped, so this is cleanup rather than a measured speed gain. The implementation now uses integer fields and an explicit `{ node: 12, repeat: true }` final stage. JavaScript treats `12.10` and `12.1` as the same number; route selection and logging no longer depend on decimal encoding.

## Choices worth measuring

| Alternative | Choose it when |
| --- | --- |
| Move BN9.1–9.2 earlier | Measured savings from 128 GB starting home RAM over the remaining BNs exceed the extra time spent completing BN9 with fewer supporting systems. Fixing B01 may reduce the urgency. |
| Take BN3.1, then sleeves/Bladeburner, then BN3.2–3.3 | Corporation APIs can be funded quickly enough that two early corporation repeats are a worse investment than new systems. |
| Take BN10.1 before finishing all three | The first sleeve/grafting unlock provides most of the immediate benefit and later sleeve counts can wait. Still finish purchases/memory while the BN10-specific opportunity is available. |
| Move BN14 or BN15 forward | Repeated same-save tests show the existing Go/darknet managers produce a larger near-term benefit and reliably handle the node. A working script alone does not establish a fast route. |
| Pull SF11.1 forward, defer .2/.3 | Large augmentation bundles and repeated corporate work make the first discount/rep unlock pay back quickly enough; measure that against the time spent in BN11. |

## Intelligence farming is a phase within the route

After SF5, preserve this sequence: **installed CashRoot → all ten corporate faction invitations/access → intelligence farm → resume the same BN**. Save explicit completion state on home so a soft reset does not restart the preparation cycle. Do not enter a different BN or use BitFlume to implement that phase.

The farm now has a one-hour elapsed budget, a five-minute no-progress exit, and the previous 0.5%/hour intelligence-bonus ROI rule with a minimum one-minute observation window. Completion survives augmentation resets within the same BN. The preparation phase still deliberately waits for CashRoot and the ten factions; its time is not included in that farm budget. These are bounded policies, not proof of an optimal INT target. Measure total preparation/farm time against downstream savings.

Primary reward/access/modifier sources are listed in [sources.md](sources.md). The official guide is a useful cross-check; these ordering decisions additionally depend on this repository's automation and the user's preferences.
