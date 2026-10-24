# BN1.1 cycle automation — 2026-10-23

`autopilot.js` now starts the first-BN1 UI controller automatically after rooting servers. It offloads the controller where RAM permits and starts hacking alongside it. Start autopilot once after each installation. The guide remains available for manual play and recovery; `scan.js` retains its restored, working implementation.

## Start

In Terminal:

```text
home
run git-pull.js --branch testing/bn1-go-audit
```

Wait for the download to finish, then:

```text
run autopilot.js
```

Use this in BN1.1 before obtaining SF1 or SF4. It requires the open game UI and uses the English/default dollar number labels. Let the script use the screen. It can expand sidebar sections, close ordinary informational popups with X or OK, and defer invitation popups. Purchase/install confirmations remain specific to the requested action; unexpected decisions and runtime errors pause with their visible text.

If autopilot was already running before this update, stop that instance in Active Scripts (including an offloaded instance), then run `autopilot.js` once to load the updated scheduler. Restart a running `bn1-auto.js` once as well to load the UI fixes. The controller recognizes an autopilot offloaded to another server and reuses it. The hacking batcher needs no restart for this change.

After an installation, dismiss the wake-up screen, open Terminal, and type **`run autopilot.js` again**. There is no timer that survives installation. A deliberate `--stop` or an unexpected UI error pauses automatic relaunch until you run `bn1-auto.js` manually; this pause expires at the next augmentation reset. After the final backdoor, follow the story/Bitverse prompts and choose BN4 yourself, then run `autopilot.js`.

To stop the running cycle on an upgraded home:

```text
run bn1-auto.js --stop
```

The stop command also reaches a remote controller/casino. If you started the controller directly on the original 8 GB home, stop its process in Active Scripts instead; there may not be room for a second command process. Autopilot and hacking stay running. If the controller has already started a persistent stock liquidator, it stays paused; stop that `stockmaster.js --liquidate` process in Active Scripts to resume normal trading. For step-by-step manual play, start `autopilot.js --disable-bn1-auto` and use `run bn1-guide.js`. Starting `bn1-auto.js` directly is still supported.

## What it does

1. Root available servers and offload autopilot, then place the BN1 controller before launching hacking work. Mug for seed/travel money if needed, travel to Aevum, and hand the controller host to the existing coinflipper. A small wrapper supplies direct player reads so coinflip does not need an overlapping home helper. It returns to the controller after verified $10b casino earnings. Remote controller/casino processes retain a 16 GB allocation through the handoff so hacking cannot take the RAM needed to resume. Direct home startup still fits on 8 GB. Both city-map layouts can open the casino.
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

## Dialogs, first purchases and autopilot startup

Ordinary game alerts are rendered by `AlertManager` with an X close button; an OK button is only added for some alerts. The old fixture always supplied OK, masking that mismatch. The controller now follows the visible Modal close callback and waits for the actual queue/transition to clear. It also clears informational notices and defers faction invitations while awaiting a purchase/travel confirmation. It does not accept an unrelated decision or hide a runtime-error popup.

On a fresh character, the game's sidebar omits Augmentations until a first purchase or another unlock. The controller now reads that sidebar's actual menu items to distinguish a locked menu from a collapsed section. A verified locked menu with no installed augmentations gives an empty queue. After starting a purchase, the controller requires the real queue again and opens collapsed sections as needed. A locked Factions menu likewise means there are currently no invitations to join.

Autopilot enables this path only in BN1 before SF1/SF4. It suppresses the competing standalone casino and infiltration launches, includes all controller imports in remote deployment, and reserves the full remote 16 GB at launch and both handoffs. Spending reads the live reserve on home through the existing helper, even with a stale remote `reserve.txt`. Other BitNodes retain their existing scheduler paths. Pauses/stops are scoped to the current reset; a brief handoff marker prevents duplicate launches between processes.

Validation adds the real AlertManager, SidebarAccordion and SidebarItem components, plus the actual SidebarRoot visibility expressions. It reproduces the old missing-menu/notification failures and exercises X-only and OK alerts, multiple queued notices, invitation deferral, collapsed sections, a first purchase revealing Augmentations, and preserved unrelated confirmations/runtime errors. Scheduler checks cover first-BN1 startup/offloading, other BitNodes, manual mode, paused controllers, casino duplication and launch failure. Controller/casino tests cover both home and remote execution, 16 GB handoffs, live home reserves and named exit callbacks. Transport checks verify complete remote imports and matching placement/exec allocations. All 50 checked script costs remain unchanged from `8b36bb3`; remote controller/casino reservations are intentionally 16 GB. No live save was run here.

## Validation

Checked against the official source checkout `1da7316ffd9d281b45a86c4c54ec532276557892` and the reported Steam 3.0.1 build `3162fd2590e221eadd0c0fbd46151913f7c4c41c`. Relevant UI, terminal, reset and cost implementations match. The controller is ready for live testing; no live save or complete BitNode was run here.

- `bn1-cycle.mjs` runs the real controller with controlled game/UI responses and official effective RAM charges. It covers an 8 GB, zero-cash bootstrap; casino/controller handoffs; offloaded autopilot reuse; guarded cash holds; unknown stocks; purchase-before-install ordering; and rejection outside the first BN1. It also runs the actual coinflip wrapper through sequence sampling and a payout with direct player reads. This caught an initial wrapper RAM budget that omitted part of the full return path; the corrected allocation covers it.
- `bn1-ui.mjs` renders the official alert, sidebar, City, Slums, augmentation, purchase, queue, travel, TOR and home-RAM TSX components in real React 17.0.2/MUI 5.18.0. Controlled state/routing callbacks exercise Mug in every city/layout, delayed navigation, confirmations enabled/disabled, prerequisite unlocks, authoritative rep fulfillment despite rounded labels, tooltip descriptions, cumulative NeuroFlux levels, changed-price refusal, invitation popup deferral, unrelated dialogs and cancellation. This is a component integration fixture, not a complete game session.
- Existing BN1 guide, infiltration, SoA, terminal, real-rendered scan, resource-purchase, API-error, stock-liquidation, reset-policy and purchase-RAM checks pass. Infiltration tests cover matching, foreign, expired and reset-stale controller handoffs. Scan remains byte-identical to `8aff87d`.
- Official RAM comparison over 50 entry points: existing costs are unchanged. Controller: **8 GB when started directly on home**, explicitly raised to **16 GB** after upgrading home; remote controller/casino: **16 GB** throughout; home casino wrapper: **6.5 GB**; temporary stock verification: **9.65 GB**. Normal coinflip remains **4.1 GB**, autopilot **4.2 GB**, guide **8 GB**, and kernel **5.85 GB**.

Reproduce with Node 24:

```sh
node audit/2026-10-17-speedrun/checks/bn1-cycle.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/bn1-ui.mjs /path/to/bitburner-src /tmp/bitburner-terminal-ui-check
node audit/2026-10-17-speedrun/checks/scan-ui.mjs /path/to/bitburner-src /tmp/bitburner-terminal-ui-check
node audit/2026-10-17-speedrun/checks/terminal-ui.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/infiltration.mjs
node audit/2026-10-17-speedrun/checks/soa-progression.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node audit/2026-10-17-speedrun/checks/rpc-reserve.mjs
node audit/2026-10-17-speedrun/checks/resource-purchases.mjs
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/augmentation-reset.mjs
node audit/2026-10-17-speedrun/checks/purchase-ram.mjs /path/to/bitburner-src
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src 8b36bb3
```

The UI fixture needs a scratch dependency directory with `react@17.0.2`, `react-dom@17.0.2`, `@mui/material@5.18.0`, `@emotion/react@11.14.0`, `@emotion/styled@11.14.1`, `jsdom@26.1.0`, and `typescript@5.9.3`. The fixture transpiles the actual TSX sources; it does not add runtime dependencies to the scripts.

Primary references: [augmentation UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Augmentation/ui), [faction UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/ui), [location UI](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Locations/ui), [terminal input](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Terminal/ui/TerminalInput.tsx), and [Netscript/RAM implementation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions.ts).
