# Optional BN1.1 cycle automation — 2026-10-23

`bn1-auto.js` handles the first BN1 augmentation cycle through the normal UI. Start it once after each installation. The guide remains available for manual play and recovery; `scan.js` retains its restored, working implementation.

## Start

In Terminal:

```text
home
run git-pull.js --branch testing/bn1-go-audit
```

Wait for the download to finish, then:

```text
run bn1-auto.js
```

Use this in BN1.1 before obtaining SF1 or SF4. It requires the open game UI and uses the English/default dollar number labels. Leave the sidebar's World menus expanded and let the script use the screen. It refuses unfamiliar prices, dialogs and controls instead of guessing.

If autopilot was already running before this update, restart that instance once to load screen coordination. The controller recognizes an autopilot offloaded to another server and reuses it. The hacking batcher needs no restart for this change.

After an installation, dismiss the wake-up screen, open Terminal, and type **`run bn1-auto.js` again**. There is no timer that survives installation or restarts a stopped controller. After the final backdoor, follow the story/Bitverse prompts and choose BN4 yourself, then run `autopilot.js`.

To stop the running cycle on an upgraded home:

```text
run bn1-auto.js --stop
```

On the original 8 GB home, stop the active `bn1-auto.js` or `bn1-casino.js` process in Active Scripts instead; there may not be room for a second command process. Autopilot and hacking stay running. If the controller has already started a persistent stock liquidator, it stays paused; stop that `stockmaster.js --liquidate` process in Active Scripts to resume normal trading. For step-by-step manual help, use `run bn1-guide.js`.

## What it does

1. Mug for seed/travel money, travel to Aevum, and hand the 8 GB home to the existing coinflipper. A small wrapper supplies direct player reads so coinflip does not need an overlapping home helper. It returns to the controller after verified $10b casino earnings. Both city-map layouts can open the casino.
2. Upgrade affordable home RAM toward 128 GB, buy TOR, available port programs and Darkscape Navigator, and keep autopilot running when startup RAM permits. Normal purchases respect the live reserve, including the intentional $8b casino reserve. Existing autopilot starts hacking, Go, darknet and other managers.
3. Backdoor eligible faction servers using normal terminal commands, join supported faction invitations, and work for useful augmentations. It studies hacking when required. One controller-owned infiltration runs at a time for reputation or cash, with the existing company selection, demand checks and SoA/WKS progression.
4. Read visible faction quotes, reputation, prerequisites and queued purchases. Feed those observations into the existing time/value reset policy. NeuroFlux levels contribute utility; repeated levels count once toward Daedalus's 30 distinct augmentations. Rewards are re-read immediately after infiltration, and its cooldown leaves time for regular ETA samples even after a long run. There is no fixed augmentation-count reset trigger. The 30-augmentation requirement is an invitation requirement, not a reset threshold.
5. When a reset is worthwhile, hold guarded spending, run persistent stock liquidation, buy affordable ordinary augmentations before NeuroFlux, and spend affordable leftovers on persistent home RAM. Verify actual zero share counts immediately before installation and again at its confirmation. Autopilot stays running. Unknown positions—including the reported invalid-symbol failure—block installation while ordinary progress can continue.
6. Hold cash for the $100b Daedalus invitation after its installed-augmentation and hacking requirements are met. Release the controller's spending/trading hold once joined. Prioritize The Red Pill's reputation, install it, then train/backdoor the final server on the next manually started cycle.

The implementation uses the existing casino, infiltration/SoA, stock liquidator and reset policy. It does not replace the batcher or Go engine. UI reads follow the displayed component's React props; actions invoke its normal controls. All new controller waits use Netscript sleep and end with their process. UI internals can change with game updates.

This first version uses Hacking Contracts for faction work and the existing infiltration selector. It does not add automatic donation planning, a new Go strategy, a new faction-work optimizer, or automatic Bitverse selection. The intended speed gain is reducing idle time between existing progression steps; a faster full BN1 run has **not** been measured.

## Slums bootstrap correction

The first live test stopped at `Location unavailable: Slums` after opening City. The controller requested `Slums`, but the game's location name is `The Slums`. The ASCII map prints `[the slums]`; its clickable letter has `aria-label="The Slums"`. The list layout uses a button with the same full name. This was a missing word in the selector, not a capitalization or render-delay problem.

The controller now requests `The Slums`, and the manual guide uses that name too. The earlier UI fixture did not render the city menu or exercise Mug, so it missed the mismatch. The expanded fixture loads the actual City and Slums components, location data and crime names. It reproduces the old failure in both layouts, then verifies City → The Slums → Mug in all six cities and both layouts. Crime outcomes remain fixture-controlled; this is not a live game run. The existing guide and controller checks pass, and all 50 checked script RAM costs are unchanged from `0d6e7b3`.

Pull the same testing branch, wait for the download to finish, and run `bn1-auto.js` again. No run restart or save reset is needed.

## Validation

Checked against the official source checkout `1da7316ffd9d281b45a86c4c54ec532276557892` and the reported Steam 3.0.1 build `3162fd2590e221eadd0c0fbd46151913f7c4c41c`. Relevant UI, terminal, reset and cost implementations match. The controller is ready for live testing; no live save or complete BitNode was run here.

- `bn1-cycle.mjs` runs the real controller with controlled game/UI responses and official effective RAM charges. It covers an 8 GB, zero-cash bootstrap; casino/controller handoffs; offloaded autopilot reuse; guarded cash holds; unknown stocks; purchase-before-install ordering; and rejection outside the first BN1. It also runs the actual coinflip wrapper through sequence sampling and a payout with direct player reads. This caught an initial wrapper RAM budget that omitted part of the full return path; the corrected allocation covers it.
- `bn1-ui.mjs` renders the official City, Slums, augmentation, purchase, queue, travel, TOR and home-RAM TSX components in real React 17.0.2/MUI 5.18.0. Controlled state/routing callbacks exercise Mug in every city/layout, delayed navigation, confirmations enabled/disabled, prerequisite unlocks, authoritative rep fulfillment despite rounded labels, tooltip descriptions, cumulative NeuroFlux levels, changed-price refusal, invitation popup deferral, unrelated dialogs and cancellation. This is a component integration fixture, not a complete game session.
- Existing BN1 guide, infiltration, SoA, terminal, real-rendered scan, resource-purchase, API-error, stock-liquidation, reset-policy and purchase-RAM checks pass. Infiltration tests cover matching, foreign, expired and reset-stale controller handoffs. Scan remains byte-identical to `8aff87d`.
- Official RAM comparison over 50 entry points: existing costs are unchanged. New controller: **8 GB at startup**, explicitly raised to **16 GB** after upgrading home; casino wrapper: **6.5 GB**; temporary stock verification: **9.65 GB**. Normal coinflip remains **4.1 GB**, autopilot **4.2 GB**, guide **8 GB**, and kernel **5.85 GB**.

Reproduce with Node 24:

```sh
node audit/2026-10-17-speedrun/checks/bn1-cycle.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/bn1-ui.mjs /path/to/bitburner-src /tmp/bitburner-terminal-ui-check
node audit/2026-10-17-speedrun/checks/scan-ui.mjs /path/to/bitburner-src /tmp/bitburner-terminal-ui-check
node audit/2026-10-17-speedrun/checks/terminal-ui.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/infiltration.mjs
node audit/2026-10-17-speedrun/checks/soa-progression.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/resource-purchases.mjs
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/augmentation-reset.mjs
node audit/2026-10-17-speedrun/checks/purchase-ram.mjs /path/to/bitburner-src
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src 6178ff2
```

The UI fixture needs a scratch dependency directory with `react@17.0.2`, `react-dom@17.0.2`, `@mui/material@5.18.0`, `@emotion/react@11.14.0`, `@emotion/styled@11.14.1`, `jsdom@26.1.0`, and `typescript@5.9.3`. The fixture transpiles the actual TSX sources; it does not add runtime dependencies to the scripts.

Primary references: [augmentation UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Augmentation/ui), [faction UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/ui), [location UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Locations/ui), [terminal input](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Terminal/ui/TerminalInput.tsx), and [Netscript/RAM implementation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions.ts).
