# BN1.1 in-game prompts

On a fresh first BN1 run, start with:

```text
run bn1-guide.js
```

The script opens a log panel showing the next manual action: seed money, Aevum travel, actual coinflip completion, home RAM, TOR/program purchases, hacking automation, faction backdoors/invitations, augmentation cycles, Daedalus, and the final transition to BN4. It reads current game state without requiring Singularity. Prompts do not spend money, click the UI, change faction work, or interrupt the casino with dialogs.

Below 64 GB home RAM, the panel prints the next step and exits to free capacity for coinflip and its helpers. Its log remains available. Complete the step, then rerun the guide; after casino completion, upgrade home RAM to 64 GB or more. At 64 GB+, the panel updates every five seconds and toasts changed actions at most once every 15 seconds. These RAM thresholds are conservative workarounds for the suite's existing home-helper requirements.

Autopilot also opens the guide during first-BN1 startup when possible. Starting `autopilot.js` directly on an 8 GB home is still subject to the audited RPC bootstrap problem; use the guide first. The optional guide launch never waits for RAM. On augmentation installation, start `bn1-guide.js` again; autopilot restarts also reopen it when appropriate.

The guide uses `isScriptRunning` from `utils.js` to recognize autopilot on any server, including offloaded instances. Below 64 GB, it skips that helper lookup because casino and home-RAM prompts take priority; this preserves the low-RAM exit without waiting for an extra process on home.

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
2. Stop **all autopilot instances**, including offloaded ones, using Active Scripts. Leave them stopped until installation so trading is not restarted.
3. On home, enter `run stockmaster.js --liquidate` (or `run stockmaster.js -l`). The liquidator stops other stockmaster instances and sells long/short positions.
4. Wait for its summary and verify that the Stock Market screen shows no positions. Without TIX API access, sell manually; if no stocks are held, skip selling.
5. Pause competing spending scripts if needed, buy the useful augmentation bundle in an appropriate price/prerequisite order, use suitable leftovers for NeuroFlux and home upgrades, then install through Augmentations.
6. After installation, restart `bn1-guide.js`. If abandoning the installation, resume autopilot when ready.

The static checklist remains useful after stopping autopilot even if the normal guide returns to its startup prompt. The guide never executes the liquidation command, kills processes, buys augmentations, or installs them.

Your $8b reserve remains intact. The panel checks casino earnings this installation, not total cash, sampling completion, or whether coinflip exited. It uses a read-only view of installed augmentations; without Singularity it cannot inspect queued purchases or faction reputation, so those prompts explicitly direct you to the relevant game screens. The guide is advisory and does not change the existing money-management implementation.

Use `--no-tail` for log-only operation or `--once` for a single snapshot. Stop the guide process to silence it for the current session. It exits outside BN1 or once SF1/SF4 is active.

This PR also corrects the cracker-inventory offset so buying BruteSSH immediately becomes visible to autopilot. The downloader fallback includes the guide and uses the real `farm-intel.js` filename.

Validation: `node audit/2026-10-17-speedrun/checks/bn1-guide.mjs`. Live tail layout and complete first-BN1 timing still need an in-game check; no speedup percentage is claimed.
