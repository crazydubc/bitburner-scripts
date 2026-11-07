# Faction planning during an unreadable stock market

The second report reached `faction-manager.js:150` after the bounded ECP valuation retries expired. The preceding fix isolated the HUD failure, but left faction-manager's startup dependent on a successful valuation. That stopped faction and augmentation planning before it could publish a fresh queue.

## Behavior

- Faction-manager now continues with confirmed player cash if valuation fails. It still gathers factions, joins eligible factions, plans augmentations, and writes its normal favor/Go/augmentation output, including from an offloaded host.
- The output explicitly includes `stock_value_known: false` and `stock_value: null` for an unreadable or deliberately ignored portfolio. Its budget excludes unverified stock proceeds. A successful read restores the full budget on the next invocation. No last-good stock value is reused.
- Automatic installation waits if either autopilot's current read or faction-manager's snapshot reports unavailable holdings. This applies before Red Pill, Daedalus augmentation count, donation favor and hard-cap installation branches. Other automation continues. Repeated installation warnings are limited to once per minute.
- Money/ETA observations are cleared during the outage, so recovery is not counted as newly earned income. Ordinary goal timing measures fresh progress again; verified milestone installations can proceed immediately.
- Faction-manager refuses `--purchase` while holdings cannot be verified. The existing explicit `--ignore-stocks` cash-only purchase override remains available. Using that override in planning does not authorize an automatic installation.
- Autopilot preserves an existing Daedalus reserve when an unreadable portfolio cannot establish a wealth loss. It can still accept an invitation once the reserved cash requirement is met. A valuation failure during the later 4S check defers installation rather than throwing.

The common valuation helper remains strict: no skipping failed symbols or reporting an unreadable portfolio as zero. The reserve formula, including its intentional $8 billion floor, is unchanged. No market mutation or reinitialization is attempted.

## Market diagnosis and recovery

ECP is still a valid symbol in both the pinned official v3.0.1 source and the current official default branch inspected for this follow-up. `getSymbols()` returns a static symbol list while `getPosition()` reads the live symbol map. A missing entry in the latter produces the reported error. This does not establish why the user's live market lost that entry.

There is also a historical [official-repository report of the same ECP lookup failure](https://github.com/bitburner-official/bitburner-src/issues/122), with saving, quitting and reloading suggested for a market that failed to load. Try saving the game, fully closing it, and reopening it. This is a recovery step to try, not a guaranteed diagnosis or repair. Do not delete or reinitialize the market to hide the error.

Sources: [current official stock API](https://github.com/bitburner-official/bitburner-src/blob/dev/src/NetscriptFunctions/StockMarket.ts), and the pinned v3.0.1 files listed in [the preceding valuation audit](2026-10-22-stock-valuation.md).

## Validation and deployment

The extended `stock-valuation.mjs` fixture executes the actual faction-manager startup, output writer and purchase function against the real valuation/RPC helper and pinned official stock API. Unrelated faction-data gathering and presentation are stubbed. It verifies offloaded output, cash-only continuation, recovery, repeated-run state clearing, purchase protection and the explicit override. It also runs the actual autopilot installation branches, main-loop availability forwarding, late 4S check and Daedalus state handling through failure and recovery.

All six focused suites pass: `stock-valuation`, `speedrun-improvements`, `augmentation-reset`, `stock-liquidation`, `api-errors` and `rpc-reserve`. The official RAM comparison against `d5d17cd` shows no increases: autopilot **4.2 GB**, faction-manager **24 GB**, stock snapshot **9.65 GB**. These are offline regressions; the user's live save was not inspected.

```sh
node audit/2026-10-17-speedrun/checks/stock-valuation.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/speedrun-improvements.mjs
node audit/2026-10-17-speedrun/checks/augmentation-reset.mjs
node audit/2026-10-17-speedrun/checks/stock-liquidation.mjs
node audit/2026-10-17-speedrun/checks/api-errors.mjs
node audit/2026-10-17-speedrun/checks/rpc-reserve.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine d5d17cd
```

Pull the complete `testing/bn1-go-audit` branch and restart autopilot from the updated home copy. Its next faction-manager launch loads the new code. Restart a manually running faction-manager as well. No kernel restart is needed for this follow-up. Persistent stock failures keep automatic installation paused with an explanatory warning; successful reads and a fresh faction-manager snapshot release that pause automatically.
