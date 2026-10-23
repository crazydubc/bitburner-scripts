# Beginner BN1.1 guidance and full-automation assessment — 2026-10-23

**Scan correction:** the terminal helper described below introduced a focus-order regression and is no longer used by scan. The [hotfix](2026-10-23-scan-regression.md) restores the previous scan handler and reproduces the defect with real React/Material UI components. The beginner guide and full-automation assessment are unchanged. The original scan validation below was insufficient and is retained as history.

This update ships clearer `bn1-guide.js` instructions and a terminal-input timing correction for `scan.js`. It does **not** replace the guide with a fully autonomous BN1 controller.

## Implemented guidance

The main panel shows a goal and numbered actions using the game's visible buttons and exact terminal commands. Examples:

- `Click City > Slums > Mug. Let the crime repeat until you have $250,000.`
- `Open Terminal and type "run scan.js". Click "backdoor" beside "CSEC" and wait for it to finish.`
- `Click Factions > CyberSec > Details > Hacking Contracts.`
- `Click Augmentations > Install Augmentations, then confirm.`

Stores and universities are named for the current city, with travel to Aevum when the city has no suitable location. Faction backdoor targets use the actual server requirements. The roadmap provides named upgrades, their reputation goals, optional city factions, darknet, Shadows of Anarchy, and the Daedalus/Red Pill route. The ordinary panel stays focused on the next action; the longer route and install procedure remain separate commands.

Removed implementation commentary such as “There is no mandatory four-hour wait,” internal startup-policy explanations, and repeated Singularity limitations. The install checklist still asks the player to liquidate and verify zero stock positions, leave autopilot running, buy a useful bundle, and restart the guide after installation. Unreadable holdings are a reason to wait, not an assumption of zero holdings. Repeated NeuroFlux levels retain their stat value but count only once toward Daedalus's distinct-augmentation requirement.

Progression priority, the $10b casino-completion gate, the $8b reserve, automatic autopilot restart, and detection of offloaded autopilot instances are unchanged. The guide still exits below 64 GB home RAM to make space and still fits on an 8 GB starting home.

## Scan links wait for terminal rendering

The existing scan links assigned the terminal input, called its React change handler, and immediately pressed Enter. In the inspected game build, Enter reads component state or the selected history result. Updating the DOM value does not synchronously update that state, so this sequence can submit an older command or history selection.

`terminal-ui.js` waits for fresh input props containing the intended command before invoking Enter. It uses a bounded five-second browser-timer wait because scan links remain usable after the Netscript process exits. Navigation, disabled input, changed text, missing controls, and timeout stop submission. `scan.js` ignores additional link clicks while its current submission is pending and reports failures as plain text in Terminal. It does not automatically press Enter after a timeout.

The downloader fallback includes the new helper. Existing route generation and server/backdoor eligibility are unchanged. This fixes a reproduced input race; it is not a full browser integration test.

## Can BN1.1 be fully automated?

**The source review supports feasibility using the same UI-handler approach as coinflip and infiltration, without SF4. End-to-end unattended completion is not yet demonstrated.** The normal UI exposes travel, crime, training, purchases, faction invitations/work, augmentation installation, and BitNode selection. Existing code already handles casino earnings, infiltration completion/rewards, and pre-SF4 SoA purchases. A controller could coordinate those pieces and use the ordinary terminal backdoor commands.

The remaining work is more than converting guide sentences into clicks:

| Area | Needed implementation and acceptance check |
| --- | --- |
| Screen ownership | One controller must coordinate casino, infiltration, faction work and purchases. Wait for the visible page and enabled control after each transition, and stop cleanly on unexpected navigation or dialogs. Verify slow rendering and manual interruption. |
| Progression observations | Read faction reputation, current prices, prerequisites and queued purchases from the visible faction/augmentation UI. The existing SoA adapter demonstrates this approach; the guide itself currently reads only installed augmentations. Confirm actual post-action state before advancing. |
| Reset decisions | Feed validated observations into goal/ETA decisions, include NeuroFlux's stat benefit, and distinguish purchased from installed upgrades. Preserve stock-liquidation verification and cash reserves. Do not introduce a fixed augmentation-count reset target. |
| Eight-GB bootstrap | Free enough home RAM for coinflip and helpers; resume the controller after completion. Verify a genuinely fresh home, low seed cash and failed launches. |
| Restart after installation | The UI install handler passes no restart script and kills every Netscript worker. A planned, bounded browser callback may survive to launch a fresh controller through Terminal, but must not reuse the dead script's `ns` object. Test installation confirmation on/off, wake-up dialogs, repeated installs, cancellation and duplicate prevention. |
| Finish and handoff | Backdoor the final server, complete story/Bitverse dialogs and select the configured next BN. Start the existing Singularity automation in BN4. Test the actual transition. |

The browser-callback restart is an **inference from engine cleanup**, not a tested solution: worker cleanup clears the Netscript delay and runs exit handlers, but does not globally clear browser timers. A callback would not survive closing/reloading the game. It must be explicitly armed only for the planned reset and bounded so stopping automation does not leave a controller that restarts itself unexpectedly.

Keep the beginner guide as the manual recovery path while these pieces are implemented and tested. No perpetual background callback, automatic installation, or automatic BitNode selection is introduced by this update.

## Verification

Passed:

```sh
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/terminal-ui.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/soa-progression.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src 8aff87d
```

The terminal test executes the official keyboard handler against delayed-render fixtures. It reproduces stale history submission, then verifies exact-command submission, unrelated/slow renders, navigation, edited input, disabled input, cancellation, missing controls and timeouts. Guide tests retain progression, casino gating, liquidation ordering, low-RAM exit, and offloaded/continuously restarted autopilot coverage. Existing SoA and liquidation tests also pass.

The official RAM comparison checks 46 entry points and reports no changes: guide **8 GB**, scan **4.05 GB**. Syntax and whitespace checks pass. Live UI layout, clickable links and full BN1 timing still need in-game testing; there is no claimed speedup measurement or completed autonomous run.

## Sources

Inspected the user's exact Steam build, `3162fd2590e221eadd0c0fbd46151913f7c4c41c`. The relevant UI/reset/terminal files match the pinned RAM-test checkout `1da7316ffd9d281b45a86c4c54ec532276557892`.

- [TerminalInput.tsx](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Terminal/ui/TerminalInput.tsx): change handler, state/history selection and Enter submission.
- [Location UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Locations/ui): travel, Slums crime, university and technology-store handlers/labels.
- [Faction UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/ui): invitations, work, augmentation lists and purchases.
- [GameRoot.tsx](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/ui/GameRoot.tsx) and [AugmentationHelpers.ts](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Augmentation/AugmentationHelpers.ts): UI installation and worker termination before resetting.
- [killWorkerScript.ts](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Netscript/killWorkerScript.ts): delay cancellation, exit handlers and worker cleanup.
- [BitNode UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/BitNode/ui): Bitverse/portal selection handlers.

## Pull and use

```text
home
run git-pull.js --branch testing/bn1-go-audit
```

Wait for `Pull complete`. If an older downloader falls back to its local file list, run the same pull again after it updates itself so `terminal-ui.js` is included. Stop the existing guide in Active Scripts, then run `run bn1-guide.js`. Run `run scan.js` again to get links using the new handler. The reference commands remain `run bn1-guide.js --roadmap` and `run bn1-guide.js --install`.
