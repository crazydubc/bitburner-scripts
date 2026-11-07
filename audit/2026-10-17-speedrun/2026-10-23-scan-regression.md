# Scan click regression — 2026-10-23

The scan change in `7a287d1` introduced a reproduced focus-order bug. This hotfix restores `scan.js` byte-for-byte to its version before that change (`8aff87d`). The beginner-guide improvements remain in place.

## Cause and correction

The new helper wrote a command to the DOM input, then called `focus()`, then invoked React's change handler. When an unfocused Material UI input gains focus, it can rerender and restore the previous controlled value. That erased the command before the change handler read it. The helper then refused submission with `Terminal input changed; command was not submitted` (or could time out when the previous value matched).

The earlier test used a plain object with `focus() {}`. Although it executed the official keyboard handler, it could not exercise Material UI's focus behavior. Its deliberately delayed-render fixture also did not establish that the previously working immediate scan handler was broken in the actual game UI.

The restored scan handler changes React state before focusing and uses its established Enter sequence. It has no `terminal-ui.js` import, so updating `scan.js` alone restores its old dependency set and click behavior. Route generation, rooting/backdoor eligibility, layout and server statistics are unchanged.

`terminal-ui.js` stays in the repository for compatibility with the preceding downloader's explicit file list and any still-loaded copy of the previous scan. Its focus call now happens **before** writing the command and reading the current handlers. No production script imports this helper after the rollback; future automation should not treat it as an approved general-purpose controller.

## Verification

A new rendered-input test uses the versions from the game's lockfile: React/ReactDOM 17.0.2, Material UI 5.18.0, Emotion React 11.14.0 and Emotion Styled 11.14.1. It mounts the actual `TextField` component in jsdom, executes the official terminal change/Enter handlers, and runs production `scan.js` with a small server graph.

The test reproduces the broken helper against an unfocused input in standard, outlined and filled variants. The restored scan passes 24 link clicks covering focused/unfocused input, stale input/history, full server routes, backdoor commands, already-backdoored shortcuts, home navigation and handlers clicked after `main` returns. The corrected compatibility helper also passes all three variants.

To reproduce, install the UI test dependencies in a separate scratch directory, then run:

```sh
npm install --prefix /tmp/bitburner-terminal-ui-check --ignore-scripts --no-audit --no-fund \
  react@17.0.2 react-dom@17.0.2 @mui/material@5.18.0 \
  @emotion/react@11.14.0 @emotion/styled@11.14.1 jsdom@26.1.0
node audit/2026-10-17-speedrun/checks/scan-ui.mjs /path/to/bitburner-src /tmp/bitburner-terminal-ui-check
node audit/2026-10-17-speedrun/checks/terminal-ui.mjs /path/to/bitburner-src
node audit/2026-10-17-speedrun/checks/bn1-guide.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src 7a287d1
```

All three focused checks pass. The official RAM comparison reports no changes across 46 entry points; scan remains **4.05 GB**, and the guide remains **8 GB**. Syntax and whitespace checks pass. This is a rendered UI reproduction, not a test in the user's live Steam session. The user reported scan broken without a specific error message; this test establishes a defect introduced by our change, not every possible symptom of that report.

Source: the user's exact engine build [`3162fd2`](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Terminal/ui/TerminalInput.tsx). Its terminal input source matches the pinned checkout used by the tests. The test checks UI dependency versions against that checkout's lockfile.

## Update in game

```text
home
run git-pull.js --branch testing/bn1-go-audit
```

Wait for `Pull complete`, then run `run scan.js` again and use the newly printed links. Existing printed links retain their earlier JavaScript handlers. No autopilot or batcher restart is required for this hotfix.
