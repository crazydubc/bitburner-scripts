# BN1.1 in-game prompts

On a fresh first BN1 run, start with:

```text
run bn1-guide.js
```

The script opens a log panel showing the next action: seed money, Aevum travel, actual coinflip completion, home RAM, TOR/program purchases, hacking automation, darknet, faction backdoors/invitations, augmentation cycles, Daedalus, and the final transition to BN4. It reads current game state without requiring Singularity. It can start autopilot, which runs coinflip and the other automation. Purchases, faction work, and augmentation installation still require manual input; prompts do not interrupt the casino with dialogs.

Below 64 GB home RAM, the panel prints the next step and exits to free capacity for coinflip and its helpers. Its log remains available. Complete the step, then rerun the guide; after casino completion, upgrade home RAM to 64 GB or more. At 64 GB+, the panel updates every five seconds and toasts changed actions at most once every 15 seconds. These RAM thresholds are conservative workarounds for the suite's existing home-helper requirements.

After an augmentation installation, run `bn1-guide.js` again. With at least 64 GB home RAM and 48 GB currently free, it starts autopilot automatically whenever it is missing. Every five-second refresh checks for it on all servers, so stopping or losing autopilot triggers a restart when RAM permits. Casino progress, travel, and cash do not block the manager; autopilot checks for an existing coinflipper before launching one. Launch failure returns immediately and retries on a later refresh.

There is no once-per-cycle restriction and no persistent startup latch. Existing `bn1-guide-state.txt` files are ignored; no cleanup is needed when updating. Use `--manual` to keep the normal panel in prompts-only mode, or stop the guide if you want to keep autopilot stopped. A running guide in normal mode will restart it.

Autopilot also opens the guide during first-BN1 startup when possible. Starting `autopilot.js` directly on an 8 GB home is still subject to the audited RPC bootstrap problem; use the guide first. The optional guide launch never waits for RAM.

The guide uses `isScriptRunning` from `utils.js` to recognize autopilot on any server, including offloaded instances. Below 64 GB, it skips that helper lookup because casino and home-RAM prompts take priority. At higher capacities it also skips the lookup when less than 4 GB is free, reports the unknown status, and asks for helper headroom instead of starting a possible duplicate. These checks reduce home-RAM stalls; they do not repair the suite's general RPC transport.

## Early darknet setup

After coinflip and the main bootstrap purchases, the guide recommends `buy DarkscapeNavigator.exe` for $50m through TOR. The cheaper alternative is Chongqing > Shadowed Walkway: $30m, including TOR if missing. Visiting Chongqing does not join its city faction or block Sector-12. The purchase prompt does not block faction progress if cash is short.

Autopilot detects the program and starts `darknet.js` from home. A rejected launch now returns immediately, allowing other helpers to run and a later retry. Check Active Scripts/logs for its darknet workers. Their phishing actions train Charisma; in fresh BN1.1 this improves Field Work, not Hacking Contracts. Compare displayed rep/sec where both are offered: Sector-12, The Black Hand, and Daedalus. CyberSec, NiteSec, and BitRunners offer hacking work only. The direct Charisma contribution to Hacking Contracts is a later SF15.3 bonus.

## Faction roadmap and work

```text
run bn1-guide.js --roadmap
```

This opens an on-screen route through CyberSec, NiteSec, The Black Hand, BitRunners, and Daedalus, with actual faction-server hacking/port requirements, invitation steps, and example augmentation/reputation targets. Sector-12/CashRoot and Tian Di Hui/Neuroreceptor are explained as side stops, including city-faction conflicts. It tells the player how to select Hacking Contracts, when to focus, and how to build toward 30 distinct installed augmentations. The normal panel suggests work among joined factions and skips installed example targets.

These are suggestions, not a requirement to exhaust every faction or grind every named augmentation. Reputation and queued purchases are unavailable without Singularity; check the game screens and skip already purchased targets. The reference view exits after rendering and leaves its log available. Rerun it to refresh requirements/status after progress; it can open alongside the normal guide and does not launch the server-lookup helper.

## Before buying the final bundle or installing

```text
run bn1-guide.js --install
```

This opens a separate, one-shot checklist that remains available after exiting. The normal augmentation and Red Pill prompts also include the stock-liquidation reminder. The sequence is:

1. Check the desired bundle, reputation, prerequisites, and queued purchases.
2. Leave autopilot running. On home, enter `run stockmaster.js --liquidate` (or `run stockmaster.js -l`). The liquidator stops other stockmaster instances, sells long/short positions, and remains running without buying. Its presence prevents autopilot from launching normal trading.
3. Wait for its summary and verify that the Stock Market screen shows no positions. Without TIX API access, sell manually; the liquidator still remains active to hold trading paused.
4. Leave the liquidator running until installation.
5. Pause competing spending scripts if needed, buy the useful augmentation bundle in an appropriate price/prerequisite order, use suitable leftovers for NeuroFlux and home upgrades, then install through Augmentations.
6. After installation, restart `bn1-guide.js`; it can start autopilot on the new cycle. If abandoning the installation, stop only the liquidating stockmaster process in Active Scripts. Autopilot can then resume trading when eligible, or you can run stockmaster yourself.

Opening the static checklist does not pause automatic startup or change running processes. The guide never executes the liquidation command, kills processes, buys augmentations, or installs them. Internal reset/Daedalus callers use `--liquidate-once` to preserve their wait-for-exit/resume behavior; use the persistent `--liquidate` command for this manual checklist.

Your $8b reserve remains intact. The panel checks casino earnings this installation, not total cash, sampling completion, or whether coinflip exited. It uses a read-only view of installed augmentations; without Singularity it cannot inspect queued purchases or faction reputation, so those prompts explicitly direct you to the relevant game screens. The guide is advisory and does not change the existing money-management implementation.

Use `--no-tail` for log-only operation or `--once` for a single snapshot without starting autopilot. `--roadmap` and `--install` also never start it. Stop the guide process to silence it for the current session. It exits outside BN1 or once SF1/SF4 is active.

This PR also corrects the cracker-inventory offset so buying BruteSSH immediately becomes visible to autopilot. The downloader fallback includes the guide and uses the real `farm-intel.js` filename.

Validation: `node audit/2026-10-17-speedrun/checks/bn1-guide.mjs` and `node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs`. These execute the guide, liquidation flow, and affected callers with mocked game transport. Live tail layout and complete first-BN1 timing still need an in-game check; no speedup percentage is claimed.
