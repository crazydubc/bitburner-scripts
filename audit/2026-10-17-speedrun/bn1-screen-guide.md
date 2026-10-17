# BN1.1 in-game prompts

On a fresh first BN1 run, start with:

```text
run bn1-guide.js
```

The script opens a log panel showing the next manual action: seed money, Aevum travel, actual coinflip completion, home RAM, TOR/program purchases, hacking automation, faction backdoors/invitations, augmentation cycles, Daedalus, and the final transition to BN4. It reads current game state without requiring Singularity. Prompts do not spend money, click the UI, change faction work, or interrupt the casino with dialogs.

Below 64 GB home RAM, the panel prints the next step and exits to free capacity for coinflip and its helpers. Its log remains available. Complete the step, then rerun the guide; after casino completion, upgrade home RAM to 64 GB or more. At 64 GB+, the panel updates every five seconds and toasts changed actions at most once every 15 seconds. These RAM thresholds are conservative workarounds for the suite's existing home-helper requirements.

Autopilot also opens the guide during first-BN1 startup when possible. Starting `autopilot.js` directly on an 8 GB home is still subject to the audited RPC bootstrap problem; use the guide first. The optional guide launch never waits for RAM. On augmentation installation, start `bn1-guide.js` again; autopilot restarts also reopen it when appropriate.

Your $8b reserve remains intact. The panel checks casino earnings this installation, not total cash, sampling completion, or whether coinflip exited. It uses a read-only view of installed augmentations; without Singularity it cannot inspect queued purchases or faction reputation, so those prompts explicitly direct you to the relevant game screens. The guide is advisory and does not change the existing money-management implementation.

Use `--no-tail` for log-only operation or `--once` for a single snapshot. Stop the guide process to silence it for the current session. It exits outside BN1 or once SF1/SF4 is active.

This PR also corrects the cracker-inventory offset so buying BruteSSH immediately becomes visible to autopilot. The downloader fallback includes the guide and uses the real `farm-intel.js` filename.

Validation: `node audit/2026-10-17-speedrun/checks/bn1-guide.mjs`. Live tail layout and complete first-BN1 timing still need an in-game check; no speedup percentage is claimed.
